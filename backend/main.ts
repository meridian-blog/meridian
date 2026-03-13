/**
 * Meridian Blog Engine - Main Entry Point
 * Deno 2.x HTTP server with Oak framework
 */

import { Application, Router, send } from '@oak/oak';
import { oakCors } from '@oak/cors';
import { errorHandler } from './middleware/error.ts';
import { requestLogger } from './middleware/logger.ts';
import {
  authRateLimiter,
  generalRateLimiter,
  subscribeRateLimiter,
  uploadRateLimiter,
} from './middleware/rateLimit.ts';
import { authRouter } from './routes/auth.ts';
import { postsRouter } from './routes/posts.ts';
import { membersRouter } from './routes/members.ts';
import { tagsRouter } from './routes/tags.ts';
import { settingsRouter } from './routes/settings.ts';
import { uploadRouter } from './routes/upload.ts';
import { analyticsRouter } from './routes/analytics.ts';
import { newslettersRouter } from './routes/newsletters.ts';
import { pagesRouter } from './routes/pages.ts';
import { stripeRouter } from './routes/stripe.ts';
import { publicRouter } from './routes/public.ts';
import { createGraphQLRouter } from './graphql/mod.ts';
import { isDatabaseHealthy } from '../db/connection.ts';
import { queryOne } from '../db/connection.ts';

// Serve static files
const STATIC_DIR = './frontend';

const APP_PORT = parseInt(Deno.env.get('APP_PORT') || '8000');
const APP_ENV = Deno.env.get('APP_ENV') || 'development';

if (APP_ENV === 'production') {
  const appSecret = Deno.env.get('APP_SECRET');
  if (!appSecret || appSecret === 'your-super-secret-key-min-32-chars!!') {
    console.error(
      'FATAL: APP_SECRET is not set or uses the default placeholder. ' +
        'Refusing to start in production without a secure secret.',
    );
    Deno.exit(1);
  }
}

const app = new Application();
const router = new Router();

// Global middleware
app.use(oakCors({
  origin: APP_ENV === 'development' ? '*' : undefined,
  credentials: true,
}));
app.use(errorHandler);
app.use(requestLogger);

// Global rate limit for all API requests
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname.startsWith('/api/')) {
    await generalRateLimiter(ctx, next);
  } else {
    await next();
  }
});

// Health check
router.get('/health', async (ctx) => {
  const dbHealthy = await isDatabaseHealthy();
  ctx.response.status = dbHealthy ? 200 : 503;
  ctx.response.body = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    services: {
      database: dbHealthy ? 'up' : 'down',
    },
  };
});

// API routes — route-specific rate limiters applied before routers
router.use('/api/auth', authRateLimiter, authRouter.routes(), authRouter.allowedMethods());
router.use('/api/posts', postsRouter.routes(), postsRouter.allowedMethods());
router.use('/api/members', membersRouter.routes(), membersRouter.allowedMethods());
router.use('/api/tags', tagsRouter.routes(), tagsRouter.allowedMethods());
router.use('/api/settings', settingsRouter.routes(), settingsRouter.allowedMethods());
router.use('/api/upload', uploadRateLimiter, uploadRouter.routes(), uploadRouter.allowedMethods());
router.use('/api/analytics', analyticsRouter.routes(), analyticsRouter.allowedMethods());
router.use('/api/newsletters', newslettersRouter.routes(), newslettersRouter.allowedMethods());
router.use('/api/pages', pagesRouter.routes(), pagesRouter.allowedMethods());

// Stripe (payments + webhooks)
router.use('/api/stripe', stripeRouter.routes(), stripeRouter.allowedMethods());

// Public routes (blog frontend API)
router.use('/api/public/subscribe', subscribeRateLimiter);
router.use('/api/public', publicRouter.routes(), publicRouter.allowedMethods());

// GraphQL
const graphqlRouter = await createGraphQLRouter();
router.use('/graphql', graphqlRouter.routes(), graphqlRouter.allowedMethods());

// Serve uploaded files
router.get('/uploads/:filename', async (ctx) => {
  await send(ctx, ctx.params.filename, { root: './uploads' });
});

// Page routes
router.get('/post/:slug', async (ctx) => {
  await send(ctx, '/post.html', { root: STATIC_DIR });
});

router.get('/page/:slug', async (ctx) => {
  await send(ctx, '/page.html', { root: STATIC_DIR });
});

router.get('/tag/:slug', async (ctx) => {
  await send(ctx, '/tag.html', { root: STATIC_DIR });
});

router.get('/search', async (ctx) => {
  await send(ctx, '/search.html', { root: STATIC_DIR });
});

router.get('/admin', async (ctx) => {
  await send(ctx, '/admin.html', { root: STATIC_DIR });
});

router.get('/login', async (ctx) => {
  await send(ctx, '/login.html', { root: STATIC_DIR });
});

app.use(router.routes());
app.use(router.allowedMethods());

// Known non-post paths that should never resolve as post slugs
const reservedPaths = new Set([
  '/',
  '/health',
  '/admin',
  '/login',
  '/search',
  '/graphql',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
]);

// Static file serving
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;

  // API routes skip
  if (path.startsWith('/api') || path.startsWith('/graphql') || path.startsWith('/uploads')) {
    await next();
    return;
  }

  // Try to serve static file first
  try {
    const filePath = path === '/' ? '/index.html' : path;
    await send(ctx, filePath, { root: STATIC_DIR });
  } catch {
    // Check if this is a bare /:slug path that matches a post
    // (single path segment, not a reserved route, no file extension)
    const segments = path.replace(/^\/|\/$/g, '').split('/');
    if (
      segments.length === 1 &&
      segments[0] &&
      !reservedPaths.has(path) &&
      !segments[0].includes('.')
    ) {
      const post = await queryOne<{ id: string }>(
        "SELECT id FROM posts WHERE slug = $1 AND status = 'published'",
        [segments[0]],
      );
      if (post) {
        try {
          await send(ctx, '/post.html', { root: STATIC_DIR });
          return;
        } catch {
          // fall through
        }
      }
    }

    // Serve index.html for client-side routing (public pages)
    if (!path.startsWith('/admin') && !path.startsWith('/login')) {
      try {
        await send(ctx, '/index.html', { root: STATIC_DIR });
      } catch {
        await next();
      }
    } else {
      await next();
    }
  }
});

// Start server
console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🔥 MERIDIAN BLOG ENGINE v0.1.0                          ║
║   Zero-Platform-Fee Publishing Infrastructure             ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   Environment: ${APP_ENV.padEnd(42)}║
║   Port:       ${APP_PORT.toString().padEnd(43)}║
╚════════════════════════════════════════════════════════════╝
`);

await app.listen({ port: APP_PORT, hostname: '0.0.0.0' });
