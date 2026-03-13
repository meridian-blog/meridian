/**
 * Stripe Payment Routes
 * Checkout sessions, webhooks, and customer portal
 */

import { Router } from '@oak/oak';
import { execute, query, queryOne } from '../../db/connection.ts';
import { authMiddleware } from '../middleware/auth.ts';
import { generateToken } from '../middleware/auth.ts';
import type { Member, SubscriptionTier } from '../../shared/types.ts';

const router = new Router();

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

// Lazy-init Stripe client
let _stripe: any = null;
async function getStripe() {
  if (!_stripe) {
    if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
    const Stripe = (await import('stripe')).default;
    _stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
  }
  return _stripe;
}

// Check if Stripe is configured
function stripeEnabled(): boolean {
  return !!STRIPE_SECRET_KEY;
}

// --- Public: Get active subscription tiers ---
router.get('/tiers', async (ctx) => {
  const tiers = await query<SubscriptionTier>(`
    SELECT id, name, description, price, currency, interval, benefits, sort_order
    FROM subscription_tiers
    WHERE is_active = true
    ORDER BY sort_order, price
  `);

  ctx.response.body = { success: true, data: tiers, stripeEnabled: stripeEnabled() };
});

// --- Public: Create checkout session ---
router.post('/checkout', async (ctx) => {
  if (!stripeEnabled()) {
    ctx.response.status = 503;
    ctx.response.body = {
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payments are not configured' },
    };
    return;
  }

  const body = await ctx.request.body.json();
  const { tierId, email, successUrl, cancelUrl } = body;

  if (!tierId || !email) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'tierId and email are required' },
    };
    return;
  }

  // Get tier
  const tier = await queryOne<SubscriptionTier & { stripe_price_id: string }>(
    `
    SELECT * FROM subscription_tiers WHERE id = $1 AND is_active = true
  `,
    [tierId],
  );

  if (!tier) {
    ctx.response.status = 404;
    ctx.response.body = { success: false, error: { code: 'NOT_FOUND', message: 'Tier not found' } };
    return;
  }

  const stripe = await getStripe();
  const origin = ctx.request.url.origin || `${ctx.request.url.protocol}//${ctx.request.url.host}`;

  // Find or create member
  let member = await queryOne<Member & { stripe_customer_id: string }>(
    'SELECT * FROM members WHERE email = $1',
    [email.toLowerCase()],
  );

  if (!member) {
    member = await queryOne<Member & { stripe_customer_id: string }>(
      `
      INSERT INTO members (email, tier, status) VALUES ($1, 'free', 'active') RETURNING *
    `,
      [email.toLowerCase()],
    );
  }

  // Find or create Stripe customer
  let customerId = member!.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email.toLowerCase(),
      metadata: { meridian_member_id: member!.id },
    });
    customerId = customer.id;
    await execute('UPDATE members SET stripe_customer_id = $1 WHERE id = $2', [
      customerId,
      member!.id,
    ]);
  }

  // Create or find Stripe Price
  let priceId = tier.stripe_price_id;
  if (!priceId) {
    // Create product + price in Stripe
    const product = await stripe.products.create({
      name: tier.name,
      description: tier.description || undefined,
      metadata: { meridian_tier_id: tier.id },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.price,
      currency: tier.currency || 'usd',
      recurring: { interval: tier.interval || 'month' },
    });

    priceId = price.id;
    await execute('UPDATE subscription_tiers SET stripe_price_id = $1 WHERE id = $2', [
      priceId,
      tier.id,
    ]);
  }

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl || `${origin}/post/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || origin,
    metadata: {
      meridian_member_id: member!.id,
      meridian_tier_id: tier.id,
    },
  });

  ctx.response.body = { success: true, data: { sessionId: session.id, url: session.url } };
});

// --- Public: Create customer portal session ---
router.post('/portal', async (ctx) => {
  if (!stripeEnabled()) {
    ctx.response.status = 503;
    ctx.response.body = {
      success: false,
      error: { code: 'STRIPE_NOT_CONFIGURED', message: 'Payments are not configured' },
    };
    return;
  }

  // Require member auth
  await authMiddleware(ctx, async () => {});
  const member = ctx.auth?.member;

  if (!member) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Member login required' },
    };
    return;
  }

  const memberRow = await queryOne<{ stripe_customer_id: string }>(
    'SELECT stripe_customer_id FROM members WHERE id = $1',
    [member.id],
  );

  if (!memberRow?.stripe_customer_id) {
    ctx.response.status = 400;
    ctx.response.body = {
      success: false,
      error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found' },
    };
    return;
  }

  const stripe = await getStripe();
  const origin = ctx.request.url.origin || `${ctx.request.url.protocol}//${ctx.request.url.host}`;

  const session = await stripe.billingPortal.sessions.create({
    customer: memberRow.stripe_customer_id,
    return_url: origin,
  });

  ctx.response.body = { success: true, data: { url: session.url } };
});

