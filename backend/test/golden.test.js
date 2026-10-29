// Tests golden de no regresión del espacio personal (mainds pro).
//
// Capturan la respuesta ACTUAL de los endpoints Pro que más datos clínicos y de
// facturación mueven, con una semilla fija, y la comparan con lo guardado en
// test/golden/*.json. Si un cambio de Business altera alguna de estas
// respuestas, este test falla.
//
// Regenerar (solo si el cambio de comportamiento es intencionado y revisado):
//   cd backend && UPDATE_GOLDEN=1 node --test test/golden.test.js
//
// Nota: se ejecutan sin Supabase (driver de fichero). Algunos endpoints Pro
// responden distinto sin Supabase (p. ej. /api/sessions → 503); el golden
// captura exactamente eso, que es el comportamiento actual en local.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './helpers/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOLATILE_KEYS = /^(createdAt|created_at|updatedAt|updated_at|timestamp|lastLogin|last_login|last_seen_at)$/;

/** Sustituye ids y marcas de tiempo variables por marcadores estables. */
function normalize(value, idMap, key = '') {
  if (Array.isArray(value)) return value.map(v => normalize(v, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = normalize(value[k], idMap, k);
    return out;
  }
  if (VOLATILE_KEYS.test(key) && (typeof value === 'number' || typeof value === 'string')) return '<ts>';
  if (typeof value === 'string') {
    if (idMap.has(value)) return idMap.get(value);
    if (UUID_RE.test(value)) return '<uuid>';
    if (/^\d{13}$/.test(value)) return '<epoch-id>';
  }
  return value;
}

// Semilla fija: ids y fechas (2030) constantes salvo los de los usuarios, que
// los genera /api/auth/register y se normalizan a <PRO>, <P1>, <P2>.
function seed(db, { pro, p1, p2 }) {
  db.careRelationships = [{
    id: 'rel-golden-1',
    psychologist_user_id: pro.id,
    patient_user_id: p1.id,
    createdAt: 1893456000000,
    default_session_price: 60,
    default_psych_percent: 100
  }];
  db.sessions = [
    {
      id: 'ses-golden-1', psychologistId: pro.id, psychologist_user_id: pro.id,
      patientId: p1.id, patient_user_id: p1.id,
      date: '2030-03-04', startTime: '10:00', endTime: '11:00',
      starts_on: '2030-03-04T10:00:00.000Z', ends_on: '2030-03-04T11:00:00.000Z',
      status: 'completed', price: 60, percent_psych: 100, paid: false, bonus_id: null
    },
    {
      id: 'ses-golden-2', psychologistId: pro.id, psychologist_user_id: pro.id,
      patientId: p1.id, patient_user_id: p1.id,
      date: '2030-03-11', startTime: '10:00', endTime: '11:00',
      starts_on: '2030-03-11T10:00:00.000Z', ends_on: '2030-03-11T11:00:00.000Z',
      status: 'scheduled', price: 60, percent_psych: 100, paid: false, bonus_id: null
    }
  ];
  db.invoices = [{
    id: 'inv-golden-1',
    invoiceNumber: 'F2030-0001',
    psychologist_user_id: pro.id, psychologistId: pro.id,
    patient_user_id: p1.id, patientId: p1.id,
    invoice_type: 'patient', status: 'pending', currency: 'EUR',
    date: '2030-03-05', invoice_date: '2030-03-05',
    amount: 60, tax: 0, total: 60,
    items: [{ description: 'Sesión de psicoterapia', quantity: 1, unitPrice: 60 }],
    sessionIds: ['ses-golden-1']
  }];
  return db;
}

const CASES = [
  { name: 'sessions-pro', as: 'pro', url: u => `/api/sessions?psychologistId=${u.pro.id}` },
  { name: 'sessions-patient', as: 'p1', url: u => `/api/sessions?patientId=${u.p1.id}` },
  { name: 'relationships-pro', as: 'pro', url: u => `/api/relationships?psychologist_user_id=${u.pro.id}` },
  { name: 'relationships-patient', as: 'p1', url: u => `/api/relationships?patient_user_id=${u.p1.id}` },
  { name: 'invoices-pro', as: 'pro', url: u => `/api/invoices?psychologist_user_id=${u.pro.id}` },
  { name: 'invoices-patient', as: 'p1', url: u => `/api/invoices?patient_user_id=${u.p1.id}` },
  { name: 'centers-pro', as: 'pro', url: u => `/api/centers?psychologistId=${u.pro.id}` },
  { name: 'templates-pro', as: 'pro', url: u => `/api/templates?psych_user_id=${u.pro.id}` }
];

// Los golden se comprueban con Business apagado y encendido: encender el flag
// no puede cambiar nada del espacio personal (R6). Se generan solo con el
// flag apagado.
const MODES = [
  { label: 'flag apagado', env: {}, generate: true },
  { label: 'flag encendido', env: { BUSINESS_ENABLED: 'true', BUSINESS_STORE: 'file', BUSINESS_BETA_EMAILS: 'pro@golden.local' }, generate: false }
];

for (const mode of MODES) {
  test(`golden (${mode.label})`, async (t) => {
    if (UPDATE && !mode.generate) return;
    const srv = await startServer({ env: mode.env });
    t.after(() => srv.stop());
    const pro = await srv.createUser({ name: 'Pro Golden', email: 'pro@golden.local', role: 'PSYCHOLOGIST' });
    const p1 = await srv.createUser({ name: 'Paciente Uno', email: 'p1@golden.local' });
    const p2 = await srv.createUser({ name: 'Paciente Dos', email: 'p2@golden.local' });
    const users = { pro, p1, p2 };
    const ids = new Map([[pro.id, '<PRO>'], [p1.id, '<P1>'], [p2.id, '<P2>']]);
    srv.writeDb(seed(srv.readDb(), users));

    for (const c of CASES) {
      await t.test(`GET ${c.name}`, async () => {
        const r = await srv.request('GET', c.url(users), { token: users[c.as].token });
        const actual = normalize({ status: r.status, body: r.body }, ids);
        const file = path.join(GOLDEN_DIR, `${c.name}.json`);
        if (UPDATE) {
          fs.mkdirSync(GOLDEN_DIR, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(actual, null, 2) + '\n', 'utf-8');
          return;
        }
        assert.ok(fs.existsSync(file), `Falta ${file}. Genera los golden con UPDATE_GOLDEN=1.`);
        const expected = JSON.parse(fs.readFileSync(file, 'utf-8'));
        assert.deepEqual(actual, expected);
      });
    }
  });
}
