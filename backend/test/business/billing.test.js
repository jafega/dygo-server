// F1.4 — Estado de la suscripción (R9), sincronización de licencias y eventos
// de Stripe de las clínicas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../business/store.js';
import { orgAccess, hasPlus, enforceWritable } from '../../business/workspace.js';
import {
  isOrgStripeEvent, handleOrgStripeEvent, mapStripeStatus, createSeatSync, countSeats, readPriceIds
} from '../../business/billing.js';

const DAY = 24 * 3600 * 1000;
const future = (d = 5) => new Date(Date.now() + d * DAY).toISOString();
const past = (d = 1) => new Date(Date.now() - d * DAY).toISOString();

test('orgAccess: prueba vigente o activa → full; el resto → read_only', () => {
  assert.equal(orgAccess({ status: 'trialing', trial_ends_at: future(3) }).level, 'full');
  assert.equal(orgAccess({ status: 'trialing', trial_ends_at: future(3) }).trialDaysLeft, 3);
  assert.equal(orgAccess({ status: 'trialing', trial_ends_at: past() }).level, 'read_only');
  assert.equal(orgAccess({ status: 'active' }).level, 'full');
  assert.equal(orgAccess({ status: 'past_due' }).level, 'read_only');
  assert.equal(orgAccess({ status: 'canceled' }).level, 'read_only');
  assert.equal(orgAccess(null).level, 'read_only');
});

test('hasPlus: plan plus activo o cualquier plan en prueba', () => {
  assert.equal(hasPlus({ plan_id: 'plus', status: 'active' }), true);
  assert.equal(hasPlus({ plan_id: 'essential', status: 'active' }), false);
  assert.equal(hasPlus({ plan_id: 'essential', status: 'trialing', trial_ends_at: future() }), true);
  assert.equal(hasPlus({ plan_id: 'plus', status: 'past_due' }), false);
});

function runGuard(method, path, level) {
  let result = 'next';
  const req = { method, path, workspace: { access: { level } } };
  enforceWritable(req, {}, (err) => { result = err ? err.status : 'next'; });
  return result;
}

test('enforceWritable: con la suscripción caducada solo se lee (402), salvo pagar o reducir equipo', () => {
  assert.equal(runGuard('POST', '/members/invite', 'full'), 'next');
  assert.equal(runGuard('GET', '/members', 'read_only'), 'next');
  assert.equal(runGuard('POST', '/members/invite', 'read_only'), 402);
  assert.equal(runGuard('PATCH', '/', 'read_only'), 402);
  assert.equal(runGuard('PATCH', '/members/abc', 'read_only'), 402);
  assert.equal(runGuard('POST', '/billing/checkout', 'read_only'), 'next');
  assert.equal(runGuard('POST', '/leave', 'read_only'), 'next');
  assert.equal(runGuard('POST', '/members/abc/suspend', 'read_only'), 'next');
  assert.equal(runGuard('DELETE', '/members/abc', 'read_only'), 'next');
  assert.equal(runGuard('POST', '/members/abc/reactivate', 'read_only'), 402);
});

test('isOrgStripeEvent: solo por metadata de clínica', () => {
  assert.equal(isOrgStripeEvent({ data: { object: { metadata: { mainds_kind: 'organization' } } } }), true);
  assert.equal(isOrgStripeEvent({ data: { object: { subscription_details: { metadata: { mainds_kind: 'organization' } } } } }), true);
  assert.equal(isOrgStripeEvent({ data: { object: { metadata: { subscription_type: 'psychologist' } } } }), false);
  assert.equal(isOrgStripeEvent({}), false);
});

test('mapStripeStatus', () => {
  assert.equal(mapStripeStatus('active'), 'active');
  assert.equal(mapStripeStatus('trialing'), 'active');
  assert.equal(mapStripeStatus('past_due'), 'past_due');
  assert.equal(mapStripeStatus('unpaid'), 'past_due');
  assert.equal(mapStripeStatus('canceled'), 'canceled');
  assert.equal(mapStripeStatus('weird'), null);
});

async function orgStore() {
  const store = createStore({ driver: 'memory' });
  const org = await store.insert('organizations', {
    name: 'Clínica', slug: 'clinica', plan_id: 'essential', billing_interval: 'month',
    status: 'trialing', trial_ends_at: future(10), settings: {}
  });
  return { store, org };
}

test('webhook: checkout de clínica activa la organización', async () => {
  const { store, org } = await orgStore();
  const r = await handleOrgStripeEvent({ store }, {
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', metadata: { mainds_kind: 'organization', organization_id: org.id, plan: 'plus', interval: 'year' } } }
  });
  assert.deepEqual(r, { handled: true, ok: true });
  const after = await store.get('organizations', org.id);
  assert.equal(after.status, 'active');
  assert.equal(after.stripe_subscription_id, 'sub_1');
  assert.equal(after.stripe_customer_id, 'cus_1');
  assert.equal(after.plan_id, 'plus');
  assert.equal(after.billing_interval, 'year');
});

