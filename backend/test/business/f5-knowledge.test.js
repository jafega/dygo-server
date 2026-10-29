// F5 — Biblioteca, cursos, supervisión, asistente IA y panel del dueño.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic, CLINICAL_KEY } from './helpers.js';
import { rankLibrary, buildLibraryPrompt, tokenize } from '../../utils/knowledge.js';
import { computeDashboard, workingDays } from '../../utils/dashboard.js';
import { createBusinessRouter } from '../../business/index.js';
import { createStore } from '../../business/store.js';

test('biblioteca: ranking por palabras clave y prompt sin datos ajenos', () => {
  assert.deepEqual(tokenize('¿Cómo actúo ante una crisis de ANSIEDAD?'), ['actuo', 'crisis', 'ansiedad']);
  const items = [
    { id: '1', title: 'Protocolo de riesgo suicida', body: 'Evaluar ideación, plan y medios. Derivar a urgencias si hay plan.', tags: ['riesgo'], kind: 'protocolo' },
    { id: '2', title: 'Crisis de ansiedad en consulta', body: 'Respiración diafragmática. Validar. Ansiedad, ansiedad.', tags: ['ansiedad'], kind: 'protocolo' },
    { id: '3', title: 'Política de cancelaciones', body: 'Avisar con 24 h.', tags: [], kind: 'material' },
    { id: '4', title: 'Antiguo', body: 'ansiedad', tags: [], kind: 'material', active: false }
  ];
  const top = rankLibrary(items, '¿Qué hago ante una crisis de ansiedad?');
  assert.equal(top[0].id, '2');
  assert.ok(!top.some(i => i.id === '4'), 'los inactivos no cuentan');
  assert.deepEqual(rankLibrary(items, '¿?'), []);
  const prompt = buildLibraryPrompt('¿Qué hago ante una crisis?', top, 'Clínica Sol');
  assert.match(prompt, /Fuente 1: Crisis de ansiedad en consulta/);
  assert.match(prompt, /Clínica Sol/);
  assert.match(prompt, /no inventes/);
});

test('panel del dueño: KPIs con semilla conocida', () => {
  const range = { from: '2031-05-01T00:00:00.000Z', to: '2031-06-01T00:00:00.000Z' };
  assert.equal(workingDays(range.from, range.to), 22); // mayo de 2031
  const appt = (o) => ({ status: 'completed', price: 60, member_id: 'A', starts_at: '2031-05-05T10:00:00Z', ends_at: '2031-05-05T11:00:00Z', ...o });
  const appointments = [
    ...Array.from({ length: 8 }, (_, i) => appt({ patient_id: `p${i % 3}`, member_id: i < 5 ? 'A' : 'B', room_id: 'r1', location_id: 'L1' })),
    appt({ status: 'no_show', room_id: 'r1' }), appt({ status: 'no_show' }),
    appt({ status: 'cancelled', room_id: 'r1' })
  ];
  const d = computeDashboard({
    range, appointments,
    invoices: [{ kind: 'patient', status: 'issued', total: 120 }, { kind: 'patient', status: 'issued', total: -60 }, { kind: 'patient', status: 'draft', total: 999 }],
    rooms: [{ id: 'r1', name: 'Despacho 1' }], locations: [{ id: 'L1', name: 'Centro' }],
    patients: [{ status: 'active' }, { status: 'active' }, { status: 'discharged' }],
    leads: [{ status: 'paciente' }, { status: 'nuevo' }, { status: 'descartado' }, { status: 'paciente' }],
    settlements: [{ status: 'paid', data: { net_payable: 10 } }, { status: 'validated', data: { net_payable: 158.1 } }],
    memberNames: { A: 'Ana', B: 'Bruno' }
  });
  assert.equal(d.sessions, 8);
  assert.equal(d.no_shows, 2);
  assert.equal(d.no_show_rate, 20, '2 de 10');
  assert.equal(d.production, 480);
  assert.equal(d.invoiced, 60, 'rectificativas restan; borradores no cuentan');
  assert.equal(d.by_member[0].name, 'Ana');
  assert.equal(d.by_member[0].production, 300);
  assert.equal(d.by_location.find(l => l.name === 'Centro').sessions, 8);
  // 9 h de sala (8 realizadas + 1 no presentada) / (22 días × 12 h)
  assert.equal(d.room_occupancy, Math.round((540 / (22 * 720)) * 1000) / 10);
  assert.equal(d.patients_active, 2);
  assert.equal(d.patients_seen, 3);
  assert.equal(d.lead_conversion, 50);
  assert.equal(d.settlements_pending, 1);
  assert.equal(d.settlements_pending_amount, 158.1);
});

// ── Asistente IA, con un cliente de IA simulado que captura el prompt ──
const fakeAuth = (req, res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Autenticación requerida' });
  req.authenticatedUserId = h.slice(7);
  next();
};

