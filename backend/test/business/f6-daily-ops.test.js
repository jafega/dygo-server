// F6 — Operativa diaria (feedback de la titular): tarifas y precio resuelto en
// el servidor, citas periódicas, cierre en bloque, Inicio, citas del paciente y
// facturación en lote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic } from './helpers.js';
import { resolvePrice, repeatSlots, addDaysLocal, normalizeServicePrices, madridOffsetMinutes } from '../../utils/agenda.js';
import { madridDayRange } from '../../business/home.js';

test('resolvePrice: indicado > paciente > tarifa > null', () => {
  const servicePrices = { session: 60, first_visit: 75 };
  assert.equal(resolvePrice({ explicit: 50, patient: { default_price: 40 }, servicePrices, serviceType: 'session' }), 50);
  assert.equal(resolvePrice({ explicit: 0, patient: { default_price: 40 }, servicePrices }), 0, 'una sesión gratuita es 0, no "sin precio"');
  assert.equal(resolvePrice({ explicit: null, patient: { default_price: 40 }, servicePrices }), 40);
  assert.equal(resolvePrice({ explicit: '', patient: {}, servicePrices, serviceType: 'first_visit' }), 75);
  assert.equal(resolvePrice({ patient: null, servicePrices, serviceType: 'couple' }), null);
  assert.equal(resolvePrice({ patient: null, servicePrices: undefined }), null);
});

test('normalizeServicePrices valida servicios e importes', () => {
  const types = ['session', 'first_visit'];
  assert.deepEqual(normalizeServicePrices({ session: '60', first_visit: '' }, types), { prices: { session: 60 } });
  assert.ok(normalizeServicePrices({ massage: 10 }, types).error);
  assert.ok(normalizeServicePrices({ session: -1 }, types).error);
  assert.ok(normalizeServicePrices([1], types).error);
  assert.deepEqual(normalizeServicePrices(null, types), {});
});

test('repeatSlots mantiene la hora de reloj de España al cambiar la hora', () => {
  // Lunes 23-mar-2026 10:00 en Madrid (CET, UTC+1) → 09:00Z. El 29-mar empieza el horario de verano.
  const r = repeatSlots('2026-03-23T09:00:00.000Z', '2026-03-23T09:50:00.000Z', { every_weeks: 1, count: 3 });
  assert.deepEqual(r.slots.map(s => s.starts_at), ['2026-03-23T09:00:00.000Z', '2026-03-30T08:00:00.000Z', '2026-04-06T08:00:00.000Z']);
  assert.equal(r.slots[1].ends_at, '2026-03-30T08:50:00.000Z');
  // Y al revés en octubre (verano → invierno), cada dos semanas.
  const o = repeatSlots('2026-10-19T08:00:00.000Z', '2026-10-19T09:00:00.000Z', { every_weeks: 2, count: 2 });
  assert.equal(o.slots[1].starts_at, '2026-11-02T09:00:00.000Z');
  assert.ok(repeatSlots('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', { every_weeks: 5, count: 3 }).error);
  assert.ok(repeatSlots('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', { every_weeks: 1, count: 1 }).error);
  assert.ok(repeatSlots('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', { every_weeks: 1, count: 27 }).error);
  assert.equal(addDaysLocal('2026-06-01T08:00:00.000Z', 0), '2026-06-01T08:00:00.000Z');
  assert.equal(madridOffsetMinutes(new Date('2026-01-15T12:00:00Z')), 60);
  assert.equal(madridOffsetMinutes(new Date('2026-07-15T12:00:00Z')), 120);
});

test('madridDayRange: el día empieza a medianoche de Madrid', () => {
  const r = madridDayRange(new Date('2026-07-15T23:30:00Z')); // ya es 16 en Madrid
  assert.equal(r.date, '2026-07-16');
  assert.equal(r.start.toISOString(), '2026-07-15T22:00:00.000Z');
  assert.equal(r.end.toISOString(), '2026-07-16T22:00:00.000Z');
  const w = madridDayRange(new Date('2026-01-15T10:00:00Z'));
  assert.equal(w.start.toISOString(), '2026-01-14T23:00:00.000Z');
});

const DAY_MS = 24 * 3600e3;
const iso = (ms) => new Date(ms).toISOString();

