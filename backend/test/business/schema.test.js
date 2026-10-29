// Las escrituras del store se validan contra las columnas de las migraciones
// SQL (los tests de integración lo activan con BUSINESS_STORE_SCHEMA_CHECK=1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema, loadBusinessSchema } from '../../business/schema.js';
import { createStore, isAllowedTable } from '../../business/store.js';

test('parseSchema lee CREATE TABLE y ALTER TABLE ADD COLUMN, ignorando CONSTRAINT', () => {
  const s = parseSchema([`CREATE TABLE IF NOT EXISTS public.org_x (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, -- comentario
  CONSTRAINT org_x_chk CHECK (name <> '')
);
ALTER TABLE public.org_x ADD COLUMN IF NOT EXISTS extra jsonb;`]);
  assert.deepEqual([...s.org_x].sort(), ['extra', 'id', 'name']);
});

test('todas las tablas de Business están en las migraciones y en la lista blanca', () => {
  const schema = loadBusinessSchema();
  const expected = ['access_audit', 'organizations', 'org_members', 'org_locations', 'org_rooms', 'org_patients', 'org_appointments',
    'org_clinical_notes', 'org_consent_templates', 'org_patient_consents', 'org_billing_entities', 'org_commission_rules',
    'org_invoices', 'org_settlements', 'verifactu_records', 'org_leads', 'org_library_items', 'org_courses',
    'org_course_modules', 'org_course_progress', 'org_supervision_logs'];
  for (const t of expected) {
    assert.ok(schema[t], `falta ${t} en las migraciones`);
    assert.ok(isAllowedTable(t), `${t} fuera de la lista blanca`);
  }
  for (const t of Object.keys(schema)) assert.ok(isAllowedTable(t), `${t} creada pero no permitida en el store`);
});

test('con schema, el store rechaza columnas inexistentes (insert y update)', async () => {
  const store = createStore({ driver: 'memory', schema: loadBusinessSchema() });
  const org = await store.insert('organizations', { name: 'Clínica', slug: 'c', created_by: 'u' });
  await assert.rejects(() => store.insert('organizations', { name: 'X', slug: 'x', created_by: 'u', nmae: 'typo' }), /organizations\.nmae no existe/);
  await assert.rejects(() => store.update('organizations', org.id, { setings: {} }), /organizations\.setings no existe/);
  assert.equal((await store.update('organizations', org.id, { settings: { a: 1 } })).settings.a, 1);
});
