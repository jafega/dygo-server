// Fase 0.4 — createBusinessRouter aislado (R1/R2) con stores falsos.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBusinessRouter, mountBusiness } from '../../business/index.js';
import { createStore, StoreError } from '../../business/store.js';

const fakeAuth = (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Autenticación requerida' });
  req.authenticatedUserId = h.slice(7);
  next();
};

async function serve(app) {
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (url, token = 'u1') => {
    const r = await fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { get, close: () => new Promise(r => server.close(r)) };
}

function appWith(store, flags = { enabled: true, betaEmails: [] }, getUser = async () => ({ email: 'a@x.com' })) {
  const app = express();
  const { orgRouter, publicRouter } = createBusinessRouter({
    store, authenticateRequest: fakeAuth, isSuperAdmin: () => false, deps: { flags, getUser }
  });
  app.use('/api/org', orgRouter);
  app.use('/api/public/org', publicRouter);
  return app;
}

test('R2: tablas sin migrar → GET /api/org/me 200 {enabled:false}, nunca 500', async (t) => {
  const store = {
    driver: 'supabase',
    list: async () => { throw new StoreError('BUSINESS_NOT_MIGRATED', 'sin tabla'); },
    get: async () => null
  };
  const s = await serve(appWith(store));
  t.after(s.close);
  const r = await s.get('/api/org/me');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { enabled: false, memberships: [] });
});

test('error inesperado del store → 500 con formato R12 y sin detalle', async (t) => {
  const store = { driver: 'memory', list: async () => { throw new Error('paciente Juan'); }, get: async () => null };
  const orig = console.error;
  console.error = () => {};
  t.after(() => { console.error = orig; });
  const s = await serve(appWith(store));
  t.after(s.close);
  const r = await s.get('/api/org/me');
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' });
});

test('membresías activas aparecen en /me; las demás no', async (t) => {
  const store = createStore({ driver: 'memory' });
  const org = await store.insert('organizations', { name: 'Clínica Sol', slug: 'sol' });
  await store.insert('org_members', [
    { org_id: org.id, user_id: 'u1', email: 'a@x.com', role: 'psicologo', status: 'active' },
    { org_id: 'otra', user_id: 'u1', email: 'a@x.com', role: 'psicologo', status: 'left' }
  ]);
  const s = await serve(appWith(store, { enabled: true, betaEmails: ['a@x.com'] }));
  t.after(s.close);
  const r = await s.get('/api/org/me');
  assert.equal(r.body.enabled, true);
  assert.equal(r.body.canCreateOrg, true);
  assert.deepEqual(r.body.pendingInvitations, []);
  assert.equal(r.body.memberships.length, 1);
  const m = r.body.memberships[0];
  assert.deepEqual(
    { orgId: m.orgId, name: m.name, slug: m.slug, logo_url: m.logo_url, role: m.role, status: m.status },
    { orgId: org.id, name: 'Clínica Sol', slug: 'sol', logo_url: null, role: 'psicologo', status: 'active' }
  );
  assert.ok(m.permissions.includes('agenda.manage_own'));
  assert.ok(!m.permissions.includes('team.manage'));
  assert.deepEqual((await s.get('/api/org/me', 'u2')).body.memberships, []);
});

test('flag apagado: aunque haya store, todo 404 salvo /me', async (t) => {
  const s = await serve(appWith(createStore({ driver: 'memory' }), { enabled: false, betaEmails: [] }));
  t.after(s.close);
  assert.deepEqual((await s.get('/api/org/me')).body, { enabled: false, memberships: [] });
  assert.equal((await s.get('/api/org/abc')).status, 404);
  assert.equal((await s.get('/api/public/org/abc', null)).status, 404);
});

test('mountBusiness: en serverless sin Supabase queda apagado y no lanza', async (t) => {
  const app = express();
  const logs = [];
  const res = mountBusiness(app, {
    supabase: null, isServerless: true, authenticateRequest: fakeAuth, isSuperAdmin: () => false,
    env: { BUSINESS_ENABLED: 'true' }, logger: { log: (m) => logs.push(m) }
  });
  assert.equal(res.active, false);
  assert.equal(res.store, null);
  assert.match(logs[0], /apagado/);
  const s = await serve(app);
  t.after(s.close);
  assert.deepEqual((await s.get('/api/org/me')).body, { enabled: false, memberships: [] });
});

test('mountBusiness: driver memory con flag encendido', async (t) => {
  const app = express();
  const res = mountBusiness(app, {
    authenticateRequest: fakeAuth, isSuperAdmin: () => false, getUser: async () => ({ email: 'x@y.com' }),
    env: { BUSINESS_ENABLED: 'true', BUSINESS_STORE: 'memory' }, logger: { log: () => {} }
  });
  assert.equal(res.active, true);
  assert.equal(res.store.driver, 'memory');
  const s = await serve(app);
  t.after(s.close);
  assert.deepEqual((await s.get('/api/org/me')).body,
    { enabled: true, canCreateOrg: false, dpaVersion: 'v1-borrador', memberships: [], pendingInvitations: [] });
});
