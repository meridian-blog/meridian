/**
 * Meridian Blog Engine - Shared Types
 * Core domain models for the publishing platform
 */

// ===== USER & MEMBERSHIP =====

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  AUTHOR = 'author',
  CONTRIBUTOR = 'contributor',
}

export enum MemberTier {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  LIFETIME = 'lifetime',
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface Member {
  id: string;
  email: string;
  name: string | null;
  tier: MemberTier;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  subscriptionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
}

// ===== CONTENT =====

export enum PostStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  UNLISTED = 'unlisted',
  ARCHIVED = 'archived',
}

export enum ContentType {
  TEXT = 'text',
  HEADING = 'heading',
  IMAGE = 'image',
  GALLERY = 'gallery',
  EMBED = 'embed',
  CALLOUT = 'callout',
  QUOTE = 'quote',
  CODE = 'code',
  DIVIDER = 'divider',
  PAYWALL = 'paywall',
  HTML = 'html',
}

export interface ContentBlock {
  id: string;
  type: ContentType;
  props: Record<string, unknown>;
  content: string | ContentBlock[] | null;
}

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  authorId: string;
  status: PostStatus;
  visibility: 'public' | 'members' | 'paid' | 'tiers';
  allowedTiers: MemberTier[];
  content: ContentBlock[];
  tags: Tag[];
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  featured: boolean;
  readingTime: number;
  engagementScore: number;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  postCount: number;
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  content: ContentBlock[];
  status: PostStatus;
  template: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== NEWSLETTER =====

export interface Newsletter {
  id: string;
  subject: string;
  postId: string | null;
  content: ContentBlock[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  recipientCount: number;
  openCount: number;
  clickCount: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

// ===== ANALYTICS =====

export interface AnalyticsSnapshot {
  date: Date;
  pageViews: number;
  uniqueVisitors: number;
  newMembers: number;
  revenue: number;
  topPosts: { postId: string; views: number }[];
  trafficSources: Record<string, number>;
}

export interface MemberEngagement {
  memberId: string;
  score: number;
  lastActiveAt: Date;
  emailOpenRate: number;
  articlesRead: number;
  commentsMade: number;
}

// ===== SETTINGS =====

export interface SiteSettings {
  title: string;
  description: string;
  logo: string | null;
  coverImage: string | null;
  icon: string | null;
  accentColor: string;
  theme: 'editorial' | 'terminal' | 'gallery';
  language: string;
  timezone: string;
  membersEnabled: boolean;
  subscriptionsEnabled: boolean;
  newsletterEnabled: boolean;
  defaultPostVisibility: 'public' | 'members';
  permalinkFormat: string;
  socialLinks: {
    twitter?: string;
    github?: string;
    linkedin?: string;
    youtube?: string;
  };
  seo: {
    metaTitle: string | null;
    metaDescription: string | null;
    ogImage: string | null;
    twitterCard: 'summary' | 'summary_large_image';
  };
  navigation: NavigationItem[];
}

export interface NavigationItem {
  label: string;
  url: string;
  newTab: boolean;
}

// ===== API RESPONSES =====

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// ===== REFERRAL SYSTEM =====

export interface ReferralProgram {
  id: string;
  name: string;
  type: 'tiered' | 'milestone' | 'double_sided';
  isActive: boolean;
  rewards: ReferralReward[];
}

export interface ReferralReward {
  id: string;
  threshold: number;
  type: 'digital' | 'physical' | 'monetary';
  value: string;
  description: string;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredId: string | null;
  code: string;
  status: 'pending' | 'converted' | 'expired';
  convertedAt: Date | null;
  createdAt: Date;
}

// ===== PAYMENTS =====

export interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  stripePriceId: string | null;
  benefits: string[];
  isActive: boolean;
}

export interface Payment {
  id: string;
  memberId: string;
  tierId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  stripePaymentIntentId: string | null;
  createdAt: Date;
}
