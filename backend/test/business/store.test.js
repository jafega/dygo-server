// Fase 0.4 / R3 — adaptador de almacenamiento de Business.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore, isAllowedTable, MAX_LIMIT } from '../../business/store.js';

const memory = () => createStore({ driver: 'memory' });

test('lista blanca: solo organizations, org_*, access_audit y verifactu_records', () => {
  for (const t of ['organizations', 'org_members', 'org_invoices', 'org_x1', 'access_audit', 'verifactu_records']) {
    assert.equal(isAllowedTable(t), true, t);
  }
  for (const t of ['users', 'sessions', 'care_relationships', 'invoices', 'session_entry', 'entries',
    'templates', 'center', 'subscriptions', 'org', 'org_', 'ORG_members', 'organizations2', 'public.org_members', '', null, undefined]) {
    assert.equal(isAllowedTable(t), false, String(t));
  }
});

test('tabla fuera de la lista blanca → TABLE_NOT_ALLOWED en todas las operaciones', async () => {
  const s = memory();
  for (const table of ['users', 'sessions', 'invoices', 'care_relationships']) {
    await assert.rejects(s.get(table, 'x'), { code: 'TABLE_NOT_ALLOWED' });
    await assert.rejects(s.list(table), { code: 'TABLE_NOT_ALLOWED' });
    await assert.rejects(s.insert(table, { a: 1 }), { code: 'TABLE_NOT_ALLOWED' });
    await assert.rejects(s.update(table, 'x', { a: 1 }), { code: 'TABLE_NOT_ALLOWED' });
    await assert.rejects(s.remove(table, 'x'), { code: 'TABLE_NOT_ALLOWED' });
  }
});

test('tabla fuera de la lista blanca también con el driver supabase (no llega a consultar)', async () => {
  let called = false;
  const s = createStore({ driver: 'supabase', supabase: { from() { called = true; throw new Error('no'); } } });
  await assert.rejects(s.list('users'), { code: 'TABLE_NOT_ALLOWED' });
  assert.equal(called, false);
});

test('access_audit y verifactu_records: solo inserción', async () => {
  const s = memory();
  for (const table of ['access_audit', 'verifactu_records']) {
    const row = await s.insert(table, { action: 'x' });
    assert.ok(row.id);
    await assert.rejects(s.update(table, row.id, { action: 'y' }), { code: 'INSERT_ONLY_TABLE' });
    await assert.rejects(s.remove(table, row.id), { code: 'INSERT_ONLY_TABLE' });
    assert.equal((await s.get(table, row.id)).action, 'x');
  }
});

test('CRUD básico en memoria', async () => {
  const s = memory();
  const org = await s.insert('organizations', { name: 'Clínica A', slug: 'clinica-a' });
  assert.ok(org.id);
  assert.ok(org.created_at);
  assert.deepEqual(await s.get('organizations', org.id), org);
  assert.equal(await s.get('organizations', 'nope'), null);

  const upd = await s.update('organizations', org.id, { name: 'Clínica A2', id: 'cambiar-id-no' });
  assert.equal(upd.name, 'Clínica A2');
  assert.equal(upd.id, org.id);
  assert.equal(await s.update('organizations', 'nope', { name: 'x' }), null);

  assert.equal(await s.remove('organizations', org.id), true);
  assert.equal(await s.remove('organizations', org.id), false);
  assert.equal(await s.get('organizations', org.id), null);
});

test('las filas devueltas son copias (mutarlas no cambia el store)', async () => {
  const s = memory();
  const org = await s.insert('organizations', { name: 'A', slug: 'a', settings: { x: 1 } });
  org.settings.x = 99;
  const again = await s.get('organizations', org.id);
  assert.equal(again.settings.x, 1);
});

test('insert múltiple devuelve array y es atómico ante un duplicado', async () => {
  const s = memory();
  const rows = await s.insert('organizations', [{ slug: 'a' }, { slug: 'b' }]);
  assert.equal(rows.length, 2);
  await assert.rejects(s.insert('organizations', [{ slug: 'c' }, { slug: 'a' }]), { code: 'UNIQUE_VIOLATION' });
  assert.equal((await s.list('organizations')).length, 2);
});

test('list: eq, in, gte, lte, order y limit', async () => {
  const s = memory();
  await s.insert('org_rooms', [
    { org_id: 'o1', name: 'A', n: 3, day: '2030-01-03' },
    { org_id: 'o1', name: 'B', n: 1, day: '2030-01-01' },
    { org_id: 'o1', name: 'C', n: 2, day: '2030-01-02', location_id: null },
    { org_id: 'o2', name: 'D', n: 4, day: '2030-01-04', location_id: 'l1' }
  ]);
  assert.deepEqual((await s.list('org_rooms', { eq: { org_id: 'o1' }, order: 'n' })).map(r => r.name), ['B', 'C', 'A']);
  assert.deepEqual((await s.list('org_rooms', { eq: { org_id: 'o1' }, order: { column: 'n', ascending: false } })).map(r => r.name), ['A', 'C', 'B']);
  assert.deepEqual((await s.list('org_rooms', { in: { name: ['A', 'D'] }, order: '-day' })).map(r => r.name), ['D', 'A']);
  assert.deepEqual((await s.list('org_rooms', { gte: { day: '2030-01-02' }, lte: { day: '2030-01-03' }, order: 'day' })).map(r => r.name), ['C', 'A']);
  assert.deepEqual((await s.list('org_rooms', { eq: { location_id: null }, order: 'name' })).map(r => r.name), ['A', 'B', 'C']);
  assert.equal((await s.list('org_rooms', { limit: 2 })).length, 2);
});

