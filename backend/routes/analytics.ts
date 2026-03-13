/**
 * Analytics API Routes
 * Dashboard metrics and reporting
 */

import { Router } from '@oak/oak';
import { query, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin } from '../middleware/auth.ts';

const router = new Router();
router.use(authMiddleware);

// Dashboard overview
router.get('/dashboard', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  // Get stats for last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totals, daily, posts, members] = await Promise.all([
    // Total stats
    queryOne<{ pageViews: number; visitors: number; newMembers: number; revenue: number }>(
      `
      SELECT 
        COALESCE(SUM(page_views), 0) as "pageViews",
        COALESCE(SUM(unique_visitors), 0) as "visitors",
        COALESCE(SUM(new_members), 0) as "newMembers",
        COALESCE(SUM(revenue), 0) as "revenue"
      FROM analytics_daily
      WHERE date >= $1
    `,
      [thirtyDaysAgo],
    ),

    // Daily breakdown
    query<{ date: string; pageViews: number; uniqueVisitors: number; newMembers: number }>(
      `
      SELECT date, page_views as "pageViews", unique_visitors as "uniqueVisitors", new_members as "newMembers"
      FROM analytics_daily
      WHERE date >= $1
      ORDER BY date
    `,
      [thirtyDaysAgo],
    ),

    // Top posts
    query<{ id: string; title: string; views: number }>(
      `
      SELECT p.id, p.title, SUM(pa.views) as views
      FROM posts p
      JOIN post_analytics pa ON p.id = pa.post_id
      WHERE pa.date >= $1
      GROUP BY p.id, p.title
      ORDER BY views DESC
      LIMIT 10
    `,
      [thirtyDaysAgo],
    ),

    // Member growth
    queryOne<{ total: number; free: number; paid: number }>(`
      SELECT 
        COUNT(*) as "total",
        COUNT(*) FILTER (WHERE tier = 'free') as "free",
        COUNT(*) FILTER (WHERE tier != 'free') as "paid"
      FROM members
      WHERE status = 'active'
    `),
  ]);

  ctx.response.body = {
    success: true,
    data: {
      period: '30d',
      totals,
      daily,
      topPosts: posts,
      members: {
        total: members?.total || 0,
        free: members?.free || 0,
        paid: members?.paid || 0,
      },
    },
  };
});

// Track page view (public endpoint)
router.post('/track', async (ctx) => {
  const body = await ctx.request.body.json();
  const { postId, url, referrer } = body;

  // Simple tracking - in production, use queue/batch processing
  // For now, just log it
  console.log(`[Analytics] View: ${url} | Post: ${postId || 'n/a'} | Ref: ${referrer || 'direct'}`);

  ctx.response.body = { success: true };
});

export { router as analyticsRouter };
