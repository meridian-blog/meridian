/**
 * Pages API Routes
 * CRUD for static pages (About, Contact, etc.)
 */

import { Router } from '@oak/oak';
import { execute, query, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin } from '../middleware/auth.ts';
import { generateSlug } from '../../shared/mod.ts';
import type { Page } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// List all pages (admin)
router.get('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const pages = await query<Page>(`
    SELECT id, slug, title, status, template, created_at, updated_at
    FROM pages
    ORDER BY title
  `);

  ctx.response.body = { success: true, data: pages };
});

// Get single page (admin)
router.get('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;
  const page = await queryOne<Page>(
    `
    SELECT * FROM pages WHERE id = $1
  `,
    [id],
  );

  if (!page) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } };
    return;
  }

  ctx.response.body = { success: true, data: page };
});

// Create page
router.post('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const body = await ctx.request.body.json();
  const title = body.title?.trim();
  if (!title) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Title is required' },
    };
    return;
  }

  const slug = body.slug?.trim() || generateSlug(title);

  const existing = await queryOne('SELECT id FROM pages WHERE slug = $1', [slug]);
  if (existing) {
    ctx.response.status = 409;
    ctx.response.body = {
      success: false,
      error: { code: 'DUPLICATE_SLUG', message: 'A page with this slug already exists' },
    };
    return;
  }

  const page = await queryOne<Page>(
    `
    INSERT INTO pages (slug, title, content, status, template, meta_title, meta_description)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,
    [
      slug,
      title,
      JSON.stringify(body.content || []),
      body.status || 'draft',
      body.template || null,
      body.metaTitle || null,
      body.metaDescription || null,
    ],
  );

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: page };
});

// Update page
router.put('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;
  const body = await ctx.request.body.json();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (body.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    params.push(body.title);
  }
  if (body.slug !== undefined) {
    updates.push(`slug = $${paramIndex++}`);
    params.push(body.slug);
  }
  if (body.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    params.push(JSON.stringify(body.content));
  }
  if (body.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(body.status);
  }
  if (body.template !== undefined) {
    updates.push(`template = $${paramIndex++}`);
    params.push(body.template);
  }
  if (body.metaTitle !== undefined) {
    updates.push(`meta_title = $${paramIndex++}`);
    params.push(body.metaTitle);
  }
  if (body.metaDescription !== undefined) {
    updates.push(`meta_description = $${paramIndex++}`);
    params.push(body.metaDescription);
  }

  if (updates.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'NO_UPDATES', message: 'No fields to update' },
    };
    return;
  }

  const page = await queryOne<Page>(
    `
    UPDATE pages SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING *
  `,
    [...params, id],
  );

  if (!page) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } };
    return;
  }

  ctx.response.body = { success: true, data: page };
});

// Delete page
router.delete('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;
  const result = await execute('DELETE FROM pages WHERE id = $1', [id]);

  if (result === 0) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } };
    return;
  }

  ctx.response.body = { success: true, data: { deleted: true } };
});

export { router as pagesRouter };
