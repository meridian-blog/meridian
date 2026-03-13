/**
 * Posts API Routes
 * CRUD operations for blog posts
 */

import { Router } from '@oak/oak';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../../db/connection.ts';
import { authMiddleware, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { calculateReadingTime, generateSlug, stripHtml } from '../../shared/mod.ts';
import type { ContentBlock, Post, Tag } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// Validation schemas
const contentBlockSchema: z.ZodType = z.object({
  id: z.string(),
  type: z.enum([
    'text',
    'heading',
    'image',
    'gallery',
    'embed',
    'callout',
    'quote',
    'code',
    'divider',
    'paywall',
    'html',
  ]),
  props: z.record(z.unknown()),
  content: z.union([z.string(), z.array(z.lazy(() => contentBlockSchema)), z.null()]),
});

const createPostSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.array(contentBlockSchema),
  excerpt: z.string().optional(),
  coverImage: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'unlisted']).default('draft'),
  visibility: z.enum(['public', 'members', 'paid', 'tiers']).default('public'),
  allowedTiers: z.array(z.enum(['free', 'basic', 'premium', 'lifetime'])).default([]),
  tags: z.array(z.string()).default([]),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  featured: z.boolean().default(false),
  scheduledAt: z.string().datetime().optional(),
});

// List posts (with filtering)
router.get('/', async (ctx) => {
  const url = ctx.request.url;
  const status = url.searchParams.get('status') || 'published';
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '20'), 100);
  const featured = url.searchParams.get('featured') === 'true';
  const tag = url.searchParams.get('tag');
  const author = url.searchParams.get('author');
  const search = url.searchParams.get('q');

  const offset = (page - 1) * perPage;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status !== 'all') {
    conditions.push(`p.status = $${paramIndex++}`);
    params.push(status);
  }

  if (featured) {
    conditions.push('p.featured = true');
  }

  if (tag) {
    conditions.push(
      `EXISTS (SELECT 1 FROM posts_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = p.id AND t.slug = $${paramIndex++})`,
    );
    params.push(tag);
  }

  if (author) {
    conditions.push(`p.author_id = $${paramIndex++}`);
    params.push(author);
  }

  if (search) {
    conditions.push(`(p.title ILIKE $${paramIndex} OR p.excerpt ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get posts
  const posts = await query<
    Post & { authorName: string; authorAvatar: string | null; tags: Tag[] }
  >(
    `
    SELECT p.*, 
           u.name as "authorName", 
           u.avatar as "authorAvatar",
           COALESCE(
             json_agg(
               json_build_object(
                 'id', t.id,
                 'slug', t.slug,
                 'name', t.name,
                 'color', t.color
               ) ORDER BY t.name
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) as tags
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    ${whereClause}
    GROUP BY p.id, u.name, u.avatar
    ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `,
    [...params, perPage, offset],
  );

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `
    SELECT COUNT(*) as count FROM posts p ${whereClause}
  `,
    params,
  );

  const total = parseInt(countResult?.count || '0');

  ctx.response.body = {
    success: true,
    data: posts,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      hasNext: page * perPage < total,
      hasPrev: page > 1,
    },
  };
});

// Get single post
router.get('/:id', async (ctx) => {
  const { id } = ctx.params;

  const post = await queryOne<
    Post & { authorName: string; authorAvatar: string | null; tags: Tag[] }
  >(
    `
    SELECT p.*, 
           u.name as "authorName", 
           u.avatar as "authorAvatar",
           COALESCE(
             json_agg(
               json_build_object(
                 'id', t.id,
                 'slug', t.slug,
                 'name', t.name,
                 'color', t.color
               ) ORDER BY t.name
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) as tags
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.id::text = $1 OR p.slug = $1
    GROUP BY p.id, u.name, u.avatar
  `,
    [id],
  );

  if (!post) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } };
    return;
  }

  ctx.response.body = { success: true, data: post };
});

// Create post
router.post('/', async (ctx) => {
  if (!requireAuth(ctx)) return;

  const body = await ctx.request.body.json();
  const result = createPostSchema.safeParse(body);

  if (!result.success) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: result.error.flatten(),
      },
    };
    return;
  }

  const data = result.data;
  const slug = generateSlug(data.title);

  // Check slug uniqueness
  const existing = await queryOne('SELECT id FROM posts WHERE slug = $1', [slug]);
  if (existing) {
    ctx.response.status = 409;
    ctx.response.body = {
      success: false,
      error: { code: 'DUPLICATE_SLUG', message: 'A post with this title already exists' },
    };
    return;
  }

  // Calculate excerpt if not provided
  const contentText = data.content
    .filter((b: ContentBlock) => b.type === 'text' || b.type === 'heading')
    .map((b: ContentBlock) => typeof b.content === 'string' ? b.content : '')
    .join(' ');
  const excerpt = data.excerpt || stripHtml(contentText).slice(0, 300);
  const readingTime = calculateReadingTime(contentText);

  // Determine publish date
  const publishedAt = data.status === 'published'
    ? new Date()
    : data.scheduledAt
    ? new Date(data.scheduledAt)
    : null;

  const post = await queryOne<Post>(
    `
    INSERT INTO posts (
      slug, title, excerpt, cover_image, author_id, status, visibility,
      allowed_tiers, content, meta_title, meta_description, featured, 
      reading_time, published_at, scheduled_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `,
    [
      slug,
      data.title,
      excerpt,
      data.coverImage || null,
      ctx.auth.user!.id,
      data.status,
      data.visibility,
      data.allowedTiers,
      JSON.stringify(data.content),
      data.metaTitle || null,
      data.metaDescription || null,
      data.featured,
      readingTime,
      publishedAt,
      data.scheduledAt || null,
    ],
  );

  // Handle tags
  if (data.tags.length > 0) {
    for (const tagName of data.tags) {
      const tagSlug = generateSlug(tagName);
      const tag = await queryOne<Tag>(
        `
        INSERT INTO tags (slug, name) VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET name = $2
        RETURNING id
      `,
        [tagSlug, tagName],
      );

      await execute(
        'INSERT INTO posts_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [post!.id, tag!.id],
      );
    }
  }

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: post };
});

// Update post
router.put('/:id', async (ctx) => {
  if (!requireAuth(ctx)) return;

  const { id } = ctx.params;
  const body = await ctx.request.body.json();

  // Verify ownership or admin
  const existing = await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [id]);
  if (!existing) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } };
    return;
  }

  if (existing.authorId !== ctx.auth.user!.id && !ctx.auth.isAdmin) {
    ctx.response.status = 403;
    ctx.response.body = {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Can only edit your own posts' },
    };
    return;
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (body.title !== undefined) {
    updates.push(`title = $${paramIndex++}`);
    params.push(body.title);
    updates.push(`slug = $${paramIndex++}`);
    params.push(generateSlug(body.title));
  }
  if (body.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    params.push(JSON.stringify(body.content));
    // Recalculate reading time
    const contentText = body.content
      .filter((b: ContentBlock) => b.type === 'text' || b.type === 'heading')
      .map((b: ContentBlock) => typeof b.content === 'string' ? b.content : '')
      .join(' ');
    updates.push(`reading_time = $${paramIndex++}`);
    params.push(calculateReadingTime(contentText));
  }
  if (body.excerpt !== undefined) {
    updates.push(`excerpt = $${paramIndex++}`);
    params.push(body.excerpt);
  }
  if (body.coverImage !== undefined) {
    updates.push(`cover_image = $${paramIndex++}`);
    params.push(body.coverImage);
  }
  if (body.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(body.status);
    if (body.status === 'published' && !existing.publishedAt) {
      updates.push(`published_at = NOW()`);
    }
  }
  if (body.visibility !== undefined) {
    updates.push(`visibility = $${paramIndex++}`);
    params.push(body.visibility);
  }
  if (body.allowedTiers !== undefined) {
    updates.push(`allowed_tiers = $${paramIndex++}`);
    params.push(body.allowedTiers);
  }
  if (body.metaTitle !== undefined) {
    updates.push(`meta_title = $${paramIndex++}`);
    params.push(body.metaTitle);
  }
  if (body.metaDescription !== undefined) {
    updates.push(`meta_description = $${paramIndex++}`);
    params.push(body.metaDescription);
  }
  if (body.featured !== undefined) {
    updates.push(`featured = $${paramIndex++}`);
    params.push(body.featured);
  }

  if (updates.length === 0) {
    ctx.response.body = { success: true, data: existing };
    return;
  }

  const post = await queryOne<Post>(
    `
    UPDATE posts SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING *
  `,
    [...params, id],
  );

  // Update tags if provided
  if (body.tags !== undefined) {
    await execute('DELETE FROM posts_tags WHERE post_id = $1', [id]);
    for (const tagName of body.tags) {
      const tagSlug = generateSlug(tagName);
      const tag = await queryOne<Tag>(
        `
        INSERT INTO tags (slug, name) VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET name = $2
        RETURNING id
      `,
        [tagSlug, tagName],
      );
      await execute('INSERT INTO posts_tags (post_id, tag_id) VALUES ($1, $2)', [id, tag!.id]);
    }
  }

  ctx.response.body = { success: true, data: post };
});

// Delete post
router.delete('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const result = await execute('DELETE FROM posts WHERE id = $1', [id]);

  if (result === 0) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } };
    return;
  }

  ctx.response.body = { success: true, data: { deleted: true } };
});

export { router as postsRouter };
