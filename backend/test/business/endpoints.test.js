// Fase 0.4 — esqueleto de Business montado en server.js (R1, R2, R14).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../helpers/server.js';

test('flag apagado: /api/org/me → {enabled:false}, el resto 404, Pro intacto', async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const pro = await srv.createUser({ name: 'Pro', email: 'pro@off.local', role: 'PSYCHOLOGIST' });

  const me = await srv.request('GET', '/api/org/me', { token: pro.token });
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, { enabled: false, memberships: [] });

  assert.equal((await srv.request('GET', '/api/org/me')).status, 401);

  for (const [method, url] of [['GET', '/api/org/x'], ['POST', '/api/org'], ['GET', '/api/org/abc/members'],
    ['GET', '/api/public/org/x'], ['GET', '/api/public/org/clinica/widget']]) {
    const r = await srv.request(method, url, { token: pro.token });
    assert.equal(r.status, 404, `${method} ${url}`);
    assert.equal(r.body?.code, 'NOT_FOUND');
  }
  // Sin sesión también 404: con el flag apagado no se revela nada.
  assert.equal((await srv.request('GET', '/api/org/x')).status, 404);

  assert.equal((await srv.request('GET', '/api/plans')).status, 200);
  assert.match(srv.output(), /mainds business apagado/);
});

test('flag encendido con driver file: /me con canCreateOrg según la lista beta', async (t) => {
  const srv = await startServer({
    env: { BUSINESS_ENABLED: 'true', BUSINESS_STORE: 'file', BUSINESS_BETA_EMAILS: 'owner@test.local' }
  });
  t.after(() => srv.stop());
  const pro = await srv.createUser({ name: 'Pro', email: 'pro@on.local', role: 'PSYCHOLOGIST' });
  const owner = await srv.createUser({ name: 'Owner', email: 'owner@test.local', role: 'PSYCHOLOGIST' });

  const mePro = await srv.request('GET', '/api/org/me', { token: pro.token });
  assert.equal(mePro.status, 200);
  assert.deepEqual(mePro.body, { enabled: true, canCreateOrg: false, dpaVersion: 'v1-borrador', memberships: [], pendingInvitations: [] });

  const meOwner = await srv.request('GET', '/api/org/me', { token: owner.token });
  assert.deepEqual(meOwner.body, { enabled: true, canCreateOrg: true, dpaVersion: 'v1-borrador', memberships: [], pendingInvitations: [] });

  const x = await srv.request('GET', '/api/org/x', { token: pro.token });
  assert.equal(x.status, 404);
  assert.deepEqual(x.body, { error: 'No encontrado', code: 'NOT_FOUND' });

  assert.equal((await srv.request('GET', '/api/plans')).status, 200);
  assert.match(srv.output(), /mainds business ACTIVO \(store: file\)/);
  // El store de Business vive en el directorio temporal del test, no en el repo.
  assert.ok(srv.tmpDir && fs.existsSync(srv.tmpDir));
});

test('flag encendido pero BUSINESS_STORE=supabase sin Supabase: Business deshabilitado', async (t) => {
  const srv = await startServer({ env: { BUSINESS_ENABLED: 'true', BUSINESS_STORE: 'supabase' } });
  t.after(() => srv.stop());
  const pro = await srv.createUser({ name: 'Pro', email: 'pro@nosb.local', role: 'PSYCHOLOGIST' });
  const me = await srv.request('GET', '/api/org/me', { token: pro.token });
  assert.deepEqual(me.body, { enabled: false, memberships: [] });
  assert.equal((await srv.request('GET', '/api/org/x', { token: pro.token })).status, 404);
  assert.equal((await srv.request('GET', '/api/plans')).status, 200);
});
