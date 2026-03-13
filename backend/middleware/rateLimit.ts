/**
 * Rate Limiting Middleware
 * In-memory sliding window rate limiter with IP-based tracking.
 */

import type { Context, Next } from '@oak/oak';

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
  /** Label for logging (e.g. 'auth', 'upload'). */
  label?: string;
}

const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

/**
 * Creates a rate-limiting Oak middleware with the given options.
 * Each call creates an independent limiter with its own request store.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const { maxRequests, windowMs, label } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of stale entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store) {
      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) {
        store.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the Deno process to exit even if the timer is running
  if (typeof cleanupTimer === 'number') {
    Deno.unrefTimer(cleanupTimer);
  }

  return async function rateLimitMiddleware(ctx: Context, next: Next) {
    const ip = ctx.request.ip ?? 'unknown';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(ip, entry);
    }

    // Drop timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      // Calculate how long until the oldest request in the window expires
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = windowMs - (now - oldestInWindow);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      if (label) {
        console.warn(
          `Rate limit exceeded [${label}]: ${ip} — ${entry.timestamps.length}/${maxRequests}`,
        );
      }

      ctx.response.status = 429;
      ctx.response.headers.set('Retry-After', String(retryAfterSec));
      ctx.response.body = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${retryAfterSec} second${
            retryAfterSec === 1 ? '' : 's'
          }.`,
        },
      };
      return;
    }

    // Record this request
    entry.timestamps.push(now);

    // Set informational rate-limit headers
    ctx.response.headers.set('X-RateLimit-Limit', String(maxRequests));
    ctx.response.headers.set(
      'X-RateLimit-Remaining',
      String(maxRequests - entry.timestamps.length),
    );

    await next();
  };
}

// Pre-configured limiters for use in main.ts

/** Auth endpoints: 10 req / 60s */
export const authRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
  label: 'auth',
});

/** Public subscribe: 5 req / 60s */
export const subscribeRateLimiter = createRateLimiter({
  maxRequests: 5,
  windowMs: 60_000,
  label: 'subscribe',
});

/** Upload endpoint: 20 req / 60s */
export const uploadRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
  label: 'upload',
});

/** General API: 100 req / 60s */
export const generalRateLimiter = createRateLimiter({
  maxRequests: 100,
  windowMs: 60_000,
  label: 'general',
});
