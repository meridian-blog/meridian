/**
 * Public API Routes
 * Blog frontend data - no auth required (mostly)
 */

import { Router } from '@oak/oak';
import { query, queryOne } from '../../db/connection.ts';
import { authMiddleware } from '../middleware/auth.ts';
import type { Member, Page, Post, Tag } from '../../shared/types.ts';

const router = new Router();

// Parse auth token if present (optional - not required for public routes)
router.use(authMiddleware);

// Get site settings (public)
router.get('/site', async (ctx) => {
  const settings = await queryOne<{
    title: string;
    description: string;
    logo: string | null;
    icon: string | null;
    accent_color: string;
    permalink_format: string;
    social_links: Record<string, string>;
  }>(
    'SELECT title, description, logo, icon, accent_color, permalink_format, social_links FROM settings WHERE id = 1',
  );

  ctx.response.body = {
    success: true,
    data: {
      title: settings?.title || 'Meridian',
      description: settings?.description || 'A modern publishing platform with zero platform fees.',
      logo: settings?.logo || null,
      icon: settings?.icon || null,
      accentColor: settings?.accent_color || '#C41E3A',
      permalinkFormat: settings?.permalink_format || '/:slug',
      socialLinks: settings?.social_links || {},
    },
  };
});

// Get published posts for blog frontend
router.get('/posts', async (ctx) => {
  const url = ctx.request.url;
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '10'), 50);
  const tag = url.searchParams.get('tag');
  const author = url.searchParams.get('author');
  const featured = url.searchParams.get('featured') === 'true';

  const offset = (page - 1) * perPage;
  const conditions = ["p.status = 'published'"];
  const params: unknown[] = [];
  let paramIndex = 1;

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

  if (featured) {
    conditions.push('p.featured = true');
  }

  // Show all published posts but mark non-public ones for paywall treatment
  const posts = await query<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    coverImage: string;
    featured: boolean;
    readingTime: number;
    publishedAt: string;
    visibility: string;
    authorName: string;
    authorAvatar: string;
    tags: Tag[];
  }>(
    `
    SELECT p.id, p.slug, p.title, p.excerpt, p.cover_image as "coverImage",
           p.featured, p.reading_time as "readingTime", p.published_at as "publishedAt",
           p.visibility,
           u.name as "authorName", u.avatar as "authorAvatar",
           COALESCE(
             json_agg(
               json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'color', t.color)
               ORDER BY t.name
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) as tags
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY p.id, u.name, u.avatar
    ORDER BY p.published_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `,
    [...params, perPage, offset],
  );

  const countResult = await queryOne<{ count: string }>(
    `
    SELECT COUNT(*) as count FROM posts p
    WHERE ${conditions.join(' AND ')}
  `,
    params,
  );

  const total = parseInt(countResult?.count || '0');

  // Add access metadata for non-public posts
  const postsWithAccess = posts.map((post) => {
    if (post.visibility === 'public') {
      return post;
    }
    return {
      ...post,
      requiresSubscription: true,
      accessLevel: post.visibility,
    };
  });

  ctx.response.body = {
    success: true,
    data: postsWithAccess,
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

// Get single published post
router.get('/posts/:slug', async (ctx) => {
  const { slug } = ctx.params;

  const post = await queryOne<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    content: unknown;
    coverImage: string;
    featured: boolean;
    readingTime: number;
    publishedAt: string;
    visibility: string;
    allowedTiers: string[];
    metaTitle: string;
    metaDescription: string;
    authorName: string;
    authorAvatar: string;
    kudosCount: number;
    tags: Tag[];
  }>(
    `
    SELECT p.id, p.slug, p.title, p.excerpt, p.content, p.cover_image as "coverImage",
           p.featured, p.reading_time as "readingTime", p.published_at as "publishedAt",
           p.visibility, p.allowed_tiers as "allowedTiers",
           p.meta_title as "metaTitle", p.meta_description as "metaDescription",
           u.name as "authorName", u.avatar as "authorAvatar",
           p.kudos_count as "kudosCount",
           COALESCE(
             json_agg(
               json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'color', t.color)
               ORDER BY t.name
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) as tags
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.slug = $1 AND p.status = 'published'
    GROUP BY p.id, u.name, u.avatar
  `,
    [slug],
  );

  if (!post) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } };
    return;
  }

  // Increment view count (fire and forget)
  query('UPDATE post_analytics SET views = views + 1 WHERE post_id = $1 AND date = CURRENT_DATE', [
    post.id,
  ])
    .catch(() => {/* ignore */});

  // Check if user has access to the full content
  const member = ctx.auth?.member;
  const isAdmin = ctx.auth?.isAdmin;
  let hasAccess = false;

  if (post.visibility === 'public' || isAdmin) {
    hasAccess = true;
  } else if (post.visibility === 'members' && member) {
    hasAccess = true;
  } else if (post.visibility === 'paid' && member && member.tier !== 'free') {
    hasAccess = true;
  } else if (post.visibility === 'tiers' && member && post.allowedTiers?.includes(member.tier)) {
    hasAccess = true;
  }

  if (hasAccess) {
    // Return full post (strip internal fields)
    const { visibility: _v, allowedTiers: _at, ...postData } = post;
    ctx.response.body = { success: true, data: postData };
  } else {
    // Return metadata only - no content
    const { content: _c, visibility: _v, allowedTiers: _at, ...postPreview } = post;
    ctx.response.body = {
      success: true,
      data: {
        ...postPreview,
        requiresSubscription: true,
        accessLevel: post.visibility,
      },
    };
  }
});

