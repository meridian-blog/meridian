/**
 * Email Service
 * Supports Resend (default) and logs-only fallback for development
 */

const EMAIL_PROVIDER = Deno.env.get('EMAIL_PROVIDER') || '';
const EMAIL_API_KEY = Deno.env.get('EMAIL_API_KEY') || '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'newsletter@meridian.blog';

export function emailEnabled(): boolean {
  return !!EMAIL_PROVIDER && !!EMAIL_API_KEY;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

interface SendBatchOptions {
  recipients: string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

async function sendViaResend(opts: SendEmailOptions): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from || EMAIL_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error (${res.status}): ${err}`);
  }

  return await res.json();
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!emailEnabled()) {
    console.log(`[Email] (dev mode) Would send to ${opts.to}: "${opts.subject}"`);
    return true;
  }

  try {
    if (EMAIL_PROVIDER === 'resend') {
      await sendViaResend(opts);
    } else {
      console.warn(`[Email] Unknown provider: ${EMAIL_PROVIDER}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send to ${opts.to}:`, (err as Error).message);
    return false;
  }
}

export async function sendBatch(opts: SendBatchOptions): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Resend supports batch API (up to 100 per call)
  if (emailEnabled() && EMAIL_PROVIDER === 'resend') {
    const batches = chunkArray(opts.recipients, 100);

    for (const batch of batches) {
      try {
        const res = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${EMAIL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            batch.map((to) => ({
              from: opts.from || EMAIL_FROM,
              to: [to],
              subject: opts.subject,
              html: opts.html,
              reply_to: opts.replyTo,
            })),
          ),
        });

        if (res.ok) {
          sent += batch.length;
        } else {
          const err = await res.text();
          console.error(`[Email] Batch send failed:`, err);
          failed += batch.length;
        }
      } catch (err) {
        console.error(`[Email] Batch send error:`, (err as Error).message);
        failed += batch.length;
      }
    }
  } else {
    // Dev mode: just log
    for (const to of opts.recipients) {
      console.log(`[Email] (dev mode) Would send to ${to}: "${opts.subject}"`);
      sent++;
    }
  }

  return { sent, failed };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
