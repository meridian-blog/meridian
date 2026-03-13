/**
 * Request Logger Middleware
 */

import type { Context, Next } from '@oak/oak';

export async function requestLogger(ctx: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;

  const status = ctx.response.status;
  const method = ctx.request.method;
  const path = ctx.request.url.pathname;

  const statusColor = status >= 500
    ? '\x1b[31m' // red
    : status >= 400
    ? '\x1b[33m' // yellow
    : status >= 300
    ? '\x1b[36m' // cyan
    : '\x1b[32m'; // green

  console.log(
    `${statusColor}${status}\x1b[0m ${method.padEnd(6)} ${path} - ${ms}ms`,
  );
}
