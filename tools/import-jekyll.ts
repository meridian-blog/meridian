#!/usr/bin/env -S deno run --allow-all
/**
 * Jekyll Import Tool
 * Imports posts from a Jekyll Atom/RSS feed into Meridian.
 *
 * Usage:
 *   deno run --allow-all tools/import-jekyll.ts <feed-url> [options]
 *
 * Options:
 *   --api-url=http://localhost:8000  Base URL of your Meridian instance
 *   --email=admin@meridian.blog      Admin email
 *   --password=password              Admin password
 *   --dry-run                        Preview without importing
 *   --status=draft|published         Import status (default: draft)
 *
 * Examples:
 *   deno run --allow-all tools/import-jekyll.ts https://aliirz.com/feed.xml --dry-run
 *   deno run --allow-all tools/import-jekyll.ts https://aliirz.com/feed.xml --status=published
 */

// --- Parse args ---
const args = parseArgs(Deno.args);

if (!args.feedUrl) {
  console.log(`
Jekyll Import Tool for Meridian
================================
Usage: deno run --allow-all tools/import-jekyll.ts <feed-url> [options]

Options:
  --api-url=URL        Meridian API base (default: http://localhost:8000)
  --email=EMAIL        Admin email (default: admin@meridian.blog)
  --password=PASS      Admin password (default: password)
  --dry-run            Preview imports without creating posts
  --status=STATUS      Post status: draft or published (default: draft)
`);
  Deno.exit(1);
}

const API_URL = args.apiUrl || 'http://localhost:8000';
const EMAIL = args.email || 'admin@meridian.blog';
const PASSWORD = args.password || 'password';
const DRY_RUN = args.dryRun;
const STATUS = args.status || 'draft';

// --- Fetch feed ---
console.log(`\nFetching feed: ${args.feedUrl}`);
const feedRes = await fetch(args.feedUrl);
if (!feedRes.ok) {
  console.error(`Failed to fetch feed: ${feedRes.status} ${feedRes.statusText}`);
  Deno.exit(1);
}

const feedXml = await feedRes.text();
console.log(`Feed fetched (${(feedXml.length / 1024).toFixed(1)} KB)`);

// --- Parse feed entries ---
const entries = parseFeed(feedXml);
console.log(`Found ${entries.length} entries\n`);

if (entries.length === 0) {
  console.log('No entries found in feed. Check the URL.');
  Deno.exit(0);
}

// --- Authenticate ---
let token = '';
if (!DRY_RUN) {
  console.log(`Authenticating as ${EMAIL}...`);
  const authRes = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const authData = await authRes.json();
  if (!authData.success || !authData.data?.token) {
    console.error('Authentication failed:', authData.error?.message || 'Unknown error');
    console.error('Make sure the server is running and credentials are correct.');
    Deno.exit(1);
  }
  token = authData.data.token;
  console.log('Authenticated.\n');
}

