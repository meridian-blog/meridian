/**
 * Settings API Routes
 * Site configuration and appearance
 */

import { Router } from '@oak/oak';
import { execute, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin } from '../middleware/auth.ts';
import type { SiteSettings } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// Default settings
const defaultSettings: SiteSettings = {
  title: 'Meridian',
  description: 'A modern publishing platform',
  logo: null,
  coverImage: null,
  icon: null,
  accentColor: '#C41E3A',
  theme: 'editorial',
  language: 'en',
  timezone: 'UTC',
  membersEnabled: true,
  subscriptionsEnabled: true,
  newsletterEnabled: true,
  defaultPostVisibility: 'public',
  permalinkFormat: '/:slug',
  socialLinks: {},
  seo: {
    metaTitle: null,
    metaDescription: null,
    ogImage: null,
    twitterCard: 'summary_large_image',
  },
  navigation: [],
};

// Get settings (public)
router.get('/', async (ctx) => {
  const settings = await queryOne<{
    title: string;
    description: string;
    logo: string;
    cover_image: string;
    icon: string;
    accent_color: string;
    theme: string;
    language: string;
    timezone: string;
    members_enabled: boolean;
    subscriptions_enabled: boolean;
    newsletter_enabled: boolean;
    default_post_visibility: string;
    permalink_format: string;
    social_links: Record<string, string>;
    seo: Record<string, unknown>;
    navigation: Array<{ label: string; url: string; newTab: boolean }>;
  }>(`SELECT * FROM settings WHERE id = 1`);

  if (!settings) {
    ctx.response.body = { success: true, data: defaultSettings };
    return;
  }

  const formatted: SiteSettings = {
    title: settings.title,
    description: settings.description,
    logo: settings.logo,
    coverImage: settings.cover_image,
    icon: settings.icon,
    accentColor: settings.accent_color,
    theme: settings.theme as 'editorial' | 'terminal' | 'gallery',
    language: settings.language,
    timezone: settings.timezone,
    membersEnabled: settings.members_enabled,
    subscriptionsEnabled: settings.subscriptions_enabled,
    newsletterEnabled: settings.newsletter_enabled,
    defaultPostVisibility: settings.default_post_visibility as 'public' | 'members',
    permalinkFormat: settings.permalink_format || '/:slug',
    socialLinks: settings.social_links,
    seo: {
      metaTitle: settings.seo?.metaTitle as string || null,
      metaDescription: settings.seo?.metaDescription as string || null,
      ogImage: settings.seo?.ogImage as string || null,
      twitterCard: (settings.seo?.twitterCard as 'summary' | 'summary_large_image') ||
        'summary_large_image',
    },
    navigation: settings.navigation || [],
  };

  ctx.response.body = { success: true, data: formatted };
});

// Update settings (admin only)
router.put('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const body = await ctx.request.body.json();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const fieldMapping: Record<string, string> = {
    title: 'title',
    description: 'description',
    logo: 'logo',
    coverImage: 'cover_image',
    icon: 'icon',
    accentColor: 'accent_color',
    theme: 'theme',
    language: 'language',
    timezone: 'timezone',
    membersEnabled: 'members_enabled',
    subscriptionsEnabled: 'subscriptions_enabled',
    newsletterEnabled: 'newsletter_enabled',
    defaultPostVisibility: 'default_post_visibility',
    permalinkFormat: 'permalink_format',
    socialLinks: 'social_links',
    seo: 'seo',
    navigation: 'navigation',
  };

  for (const [key, dbField] of Object.entries(fieldMapping)) {
    if (body[key] !== undefined) {
      updates.push(`${dbField} = $${paramIndex++}`);
      params.push(typeof body[key] === 'object' ? JSON.stringify(body[key]) : body[key]);
    }
  }

  if (updates.length === 0) {
    ctx.response.body = { success: true, data: body };
    return;
  }

  await execute(`UPDATE settings SET ${updates.join(', ')} WHERE id = 1`, params);

  ctx.response.body = { success: true, data: body };
});

export { router as settingsRouter };
