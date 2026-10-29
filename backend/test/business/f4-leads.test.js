// F4 — Captación: lógica pura y flujo completo (página pública, widget,
// solicitudes, reparto, conversión a paciente y su efecto en las comisiones).
import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic } from './helpers.js';
import { canTransition, nextRoundRobin, splitName, isPurgeable, leadMetrics } from '../../utils/leads.js';

test('leads: transiciones, reparto rotatorio, nombre, retención y métricas', () => {
  assert.equal(canTransition('nuevo', 'contactado'), true);
  assert.equal(canTransition('nuevo', 'paciente'), false, 'a paciente solo se llega convirtiendo');
  assert.equal(canTransition('paciente', 'nuevo'), false);
  assert.equal(canTransition('descartado', 'nuevo'), true);
  assert.equal(nextRoundRobin(['b', 'a'], null), 'a');
  assert.equal(nextRoundRobin(['b', 'a'], 'a'), 'b');
  assert.equal(nextRoundRobin(['b', 'a'], 'b'), 'a');
  assert.equal(nextRoundRobin(['a', 'b'], 'zz'), 'a', 'si el último ya no acepta, empieza por el primero');
  assert.equal(nextRoundRobin([], null), null);
  assert.deepEqual(splitName('  Laura  Gómez Ruiz '), { first_name: 'Laura', last_name: 'Gómez Ruiz' });
  assert.deepEqual(splitName('Laura'), { first_name: 'Laura', last_name: null });
  const old = new Date(Date.now() - 400 * 864e5).toISOString();
  assert.equal(isPurgeable({ status: 'descartado', discarded_at: old }), true);
  assert.equal(isPurgeable({ status: 'descartado', discarded_at: new Date().toISOString() }), false);
  assert.equal(isPurgeable({ status: 'nuevo', discarded_at: old }), false);
  const m = leadMetrics([
    { source: 'web', status: 'paciente', assigned_member_id: 'A' },
    { source: 'web', status: 'nuevo', assigned_member_id: 'A' },
    { source: 'widget', status: 'paciente', assigned_member_id: 'B' },
    { source: 'telefono', status: 'descartado' }
  ]);
  assert.equal(m.total, 4);
  assert.equal(m.rate, 50);
  assert.deepEqual(m.by_source.find(s => s.source === 'web'), { source: 'web', leads: 2, converted: 1, rate: 50 });
  assert.equal(m.by_member.find(x => x.member_id === 'B').rate, 100);
  assert.equal(m.by_status.descartado, 1);
});

