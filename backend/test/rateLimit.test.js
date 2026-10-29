// El límite de intentos de login sigue activo salvo que los tests lo apaguen
// explícitamente (NODE_ENV=test + MAINDS_TEST_NO_RATE_LIMIT=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers/server.js';

test('sin MAINDS_TEST_NO_RATE_LIMIT el login se bloquea tras 10 intentos (429)', async (t) => {
  const srv = await startServer({ env: { MAINDS_TEST_NO_RATE_LIMIT: '' } });
  t.after(() => srv.stop());
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await srv.request('POST', '/api/auth/login', { body: { email: 'nadie@x.local', password: 'mal' } });
    statuses.push(r.status);
  }
  assert.equal(statuses[10], 429);
  assert.ok(statuses.slice(0, 10).every(s => s !== 429));
});

test('con NODE_ENV distinto de test el interruptor no tiene efecto', async (t) => {
  const srv = await startServer({ env: { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(64), MAINDS_TEST_NO_RATE_LIMIT: '1' } });
  t.after(() => srv.stop());
  let last = 0;
  for (let i = 0; i < 11; i++) {
    last = (await srv.request('POST', '/api/auth/login', { body: { email: 'nadie@x.local', password: 'mal' } })).status;
  }
  assert.equal(last, 429);
});
