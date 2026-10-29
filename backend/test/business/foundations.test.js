// Fase 0 — flags (R1/R3), errores (R12) y auditoría (0.6) de Business.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFlags, resolveStoreDriver, canCreateOrganization, organizationCreationAccess } from '../../business/flags.js';
import { toHttp, httpError, notFound, forbidden } from '../../business/errors.js';
import { StoreError, createStore } from '../../business/store.js';
import { FieldCryptoError } from '../../utils/fieldCrypto.js';
import { recordAccess, buildAuditRow, createAuditRecorder } from '../../business/audit.js';

// ── flags ──────────────────────────────────────────────────────────────────
test('flags: apagado por defecto', () => {
  const f = readFlags({});
  assert.equal(f.enabled, false);
  assert.deepEqual(f.betaEmails, []);
  assert.equal(f.requestedStore, null);
});

test('flags: lectura de variables', () => {
  const f = readFlags({ BUSINESS_ENABLED: 'true', BUSINESS_BETA_EMAILS: ' A@x.com, b@y.com ,', BUSINESS_STORE: 'File', BUSINESS_STORE_FILE: '/tmp/s.json' });
  assert.equal(f.enabled, true);
  assert.deepEqual(f.betaEmails, ['a@x.com', 'b@y.com']);
  assert.equal(f.requestedStore, 'file');
  assert.equal(f.storeFile, '/tmp/s.json');
  assert.equal(readFlags({ BUSINESS_ENABLED: 'false' }).enabled, false);
  assert.equal(readFlags({ BUSINESS_ENABLED: 'yes' }).enabled, true);
});

test('flags: solo beta y superadmin crean organizaciones', () => {
  const isSuperAdmin = (e) => e === 'root@x.com';
  const opts = { betaEmails: ['beta@x.com'], isSuperAdmin };
  assert.equal(canCreateOrganization('BETA@x.com', opts), true);
  assert.equal(canCreateOrganization('root@x.com', opts), true);
  assert.equal(canCreateOrganization('otro@x.com', opts), false);
  assert.equal(canCreateOrganization('', opts), false);
  assert.equal(canCreateOrganization(null, { betaEmails: [] }), false);
});

test('flags: autoservicio solo para psicólogos y solo con BUSINESS_SELF_SERVE', () => {
  assert.equal(readFlags({}).selfServe, false);
  assert.equal(readFlags({ BUSINESS_SELF_SERVE: 'true' }).selfServe, true);
  const isSuperAdmin = (e) => e === 'root@x.com';
  const on = { betaEmails: ['beta@x.com'], isSuperAdmin, selfServe: true };
  assert.equal(organizationCreationAccess('psico@x.com', { ...on, isPsychologist: true }), 'self_serve');
  assert.equal(organizationCreationAccess('paciente@x.com', { ...on, isPsychologist: false }), null);
  assert.equal(organizationCreationAccess('psico@x.com', { ...on, selfServe: false, isPsychologist: true }), null);
  assert.equal(organizationCreationAccess('beta@x.com', { ...on, isPsychologist: true }), 'beta', 'la lista beta manda');
  assert.equal(organizationCreationAccess('root@x.com', on), 'beta');
  assert.equal(organizationCreationAccess('', { ...on, isPsychologist: true }), null);
});

test('store: supabase por defecto si hay cliente; si no, file', () => {
  assert.deepEqual(resolveStoreDriver({ hasSupabase: true }), { driver: 'supabase', reason: null });
  assert.deepEqual(resolveStoreDriver({ hasSupabase: false }), { driver: 'file', reason: null });
  assert.equal(resolveStoreDriver({ requested: 'memory' }).driver, 'memory');
  assert.equal(resolveStoreDriver({ requested: 'file', hasSupabase: true }).driver, 'file');
});

test('store: en serverless sin Supabase, Business deshabilitado', () => {
  assert.equal(resolveStoreDriver({ hasSupabase: false, isServerless: true }).driver, null);
  assert.equal(resolveStoreDriver({ requested: 'file', hasSupabase: true, isServerless: true }).driver, null);
  assert.equal(resolveStoreDriver({ hasSupabase: true, isServerless: true }).driver, 'supabase');
});

test('store: un driver pedido que no se puede usar no cae a otro', () => {
  assert.equal(resolveStoreDriver({ requested: 'supabase', hasSupabase: false }).driver, null);
  assert.equal(resolveStoreDriver({ requested: 'sqlite' }).driver, null);
});

