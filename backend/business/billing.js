// Suscripción de la clínica a mainds business (backlog F1.4).
//
// Precio = base por clínica + licencia por profesional (seat). Precios por env:
//   STRIPE_PRICE_ID_BUSINESS_{ESSENTIAL|PLUS}_{BASE|SEAT}           (mensual)
//   STRIPE_PRICE_ID_BUSINESS_{ESSENTIAL|PLUS}_{BASE|SEAT}_YEARLY    (anual)
//
// Separación total de Pro: los objetos de Stripe de una clínica llevan
// metadata { mainds_kind: 'organization', organization_id }. El webhook de
// server.js pregunta primero a handleStripeEvent(); si el evento es de una
// clínica, Pro no lo procesa nunca.

import { asyncRoute, httpError, badRequest } from './errors.js';
import { requireAction } from './workspace.js';
import { PLANS, INTERVALS } from './orgs.js';

export const ORG_KIND = 'organization';

export function readPriceIds(env = process.env) {
  const out = {};
  for (const plan of PLANS) {
    out[plan] = {};
    for (const interval of INTERVALS) {
      const suffix = interval === 'year' ? '_YEARLY' : '';
      const key = `STRIPE_PRICE_ID_BUSINESS_${plan.toUpperCase()}`;
      out[plan][interval] = {
        base: env[`${key}_BASE${suffix}`] || null,
        seat: env[`${key}_SEAT${suffix}`] || null
      };
    }
  }
  return out;
}

const allSeatPriceIds = (prices) => {
  const ids = new Set();
  for (const plan of Object.values(prices)) for (const i of Object.values(plan)) if (i.seat) ids.add(i.seat);
  return ids;
};

/** ¿Es un evento de Stripe de una clínica? (solo mira metadata; síncrono) */
export function isOrgStripeEvent(event) {
  const obj = event?.data?.object || {};
  const md = obj.metadata || {};
  const subMd = obj.subscription_details?.metadata || {};
  return md.mainds_kind === ORG_KIND || subMd.mainds_kind === ORG_KIND;
}

const orgIdFromEvent = (event) => {
  const obj = event?.data?.object || {};
  return obj.metadata?.organization_id || obj.subscription_details?.metadata?.organization_id || null;
};

/** Estado de Stripe → estado de la organización. */
export function mapStripeStatus(status) {
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'past_due';
  if (status === 'canceled' || status === 'incomplete_expired') return 'canceled';
  return null;
}

/** Número de licencias facturables de una clínica (siempre recalculado desde BD). */
export async function countSeats(store, orgId) {
  const members = await store.list('org_members', { eq: { org_id: orgId, status: 'active' }, limit: 500 });
  return members.filter(m => m.seat_billable).length;
}

/**
 * Crea el sincronizador de licencias. sync(orgId) nunca lanza: si Stripe falla
 * marca settings.seat_sync_pending y el cambio de equipo sigue adelante.
 */
export function createSeatSync({ store, stripe, prices, logger = console }) {
  const seatIds = allSeatPriceIds(prices);
  async function sync(orgId) {
    try {
      const org = await store.get('organizations', orgId);
      if (!org) return { ok: false, reason: 'no_org' };
      const quantity = await countSeats(store, orgId);
      const client = typeof stripe === 'function' ? stripe() : stripe;
      if (!client || !org.stripe_subscription_id) return { ok: true, quantity, stripe: false };

      const wanted = prices[org.plan_id]?.[org.billing_interval]?.seat;
      const sub = await client.subscriptions.retrieve(org.stripe_subscription_id);
      const item = (sub.items?.data || []).find(i => seatIds.has(i.price?.id));
      if (item && quantity === 0) {
        await client.subscriptionItems.del(item.id, { proration_behavior: 'create_prorations' });
      } else if (item && item.quantity !== quantity) {
        await client.subscriptionItems.update(item.id, { quantity, proration_behavior: 'create_prorations' });
      } else if (!item && quantity > 0) {
        if (!wanted) throw new Error('Sin precio de licencia configurado');
        await client.subscriptionItems.create({ subscription: sub.id, price: wanted, quantity, proration_behavior: 'create_prorations' });
      }
      const settings = { ...(org.settings || {}) };
      delete settings.seat_sync_pending;
      await store.update('organizations', orgId, { seats_billed: quantity, settings, updated_at: new Date().toISOString() });
      return { ok: true, quantity, stripe: true };
    } catch (err) {
      try { logger.warn('[business] syncSeats falló', JSON.stringify({ orgId, code: err?.code || err?.type || null })); } catch { /* */ }
      try {
        const org = await store.get('organizations', orgId);
        if (org) await store.update('organizations', orgId, { settings: { ...(org.settings || {}), seat_sync_pending: true } });
      } catch { /* */ }
      return { ok: false, reason: 'stripe_error' };
    }
  }
  return { sync };
}

/**
 * Procesa un evento de Stripe si es de una clínica.
 * @returns {Promise<{handled:boolean, ok:boolean}>}
 */
