// Cerrar la clínica y seguir en mainds pro (feedback del usuario):
//   - solo el titular, confirmando el nombre;
//   - se cancela la suscripción de Stripe de la clínica (y si falla, no se cierra nada);
//   - la clínica queda en solo lectura para el titular y el equipo pierde el acceso;
//   - la suscripción de mainds pro del titular no se toca.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic } from './helpers.js';
import { createBusinessRouter } from '../../business/index.js';
import { createStore } from '../../business/store.js';

test('cerrar la clínica: el equipo sale, queda en solo lectura y Pro sigue igual', async (t) => {
  const srv = await startServer({ env: businessEnv('olga@close.local') });
  t.after(() => srv.stop());
  const req = srv.request;
  const { org, base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'olga@close.local', isClinical: true },
    name: 'Centro Olga',
    members: [
      { key: 'paula', name: 'Paula', email: 'paula@close.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa', email: 'rosa@close.local', role: 'recepcion', psych: false }
    ]
  });
  // Olga paga mainds pro: su suscripción personal no puede cambiar al cerrar la clínica.
  const db = srv.readDb();
  db.subscriptions = [...(db.subscriptions || []), {
    psychologist_user_id: u.owner.id, stripe_customer_id: 'cus_pro_olga', stripe_subscription_id: 'sub_pro_olga',
    stripe_status: 'active', plan_id: 'mainder', access_blocked: false
  }];
  srv.writeDb(db);
  const proBefore = (await req('GET', '/api/subscription', { token: u.owner.token })).body;
  assert.equal(proBefore.is_subscribed, true);
  const pending = await req('POST', `${base}/members/invite`, { token: u.owner.token, body: { email: 'nuevo@close.local', role: 'psicologo' } });
  assert.equal(pending.status, 201);

  // Validaciones.
  assert.equal((await req('POST', `${base}/close`, { token: u.paula.token, body: { confirm_name: 'Centro Olga' } })).status, 403);
  assert.equal((await req('POST', `${base}/close`, { token: u.owner.token, body: { confirm_name: 'Otro' } })).body.code, 'CONFIRM_NAME');

  const closed = await req('POST', `${base}/close`, { token: u.owner.token, body: { confirm_name: 'centro olga' } });
  assert.equal(closed.status, 200, closed.text);
  assert.ok(closed.body.organization.closed_at);
  assert.equal(closed.body.organization.access, 'read_only');
  assert.equal((await req('POST', `${base}/close`, { token: u.owner.token, body: { confirm_name: 'Centro Olga' } })).body.code, 'ALREADY_CLOSED');

  // El equipo pierde el acceso; la invitación pendiente deja de valer.
  assert.equal((await req('GET', base, { token: u.paula.token })).status, 404);
  assert.deepEqual((await req('GET', '/api/org/me', { token: u.rec.token })).body.memberships, []);
  const invitee = await srv.createUser({ name: 'Nuevo', email: 'nuevo@close.local', role: 'PSYCHOLOGIST' });
  const token = new URL(pending.body.invite_url).searchParams.get('org_invite');
  assert.notEqual((await req('POST', '/api/org/invitations/accept', { token: invitee.token, body: { token } })).status, 200);

  // La titular conserva la consulta de los datos, en solo lectura.
  const me = (await req('GET', '/api/org/me', { token: u.owner.token })).body;
  assert.equal(me.memberships.length, 1);
  assert.equal(me.memberships[0].closed, true);
  assert.equal(me.memberships[0].access, 'read_only');
  assert.equal((await req('GET', `${base}/patients`, { token: u.owner.token })).status, 200);
  assert.equal((await req('POST', `${base}/patients`, { token: u.owner.token, body: { first_name: 'X' } })).status, 402);
  const audit = (await req('GET', `${base}/audit`, { token: u.owner.token })).body;
  assert.ok(JSON.stringify(audit).includes('org.closed'));

  // mainds pro: idéntico.
  const proAfter = (await req('GET', '/api/subscription', { token: u.owner.token })).body;
  assert.deepEqual(proAfter, proBefore);
  const sub = srv.readDb().subscriptions.find(s => s.psychologist_user_id === u.owner.id);
  assert.equal(sub.stripe_subscription_id, 'sub_pro_olga');
  assert.equal(sub.stripe_status, 'active');
  void org;
});

// ── Stripe: se cancela la suscripción de la clínica, nunca la de Pro ──
const fakeAuth = (req, res, next) => { req.authenticatedUserId = (req.headers.authorization || '').slice(7); next(); };

async function clinicWithSubscription(stripe) {
  const store = createStore({ driver: 'memory' });
  const org = await store.insert('organizations', {
    name: 'Centro Pago', slug: 'centro-pago', created_by: 'u1', status: 'active', plan_id: 'essential', billing_interval: 'month',
    stripe_customer_id: 'cus_org', stripe_subscription_id: 'sub_org', settings: {}
  });
  await store.insert('org_members', { org_id: org.id, user_id: 'u1', email: 'o@x.com', role: 'titular', status: 'active', is_clinical: true, seat_billable: true });
  const app = express();
  app.use(express.json());
  const { orgRouter } = createBusinessRouter({
    store, authenticateRequest: fakeAuth, isSuperAdmin: () => false, stripe: () => stripe,
    deps: { flags: { enabled: true, betaEmails: [] }, getUser: async () => ({ email: 'o@x.com' }), prices: { essential: {}, plus: {} } }
  });
  app.use('/api/org', orgRouter);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const close = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/org/${org.id}/close`, {
    method: 'POST', headers: { Authorization: 'Bearer u1', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => ({ status: r.status, body: await r.json() }));
  return { store, org, close, stop: () => new Promise(r => server.close(r)) };
}

test('cerrar cancela la suscripción de la clínica en Stripe', async (t) => {
  const calls = [];
  const stripe = { subscriptions: { del: async (id) => { calls.push(id); return { id, status: 'canceled' }; } } };
  const c = await clinicWithSubscription(stripe);
  t.after(c.stop);
  const r = await c.close({ confirm_name: 'Centro Pago' });
  assert.equal(r.status, 200);
  assert.deepEqual(calls, ['sub_org'], 'solo la de la clínica');
  assert.equal((await c.store.get('organizations', c.org.id)).status, 'canceled');
});

test('si Stripe falla, no se cierra nada; si ya estaba cancelada, se cierra', async (t) => {
  const failing = { subscriptions: { del: async () => { throw Object.assign(new Error('x'), { code: 'api_error' }); } } };
  const c = await clinicWithSubscription(failing);
  t.after(c.stop);
  const r = await c.close({ confirm_name: 'Centro Pago' });
  assert.equal(r.status, 502);
  assert.equal(r.body.code, 'STRIPE_CANCEL_FAILED');
  assert.equal((await c.store.get('organizations', c.org.id)).status, 'active');

  const gone = { subscriptions: { cancel: async () => { throw Object.assign(new Error('x'), { code: 'resource_missing' }); } } };
  const d = await clinicWithSubscription(gone);
  t.after(d.stop);
  assert.equal((await d.close({ confirm_name: 'Centro Pago' })).status, 200);
});