async function aiApp(askAI) {
  const store = createStore({ driver: 'memory' });
  const org = await store.insert('organizations', { name: 'Clínica Sol', slug: 'sol', plan_id: 'essential', status: 'trialing', trial_ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), settings: {} });
  const add = (user_id, role) => store.insert('org_members', { org_id: org.id, user_id, email: `${user_id}@x`, role, status: 'active', permissions_override: {} });
  const psy = await add('psy', 'psicologo');
  await add('rec', 'recepcion');
  await store.insert('org_library_items', { org_id: org.id, kind: 'protocolo', title: 'Crisis de ansiedad', body: 'Respiración y validación.', tags: ['ansiedad'], active: true });
  // Datos que NUNCA deben llegar a la IA.
  await store.insert('org_patients', { org_id: org.id, first_name: 'PACIENTE-SECRETO', email: 'secreto@paciente.es', phone: '699999999', assigned_member_ids: [psy.id], status: 'active' });
  await store.insert('org_clinical_notes', { org_id: org.id, patient_id: 'x', author_member_id: psy.id, visibility: 'clinical_record', content_enc: 'enc:v1:NOTA-SECRETA' });
  const app = express();
  app.use(express.json());
  const { orgRouter } = createBusinessRouter({ store, authenticateRequest: fakeAuth, isSuperAdmin: () => false, deps: { flags: { enabled: true, betaEmails: [], dpaVersion: 'v1' }, askAI } });
  app.use('/api/org', orgRouter);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/org/${org.id}`;
  const ask = (token, question) => fetch(`${base}/library/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ question }) })
    .then(async r => ({ status: r.status, body: await r.json() }));
  return { ask, close: () => new Promise(r => server.close(r)), store, org };
}

test('asistente IA: solo biblioteca y pregunta; nunca datos de pacientes ni notas', async (t) => {
  const prompts = [];
  const { ask, close } = await aiApp(async ({ prompt }) => { prompts.push(prompt); return 'Según la [Fuente 1], respiración y validación.'; });
  t.after(close);
  const r = await ask('psy', '¿Cómo manejo una crisis de ansiedad de [PACIENTE_001]?');
  assert.equal(r.status, 200);
  assert.match(r.body.answer, /Fuente 1/);
  assert.deepEqual(r.body.sources.map(s => s.title), ['Crisis de ansiedad']);
  assert.equal(prompts.length, 1);
  for (const forbidden of ['PACIENTE-SECRETO', 'secreto@paciente.es', '699999999', 'NOTA-SECRETA', 'enc:v1']) {
    assert.ok(!prompts[0].includes(forbidden), `el prompt no contiene ${forbidden}`);
  }
  assert.ok(prompts[0].includes('[PACIENTE_001]'), 'la pregunta llega anonimizada tal cual');
  // Sin fuentes relevantes no se llama a la IA.
  const none = await ask('psy', 'zzz qqq');
  assert.equal(none.status, 200);
  assert.equal(prompts.length, 1);
  // Recepción no usa la biblioteca.
  assert.equal((await ask('rec', 'ansiedad')).status, 403);
});

test('asistente IA: sin cliente configurado → 503', async (t) => {
  const { ask, close } = await aiApp(null);
  t.after(close);
  const r = await ask('psy', 'ansiedad');
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
});

