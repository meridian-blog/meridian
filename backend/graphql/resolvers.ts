/**
 * GraphQL Resolvers
 */

import { execute, query, queryOne } from '../../db/connection.ts';
import type { Member, Post, Tag, User } from '../../shared/types.ts';

export const resolvers = {
  Query: {
    // Posts
    posts: async (
      _: unknown,
      args: { filter?: Record<string, unknown>; pagination?: { page?: number; perPage?: number } },
    ) => {
      const page = args.pagination?.page || 1;
      const perPage = Math.min(args.pagination?.perPage || 20, 100);
      const offset = (page - 1) * perPage;

      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (args.filter?.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(args.filter.status);
      }
      if (args.filter?.featured) {
        conditions.push('featured = true');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const posts = await query<Post>(
        `
        SELECT * FROM posts ${whereClause}
        ORDER BY published_at DESC NULLS LAST
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `,
        [...params, perPage, offset],
      );

      const countResult = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM posts ${whereClause}`,
        params,
      );

      return {
        edges: posts,
        pageInfo: {
          hasNextPage: page * perPage < parseInt(countResult?.count || '0'),
          hasPreviousPage: page > 1,
          total: parseInt(countResult?.count || '0'),
          currentPage: page,
        },
      };
    },

    post: async (_: unknown, args: { id?: string; slug?: string }) => {
      if (args.id) {
        return await queryOne<Post>('SELECT * FROM posts WHERE id = $1', [args.id]);
      }
      if (args.slug) {
        return await queryOne<Post>('SELECT * FROM posts WHERE slug = $1', [args.slug]);
      }
      return null;
    },

    // Tags
    tags: async () => {
      return await query<Tag>('SELECT * FROM tags ORDER BY name');
    },

    tag: async (_: unknown, args: { slug: string }) => {
      return await queryOne<Tag>('SELECT * FROM tags WHERE slug = $1', [args.slug]);
    },

    // Members
    members: async (_: unknown, args: { pagination?: { page?: number; perPage?: number } }) => {
      const perPage = Math.min(args.pagination?.perPage || 50, 100);
      const offset = ((args.pagination?.page || 1) - 1) * perPage;
      return await query<Member>(
        'SELECT * FROM members ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [perPage, offset],
      );
    },

    member: async (_: unknown, args: { id: string }) => {
      return await queryOne<Member>('SELECT * FROM members WHERE id = $1', [args.id]);
    },

    // Settings
    settings: async () => {
      return await queryOne('SELECT * FROM settings WHERE id = 1');
    },

    // Dashboard stats
    dashboardStats: async () => {
      const [posts, members, recent] = await Promise.all([
        queryOne<{ count: string }>('SELECT COUNT(*) as count FROM posts'),
        queryOne<{ count: string }>('SELECT COUNT(*) as count FROM members'),
        query<Post>('SELECT * FROM posts ORDER BY created_at DESC LIMIT 5'),
      ]);

      return {
        totalPosts: parseInt(posts?.count || '0'),
        totalMembers: parseInt(members?.count || '0'),
        newMembersThisMonth: 0, // TODO
        totalPageViews: 0, // TODO
        recentPosts: recent,
        topPosts: [],
      };
    },

    // Search
    search: async (_: unknown, args: { query: string }) => {
      return await query<Post>(
        `
        SELECT * FROM posts
        WHERE status = 'published'
        AND (title ILIKE $1 OR excerpt ILIKE $1)
        ORDER BY published_at DESC
        LIMIT 20
      `,
        [`%${args.query}%`],
      );
    },
  },

  Post: {
    author: async (parent: Post) => {
      return await queryOne<User>('SELECT * FROM users WHERE id = $1', [parent.authorId]);
    },
    tags: async (parent: Post) => {
      return await query<Tag>(
        `
        SELECT t.* FROM tags t
        JOIN posts_tags pt ON t.id = pt.tag_id
        WHERE pt.post_id = $1
      `,
        [parent.id],
      );
    },
  },

  Mutation: {
    createPost: async (_: unknown, args: { input: Record<string, unknown> }) => {
      // Simplified - would need full implementation
      return await queryOne<Post>(
        `
        INSERT INTO posts (title, slug, content, status, author_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
        [args.input.title, 'test-slug', JSON.stringify(args.input.content), 'draft', 'system'],
      );
    },

    updatePost: async (_: unknown, args: { id: string; input: Record<string, unknown> }) => {
      return await queryOne<Post>(
        `
        UPDATE posts SET title = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
        [args.input.title, args.id],
      );
    },

    deletePost: async (_: unknown, args: { id: string }) => {
      const result = await execute('DELETE FROM posts WHERE id = $1', [args.id]);
      return result > 0;
    },

    updateMember: async (_: unknown, args: { id: string; input: Record<string, unknown> }) => {
      return await queryOne<Member>(
        `
        UPDATE members SET name = $1, tier = $2
        WHERE id = $3
        RETURNING *
      `,
        [args.input.name, args.input.tier, args.id],
      );
    },

    deleteMember: async (_: unknown, args: { id: string }) => {
      const result = await execute('DELETE FROM members WHERE id = $1', [args.id]);
      return result > 0;
    },

    updateSettings: async (_: unknown, args: { input: Record<string, unknown> }) => {
      return await queryOne(
        `
        UPDATE settings SET title = $1, updated_at = NOW()
        WHERE id = 1
        RETURNING *
      `,
        [args.input.title],
      );
    },
  },
};