// --- Webhook: Handle Stripe events ---
router.post('/webhook', async (ctx) => {
  if (!stripeEnabled()) {
    ctx.response.status = 503;
    ctx.response.body = { received: false };
    return;
  }

  const stripe = await getStripe();
  const body = await ctx.request.body.text();
  const sig = ctx.request.headers.get('stripe-signature');

  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // Development: parse without signature verification
      event = JSON.parse(body);
      console.log('[Stripe Webhook] WARNING: No signature verification (dev mode)');
    }
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', (err as Error).message);
    ctx.response.status = 400;
    ctx.response.body = { received: false, error: 'Invalid signature' };
    return;
  }

  console.log(`[Stripe Webhook] ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const memberId = session.metadata?.meridian_member_id;
        const tierId = session.metadata?.meridian_tier_id;

        if (memberId && tierId) {
          // Get tier info to determine member tier level
          const tier = await queryOne<{ name: string; price: number; currency: string }>(
            'SELECT name, price, currency FROM subscription_tiers WHERE id = $1',
            [tierId],
          );
          const tierLevel = tier && tier.price > 0 ? 'premium' : 'basic';

          // Update member
          await execute(
            `
            UPDATE members SET tier = $1, subscription_id = $2, status = 'active'
            WHERE id = $3
          `,
            [tierLevel, session.subscription, memberId],
          );

          // Record payment
          await execute(
            `
            INSERT INTO payments (member_id, tier_id, amount, currency, status, stripe_payment_intent_id)
            VALUES ($1, $2, $3, $4, 'succeeded', $5)
          `,
            [
              memberId,
              tierId,
              session.amount_total || 0,
              tier?.currency || 'usd',
              session.payment_intent,
            ],
          );

          console.log(`[Stripe] Member ${memberId} upgraded to ${tierLevel}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const member = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE stripe_customer_id = $1',
          [customerId],
        );
        if (member) {
          const status = subscription.status === 'active'
            ? 'active'
            : subscription.status === 'past_due'
            ? 'past_due'
            : subscription.status === 'trialing'
            ? 'trialing'
            : 'cancelled';
          await execute('UPDATE members SET status = $1, subscription_id = $2 WHERE id = $3', [
            status,
            subscription.id,
            member.id,
          ]);
          console.log(`[Stripe] Member ${member.id} subscription status: ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const member = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE stripe_customer_id = $1',
          [customerId],
        );
        if (member) {
          await execute(
            `UPDATE members SET tier = 'free', status = 'cancelled', subscription_id = NULL WHERE id = $1`,
            [member.id],
          );
          console.log(`[Stripe] Member ${member.id} subscription cancelled, downgraded to free`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const member = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE stripe_customer_id = $1',
          [customerId],
        );
        if (member) {
          await execute(`UPDATE members SET status = 'past_due' WHERE id = $1`, [member.id]);
          console.log(`[Stripe] Member ${member.id} payment failed, marked past_due`);
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error handling ${event.type}:`, (err as Error).message);
  }

  ctx.response.body = { received: true };
});

export { router as stripeRouter };
