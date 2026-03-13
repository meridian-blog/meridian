/**
 * Tags API Routes
 * Tag management
 */

import { Router } from '@oak/oak';
import { execute, query, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin } from '../middleware/auth.ts';
import { generateSlug } from '../../shared/mod.ts';
import type { Tag } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// List all tags (public)
router.get('/', async (ctx) => {
  const tags = await query<Tag>(`
    SELECT t.*, COUNT(pt.post_id) as post_count
    FROM tags t
    LEFT JOIN posts_tags pt ON t.id = pt.tag_id
    LEFT JOIN posts p ON pt.post_id = p.id AND p.status = 'published'
    GROUP BY t.id
    ORDER BY post_count DESC, t.name
  `);

  ctx.response.body = { success: true, data: tags };
});

// Get single tag
router.get('/:slug', async (ctx) => {
  const { slug } = ctx.params;

  const tag = await queryOne<Tag & { post_count: number }>(
    `
    SELECT t.*, COUNT(pt.post_id) as post_count
    FROM tags t
    LEFT JOIN posts_tags pt ON t.id = pt.tag_id
    LEFT JOIN posts p ON pt.post_id = p.id AND p.status = 'published'
    WHERE t.slug = $1
    GROUP BY t.id
  `,
    [slug],
  );

  if (!tag) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } };
    return;
  }

  ctx.response.body = { success: true, data: tag };
});

// Create tag (admin)
router.post('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const body = await ctx.request.body.json();

  const slug = generateSlug(body.name);

  const tag = await queryOne<Tag>(
    `
    INSERT INTO tags (slug, name, description, color)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (slug) DO UPDATE SET name = $2, description = $3, color = $4
    RETURNING *
  `,
    [slug, body.name, body.description || null, body.color || null],
  );

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: tag };
});

// Update tag (admin)
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
    updates.push(`slug = $${paramIndex++}`);
    params.push(generateSlug(body.name));
  }
  if (body.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(body.description);
  }
  if (body.color !== undefined) {
    updates.push(`color = $${paramIndex++}`);
    params.push(body.color);
  }

  const tag = await queryOne<Tag>(
    `
    UPDATE tags SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING *
  `,
    [...params, id],
  );

  if (!tag) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } };
    return;
  }

  ctx.response.body = { success: true, data: tag };
});

// Delete tag (admin)
router.delete('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const result = await execute('DELETE FROM tags WHERE id = $1', [id]);

  if (result === 0) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } };
    return;
  }

  ctx.response.body = { success: true, data: { deleted: true } };
});

export { router as tagsRouter };
