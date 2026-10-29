// Fase 0.1 — Autorización de centros y plantillas.
// Un psicólogo no puede leer ni tocar centros/plantillas de otro pasando su id
// en la query o el body. El superadmin sí. Sin Supabase las rutas propias
// mantienen su respuesta de siempre (lo vigilan también los golden).

import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, SUPERADMIN_EMAIL } from './helpers/server.js';

let srv, pro, otro, admin;

test.before(async () => {
  srv = await startServer();
  pro = await srv.createUser({ name: 'Pro Uno', email: 'pro1@authz.local', role: 'PSYCHOLOGIST' });
  otro = await srv.createUser({ name: 'Pro Dos', email: 'pro2@authz.local', role: 'PSYCHOLOGIST' });
  admin = await srv.createUser({ name: 'Super Admin', email: SUPERADMIN_EMAIL, role: 'PSYCHOLOGIST' });
});

test.after(async () => { await srv?.stop(); });

const DENIED = { error: 'Acceso denegado' };

// [método, ruta(idAjeno), body(idAjeno)]
const CASES_AJENO = [
  ['GET', id => `/api/centers?psychologistId=${id}`],
  ['POST', () => '/api/centers', id => ({ psychologistId: id, center_name: 'C', cif: 'B12345678', address: 'Calle 1' })],
  ['PATCH', () => '/api/centers/abc', id => ({ psychologistId: id, center_name: 'X' })],
  ['DELETE', id => `/api/centers/abc?psychologistId=${id}`],
  ['GET', id => `/api/center/abc/unbilled?psychologistId=${id}`],
  ['GET', id => `/api/templates?psych_user_id=${id}`],
  ['POST', () => '/api/templates', id => ({ psych_user_id: id, content: '<p>x</p>', template_name: 'T' })],
  ['PUT', () => '/api/templates/1', id => ({ psych_user_id: id, content: '<p>x</p>' })],
  ['DELETE', id => `/api/templates/1?psych_user_id=${id}`],
  ['PATCH', () => '/api/templates/1/archive', id => ({ psych_user_id: id })],
  ['PATCH', () => '/api/templates/1/unarchive', id => ({ psych_user_id: id })]
];

for (const [method, url, body] of CASES_AJENO) {
  const label = `${method} ${url(':ajeno').split('?')[0]}`;

  test(`${label} con id ajeno → 403`, async () => {
    const r = await srv.request(method, url(otro.id), { token: pro.token, body: body ? body(otro.id) : undefined });
    assert.equal(r.status, 403);
    assert.deepEqual(r.body, DENIED);
  });

  test(`${label} con id propio → no 403`, async () => {
    const r = await srv.request(method, url(pro.id), { token: pro.token, body: body ? body(pro.id) : undefined });
    assert.notEqual(r.status, 403);
  });

  test(`${label} superadmin con id ajeno → no 403`, async () => {
    const r = await srv.request(method, url(pro.id), { token: admin.token, body: body ? body(pro.id) : undefined });
    assert.notEqual(r.status, 403);
  });
}

test('GET /api/centers con id propio → 200', async () => {
  const r = await srv.request('GET', `/api/centers?psychologistId=${pro.id}`, { token: pro.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
});

test('GET /api/templates con id propio → 200', async () => {
  const r = await srv.request('GET', `/api/templates?psych_user_id=${pro.id}`, { token: pro.token });
  assert.equal(r.status, 200);
});

test('superadmin: GET /api/centers de otro → 200', async () => {
  const r = await srv.request('GET', `/api/centers?psychologistId=${otro.id}`, { token: admin.token });
  assert.equal(r.status, 200);
});

test('sin el id sigue respondiendo 400 (validación previa intacta)', async () => {
  const r1 = await srv.request('GET', '/api/centers', { token: pro.token });
  assert.equal(r1.status, 400);
  const r2 = await srv.request('GET', '/api/templates', { token: pro.token });
  assert.equal(r2.status, 400);
});

test('sin sesión → 401', async () => {
  const r = await srv.request('GET', `/api/centers?psychologistId=${pro.id}`);
  assert.equal(r.status, 401);
});
