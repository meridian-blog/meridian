/**
 * Newsletter API Routes
 * Email campaign management
 */

import { Router } from '@oak/oak';
import { execute, query, queryOne } from '../../db/connection.ts';
import { authMiddleware, requireAdmin } from '../middleware/auth.ts';
import { emailEnabled, sendBatch } from '../services/email.ts';
import type { ContentBlock, Newsletter } from '../../shared/types.ts';

const router = new Router();
router.use(authMiddleware);

// List newsletters
router.get('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const newsletters = await query<Newsletter>(`
    SELECT n.*, p.title as post_title
    FROM newsletters n
    LEFT JOIN posts p ON n.post_id = p.id
    ORDER BY n.created_at DESC
  `);

  ctx.response.body = { success: true, data: newsletters };
});

// Get single newsletter
router.get('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const newsletter = await queryOne<Newsletter & { postTitle: string }>(
    `
    SELECT n.*, p.title as "postTitle"
    FROM newsletters n
    LEFT JOIN posts p ON n.post_id = p.id
    WHERE n.id = $1
  `,
    [id],
  );

  if (!newsletter) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Newsletter not found' },
    };
    return;
  }

  ctx.response.body = { success: true, data: newsletter };
});

// Create newsletter
router.post('/', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const body = await ctx.request.body.json();

  const newsletter = await queryOne<Newsletter>(
    `
    INSERT INTO newsletters (subject, post_id, content, status, scheduled_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `,
    [
      body.subject,
      body.postId || null,
      JSON.stringify(body.content || []),
      body.scheduledAt ? 'scheduled' : 'draft',
      body.scheduledAt || null,
    ],
  );

  ctx.response.status = 201;
  ctx.response.body = { success: true, data: newsletter };
});

// Update newsletter
router.put('/:id', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;
  const body = await ctx.request.body.json();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (body.subject !== undefined) {
    updates.push(`subject = $${paramIndex++}`);
    params.push(body.subject);
  }
  if (body.content !== undefined) {
    updates.push(`content = $${paramIndex++}`);
    params.push(JSON.stringify(body.content));
  }
  if (body.scheduledAt !== undefined) {
    updates.push(`scheduled_at = $${paramIndex++}`);
    params.push(body.scheduledAt);
    updates.push(`status = 'scheduled'`);
  }

  const newsletter = await queryOne<Newsletter>(
    `
    UPDATE newsletters SET ${updates.join(', ')} WHERE id = $${paramIndex}
    RETURNING *
  `,
    [...params, id],
  );

  if (!newsletter) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Newsletter not found' },
    };
    return;
  }

  ctx.response.body = { success: true, data: newsletter };
});

// Send newsletter (or schedule)
router.post('/:id/send', async (ctx) => {
  if (!requireAdmin(ctx)) return;

  const { id } = ctx.params;

  const newsletter = await queryOne<Newsletter & { post_id: string | null }>(
    'SELECT * FROM newsletters WHERE id = $1',
    [id],
  );

  if (!newsletter) {
    ctx.response.status = 404;
    ctx.response.body = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Newsletter not found' },
    };
    return;
  }

  if (newsletter.status === 'sent') {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'ALREADY_SENT', message: 'Newsletter already sent' },
    };
    return;
  }

  // Get active subscribers
  const subscribers = await query<{ email: string }>(`
    SELECT email FROM members WHERE status = 'active'
  `);

  if (!subscribers.length) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'NO_SUBSCRIBERS', message: 'No active subscribers to send to' },
    };
    return;
  }

  // Get permalink format for links
  const siteSettings = await queryOne<{ permalink_format: string }>(
    'SELECT permalink_format FROM settings WHERE id = 1',
  );
  const permalinkFormat = siteSettings?.permalink_format || '/:slug';

  // Build HTML content
  let htmlBody = '';
  if (newsletter.post_id) {
    const post = await queryOne<{ title: string; content: string; slug: string }>(
      `
      SELECT title, content, slug FROM posts WHERE id = $1
    `,
      [newsletter.post_id],
    );
    if (post) {
      const blocks = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
      const postPath = permalinkFormat.replace(':slug', post.slug);
      htmlBody = renderNewsletterHtml(newsletter.subject, blocksToHtml(blocks), postPath);
    }
  }
  if (!htmlBody) {
    const raw = newsletter.content as unknown;
    const blocks: ContentBlock[] = typeof raw === 'string'
      ? JSON.parse(raw)
      : (Array.isArray(raw) ? raw : []);
    htmlBody = renderNewsletterHtml(newsletter.subject, blocksToHtml(blocks));
  }

  // Update status to sending
  await execute(
    `
    UPDATE newsletters
    SET status = 'sending', recipient_count = $1, sent_at = NOW()
    WHERE id = $2
  `,
    [subscribers.length, id],
  );

  // Send emails
  const emails = subscribers.map((s) => s.email);
  const { sent, failed } = await sendBatch({
    recipients: emails,
    subject: newsletter.subject,
    html: htmlBody,
  });

  // Update final status
  const finalStatus = failed === 0 ? 'sent' : (sent === 0 ? 'failed' : 'sent');
  await execute(
    `
    UPDATE newsletters SET status = $1, recipient_count = $2 WHERE id = $3
  `,
    [finalStatus, sent, id],
  );

  console.log(`[Newsletter] ${id} sent to ${sent}/${subscribers.length} (${failed} failed)`);

  ctx.response.body = { success: true, data: { sent, failed, total: subscribers.length } };
});

// --- Email status endpoint ---
router.get('/status', (_ctx) => {
  _ctx.response.body = { success: true, data: { emailEnabled: emailEnabled() } };
});

// --- HTML rendering helpers ---

function blocksToHtml(blocks: ContentBlock[]): string {
  if (!blocks || !Array.isArray(blocks)) return '<p>No content</p>';

  return blocks.map((block) => {
    const text = typeof block.content === 'string' ? block.content : '';
    const props = block.props || {};

    switch (block.type) {
      case 'text':
        return `<p style="margin:0 0 16px;line-height:1.6;color:#1A1A1A;">${text}</p>`;
      case 'heading': {
        const tag = `h${props.level || 2}`;
        return `<${tag} style="margin:24px 0 8px;color:#1A1A1A;font-family:Georgia,serif;">${text}</${tag}>`;
      }
      case 'quote':
        return `<blockquote style="margin:16px 0;padding:12px 20px;border-left:3px solid #C41E3A;color:#6B6B6B;font-style:italic;">${text}</blockquote>`;
      case 'code':
        return `<pre style="margin:16px 0;padding:16px;background:#f5f5f5;border-radius:4px;overflow-x:auto;font-size:14px;"><code>${
          escapeHtml(text)
        }</code></pre>`;
      case 'image':
        return `<img src="${props.url || ''}" alt="${
          props.alt || ''
        }" style="max-width:100%;height:auto;margin:16px 0;border-radius:4px;">`;
      case 'divider':
        return `<hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5;">`;
      case 'html':
        return text;
      default:
        return `<p style="margin:0 0 16px;line-height:1.6;">${text}</p>`;
    }
  }).join('\n');
}

function renderNewsletterHtml(subject: string, bodyHtml: string, postPath?: string): string {
  const readOnlineLink = postPath
    ? `<p style="text-align:center;margin-bottom:24px;"><a href="{{origin}}${postPath}" style="color:#6B6B6B;font-size:13px;">Read online</a></p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF9F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF9F6;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:24px;text-align:center;">
          <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#1A1A1A;">${
    escapeHtml(subject)
  }</h1>
        </td></tr>
        ${readOnlineLink ? `<tr><td>${readOnlineLink}</td></tr>` : ''}
        <tr><td style="background:#ffffff;padding:32px;border:1px solid rgba(0,0,0,0.06);">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="color:#6B6B6B;font-size:12px;margin:0;">You received this because you subscribed to our newsletter.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { router as newslettersRouter };
