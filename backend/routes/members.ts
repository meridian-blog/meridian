/**
 * Members API Routes
 * Member management and subscription handling
 */

import { Router } from '@oak/oak';
import { z } from 'zod';
import { execute, query, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin, requireAuth } from '../middleware/auth.ts';
import type { Member, SubscriptionTier } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// List members (admin only)
router.get('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const url = ctx.request.url;
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '50'), 100);
  const tier = url.searchParams.get('tier');
  const search = url.searchParams.get('q');

  const offset = (page - 1) * perPage;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (tier) {
    conditions.push(`tier = $${paramIndex++}`);
    params.push(tier);
  }

  if (search) {
    conditions.push(`(email ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const members = await query<Member>(
    `
    SELECT id, email, name, tier, status, metadata, created_at, updated_at, expires_at
    FROM members
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `,
    [...params, perPage, offset],
  );

  const countResult = await queryOne<{ count: string }>(
    `
    SELECT COUNT(*) as count FROM members ${whereClause}
  `,
    params,
  );

  ctx.response.body = {
    success: true,
    data: members,
    pagination: {
      page,
      perPage,
      total: parseInt(countResult?.count || '0'),
      totalPages: Math.ceil(parseInt(countResult?.count || '0') / perPage),
      hasNext: page * perPage < parseInt(countResult?.count || '0'),
      hasPrev: page > 1,
    },
  };
});

// Get single member
router.get('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const member = await queryOne<Member>(
    `
    SELECT id, email, name, tier, status, metadata, created_at, updated_at, expires_at
    FROM members WHERE id = $1
  `,
    [id],
  );

  if (!member) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    };
    return;
  }

  ctx.response.body = { success: true, data: member };
});

// Update member
router.put('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;
  const body = await ctx.request.body.json();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (body.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(body.name);
  }
  if (body.tier !== undefined) {
    updates.push(`tier = $${paramIndex++}`);
    params.push(body.tier);
  }
  if (body.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(body.status);
  }

  if (updates.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'NO_UPDATES', message: 'No fields to update' },
    };
    return;
  }

  const member = await queryOne<Member>(
    `
    UPDATE members SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING id, email, name, tier, status, created_at, updated_at
  `,
    [...params, id],
  );

  if (!member) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    };
    return;
  }

  ctx.response.body = { success: true, data: member };
});

// Delete member
router.delete('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const result = await execute('DELETE FROM members WHERE id = $1', [id]);

  if (result === 0) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Member not found' },
    };
    return;
  }

  ctx.response.body = { success: true, data: { deleted: true } };
});

// Get subscription tiers
router.get('/tiers/list', async (ctx) => {
  const tiers = await query<SubscriptionTier>(`
    SELECT * FROM subscription_tiers
    WHERE is_active = true
    ORDER BY sort_order, price
  `);

  ctx.response.body = { success: true, data: tiers };
});

// Create/update tier (admin only)
router.post('/tiers', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const body = await ctx.request.body.json();

  const tier = await queryOne<SubscriptionTier>(
    `
    INSERT INTO subscription_tiers (name, description, price, currency, interval, benefits, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,
    [
      body.name,
      body.description,
      body.price,
      body.currency || 'usd',
      body.interval,
      body.benefits || [],
      body.sortOrder || 0,
    ],
  );

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: tier };
});

export { router as membersRouter };