test(`list: nunca más de ${MAX_LIMIT} filas`, async () => {
  const s = memory();
  await assert.rejects(s.list('org_rooms', { limit: MAX_LIMIT + 1 }), { code: 'LIMIT_TOO_LARGE' });
  await assert.rejects(s.list('org_rooms', { limit: 0 }), { code: 'BAD_QUERY' });
  await s.insert('org_rooms', Array.from({ length: MAX_LIMIT + 5 }, (_, i) => ({ i })));
  assert.equal((await s.list('org_rooms')).length, MAX_LIMIT);
});

test('únicas: slug de organización (sin distinguir mayúsculas)', async () => {
  const s = memory();
  await s.insert('organizations', { name: 'A', slug: 'clinica' });
  await assert.rejects(s.insert('organizations', { name: 'B', slug: 'Clinica' }), { code: 'UNIQUE_VIOLATION' });
  const b = await s.insert('organizations', { name: 'B', slug: 'otra' });
  await assert.rejects(s.update('organizations', b.id, { slug: 'clinica' }), { code: 'UNIQUE_VIOLATION' });
  // Actualizar la propia fila sin cambiar el slug no choca consigo misma.
  assert.equal((await s.update('organizations', b.id, { name: 'B2', slug: 'otra' })).name, 'B2');
});

test('únicas: email de miembro por organización', async () => {
  const s = memory();
  await s.insert('org_members', { org_id: 'o1', email: 'ana@x.com' });
  await assert.rejects(s.insert('org_members', { org_id: 'o1', email: 'ANA@x.com ' }), { code: 'UNIQUE_VIOLATION' });
  await s.insert('org_members', { org_id: 'o2', email: 'ana@x.com' });
});

test('únicas: número de factura por emisor y serie (borradores sin número no chocan)', async () => {
  const s = memory();
  await s.insert('org_invoices', { issuer_key: 'e1', series: 'A', number: 1 });
  await assert.rejects(s.insert('org_invoices', { issuer_key: 'e1', series: 'A', number: 1 }), { code: 'UNIQUE_VIOLATION' });
  await s.insert('org_invoices', { issuer_key: 'e1', series: 'B', number: 1 });
  await s.insert('org_invoices', { issuer_key: 'e2', series: 'A', number: 1 });
  await s.insert('org_invoices', { issuer_key: 'e1', series: 'A', number: null });
  await s.insert('org_invoices', { issuer_key: 'e1', series: 'A', number: null });
});

test('driver file: persiste en disco y se recarga', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainds-store-'));
  const file = path.join(dir, 'store.json');
  try {
    const a = createStore({ driver: 'file', file });
    const org = await a.insert('organizations', { name: 'A', slug: 'a' });
    assert.ok(fs.existsSync(file));
    const b = createStore({ driver: 'file', file });
    assert.equal((await b.get('organizations', org.id)).name, 'A');
    await assert.rejects(b.insert('organizations', { slug: 'A' }), { code: 'UNIQUE_VIOLATION' });
    // Escrituras concurrentes: se serializan, no se pierde ninguna.
    await Promise.all(Array.from({ length: 20 }, (_, i) => b.insert('org_rooms', { i })));
    const c = createStore({ driver: 'file', file });
    assert.equal((await c.list('org_rooms')).length, 20);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Cliente de Supabase falso: devuelve el error que se le pida.
function fakeSupabase(result) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([prop, ...args]); return builder; };
    }
  });
  return { calls, from: (table) => { calls.push(['from', table]); return builder; } };
}

test('driver supabase: tabla inexistente → BUSINESS_NOT_MIGRATED (42P01 y PGRST205)', async () => {
  for (const code of ['42P01', 'PGRST205']) {
    const s = createStore({ driver: 'supabase', supabase: fakeSupabase({ data: null, error: { code, message: 'relation "x" does not exist' } }) });
    await assert.rejects(s.list('org_members'), { code: 'BUSINESS_NOT_MIGRATED' });
    await assert.rejects(s.get('organizations', 'x'), { code: 'BUSINESS_NOT_MIGRATED' });
  }
});

test('driver supabase: 23505 → UNIQUE_VIOLATION y otros errores sin filtrar el detalle', async () => {
  const dup = createStore({ driver: 'supabase', supabase: fakeSupabase({ data: null, error: { code: '23505', details: 'Key (email)=(ana@x.com) already exists' } }) });
  await assert.rejects(dup.insert('org_members', { email: 'ana@x.com' }), { code: 'UNIQUE_VIOLATION' });
  const other = createStore({ driver: 'supabase', supabase: fakeSupabase({ data: null, error: { code: 'XX000', message: 'paciente Juan Pérez' } }) });
  await assert.rejects(other.list('org_members'), (err) => err.code === 'STORE_ERROR' && !err.message.includes('Juan'));
});

test('driver supabase: traduce list a la consulta', async () => {
  const sb = fakeSupabase({ data: [{ id: '1' }], error: null });
  const s = createStore({ driver: 'supabase', supabase: sb });
  const rows = await s.list('org_members', { eq: { org_id: 'o1', user_id: null }, in: { role: ['a'] }, gte: { at: 1 }, lte: { at: 2 }, order: '-at', limit: 10 });
  assert.deepEqual(rows, [{ id: '1' }]);
  const ops = sb.calls.map(c => c[0]);
  assert.deepEqual(ops, ['from', 'select', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']);
  assert.deepEqual(sb.calls.find(c => c[0] === 'order'), ['order', 'at', { ascending: false }]);
  assert.deepEqual(sb.calls.find(c => c[0] === 'limit'), ['limit', 10]);
});

test('driver desconocido o sin dependencias → error al crear', () => {
  assert.throws(() => createStore({ driver: 'sqlite' }));
  assert.throws(() => createStore({ driver: 'supabase' }));
  assert.throws(() => createStore({ driver: 'file' }));
});