export async function handleOrgStripeEvent({ store }, event) {
  const obj = event?.data?.object || {};
  let orgId = orgIdFromEvent(event);
  let byMetadata = isOrgStripeEvent(event);

  // Facturas sin metadata propia: se buscan por id de suscripción.
  if (!byMetadata && store && event?.type?.startsWith('invoice.') && obj.subscription) {
    try {
      const [org] = await store.list('organizations', { eq: { stripe_subscription_id: String(obj.subscription) }, limit: 1 });
      if (org) { orgId = org.id; byMetadata = true; }
    } catch { /* tablas sin migrar: no es de una clínica */ }
  }
  if (!byMetadata) return { handled: false, ok: true };
  if (!store || !orgId) return { handled: true, ok: true }; // de una clínica, pero Business apagado: se ignora

  try {
    const org = await store.get('organizations', String(orgId));
    if (!org) return { handled: true, ok: true };
    const patch = {};
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription') break;
        patch.stripe_customer_id = obj.customer || org.stripe_customer_id || null;
        patch.stripe_subscription_id = obj.subscription || org.stripe_subscription_id || null;
        if (PLANS.includes(obj.metadata?.plan)) patch.plan_id = obj.metadata.plan;
        if (INTERVALS.includes(obj.metadata?.interval)) patch.billing_interval = obj.metadata.interval;
        patch.status = 'active';
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        // Solo la suscripción vigente de la clínica cambia su estado.
        if (org.stripe_subscription_id && obj.id && org.stripe_subscription_id !== obj.id && event.type !== 'customer.subscription.created') break;
        patch.stripe_subscription_id = obj.id || org.stripe_subscription_id;
        if (obj.customer) patch.stripe_customer_id = obj.customer;
        const mapped = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStripeStatus(obj.status);
        if (mapped) patch.status = mapped;
        if (PLANS.includes(obj.metadata?.plan)) patch.plan_id = obj.metadata.plan;
        if (INTERVALS.includes(obj.metadata?.interval)) patch.billing_interval = obj.metadata.interval;
        break;
      }
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        patch.status = 'active';
        break;
      case 'invoice.payment_failed':
        patch.status = 'past_due';
        break;
      default:
        break;
    }
    if (Object.keys(patch).length) {
      await store.update('organizations', org.id, { ...patch, updated_at: new Date().toISOString() });
    }
    return { handled: true, ok: true };
  } catch {
    return { handled: true, ok: false };
  }
}

export function registerBillingRoutes(router, ctx) {
  const { store, stripe, prices, frontendUrl, getUser, seats } = ctx;

  router.get('/billing', requireAction('org.subscription'), asyncRoute(async (req, res) => {
    const { org, access } = req.workspace;
    const seatCount = await countSeats(store, org.id);
    const p = prices[org.plan_id]?.[org.billing_interval] || {};
    res.json({
      plan_id: org.plan_id,
      billing_interval: org.billing_interval,
      status: org.status,
      trial: access.trial,
      trial_ends_at: org.trial_ends_at || null,
      trial_days_left: access.trialDaysLeft,
      seats: seatCount,
      seats_billed: org.seats_billed ?? null,
      seat_sync_pending: !!org.settings?.seat_sync_pending,
      has_subscription: !!org.stripe_subscription_id,
      stripe_configured: !!((typeof stripe === 'function' ? stripe() : stripe) && p.base && p.seat)
    });
  }));

  router.post('/billing/checkout', requireAction('org.subscription'), asyncRoute(async (req, res) => {
    const { org } = req.workspace;
    const plan = req.body?.plan || org.plan_id;
    const interval = req.body?.interval || org.billing_interval;
    if (!PLANS.includes(plan)) throw badRequest('Plan no válido.');
    if (!INTERVALS.includes(interval)) throw badRequest('Periodicidad no válida.');
    if (org.stripe_subscription_id && org.status === 'active') {
      throw httpError(409, 'ALREADY_SUBSCRIBED', 'La clínica ya tiene una suscripción activa.');
    }
    const client = typeof stripe === 'function' ? stripe() : stripe;
    const p = prices[plan]?.[interval] || {};
    if (!client || !p.base || !p.seat) {
      throw httpError(503, 'STRIPE_NOT_CONFIGURED', 'Los pagos de mainds business todavía no están configurados.');
    }
    const seatCount = await countSeats(store, org.id);
    const lineItems = [{ price: p.base, quantity: 1 }];
    if (seatCount > 0) lineItems.push({ price: p.seat, quantity: seatCount });

    const metadata = { mainds_kind: ORG_KIND, organization_id: org.id, plan, interval };
    const subscriptionData = { metadata };
    // Respeta los días de prueba que queden (Stripe exige al menos 48 h).
    const trialEnd = org.trial_ends_at ? Math.floor(new Date(org.trial_ends_at).getTime() / 1000) : 0;
    if (org.status === 'trialing' && trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600) {
      subscriptionData.trial_end = trialEnd;
    }
    const user = await getUser(String(req.authenticatedUserId));
    const params = {
      mode: 'subscription',
      line_items: lineItems,
      metadata,
      subscription_data: subscriptionData,
      allow_promotion_codes: true,
      client_reference_id: org.id,
      success_url: `${frontendUrl}/?org_billing=success&org=${org.id}`,
      cancel_url: `${frontendUrl}/?org_billing=cancel&org=${org.id}`
    };
    if (org.stripe_customer_id) params.customer = org.stripe_customer_id;
    else if (user?.email || user?.user_email) params.customer_email = user.email || user.user_email;

    const session = await client.checkout.sessions.create(params);
    await store.update('organizations', org.id, { plan_id: plan, billing_interval: interval, updated_at: new Date().toISOString() });
    res.json({ url: session.url });
  }));

  // Reintenta sincronizar licencias (si quedó pendiente).
  router.post('/billing/sync-seats', requireAction('org.subscription'), asyncRoute(async (req, res) => {
    const r = await seats.sync(req.workspace.orgId);
    res.json(r);
  }));
}
