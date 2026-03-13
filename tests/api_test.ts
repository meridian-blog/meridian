/**
 * API smoke tests for Meridian Blog Engine
 * Requires a running server: deno task dev
 * Run: deno test --allow-all tests/api_test.ts
 */

import { assert, assertEquals, assertExists } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const BASE_URL = Deno.env.get('TEST_BASE_URL') || 'http://localhost:8000';

// Helper to make requests
async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers as Record<string, string> },
    ...options,
  });
  const body = await res.json();
  return { status: res.status, body };
}

// Helper to get admin auth token
let adminToken: string | null = null;
async function getAdminToken(): Promise<string> {
  if (adminToken) return adminToken;
  const { body } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: Deno.env.get('ADMIN_EMAIL') || 'admin@meridian.blog',
      password: Deno.env.get('ADMIN_PASSWORD') || 'password',
    }),
  });
  adminToken = body.data?.token;
  if (!adminToken) throw new Error('Failed to get admin token. Is the server running?');
  return adminToken;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// --- Health Check ---

Deno.test('GET /health returns healthy', async () => {
  const { status, body } = await api('/health');
  assertEquals(status, 200);
  assertEquals(body.status, 'healthy');
  assertExists(body.timestamp);
  assertEquals(body.services.database, 'up');
});

// --- Auth ---

Deno.test('POST /api/auth/login with valid credentials', async () => {
  const { status, body } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: Deno.env.get('ADMIN_EMAIL') || 'admin@meridian.blog',
      password: Deno.env.get('ADMIN_PASSWORD') || 'password',
    }),
  });
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assertExists(body.data.token);
  assertExists(body.data.user);
});

Deno.test('POST /api/auth/login with wrong password', async () => {
  const { status, body } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@meridian.blog',
      password: 'wrong-password',
    }),
  });
  assertEquals(status, 401);
  assertEquals(body.success, false);
});

Deno.test('GET /api/auth/me without token returns 401', async () => {
  const { status, body } = await api('/api/auth/me');
  assertEquals(status, 401);
  assertEquals(body.success, false);
});

Deno.test('GET /api/auth/me with valid token', async () => {
  const token = await getAdminToken();
  const { status, body } = await api('/api/auth/me', {
    headers: authHeaders(token),
  });
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assertExists(body.data.email);
});

// --- Public Posts ---

Deno.test('GET /api/public/posts returns posts list', async () => {
  const { status, body } = await api('/api/public/posts');
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assert(Array.isArray(body.data));
  assertExists(body.pagination);
  assertExists(body.pagination.total);
  assertExists(body.pagination.page);
});

Deno.test('GET /api/public/posts supports pagination', async () => {
  const { status, body } = await api('/api/public/posts?page=1&perPage=5');
  assertEquals(status, 200);
  assertEquals(body.pagination.page, 1);
  assertEquals(body.pagination.perPage, 5);
});

Deno.test('GET /api/public/posts/nonexistent returns 404', async () => {
  const { status, body } = await api('/api/public/posts/this-slug-does-not-exist-xyz');
  assertEquals(status, 404);
  assertEquals(body.success, false);
});

// --- Public Tags ---

Deno.test('GET /api/public/tags returns tags', async () => {
  const { status, body } = await api('/api/public/tags');
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assert(Array.isArray(body.data));
});

// --- Public Subscribe ---

Deno.test('POST /api/public/subscribe with invalid email', async () => {
  const { status, body } = await api('/api/public/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assertEquals(status, 400);
  assertEquals(body.success, false);
});

Deno.test('POST /api/public/subscribe with valid email', async () => {
  const testEmail = `test-${Date.now()}@example.com`;
  const { status, body } = await api('/api/public/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, name: 'Test User' }),
  });
  assert([200, 201].includes(status));
  assertEquals(body.success, true);
});

// --- Admin Posts (requires auth) ---

Deno.test('GET /api/posts without auth returns 401', async () => {
  const { status } = await api('/api/posts');
  assertEquals(status, 401);
});

Deno.test('GET /api/posts with auth returns posts', async () => {
  const token = await getAdminToken();
  const { status, body } = await api('/api/posts', {
    headers: authHeaders(token),
  });
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assert(Array.isArray(body.data));
});

Deno.test('POST /api/posts creates a draft post', async () => {
  const token = await getAdminToken();
  const { status, body } = await api('/api/posts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      title: `Test Post ${Date.now()}`,
      content: [
        { id: '1', type: 'text', props: {}, content: 'This is a test post body.' },
      ],
      status: 'draft',
    }),
  });
  assertEquals(status, 201);
  assertEquals(body.success, true);
  assertExists(body.data.id);
  assertExists(body.data.slug);

  // Clean up: delete the post
  await api(`/api/posts/${body.data.id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
});

// --- Admin Members (requires admin) ---

Deno.test('GET /api/members without auth returns 401/403', async () => {
  const { status } = await api('/api/members');
  assert([401, 403].includes(status));
});

Deno.test('GET /api/members with admin auth returns list', async () => {
  const token = await getAdminToken();
  const { status, body } = await api('/api/members', {
    headers: authHeaders(token),
  });
  assertEquals(status, 200);
  assertEquals(body.success, true);
  assert(Array.isArray(body.data));
});

// --- Settings ---

Deno.test('GET /api/settings with admin auth', async () => {
  const token = await getAdminToken();
  const { status, body } = await api('/api/settings', {
    headers: authHeaders(token),
  });
  assertEquals(status, 200);
  assertEquals(body.success, true);
});