test('F5: biblioteca, cursos, supervisión y panel del dueño con permisos', async (t) => {
  const srv = await startServer({ env: businessEnv('owner@k5.local') });
  t.after(() => srv.stop());
  const req = srv.request;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'owner@k5.local' },
    name: 'Clínica Saber',
    members: [
      { key: 'dir', name: 'Diego Director', email: 'dir@k5.local', role: 'director_clinico' },
      { key: 'p1', name: 'Paula Uno', email: 'p1@k5.local', role: 'psicologo' },
      { key: 'p2', name: 'Pablo Dos', email: 'p2@k5.local', role: 'psicologo' },
      { key: 'int', name: 'Inés Prácticas', email: 'int@k5.local', role: 'en_practicas' },
      { key: 'ger', name: 'Gema Gerente', email: 'ger@k5.local', role: 'gerente', psych: false },
      { key: 'rec', name: 'Rosa Recepción', email: 'rec@k5.local', role: 'recepcion', psych: false },
      { key: 'acc', name: 'Carmen Contable', email: 'acc@k5.local', role: 'contable', psych: false }
    ]
  });

  // Biblioteca: gestionan titular/gerente/director; consumen clínicos; recepción y contable no.
  assert.equal((await req('POST', `${base}/library`, { token: u.p1.token, body: { title: 'X' } })).status, 403);
  const item = await req('POST', `${base}/library`, { token: u.dir.token, body: { title: 'Protocolo de primera visita', body: 'Pasos…', kind: 'protocolo', tags: ['acogida'] } });
  assert.equal(item.status, 201);
  assert.equal((await req('POST', `${base}/library`, { token: u.dir.token, body: { title: 'Mal', url: 'http://inseguro' } })).status, 400);
  assert.equal((await req('GET', `${base}/library`, { token: u.int.token })).body.items.length, 1);
  for (const k of ['rec', 'acc']) assert.equal((await req('GET', `${base}/library`, { token: u[k].token })).status, 403, k);

  // Cursos: el gestor crea; el psicólogo completa un módulo; horas.
  const course = (await req('POST', `${base}/courses`, { token: u.ger.token, body: { title: 'Acogida en la clínica', required_for: ['psicologo', 'en_practicas'] } })).body.course;
  const m1 = (await req('POST', `${base}/courses/${course.id}/modules`, { token: u.ger.token, body: { title: 'Protocolos', minutes: 90 } })).body.module;
  await req('POST', `${base}/courses/${course.id}/modules`, { token: u.ger.token, body: { title: 'Herramientas', minutes: 30 } });
  assert.equal((await req('POST', `${base}/courses/${course.id}/modules/${m1.id}/complete`, { token: u.p1.token })).status, 201);
  assert.equal((await req('POST', `${base}/courses/${course.id}/modules/${m1.id}/complete`, { token: u.p1.token })).status, 200, 'idempotente');
  const myCourses = await req('GET', `${base}/courses`, { token: u.p1.token });
  assert.equal(myCourses.body.courses[0].my_completed, 1);
  assert.equal(myCourses.body.courses[0].total_minutes, 120);
  assert.equal(myCourses.body.courses[0].required, true);
  const hoursMgr = await req('GET', `${base}/training/hours`, { token: u.ger.token });
  assert.equal(hoursMgr.body.members.find(m => m.member_id === u.p1.memberId).training_hours, 1.5);
  const hoursP2 = await req('GET', `${base}/training/hours`, { token: u.p2.token });
  assert.deepEqual(hoursP2.body.members.map(m => m.member_id), [u.p2.memberId], 'cada uno ve las suyas');
  assert.equal((await req('DELETE', `${base}/courses/${course.id}/modules/${m1.id}`, { token: u.ger.token })).status, 409);

  // Supervisión: la ven los dos implicados y el director; nadie más.
  const sup = await req('POST', `${base}/supervision`, { token: u.p1.token, body: { supervisee_member_id: u.int.memberId, session_date: '2031-05-10', minutes: 60, topics: ['caso de ansiedad'], notes: 'NOTA-SUPERVISION: revisar plan' } });
  assert.equal(sup.status, 201, sup.text);
  assert.equal(sup.body.log.notes, 'NOTA-SUPERVISION: revisar plan');
  assert.equal((await req('POST', `${base}/supervision`, { token: u.rec.token, body: { supervisee_member_id: u.int.memberId, session_date: '2031-05-10', minutes: 60 } })).status, 403);
  assert.equal((await req('POST', `${base}/supervision`, { token: u.p1.token, body: { supervisee_member_id: u.p1.memberId, session_date: '2031-05-10', minutes: 60 } })).status, 400);
  const id = sup.body.log.id;
  assert.equal((await req('GET', `${base}/supervision/${id}`, { token: u.int.token })).status, 200);
  assert.equal((await req('GET', `${base}/supervision/${id}`, { token: u.dir.token })).status, 200);
  assert.equal((await req('GET', `${base}/supervision/${id}`, { token: u.p2.token })).status, 403);
  assert.equal((await req('GET', `${base}/supervision/${id}`, { token: u.owner.token })).status, 403);
  assert.equal((await req('GET', `${base}/supervision`, { token: u.p2.token })).body.logs.length, 0);
  assert.equal((await req('GET', `${base}/supervision`, { token: u.ger.token })).status, 403);
  const stored = fs.readFileSync(`${srv.tmpDir}/business-store.json`, 'utf-8');
  assert.ok(!stored.includes('NOTA-SUPERVISION'), 'notas de supervisión cifradas');
  assert.equal((await req('GET', `${base}/training/hours`, { token: u.ger.token })).body.members.find(m => m.member_id === u.int.memberId).supervision_hours, 1);

  // Panel del dueño: titular y gerente; nadie más.
  const dash = await req('GET', `${base}/dashboard?period=2031-05`, { token: u.owner.token });
  assert.equal(dash.status, 200);
  for (const k of ['sessions', 'no_show_rate', 'room_occupancy', 'patients_active', 'lead_conversion', 'settlements_pending']) assert.ok(k in dash.body, k);
  assert.equal((await req('GET', `${base}/dashboard?period=2031-05`, { token: u.ger.token })).status, 200);
  for (const k of ['dir', 'p1', 'rec', 'acc']) assert.equal((await req('GET', `${base}/dashboard?period=2031-05`, { token: u[k].token })).status, 403, k);
  assert.equal((await req('GET', `${base}/dashboard?period=2031-5`, { token: u.owner.token })).status, 400);
  void CLINICAL_KEY;
});