test('F6: operativa diaria de la titular de punta a punta', async (t) => {
  const srv = await startServer({ env: businessEnv('olga@f6.local') });
  t.after(() => srv.stop());
  const req = srv.request;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'olga@f6.local', isClinical: true },
    name: 'Centro Olga',
    members: [
      { key: 'paula', name: 'Paula Psicóloga', email: 'paula@f6.local', role: 'psicologo' },
      { key: 'rec', name: 'Rosa Recepción', email: 'rosa@f6.local', role: 'recepcion', psych: false }
    ]
  });

  // ── Inicio vacío: primeros pasos pendientes ──
  let home = await req('GET', `${base}/home`, { token: u.owner.token });
  assert.equal(home.status, 200, home.text);
  const step = (h, id) => h.body.setup.find(s => s.id === id).done;
  assert.equal(step(home, 'billing_entity'), false);
  assert.equal(step(home, 'prices'), false);
  assert.equal(step(home, 'team'), true, 'Paula y Rosa ya están');
  assert.deepEqual(home.body.today.mine, [], 'la titular clínica tiene su día');
  assert.equal(home.body.today.clinic.total, 0);

  // Recepción: sin primeros pasos; un psicólogo, solo lo suyo.
  const recHome = (await req('GET', `${base}/home`, { token: u.rec.token })).body;
  assert.equal(recHome.setup, null);
  assert.ok(recHome.pending.unbilled, 'recepción factura la clínica (billing.manage)');
  assert.equal(recHome.today.mine, null);
  assert.ok(recHome.pending.to_close, 'recepción cierra citas de todos');
  const paulaHome = (await req('GET', `${base}/home`, { token: u.paula.token })).body;
  assert.equal(paulaHome.today.clinic, null);
  assert.equal(paulaHome.pending.unbilled, null);
  assert.equal(paulaHome.setup, null);

  // ── Tarifas ──
  assert.equal((await req('PATCH', base, { token: u.paula.token, body: { service_prices: { session: 1 } } })).status, 403);
  assert.equal((await req('PATCH', base, { token: u.owner.token, body: { service_prices: { session: 'gratis' } } })).body.code, 'INVALID_PRICES');
  const priced = await req('PATCH', base, { token: u.owner.token, body: { service_prices: { session: 60, first_visit: 75 } } });
  assert.equal(priced.status, 200, priced.text);
  assert.deepEqual(priced.body.organization.service_prices, { session: 60, first_visit: 75 });
  assert.deepEqual((await req('GET', base, { token: u.paula.token })).body.organization.service_prices, { session: 60, first_visit: 75 }, 'el equipo ve las tarifas');

  // ── Pacientes (uno con precio propio) ──
  const pat = async (body) => {
    const r = await req('POST', `${base}/patients`, { token: u.rec.token, body });
    assert.equal(r.status, 201, r.text);
    return r.body.patient;
  };
  const laura = await pat({ first_name: 'Laura', last_name: 'Gómez', tax_id: '12345678Z', assigned_member_ids: [u.owner.memberId] });
  const mario = await pat({ first_name: 'Mario', default_price: 45, assigned_member_ids: [u.paula.memberId] });
  assert.equal(mario.default_price, 45);
  assert.equal((await req('PATCH', `${base}/patients/${mario.id}`, { token: u.rec.token, body: { default_price: -3 } })).status, 400);

  const book = (token, body) => req('POST', `${base}/appointments`, { token, body: { modality: 'online', ...body } });
  const now = Date.now();
  const H = 3600e3;
  // Precio resuelto en el servidor.
  const a1 = await book(u.rec.token, { member_id: u.owner.memberId, patient_id: laura.id, starts_at: iso(now - 3 * DAY_MS), ends_at: iso(now - 3 * DAY_MS + H) });
  assert.equal(a1.status, 201, a1.text);
  assert.equal(a1.body.appointment.price, 60, 'tarifa de sesión');
  const a2 = await book(u.rec.token, { member_id: u.owner.memberId, patient_id: laura.id, service_type: 'first_visit', starts_at: iso(now - 2 * DAY_MS), ends_at: iso(now - 2 * DAY_MS + H) });
  assert.equal(a2.body.appointment.price, 75, 'tarifa de primera visita');
  const a3 = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, starts_at: iso(now - 2 * DAY_MS), ends_at: iso(now - 2 * DAY_MS + H) });
  assert.equal(a3.body.appointment.price, 45, 'precio propio del paciente');
  const a4 = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, price: 30, starts_at: iso(now - DAY_MS), ends_at: iso(now - DAY_MS + H) });
  assert.equal(a4.body.appointment.price, 30, 'el precio indicado manda');
  const a5 = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, service_type: 'couple', starts_at: iso(now - DAY_MS + 2 * H), ends_at: iso(now - DAY_MS + 3 * H) });
  // Sin tarifa de pareja, pero Mario tiene precio propio.
  assert.equal(a5.body.appointment.price, 45);

  // ── Citas periódicas ──
  const weekly = new Date(now + 7 * DAY_MS);
  weekly.setUTCHours(9, 0, 0, 0);
  // Un hueco de la serie choca con otra cita de Paula: se salta y se informa.
  const blocker = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, starts_at: iso(weekly.getTime() + 14 * DAY_MS), ends_at: iso(weekly.getTime() + 14 * DAY_MS + H) });
  assert.equal(blocker.status, 201);
  const bad = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, starts_at: iso(weekly.getTime()), ends_at: iso(weekly.getTime() + H), repeat: { every_weeks: 1, count: 40 } });
  assert.equal(bad.body.code, 'INVALID_REPEAT');
  const series = await book(u.rec.token, { member_id: u.paula.memberId, patient_id: mario.id, starts_at: iso(weekly.getTime()), ends_at: iso(weekly.getTime() + 50 * 60e3), repeat: { every_weeks: 1, count: 4 } });
  assert.equal(series.status, 201, series.text);
  assert.equal(series.body.series.created, 3);
  assert.equal(series.body.series.skipped.length, 1);
  assert.equal(series.body.series.skipped[0].code, 'PROFESSIONAL_CONFLICT');
  assert.ok(series.body.appointment.series_id);
  // Paula no puede dar citas de Olga; sí de las suyas.
  assert.equal((await book(u.paula.token, { member_id: u.owner.memberId, patient_id: laura.id, starts_at: iso(now + 30 * DAY_MS), ends_at: iso(now + 30 * DAY_MS + H), repeat: { count: 2 } })).status, 403);

  // Cancelar "esta y las siguientes" desde la segunda.
  const marioAppts = (await req('GET', `${base}/patients/${mario.id}/appointments`, { token: u.paula.token })).body.appointments;
  const inSeries = marioAppts.filter(a => a.series_id === series.body.series.id).sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  assert.equal(inSeries.length, 3);
  assert.equal((await req('POST', `${base}/appointments/${a1.body.appointment.id}/cancel-following`, { token: u.owner.token })).body.code, 'NOT_A_SERIES');
  const cf = await req('POST', `${base}/appointments/${inSeries[1].id}/cancel-following`, { token: u.paula.token });
  assert.equal(cf.status, 200, cf.text);
  assert.equal(cf.body.cancelled, 2);
  const after = (await req('GET', `${base}/patients/${mario.id}/appointments`, { token: u.paula.token })).body.appointments;
  assert.equal(after.find(a => a.id === inSeries[0].id).status, 'scheduled', 'la primera sigue');

  // ── Citas del paciente: permisos ──
  assert.equal((await req('GET', `${base}/patients/${laura.id}/appointments`, { token: u.paula.token })).status, 404, 'Laura no es paciente de Paula');
  const lauraForRec = (await req('GET', `${base}/patients/${laura.id}/appointments`, { token: u.rec.token })).body.appointments;
  assert.equal(lauraForRec.length, 2);
  assert.equal(lauraForRec[0].patient_name, 'Laura Gómez');

  // ── Inicio con actividad: citas pasadas sin cerrar ──
  home = await req('GET', `${base}/home`, { token: u.owner.token });
  assert.equal(home.body.pending.to_close.count, 5);
  assert.ok(home.body.pending.to_close.items.every(i => i.member_name));
  assert.equal((await req('GET', `${base}/home`, { token: u.paula.token })).body.pending.to_close.count, 3, 'Paula solo ve las suyas');

  // ── Cierre en bloque ──
  const pastIds = home.body.pending.to_close.items.map(i => i.id);
  const futureId = inSeries[0].id;
  const paulaClose = await req('POST', `${base}/appointments/bulk-status`, { token: u.paula.token, body: { ids: pastIds, status: 'completed' } });
  assert.equal(paulaClose.body.updated, 3, 'Paula solo cierra las suyas');
  assert.equal(paulaClose.body.skipped.filter(s => s.reason === 'Sin permiso').length, 2);
  const close = await req('POST', `${base}/appointments/bulk-status`, { token: u.owner.token, body: { ids: [...pastIds, futureId], status: 'completed' } });
  assert.equal(close.body.updated, 2);
  assert.ok(close.body.skipped.some(s => s.id === futureId && s.reason === 'Todavía no ha empezado'));
  assert.equal((await req('POST', `${base}/appointments/bulk-status`, { token: u.owner.token, body: { ids: pastIds, status: 'scheduled' } })).status, 400);

  home = await req('GET', `${base}/home`, { token: u.owner.token });
  assert.equal(home.body.pending.to_close.count, 0);
  assert.equal(home.body.pending.unbilled.count, 5);
  assert.equal(home.body.pending.unbilled.amount, 60 + 75 + 45 + 30 + 45);

  // ── Facturación en lote ──
  assert.equal((await req('POST', `${base}/invoices/bulk`, { token: u.owner.token, body: {} })).body.code, 'MISSING_BILLING_ENTITY');
  assert.equal((await req('POST', `${base}/invoices/bulk`, { token: u.paula.token, body: {} })).status, 403);
  await req('POST', `${base}/billing-entities`, { token: u.owner.token, body: { legal_name: 'Centro Olga, S.L.', tax_id: 'B12345674', address: 'Calle Mayor 1', city: 'Madrid' } });
  // Una cita sin precio (sin tarifa y sin precio propio) se informa y no se factura.
  const noPrice = await pat({ first_name: 'Nora', assigned_member_ids: [u.owner.memberId] });
  const a6 = await book(u.rec.token, { member_id: u.owner.memberId, patient_id: noPrice.id, service_type: 'evaluation', starts_at: iso(now - 5 * DAY_MS), ends_at: iso(now - 5 * DAY_MS + H) });
  assert.equal(a6.body.appointment.price, null);
  await req('PATCH', `${base}/appointments/${a6.body.appointment.id}`, { token: u.rec.token, body: { status: 'completed' } });

  const bulk = await req('POST', `${base}/invoices/bulk`, { token: u.owner.token, body: {} });
  assert.equal(bulk.status, 201, bulk.text);
  assert.equal(bulk.body.created.length, 2, 'un borrador por paciente');
  const lauraDraft = bulk.body.created.find(c => c.patient_id === laura.id);
  assert.equal(lauraDraft.appointments, 2);
  assert.equal(lauraDraft.total, 135);
  assert.equal(bulk.body.created.find(c => c.patient_id === mario.id).total, 120);
  assert.deepEqual(bulk.body.skipped.map(s => [s.patient_name, s.code]), [['Nora', 'MISSING_PRICE']]);
  // Repetir no duplica: las citas ya están reservadas por los borradores.
  const again = await req('POST', `${base}/invoices/bulk`, { token: u.owner.token, body: {} });
  assert.equal(again.body.created.length, 0);
  // La factura individual explica qué falta.
  const single = await req('POST', `${base}/invoices`, { token: u.owner.token, body: { patient_id: noPrice.id, appointment_ids: [a6.body.appointment.id] } });
  assert.equal(single.body.code, 'MISSING_PRICE');

  // Emitir todos los borradores de una vez.
  assert.equal((await req('GET', `${base}/home`, { token: u.owner.token })).body.pending.drafts, 2);
  const ids = bulk.body.created.map(c => c.id);
  const issued = await req('POST', `${base}/invoices/issue-batch`, { token: u.owner.token, body: { ids: [...ids, 'no-existe'] } });
  assert.equal(issued.status, 200, issued.text);
  assert.equal(issued.body.issued.length, 2);
  assert.deepEqual(issued.body.issued.map(i => i.full_number).sort(), [`C${new Date().getFullYear() % 100}-0001`, `C${new Date().getFullYear() % 100}-0002`]);
  assert.equal(issued.body.failed.length, 1);
  const inv = await req('GET', `${base}/invoices/${lauraDraft.id}`, { token: u.owner.token });
  assert.equal(inv.body.invoice.status, 'issued');
  assert.ok(inv.body.verifactu.hash, 'Verifactu como en la emisión individual');
  assert.equal(inv.body.invoice.aeat_type, 'F1', 'Laura tiene NIF');
  // Paula no emite facturas de la clínica.
  assert.equal((await req('POST', `${base}/invoices/issue-batch`, { token: u.paula.token, body: { ids } })).body.failed.length, 2);

  home = await req('GET', `${base}/home`, { token: u.owner.token });
  assert.equal(home.body.pending.unbilled.count, 1);
  assert.equal(home.body.pending.unbilled.without_price, 1);
  assert.equal(home.body.pending.drafts, 0);
  assert.equal(step(home, 'billing_entity'), true);
  assert.equal(step(home, 'prices'), true);
  assert.equal(step(home, 'patient'), true);
});