// ── errores ────────────────────────────────────────────────────────────────
test('errores: formato { error, code } en español', () => {
  assert.deepEqual(toHttp(notFound()), { status: 404, body: { error: 'No encontrado', code: 'NOT_FOUND' } });
  assert.equal(toHttp(forbidden()).body.code, 'FORBIDDEN');
  assert.deepEqual(toHttp(httpError(402, 'ORG_SUBSCRIPTION_REQUIRED', 'Hace falta suscripción')),
    { status: 402, body: { error: 'Hace falta suscripción', code: 'ORG_SUBSCRIPTION_REQUIRED' } });
});

test('errores: StoreError → HTTP (sin migrar 503, duplicado 409, límite 400)', () => {
  assert.equal(toHttp(new StoreError('BUSINESS_NOT_MIGRATED', 'x')).status, 503);
  assert.equal(toHttp(new StoreError('BUSINESS_NOT_MIGRATED', 'x')).body.code, 'BUSINESS_NOT_MIGRATED');
  assert.equal(toHttp(new StoreError('UNIQUE_VIOLATION', 'x')).status, 409);
  assert.equal(toHttp(new StoreError('LIMIT_TOO_LARGE', 'x')).status, 400);
  assert.equal(toHttp(new FieldCryptoError('ENCRYPTION_NOT_CONFIGURED', 'x')).status, 503);
});

test('errores: lo desconocido es 500 genérico y no filtra el mensaje', () => {
  const r = toHttp(new Error('paciente Juan Pérez, DNI 123'));
  assert.deepEqual(r, { status: 500, body: { error: 'Error interno del servidor', code: 'INTERNAL_ERROR' } });
  assert.equal(toHttp(new StoreError('TABLE_NOT_ALLOWED', 'x')).status, 500);
});

// ── auditoría ──────────────────────────────────────────────────────────────
const ENTRY = {
  org_id: null, actor_user_id: 'u1', action: 'clinical.break_glass',
  resource_type: 'clinical_note', resource_id: 'n1', patient_user_id: 'p1',
  justification: 'Urgencia: paciente Juan en crisis', ip: '1.2.3.4'
};

test('auditoría: guarda en access_audit', async () => {
  const store = createStore({ driver: 'memory' });
  const logs = [];
  assert.equal(await recordAccess(store, ENTRY, { fallback: (...a) => logs.push(a) }), true);
  const rows = await store.list('access_audit');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'clinical.break_glass');
  assert.equal(rows[0].justification, ENTRY.justification);
  assert.ok(rows[0].at);
  assert.equal(logs.length, 0);
});

test('auditoría: si el store falla no lanza y recurre al log, sin la justificación', async () => {
  const logs = [];
  const broken = { insert: async () => { throw new StoreError('BUSINESS_NOT_MIGRATED', 'sin tabla'); } };
  const ok = await recordAccess(broken, ENTRY, { fallback: (action, details) => logs.push({ action, details }) });
  assert.equal(ok, false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'ACCESS_AUDIT_FALLBACK');
  assert.equal(logs[0].details.actor_user_id, 'u1');
  assert.equal(logs[0].details.has_justification, true);
  assert.ok(!JSON.stringify(logs[0]).includes('Juan'));
});

test('auditoría: sin store, entrada incompleta o fallback roto → nunca lanza', async () => {
  const logs = [];
  assert.equal(await recordAccess(null, ENTRY, { fallback: (...a) => logs.push(a) }), false);
  assert.equal(await recordAccess(createStore({ driver: 'memory' }), { action: 'x' }, { fallback: (...a) => logs.push(a) }), false);
  assert.equal(await recordAccess(null, undefined, { fallback: () => { throw new Error('boom'); } }), false);
  assert.equal(logs.length, 2);
});

test('auditoría: createAuditRecorder y recorte de campos', async () => {
  const store = createStore({ driver: 'memory' });
  const rec = createAuditRecorder({ store, fallback: () => {} });
  assert.equal(await rec({ actorUserId: 'u2', action: 'clinical.read', justification: 'x'.repeat(2000) }), true);
  const [row] = await store.list('access_audit');
  assert.equal(row.actor_user_id, 'u2');
  assert.equal(row.justification.length, 500);
  assert.equal(buildAuditRow({ action: 'a', actor_user_id: 'u', at: '2030-01-01T00:00:00Z' }).at, '2030-01-01T00:00:00.000Z');
});