test('webhook: subscription.updated/deleted y facturas sin metadata (por id de suscripción)', async () => {
  const { store, org } = await orgStore();
  await store.update('organizations', org.id, { stripe_subscription_id: 'sub_9', status: 'active' });
  const md = { mainds_kind: 'organization', organization_id: org.id };

  await handleOrgStripeEvent({ store }, { type: 'customer.subscription.updated', data: { object: { id: 'sub_9', status: 'past_due', metadata: md } } });
  assert.equal((await store.get('organizations', org.id)).status, 'past_due');

  // Factura sin metadata: se reconoce por la suscripción.
  const paid = await handleOrgStripeEvent({ store }, { type: 'invoice.payment_succeeded', data: { object: { subscription: 'sub_9' } } });
  assert.equal(paid.handled, true);
  assert.equal((await store.get('organizations', org.id)).status, 'active');

  await handleOrgStripeEvent({ store }, { type: 'customer.subscription.deleted', data: { object: { id: 'sub_9', status: 'canceled', metadata: md } } });
  assert.equal((await store.get('organizations', org.id)).status, 'canceled');

  // Un evento de una suscripción antigua no pisa el estado de la vigente.
  await store.update('organizations', org.id, { status: 'active' });
  await handleOrgStripeEvent({ store }, { type: 'customer.subscription.updated', data: { object: { id: 'sub_old', status: 'canceled', metadata: md } } });
  assert.equal((await store.get('organizations', org.id)).status, 'active');
});

test('webhook: un evento de Pro no se toca (handled:false) y no cambia ninguna clínica', async () => {
  const { store, org } = await orgStore();
  const r = await handleOrgStripeEvent({ store }, {
    type: 'checkout.session.completed',
    data: { object: { mode: 'subscription', subscription: 'sub_pro', metadata: { subscription_type: 'psychologist', psychologist_user_id: 'p1' } } }
  });
  assert.deepEqual(r, { handled: false, ok: true });
  const inv = await handleOrgStripeEvent({ store }, { type: 'invoice.payment_failed', data: { object: { subscription: 'sub_pro' } } });
  assert.equal(inv.handled, false);
  assert.equal((await store.get('organizations', org.id)).status, 'trialing');
});

test('webhook: error del store en un evento de clínica → handled:true, ok:false (Stripe reintenta; Pro no lo procesa)', async () => {
  const store = { get: async () => { throw new Error('db caída'); }, list: async () => [] };
  const r = await handleOrgStripeEvent({ store }, { type: 'customer.subscription.updated', data: { object: { id: 's', status: 'active', metadata: { mainds_kind: 'organization', organization_id: 'o' } } } });
  assert.deepEqual(r, { handled: true, ok: false });
});

function fakeStripe(items = []) {
  const calls = [];
  return {
    calls,
    subscriptions: { retrieve: async (id) => ({ id, items: { data: items } }) },
    subscriptionItems: {
      update: async (id, p) => { calls.push(['update', id, p.quantity]); },
      create: async (p) => { calls.push(['create', p.price, p.quantity]); },
      del: async (id) => { calls.push(['del', id]); }
    }
  };
}

const PRICES = readPriceIds({
  STRIPE_PRICE_ID_BUSINESS_ESSENTIAL_BASE: 'price_eb', STRIPE_PRICE_ID_BUSINESS_ESSENTIAL_SEAT: 'price_es',
  STRIPE_PRICE_ID_BUSINESS_PLUS_BASE: 'price_pb', STRIPE_PRICE_ID_BUSINESS_PLUS_SEAT: 'price_ps'
});

test('syncSeats: cantidad = miembros activos facturables, recalculada siempre desde BD', async () => {
  const { store, org } = await orgStore();
  await store.update('organizations', org.id, { stripe_subscription_id: 'sub_1', status: 'active' });
  await store.insert('org_members', [
    { org_id: org.id, email: 'a@x', user_id: 'a', role: 'psicologo', status: 'active', seat_billable: true },
    { org_id: org.id, email: 'b@x', user_id: 'b', role: 'psicologo', status: 'active', seat_billable: true },
    { org_id: org.id, email: 'c@x', user_id: 'c', role: 'recepcion', status: 'active', seat_billable: false },
    { org_id: org.id, email: 'd@x', user_id: 'd', role: 'psicologo', status: 'suspended', seat_billable: false },
    { org_id: org.id, email: 'e@x', role: 'psicologo', status: 'invited', seat_billable: false }
  ]);
  assert.equal(await countSeats(store, org.id), 2);

  const st = fakeStripe([{ id: 'si_base', price: { id: 'price_eb' }, quantity: 1 }, { id: 'si_seat', price: { id: 'price_es' }, quantity: 5 }]);
  const r = await createSeatSync({ store, stripe: () => st, prices: PRICES }).sync(org.id);
  assert.deepEqual(r, { ok: true, quantity: 2, stripe: true });
  assert.deepEqual(st.calls, [['update', 'si_seat', 2]]);
  assert.equal((await store.get('organizations', org.id)).seats_billed, 2);

  // Sin línea de licencias todavía → se crea.
  const st2 = fakeStripe([{ id: 'si_base', price: { id: 'price_eb' }, quantity: 1 }]);
  await createSeatSync({ store, stripe: () => st2, prices: PRICES }).sync(org.id);
  assert.deepEqual(st2.calls, [['create', 'price_es', 2]]);
});

test('syncSeats: sin Stripe o sin suscripción no hace nada; si Stripe falla marca pendiente y no lanza', async () => {
  const { store, org } = await orgStore();
  assert.deepEqual(await createSeatSync({ store, stripe: () => null, prices: PRICES }).sync(org.id), { ok: true, quantity: 0, stripe: false });

  await store.update('organizations', org.id, { stripe_subscription_id: 'sub_1' });
  const broken = { subscriptions: { retrieve: async () => { throw Object.assign(new Error('boom'), { type: 'StripeConnectionError' }); } } };
  const logger = { warn: () => {} };
  const r = await createSeatSync({ store, stripe: () => broken, prices: PRICES, logger }).sync(org.id);
  assert.equal(r.ok, false);
  assert.equal((await store.get('organizations', org.id)).settings.seat_sync_pending, true);
});
