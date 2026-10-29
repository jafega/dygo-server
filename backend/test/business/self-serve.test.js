// Business a demanda: con BUSINESS_SELF_SERVE cualquier psicólogo crea su
// clínica él mismo; un paciente no. Sin clínica, /me no le enseña el selector
// (createVia 'self_serve') y Pro queda igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { businessEnv, DPA } from './helpers.js';

test('autoservicio: el psicólogo crea su clínica; el paciente no', async (t) => {
  const srv = await startServer({ env: businessEnv('', { BUSINESS_SELF_SERVE: 'true' }) });
  t.after(() => srv.stop());
  const req = srv.request;
  const psico = await srv.createUser({ name: 'Paula Psicóloga', email: 'paula@self.local', role: 'PSYCHOLOGIST' });
  const paciente = await srv.createUser({ name: 'Pedro Paciente', email: 'pedro@self.local' });

  const meBefore = (await req('GET', '/api/org/me', { token: psico.token })).body;
  assert.equal(meBefore.canCreateOrg, true);
  assert.equal(meBefore.createVia, 'self_serve');
  assert.deepEqual(meBefore.memberships, []);
  const mePatient = (await req('GET', '/api/org/me', { token: paciente.token })).body;
  assert.equal(mePatient.canCreateOrg, false);
  assert.equal(mePatient.createVia, null);

  const denied = await req('POST', '/api/org', { token: paciente.token, body: { name: 'No', ...DPA } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'BUSINESS_NOT_ALLOWED');
  assert.match(denied.body.error, /profesionales/);

  const created = await req('POST', '/api/org', { token: psico.token, body: { name: 'Centro Paula', ...DPA, is_clinical: true } });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.membership.role, 'titular');
  const meAfter = (await req('GET', '/api/org/me', { token: psico.token })).body;
  assert.equal(meAfter.memberships.length, 1);
});

test('sin autoservicio, un psicólogo que no está en la beta no crea clínicas', async (t) => {
  const srv = await startServer({ env: businessEnv('') });
  t.after(() => srv.stop());
  const psico = await srv.createUser({ name: 'Paula', email: 'paula2@self.local', role: 'PSYCHOLOGIST' });
  const me = (await srv.request('GET', '/api/org/me', { token: psico.token })).body;
  assert.equal(me.canCreateOrg, false);
  assert.equal((await srv.request('POST', '/api/org', { token: psico.token, body: { name: 'X', ...DPA } })).status, 403);
});