// --- Import entries ---
let imported = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  const slug = extractSlug(entry.link);
  const tags = entry.categories;
  const content = htmlToBlocks(entry.content);
  const excerpt = stripHtml(entry.summary || '').slice(0, 300);

  if (DRY_RUN) {
    console.log(`[DRY RUN] ${entry.title}`);
    console.log(`  Slug: ${slug}`);
    console.log(`  Date: ${entry.published}`);
    console.log(`  Tags: ${tags.join(', ') || 'none'}`);
    console.log(`  Blocks: ${content.length}`);
    console.log(`  Excerpt: ${excerpt.slice(0, 80)}...`);
    if (entry.thumbnail) console.log(`  Cover: ${entry.thumbnail}`);
    console.log('');
    imported++;
    continue;
  }

  // Check if post already exists
  const checkRes = await fetch(`${API_URL}/api/public/posts/${slug}`);
  if (checkRes.status === 200) {
    const checkData = await checkRes.json();
    if (checkData.success && checkData.data) {
      console.log(`[SKIP] "${entry.title}" - already exists (slug: ${slug})`);
      skipped++;
      continue;
    }
  }

  const postData = {
    title: entry.title,
    content: content,
    excerpt: excerpt,
    coverImage: entry.thumbnail || undefined,
    status: STATUS,
    tags: tags,
    featured: false,
  };

  try {
    const res = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(postData),
    });
    const data = await res.json();

    if (data.success) {
      console.log(`[OK] "${entry.title}" -> slug: ${data.data.slug}`);
      imported++;
    } else {
      console.log(`[FAIL] "${entry.title}" - ${data.error?.message || 'Unknown error'}`);
      failed++;
    }
  } catch (err) {
    console.log(`[FAIL] "${entry.title}" - ${(err as Error).message}`);
    failed++;
  }

  // Small delay to avoid overwhelming the server
  await new Promise((r) => setTimeout(r, 100));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Import complete${DRY_RUN ? ' (dry run)' : ''}`);
console.log(`  Imported: ${imported}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Failed:   ${failed}`);
console.log(`  Total:    ${entries.length}`);

// === Helper functions ===

interface FeedEntry {
  title: string;
  link: string;
  published: string;
  content: string;
  summary: string;
  categories: string[];
  thumbnail: string | null;
}

function parseFeed(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];

  // Handle both Atom <entry> and RSS <item>
  const entryPattern = /<entry>([\s\S]*?)<\/entry>|<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = entryPattern.exec(xml)) !== null) {
    const block = match[1] || match[2];

    const title = extractTag(block, 'title');
    const link = extractAttr(block, 'link', 'href') || extractTag(block, 'link') ||
      extractTag(block, 'guid');
    const published = extractTag(block, 'published') || extractTag(block, 'pubDate') ||
      extractTag(block, 'updated');
    const content = extractTag(block, 'content') || extractTag(block, 'content:encoded') ||
      extractTag(block, 'description') || '';
    const summary = extractTag(block, 'summary') || extractTag(block, 'description') || '';

    // Categories/tags
    const categories: string[] = [];
    const catPattern = /<category[^>]*term="([^"]*)"[^>]*\/>|<category[^>]*>([^<]*)<\/category>/g;
    let catMatch;
    while ((catMatch = catPattern.exec(block)) !== null) {
      categories.push(catMatch[1] || catMatch[2]);
    }

    // Thumbnail
    const thumbnail = extractAttr(block, 'media:thumbnail', 'url') ||
      extractAttr(block, 'media:content', 'url') || null;

    if (title && link) {
      entries.push({
        title: decodeHtmlEntities(title),
        link,
        published: published || new Date().toISOString(),
        content: decodeHtmlEntities(content),
        summary: decodeHtmlEntities(summary),
        categories,
        thumbnail,
      });
    }
  }

  return entries;
}

function extractTag(xml: string, tag: string): string {
  // Try CDATA first
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1];

  // Normal tag
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function extractSlug(url: string): string {
  // Get the last path segment as slug
  const path = new URL(url, 'https://example.com').pathname;
  return path.replace(/^\/|\/$/g, '').split('/').pop() || 'untitled';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlToBlocks(
  html: string,
): Array<{ id: string; type: string; props: Record<string, unknown>; content: string }> {
  const blocks: Array<
    { id: string; type: string; props: Record<string, unknown>; content: string }
  > = [];
  let id = 1;

  // Split HTML into logical blocks
  // Process headings, paragraphs, blockquotes, code blocks, images
  const parts = html
    .replace(/<\/?(div|section|article|main|header|footer|aside)[^>]*>/gi, '')
    .split(/(?=<(?:h[1-6]|p|blockquote|pre|hr|img)[^>]*>)/i)
    .filter((s) => s.trim());

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Heading
    const headingMatch = trimmed.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    if (headingMatch) {
      blocks.push({
        id: String(id++),
        type: 'heading',
        props: {},
        content: stripHtml(headingMatch[1]),
      });
      continue;
    }

    // Blockquote
    const quoteMatch = trimmed.match(/^<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    if (quoteMatch) {
      blocks.push({
        id: String(id++),
        type: 'quote',
        props: {},
        content: stripHtml(quoteMatch[1]),
      });
      continue;
    }

    // Code block
    const codeMatch = trimmed.match(/^<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (codeMatch) {
      const code = codeMatch[1]
        .replace(/<code[^>]*>/gi, '')
        .replace(/<\/code>/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      blocks.push({
        id: String(id++),
        type: 'code',
        props: {},
        content: code.trim(),
      });
      continue;
    }

    // Horizontal rule
    if (/^<hr\s*\/?>/i.test(trimmed)) {
      blocks.push({
        id: String(id++),
        type: 'divider',
        props: {},
        content: '',
      });
      continue;
    }

    // Image (standalone)
    const imgMatch = trimmed.match(/^<img[^>]*src="([^"]*)"[^>]*>/i);
    if (imgMatch) {
      const alt = trimmed.match(/alt="([^"]*)"/i);
      blocks.push({
        id: String(id++),
        type: 'image',
        props: { src: imgMatch[1], alt: alt ? alt[1] : '' },
        content: '',
      });
      continue;
    }

    // Default: text paragraph
    const text = stripHtml(trimmed);
    if (text) {
      blocks.push({
        id: String(id++),
        type: 'text',
        props: {},
        content: text,
      });
    }
  }

  // If no blocks were created, make one text block from the whole thing
  if (blocks.length === 0) {
    const text = stripHtml(html);
    if (text) {
      blocks.push({
        id: '1',
        type: 'text',
        props: {},
        content: text,
      });
    }
  }

  return blocks;
}

function parseArgs(raw: string[]): {
  feedUrl: string;
  apiUrl: string;
  email: string;
  password: string;
  dryRun: boolean;
  status: string;
} {
  let feedUrl = '';
  let apiUrl = '';
  let email = '';
  let password = '';
  let dryRun = false;
  let status = '';

  for (const arg of raw) {
    if (arg.startsWith('--api-url=')) apiUrl = arg.slice(10);
    else if (arg.startsWith('--email=')) email = arg.slice(8);
    else if (arg.startsWith('--password=')) password = arg.slice(11);
    else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--status=')) status = arg.slice(9);
    else if (!arg.startsWith('--')) feedUrl = arg;
  }

  return { feedUrl, apiUrl, email, password, dryRun, status };
}