test('F4: captación de punta a punta', async (t) => {
  const SECRET = 'whsec_test_leads';
  const srv = await startServer({ env: businessEnv('owner@l.local,owner2@l.local', { STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: SECRET }) });
  t.after(() => srv.stop());
  const req = srv.request;
  const { base, org, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'owner@l.local' },
    name: 'Clínica Faro',
    members: [
      { key: 'a', name: 'Ana López', email: 'ana@l.local', role: 'psicologo', body: { employment_type: 'freelance', billing_model: 'org_invoices' } },
      { key: 'b', name: 'Bruno Sanz', email: 'bruno@l.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rec@l.local', role: 'recepcion', psych: false }
    ]
  });
  const pub = (path, body) => req(body === undefined ? 'GET' : 'POST', `/api/public/org/${org.slug}${path}`, body === undefined ? {} : { body });

  // Desactivada por defecto → 404.
  assert.equal((await pub('')).status, 404);
  assert.equal((await req('PUT', `${base}/public-page`, { token: u.rec.token, body: { enabled: true } })).status, 403);
  const page = await req('PUT', `${base}/public-page`, { token: u.owner.token, body: { enabled: true, headline: 'Psicología en Vigo', specialties: ['Ansiedad', 'Pareja'], assignment: 'round_robin' } });
  assert.equal(page.status, 200);

  // Perfiles públicos: Ana visible y acepta solicitudes; Bruno acepta pero no se muestra.
  await req('PUT', `${base}/members/me/public-profile`, { token: u.a.token, body: { visible: true, display_name: 'Ana López', bio: 'TCC', specialties: ['Ansiedad'], accepts_leads: true } });
  await req('PUT', `${base}/members/me/public-profile`, { token: u.b.token, body: { visible: false, accepts_leads: true } });
  assert.equal((await req('PUT', `${base}/members/me/public-profile`, { token: u.rec.token, body: { visible: true } })).status, 403);

  const view = await pub('');
  assert.equal(view.status, 200);
  assert.equal(view.body.clinic.headline, 'Psicología en Vigo');
  assert.equal(view.body.team.length, 1);
  assert.equal(view.body.team[0].name, 'Ana López');
  const raw = JSON.stringify(view.body.team);
  assert.ok(!raw.includes('@'), 'sin emails de profesionales');
  assert.ok(!raw.includes(u.a.memberId) && !raw.includes(u.a.id), 'sin ids internos');
  assert.match(view.body.consent.text, /Clínica Faro/);

  // ── Solicitudes ──
  // Honeypot: responde 201 y no guarda nada. Sin consentimiento: 400.
  assert.equal((await pub('/leads', { name: 'Bot', email: 'bot@x.com', consent: true, website: 'http://spam' })).status, 201);
  assert.equal((await pub('/leads', { name: 'Sin permiso', email: 'x@y.com' })).body.code, 'CONSENT_REQUIRED');
  assert.equal((await pub('/leads', { name: 'Sin contacto', consent: true })).status, 400);

  const send = (i, extra = {}) => pub('/leads', { name: `Persona ${i}`, email: `p${i}@mail.com`, reason: 'Ansiedad', consent: true, utm: { source: 'google' }, ...extra });
  for (let i = 1; i <= 4; i++) assert.equal((await send(i, i % 2 ? {} : { embed: true })).status, 201);

  // Reparto rotatorio A, B, A, B.
  const inbox = await req('GET', `${base}/leads`, { token: u.rec.token });
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.leads.length, 4, 'ni el bot ni el que no consintió se guardan');
  const order = [...inbox.body.leads].reverse().map(l => l.assigned_member_id);
  assert.notEqual(order[0], order[1]);
  assert.equal(order[0], order[2]);
  assert.equal(order[1], order[3]);
  assert.ok(inbox.body.leads.every(l => l.consent_at && l.utm.source === 'google'));
  assert.deepEqual(inbox.body.leads.map(l => l.source).sort(), ['web', 'web', 'widget', 'widget']);

  // Elegir profesional en el formulario: va a quien se eligió.
  assert.equal((await send(5, { professional_ref: view.body.team[0].ref })).status, 201);
  // Límite por IP: la sexta solicitud en una hora → 429.
  const sixth = await send(6);
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.code, 'TOO_MANY_REQUESTS');

  // Cada psicólogo ve solo las suyas.
  const asA = await req('GET', `${base}/leads`, { token: u.a.token });
  assert.ok(asA.body.leads.length >= 2);
  assert.ok(asA.body.leads.every(l => l.assigned_member_id === u.a.memberId));
  const preferred = asA.body.leads.find(l => l.name === 'Persona 5');
  assert.equal(preferred.preferred_member_id, u.a.memberId);

  // Transiciones.
  const lead = asA.body.leads.find(l => l.name !== 'Persona 5');
  assert.equal((await req('PATCH', `${base}/leads/${lead.id}`, { token: u.a.token, body: { status: 'paciente' } })).body.code, 'INVALID_TRANSITION');
  assert.equal((await req('PATCH', `${base}/leads/${lead.id}`, { token: u.a.token, body: { status: 'contactado', note: 'Llamada hecha' } })).body.lead.status, 'contactado');
  // Un psicólogo no reasigna.
  assert.equal((await req('POST', `${base}/leads/${lead.id}/assign`, { token: u.a.token, body: { member_id: u.b.memberId } })).status, 403);
  // Una solicitud ajena → 404.
  const notMine = inbox.body.leads.find(l => l.assigned_member_id === u.b.memberId);
  assert.equal((await req('PATCH', `${base}/leads/${notMine.id}`, { token: u.a.token, body: { status: 'contactado' } })).status, 404);

  // Alta manual por teléfono.
  const manual = await req('POST', `${base}/leads`, { token: u.rec.token, body: { name: 'Llamada Uno', phone: '600123123', source: 'telefono' } });
  assert.equal(manual.status, 201);
  assert.equal(manual.body.lead.source, 'telefono');

  // ── Conversión → paciente captado por la clínica → comisión de lead (60 %) ──
  await req('POST', `${base}/commission-rules`, { token: u.owner.token, body: { member_id: u.a.memberId, lead_source: 'clinic', psych_percent: 60, valid_from: '2020-01-01' } });
  await req('POST', `${base}/commission-rules`, { token: u.owner.token, body: { member_id: u.a.memberId, lead_source: 'own', psych_percent: 80, valid_from: '2020-01-01' } });
  const conv = await req('POST', `${base}/leads/${lead.id}/convert`, { token: u.a.token });
  assert.equal(conv.status, 201, conv.text);
  assert.equal((await req('POST', `${base}/leads/${lead.id}/convert`, { token: u.a.token })).status, 409);
  const patient = (await req('GET', `${base}/patients/${conv.body.patient_id}`, { token: u.a.token })).body.patient;
  assert.equal(patient.acquisition_source, 'clinic_lead');
  assert.deepEqual(patient.assigned_member_ids, [u.a.memberId]);
  const ownPatient = (await req('POST', `${base}/patients`, { token: u.a.token, body: { first_name: 'Propio' } })).body.patient;
  const mk = (pid, day) => req('POST', `${base}/appointments`, { token: u.a.token, body: { patient_id: pid, starts_at: `2031-04-${day}T10:00:00Z`, ends_at: `2031-04-${day}T11:00:00Z`, price: 50, modality: 'online' } });
  const apLead = (await mk(patient.id, '07')).body.appointment;
  const apOwn = (await mk(ownPatient.id, '08')).body.appointment;
  assert.equal(apLead.psych_percent, 60);
  assert.equal(apOwn.psych_percent, 80);
  for (const ap of [apLead, apOwn]) await req('PATCH', `${base}/appointments/${ap.id}`, { token: u.a.token, body: { status: 'completed' } });
  const gen = await req('POST', `${base}/settlements/generate`, { token: u.owner.token, body: { period: '2031-04' } });
  const sa = gen.body.settlements.find(s => s.member_id === u.a.memberId);
  assert.equal(sa.data.summary.psych_amount, 30 + 40, 'el lead liquida al 60 % y el propio al 80 %');

  // ── Métricas ──
  const metrics = await req('GET', `${base}/leads/metrics`, { token: u.owner.token });
  assert.equal(metrics.status, 200);
  assert.equal(metrics.body.converted, 1);
  assert.ok(metrics.body.by_source.some(s => s.source === 'widget' && s.leads === 2));
  assert.equal(metrics.body.by_member.find(m => m.member_id === u.a.memberId).member_name, 'Ana López');
  assert.equal((await req('GET', `${base}/leads/metrics`, { token: u.a.token })).status, 403);

  // ── Essential fuera de prueba: sin página pública (404) ni bandeja (402) ──
  const stripe = new Stripe('sk_test_dummy', { apiVersion: '2022-11-15' });
  const payload = JSON.stringify({ id: 'evt_x', type: 'customer.subscription.updated', data: { object: { id: 'sub_e', status: 'active', customer: 'cus_e', metadata: { mainds_kind: 'organization', organization_id: org.id, plan: 'essential', interval: 'month' } } } });
  const wh = await fetch(`${srv.baseUrl}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }, body: payload });
  assert.equal(wh.status, 200);
  assert.equal((await pub('')).status, 404);
  const blocked = await req('GET', `${base}/leads`, { token: u.rec.token });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'PLAN_UPGRADE_REQUIRED');
});