// Give kudos to a post
router.post('/posts/:slug/kudos', async (ctx) => {
  const { slug } = ctx.params;

  const result = await queryOne<{ kudos_count: number }>(
    `
    UPDATE posts SET kudos_count = kudos_count + 1
    WHERE slug = $1 AND status = 'published'
    RETURNING kudos_count
  `,
    [slug],
  );

  if (!result) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } };
    return;
  }

  ctx.response.body = { success: true, data: { kudosCount: result.kudos_count } };
});

// Search published posts
router.get('/search', async (ctx) => {
  const q = ctx.request.url.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    ctx.response.body = { success: true, data: [], query: q || '' };
    return;
  }

  // Use PostgreSQL full-text search with fallback to ILIKE
  const posts = await query<{
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    readingTime: number;
    publishedAt: string;
    authorName: string;
    tags: Tag[];
  }>(
    `
    SELECT p.id, p.slug, p.title, p.excerpt,
           p.reading_time as "readingTime", p.published_at as "publishedAt",
           u.name as "authorName",
           COALESCE(
             json_agg(
               json_build_object('id', t.id, 'slug', t.slug, 'name', t.name, 'color', t.color)
               ORDER BY t.name
             ) FILTER (WHERE t.id IS NOT NULL),
             '[]'
           ) as tags
    FROM posts p
    JOIN users u ON p.author_id = u.id
    LEFT JOIN posts_tags pt ON p.id = pt.post_id
    LEFT JOIN tags t ON pt.tag_id = t.id
    WHERE p.status = 'published'
      AND (
        to_tsvector('english', p.title || ' ' || COALESCE(p.excerpt, '')) @@ plainto_tsquery('english', $1)
        OR p.title ILIKE $2
        OR p.excerpt ILIKE $2
      )
    GROUP BY p.id, u.name
    ORDER BY p.published_at DESC
    LIMIT 20
  `,
    [q, `%${q}%`],
  );

  ctx.response.body = { success: true, data: posts, query: q };
});

// Get all tags
router.get('/tags', async (ctx) => {
  const tags = await query<Tag & { postCount: number }>(`
    SELECT t.*, COUNT(p.id) as "postCount"
    FROM tags t
    LEFT JOIN posts_tags pt ON t.id = pt.tag_id
    LEFT JOIN posts p ON pt.post_id = p.id AND p.status = 'published'
    GROUP BY t.id
    ORDER BY "postCount" DESC, t.name
  `);

  ctx.response.body = { success: true, data: tags };
});

// Get page by slug
router.get('/pages/:slug', async (ctx) => {
  const { slug } = ctx.params;

  const page = await queryOne<Page>(
    `
    SELECT id, slug, title, content, template, meta_title, meta_description
    FROM pages
    WHERE slug = $1 AND status = 'published'
  `,
    [slug],
  );

  if (!page) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Page not found' } };
    return;
  }

  ctx.response.body = { success: true, data: page };
});

// RSS Feed
router.get('/rss', async (ctx) => {
  const settings = await queryOne<{ title: string; description: string; permalink_format: string }>(
    'SELECT title, description, permalink_format FROM settings WHERE id = 1',
  );
  const siteTitle = settings?.title || 'Meridian';
  const siteDesc = settings?.description || 'A modern publishing platform';
  const permalinkFormat = settings?.permalink_format || '/:slug';

  const baseUrl = ctx.request.url.origin || `${ctx.request.url.protocol}//${ctx.request.url.host}`;

  const posts = await query<{
    slug: string;
    title: string;
    excerpt: string;
    content: unknown;
    publishedAt: string;
    authorName: string;
  }>(`
    SELECT p.slug, p.title, p.excerpt, p.content,
           p.published_at as "publishedAt",
           u.name as "authorName"
    FROM posts p
    JOIN users u ON p.author_id = u.id
    WHERE p.status = 'published' AND p.visibility = 'public'
    ORDER BY p.published_at DESC
    LIMIT 20
  `);

  const escXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const blocksToText = (blocks: unknown): string => {
    if (!Array.isArray(blocks)) return '';
    return blocks.map((b: Record<string, unknown>) => {
      if (typeof b.content === 'string') return b.content;
      return '';
    }).join('\n\n');
  };

  const items = posts.map((p) => {
    const content = blocksToText(p.content);
    const pubDate = new Date(p.publishedAt).toUTCString();
    return `    <item>
      <title>${escXml(p.title)}</title>
      <link>${baseUrl}${permalinkFormat.replace(':slug', escXml(p.slug))}</link>
      <guid isPermaLink="true">${baseUrl}${permalinkFormat.replace(':slug', escXml(p.slug))}</guid>
      <description>${escXml(p.excerpt || content.slice(0, 300))}</description>
      <content:encoded><![CDATA[${content}]]></content:encoded>
      <author>${escXml(p.authorName)}</author>
      <pubDate>${pubDate}</pubDate>
    </item>`;
  }).join('\n');

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(siteTitle)}</title>
    <link>${baseUrl}</link>
    <description>${escXml(siteDesc)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/api/public/rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  ctx.response.type = 'application/rss+xml';
  ctx.response.body = rss;
});

// Newsletter subscription
router.post('/subscribe', async (ctx) => {
  const body = await ctx.request.body.json();
  const email = body.email?.toLowerCase().trim();
  const name = body.name?.trim();

  if (!email || !email.includes('@')) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'INVALID_EMAIL', message: 'Valid email required' },
    };
    return;
  }

  // Check if exists
  const existing = await queryOne<Member>('SELECT id FROM members WHERE email = $1', [email]);

  if (existing) {
    ctx.response.body = { success: true, data: { alreadySubscribed: true, email } };
    return;
  }

  // Create member
  await queryOne<Member>(
    `
    INSERT INTO members (email, name, tier, status)
    VALUES ($1, $2, 'free', 'active')
    RETURNING id
  `,
    [email, name || null],
  );

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: { subscribed: true, email } };
});

export { router as publicRouter };
