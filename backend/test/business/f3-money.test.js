// F3 — Integración: emisores, reglas de comisión congeladas en la cita,
// facturas (numeración, inmutabilidad, rectificativas, Verifactu), los cuatro
// modelos de liquidación, exportación y permisos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.js';
import { businessEnv, setupClinic } from './helpers.js';

const D = (day, h, m = 0) => `2031-05-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

test('F3: dinero de la clínica de punta a punta', async (t) => {
  const srv = await startServer({ env: businessEnv('owner@m.local') });
  t.after(() => srv.stop());
  const req = srv.request;
  const { base, users: u } = await setupClinic(srv, {
    owner: { name: 'Olga Titular', email: 'owner@m.local' },
    name: 'Clínica Dinero',
    members: [
      { key: 'p1', name: 'Paula Autónoma', email: 'p1@m.local', role: 'psicologo', body: { employment_type: 'freelance', billing_model: 'org_invoices', irpf_rate: 15 } },
      { key: 'p2', name: 'Pedro Factura', email: 'p2@m.local', role: 'psicologo', body: { employment_type: 'freelance', billing_model: 'psych_invoices' } },
      { key: 'p3', name: 'Pilar Alquila', email: 'p3@m.local', role: 'psicologo', body: { employment_type: 'room_rental', billing_model: 'fixed_rent' } },
      { key: 'emp', name: 'Elena Nómina', email: 'emp@m.local', role: 'psicologo', body: { employment_type: 'employee', billing_model: 'payroll' } },
      { key: 'rec', name: 'Rosa Recepción', email: 'rec@m.local', role: 'recepcion', psych: false },
      { key: 'acc', name: 'Carmen Gestoría', email: 'acc@m.local', role: 'contable', psych: false }
    ]
  });

  // ── Emisor ──
  assert.equal((await req('POST', `${base}/billing-entities`, { token: u.rec.token, body: { legal_name: 'X', tax_id: 'B12345674' } })).status, 403);
  const badCif = await req('POST', `${base}/billing-entities`, { token: u.owner.token, body: { legal_name: 'Dinero SL', tax_id: 'B12345675' } });
  assert.equal(badCif.body.code, 'INVALID_TAX_ID');
  const ent = await req('POST', `${base}/billing-entities`, { token: u.owner.token, body: { legal_name: 'Clínica Dinero, S.L.', tax_id: 'b-12345674', address: 'Calle Mayor 1', city: 'Madrid' } });
  assert.equal(ent.status, 201);
  assert.equal(ent.body.entity.tax_id, 'B12345674');

  // ── Reglas de comisión ──
  const rule = (body) => req('POST', `${base}/commission-rules`, { token: u.owner.token, body: { valid_from: '2031-01-01', ...body } });
  assert.equal((await rule({ psych_percent: 50, fixed_fee: 10 })).status, 400);
  assert.equal((await req('POST', `${base}/commission-rules`, { token: u.p1.token, body: { psych_percent: 99 } })).status, 403);
  await rule({ psych_percent: 50 });                                              // por defecto
  await rule({ member_id: u.p1.memberId, lead_source: 'clinic', psych_percent: 60 }); // paciente captado por la clínica
  await rule({ member_id: u.p1.memberId, lead_source: 'own', psych_percent: 80 });    // paciente propio
  await rule({ member_id: u.p2.memberId, psych_percent: 80 });
  const p1Rules = await req('GET', `${base}/commission-rules`, { token: u.p1.token });
  assert.ok(p1Rules.body.rules.every(r => !r.member_id || r.member_id === u.p1.memberId), 'cada uno ve sus reglas');

  // ── Pacientes y citas ──
  const pat = async (body) => (await req('POST', `${base}/patients`, { token: u.rec.token, body })).body.patient;
  const lead = await pat({ first_name: 'Lucía', acquisition_source: 'clinic_lead', tax_id: '12345678Z', assigned_member_ids: [u.p1.memberId] });
  const own = await pat({ first_name: 'Óscar', acquisition_source: 'own', assigned_member_ids: [u.p1.memberId] });
  const forP2 = await pat({ first_name: 'Carla', assigned_member_ids: [u.p2.memberId] });
  const forEmp = await pat({ first_name: 'Elisa', assigned_member_ids: [u.emp.memberId] });
  const loc = (await req('POST', `${base}/locations`, { token: u.owner.token, body: { name: 'Sede' } })).body.location;
  const room = (await req('POST', `${base}/rooms`, { token: u.owner.token, body: { location_id: loc.id, name: 'Despacho 3', hourly_rate: 12 } })).body.room;
  const forP3 = await pat({ first_name: 'Diego', assigned_member_ids: [u.p3.memberId] });

  const book = async (member, patient, start, end, extra = {}) => {
    const r = await req('POST', `${base}/appointments`, { token: u.rec.token, body: { member_id: member, patient_id: patient, starts_at: start, ends_at: end, price: 60, modality: 'online', ...extra } });
    assert.equal(r.status, 201, r.text);
    return r.body.appointment;
  };
  const complete = (id) => req('PATCH', `${base}/appointments/${id}`, { token: u.rec.token, body: { status: 'completed' } });

  const aLead = await book(u.p1.memberId, lead.id, D(5, 9), D(5, 10));
  const aOwn1 = await book(u.p1.memberId, own.id, D(5, 10), D(5, 11));
  const aOwn2 = await book(u.p1.memberId, own.id, D(12, 10), D(12, 11));
  assert.equal(aLead.psych_percent, 60, 'lead de la clínica → 60 %');
  assert.equal(aOwn1.psych_percent, 80, 'paciente propio → 80 %');

  // Cambiar la regla después NO altera las citas ya creadas.
  await rule({ member_id: u.p1.memberId, lead_source: 'own', psych_percent: 90, valid_from: '2031-02-01' });
  const aOwn3 = await book(u.p1.memberId, own.id, D(19, 10), D(19, 11));
  assert.equal(aOwn3.psych_percent, 90, 'la cita nueva usa la regla nueva');
  const agenda = await req('GET', `${base}/appointments?from=${encodeURIComponent(D(1, 0))}&to=${encodeURIComponent(D(31, 0))}`, { token: u.rec.token });
  assert.equal(agenda.body.appointments.find(a => a.id === aOwn1.id).psych_percent, 80);

  const aP2a = await book(u.p2.memberId, forP2.id, D(6, 9), D(6, 10));
  const aP2b = await book(u.p2.memberId, forP2.id, D(13, 9), D(13, 10));
  const aP3 = await book(u.p3.memberId, forP3.id, D(7, 9), D(7, 10, 30), { room_id: room.id, modality: 'in_person' });
  const aEmp = await book(u.emp.memberId, forEmp.id, D(8, 9), D(8, 10));
  for (const a of [aLead, aOwn1, aOwn2, aOwn3, aP2a, aP2b, aP3, aEmp]) assert.equal((await complete(a.id)).status, 200);

  // ── Factura de la clínica a un paciente ──
  const draft = await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: lead.id, appointment_ids: [aLead.id] } });
  assert.equal(draft.status, 201, draft.text);
  assert.equal(draft.body.invoice.status, 'draft');
  assert.equal(draft.body.invoice.aeat_type, 'F1');
  assert.equal(draft.body.invoice.total, 60);
  assert.match(draft.body.invoice.exemption_text, /20\.Uno\.3º/);
  assert.equal((await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: lead.id, appointment_ids: [aLead.id] } })).body.code, 'APPOINTMENT_ALREADY_INVOICED');
  // Una cita no realizada no se factura.
  const future = await book(u.p1.memberId, own.id, D(26, 10), D(26, 11));
  assert.equal((await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: own.id, appointment_ids: [future.id] } })).body.code, 'APPOINTMENT_NOT_COMPLETED');
  // El psicólogo de la clínica (org_invoices) no emite facturas propias a pacientes.
  assert.equal((await req('POST', `${base}/invoices`, { token: u.p1.token, body: { issuer: 'member', patient_id: own.id, appointment_ids: [aOwn1.id] } })).status, 403);

  const issued = await req('POST', `${base}/invoices/${draft.body.invoice.id}/issue`, { token: u.rec.token });
  assert.equal(issued.status, 200, issued.text);
  const yy = issued.body.invoice.series.slice(-2);
  assert.equal(issued.body.invoice.full_number, `C${yy}-0001`);
  assert.ok(issued.body.invoice.verifactu_hash.match(/^[0-9A-F]{64}$/));
  // Inmutable.
  assert.equal((await req('PATCH', `${base}/invoices/${draft.body.invoice.id}`, { token: u.rec.token, body: { notes: 'x' } })).body.code, 'INVOICE_IMMUTABLE');
  assert.equal((await req('DELETE', `${base}/invoices/${draft.body.invoice.id}`, { token: u.rec.token })).status, 409);
  // Detalle con QR.
  const detail = await req('GET', `${base}/invoices/${draft.body.invoice.id}`, { token: u.rec.token });
  assert.match(detail.body.qr_data_url, /^data:image\/png;base64,/);
  assert.match(detail.body.verifactu.qr_url, /ValidarQRNoVerifactu\?nif=B12345674&numserie=C\d{2}-0001&fecha=\d{2}-\d{2}-\d{4}&importe=60\.00$/);
  assert.equal(detail.body.verifactu.previous_hash, '');

  // Paciente sin NIF: factura simplificada (F2).
  const d2 = await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: own.id, appointment_ids: [aOwn1.id] } });
  assert.equal(d2.body.invoice.aeat_type, 'F2');

  // ── Numeración correlativa también con emisiones simultáneas ──
  const drafts = [d2.body.invoice.id];
  for (const a of [aOwn2, aOwn3]) drafts.push((await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: own.id, appointment_ids: [a.id] } })).body.invoice.id);
  for (let i = 0; i < 4; i++) {
    const x = await book(u.emp.memberId, forEmp.id, D(20 + i, 15), D(20 + i, 16));
    await complete(x.id);
    drafts.push((await req('POST', `${base}/invoices`, { token: u.rec.token, body: { patient_id: forEmp.id, appointment_ids: [x.id] } })).body.invoice.id);
  }
  const results = await Promise.all(drafts.map(id => req('POST', `${base}/invoices/${id}/issue`, { token: u.rec.token })));
  assert.ok(results.every(r => r.status === 200), results.map(r => r.text).join('\n'));
  const numbers = results.map(r => r.body.invoice.number).sort((a, b) => a - b);
  assert.deepEqual(numbers, [2, 3, 4, 5, 6, 7, 8], 'sin huecos ni duplicados');

  // ── Rectificativa ──
  assert.equal((await req('POST', `${base}/invoices/${draft.body.invoice.id}/rectify`, { token: u.rec.token, body: {} })).status, 400);
  const rect = await req('POST', `${base}/invoices/${draft.body.invoice.id}/rectify`, { token: u.rec.token, body: { reason: 'Error en el importe' } });
  assert.equal(rect.status, 201, rect.text);
  assert.equal(rect.body.invoice.full_number, `RC${yy}-0001`);
  assert.equal(rect.body.invoice.aeat_type, 'R4');
  assert.equal(rect.body.invoice.total, -60);
  assert.equal(rect.body.invoice.total + issued.body.invoice.total, 0, 'la rectificativa anula la original');
  assert.equal((await req('GET', `${base}/invoices/${draft.body.invoice.id}`, { token: u.rec.token })).body.invoice.status, 'rectified');
  assert.equal((await req('POST', `${base}/invoices/${draft.body.invoice.id}/rectify`, { token: u.rec.token, body: { reason: 'otra vez' } })).status, 409);
  // La cita vuelve a ser facturable.
  const billable = await req('GET', `${base}/billing/billable?patientId=${lead.id}`, { token: u.rec.token });
  assert.ok(billable.body.appointments.some(a => a.id === aLead.id));

  // ── Profesional que factura él al paciente (psych_invoices) ──
  const noProfile = await req('POST', `${base}/invoices`, { token: u.p2.token, body: { issuer: 'member', patient_id: forP2.id, appointment_ids: [aP2a.id] } });
  assert.equal(noProfile.body.code, 'MISSING_BILLING_PROFILE');
  assert.equal((await req('PUT', `${base}/members/me/billing-profile`, { token: u.p2.token, body: { legal_name: 'Pedro Factura', tax_id: '12345678A' } })).body.code, 'INVALID_TAX_ID');
  await req('PUT', `${base}/members/me/billing-profile`, { token: u.p2.token, body: { legal_name: 'Pedro Factura Gil', tax_id: '12345678Z', address: 'Calle Sol 2' } });
  const own2 = await req('POST', `${base}/invoices`, { token: u.p2.token, body: { issuer: 'member', patient_id: forP2.id, appointment_ids: [aP2a.id] } });
  assert.equal(own2.status, 201, own2.text);
  const own2i = await req('POST', `${base}/invoices/${own2.body.invoice.id}/issue`, { token: u.p2.token });
  assert.equal(own2i.body.invoice.full_number, `L${yy}-0001`);
  assert.equal(own2i.body.invoice.issuer_tax_id, '12345678Z');
  // Recepción no toca facturas emitidas por un profesional.
  assert.equal((await req('POST', `${base}/invoices/${own2.body.invoice.id}/rectify`, { token: u.rec.token, body: { reason: 'x' } })).status, 403);

  // ── Liquidaciones de mayo ──
  assert.equal((await req('POST', `${base}/settlements/generate`, { token: u.acc.token, body: { period: '2031-05' } })).status, 403);
  assert.equal((await req('POST', `${base}/settlements/generate`, { token: u.owner.token, body: { period: '2031-13' } })).status, 400);
  const gen = await req('POST', `${base}/settlements/generate`, { token: u.owner.token, body: { period: '2031-05' } });
  assert.equal(gen.status, 200, gen.text);
  const byMember = Object.fromEntries(gen.body.settlements.map(s => [s.member_id, s]));
  assert.equal(byMember[u.emp.memberId], undefined, 'contratado: sin liquidación');

  // P1 (autónoma, factura la clínica): 60 % de 60 + 80 % de 60 ×2 + 90 % de 60 = 36+48+48+54 = 186 → IRPF 15 % = 27,90
  const s1 = byMember[u.p1.memberId];
  assert.equal(s1.data.invoice_kind, 'psych_to_org');
  assert.equal(s1.data.summary.sessions, 4);
  assert.equal(s1.data.summary.psych_amount, 186);
  assert.equal(s1.data.invoice.irpf, 27.9);
  assert.equal(s1.data.invoice.total, 158.1);

  // P2 (factura él): la clínica le factura el 20 % con IVA: 2 × 12 = 24 + 21 % = 29,04
  const s2 = byMember[u.p2.memberId];
  assert.equal(s2.data.invoice_kind, 'org_to_psych');
  assert.equal(s2.data.invoice.total, 29.04);

  // P3 (alquila): 1,5 h × 12 € = 18 € + IVA = 21,78
  const s3 = byMember[u.p3.memberId];
  assert.equal(s3.data.invoice.subtotal, 18);
  assert.equal(s3.data.invoice.total, 21.78);

  // Cada profesional ve solo su liquidación; la gestoría las ve todas.
  const mineP1 = await req('GET', `${base}/settlements?period=2031-05`, { token: u.p1.token });
  assert.deepEqual(mineP1.body.settlements.map(s => s.member_id), [u.p1.memberId]);
  assert.equal((await req('GET', `${base}/settlements?period=2031-05`, { token: u.acc.token })).body.settlements.length, 3);

  // Solo el propio profesional valida.
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/validate`, { token: u.owner.token })).status, 403);
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/invoice`, { token: u.p1.token })).body.code, 'SETTLEMENT_NOT_VALIDATED');
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/validate`, { token: u.p1.token })).status, 200);
  // Regenerar no toca una liquidación validada.
  await req('POST', `${base}/settlements/generate`, { token: u.owner.token, body: { period: '2031-05' } });
  assert.equal((await req('GET', `${base}/settlements?period=2031-05`, { token: u.p1.token })).body.settlements[0].status, 'validated');

  // La factura de P1 a la clínica la emite P1 (no la clínica) y necesita sus datos fiscales.
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/invoice`, { token: u.owner.token })).status, 403);
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/invoice`, { token: u.p1.token })).body.code, 'MISSING_BILLING_PROFILE');
  await req('PUT', `${base}/members/me/billing-profile`, { token: u.p1.token, body: { legal_name: 'Paula Autónoma Ruiz', tax_id: 'X1234567L' } });
  const inv1 = await req('POST', `${base}/settlements/${s1.id}/invoice`, { token: u.p1.token });
  assert.equal(inv1.status, 201, inv1.text);
  assert.equal(inv1.body.invoice.kind, 'psych_to_org');
  assert.equal(inv1.body.invoice.issuer_tax_id, 'X1234567L');
  assert.equal(inv1.body.invoice.recipient_tax_id, 'B12345674');
  assert.equal(inv1.body.invoice.irpf_total, 27.9);
  assert.equal(inv1.body.invoice.total, 158.1);
  assert.equal(inv1.body.settlement.status, 'invoiced');
  const v1 = await req('GET', `${base}/invoices/${inv1.body.invoice.id}`, { token: u.p1.token });
  assert.equal(v1.body.verifactu.previous_hash, '', 'la cadena de P1 empieza con su NIF');

  // P2 valida; la clínica emite su factura de comisión, que sigue la cadena del CIF de la clínica.
  await req('POST', `${base}/settlements/${s2.id}/validate`, { token: u.p2.token });
  assert.equal((await req('POST', `${base}/settlements/${s2.id}/invoice`, { token: u.p2.token })).status, 403);
  const inv2 = await req('POST', `${base}/settlements/${s2.id}/invoice`, { token: u.owner.token });
  assert.equal(inv2.status, 201, inv2.text);
  assert.equal(inv2.body.invoice.kind, 'org_to_psych');
  assert.equal(inv2.body.invoice.recipient_tax_id, '12345678Z');
  const v2 = await req('GET', `${base}/invoices/${inv2.body.invoice.id}`, { token: u.owner.token });
  assert.notEqual(v2.body.verifactu.previous_hash, '', 'encadenada con las facturas anteriores de la clínica');

  // Pagar.
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/mark-paid`, { token: u.p1.token })).status, 403);
  assert.equal((await req('POST', `${base}/settlements/${s1.id}/mark-paid`, { token: u.owner.token })).body.settlement.status, 'paid');

  // Una regla nueva no cambia la liquidación ya emitida.
  await rule({ member_id: u.p1.memberId, psych_percent: 10, valid_from: '2031-03-01' });
  const after = await req('GET', `${base}/settlements?period=2031-05`, { token: u.p1.token });
  assert.equal(after.body.settlements[0].data.summary.psych_amount, 186);

  // ── Productividad (contratados) ──
  const prod = await req('GET', `${base}/reports/productivity?period=2031-05`, { token: u.owner.token });
  const empRow = prod.body.members.find(m => m.member_id === u.emp.memberId);
  assert.equal(empRow.sessions, 5);
  assert.equal(empRow.revenue, 300);
  assert.equal((await req('GET', `${base}/reports/productivity?period=2031-05`, { token: u.emp.token })).body.members.length, 1, 'cada uno, lo suyo');

  // ── Exportación para la gestoría ──
  assert.equal((await req('GET', `${base}/invoices/export.csv`, { token: u.p1.token })).status, 403);
  const csv = await req('GET', `${base}/invoices/export.csv`, { token: u.acc.token });
  assert.equal(csv.status, 200);
  assert.ok(csv.text.startsWith('Fecha;Número;'));
  // BOM UTF-8 para que Excel abra bien los acentos (fetch().text() lo quita, se mira en bytes).
  const raw = new Uint8Array(await (await fetch(`${srv.baseUrl}${base}/invoices/export.csv`, { headers: { Authorization: `Bearer ${u.acc.token}` } })).arrayBuffer());
  assert.deepEqual([...raw.slice(0, 3)], [0xEF, 0xBB, 0xBF]);
  assert.ok(csv.text.includes(`C${yy}-0001`));
  if (!csv.text.includes(';-60,00;')) console.log('CSV-DEBUG', JSON.stringify(csv.text));
  assert.ok(csv.text.includes(';-60,00;'), 'decimales con coma');
  assert.ok(csv.text.includes(`RC${yy}-0001`));
  // Los borradores no se exportan.
  assert.ok(!csv.text.includes(';draft;'));

  // La gestoría lee facturas, no las crea.
  assert.equal((await req('GET', `${base}/invoices`, { token: u.acc.token })).status, 200);
  assert.equal((await req('POST', `${base}/invoices`, { token: u.acc.token, body: { patient_id: lead.id, appointment_ids: [aLead.id] } })).status, 403);
  // P1 solo ve las facturas en las que participa.
  const p1Inv = await req('GET', `${base}/invoices`, { token: u.p1.token });
  assert.ok(p1Inv.body.invoices.length > 0);
  assert.ok(p1Inv.body.invoices.every(i => [i.member_id, i.issuer_member_id, i.recipient_member_id].includes(u.p1.memberId)));
});
