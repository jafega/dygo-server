// F3 — Lógica pura de dinero: NIF/CIF, cálculo de facturas en céntimos,
// reglas de comisión, liquidaciones y huella Verifactu (vector oficial AEAT).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidDni, isValidNie, isValidCif, isValidTaxId, taxIdKind } from '../../utils/nif.js';
import { toCents, formatAmount, percentOf, computeInvoice } from '../../utils/invoiceMath.js';
import { resolveRule, frozenTerms, validateRuleInput, leadSourceOf } from '../../utils/commissions.js';
import { buildSettlement, psychShareCents, periodRange } from '../../utils/settlements.js';
import { altaHashInput, sha256Upper, aeatDate, madridTimestamp, qrUrl, ensureVerifactuRecord } from '../../business/verifactu.js';
import { createStore } from '../../business/store.js';

test('NIF, NIE y CIF', () => {
  assert.equal(isValidDni('12345678Z'), true);
  assert.equal(isValidDni('12345678A'), false);
  assert.equal(isValidDni('12.345.678-z'), true);
  assert.equal(isValidNie('X1234567L'), true);
  assert.equal(isValidNie('Y1234567X'), true);
  assert.equal(isValidNie('X1234567A'), false);
  assert.equal(isValidCif('B12345674'), true);  // control dígito
  assert.equal(isValidCif('B12345675'), false);
  assert.equal(isValidCif('Q2826000H'), true);  // organismo público: control letra
  assert.equal(isValidCif('Q28260008'), false);
  assert.equal(isValidTaxId('B12345674'), true);
  assert.equal(taxIdKind('12345678Z'), 'nif');
  assert.equal(taxIdKind('X1234567L'), 'nie');
  assert.equal(taxIdKind('B12345674'), 'cif');
  assert.equal(taxIdKind('basura'), null);
});

test('céntimos y redondeo half-up', () => {
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('12,35'), 1235);
  assert.equal(toCents(0.285), 29);
  assert.equal(toCents(-0.285), -29);
  assert.equal(formatAmount(6000), '60.00');
  assert.equal(formatAmount(-1235), '-12.35');
  assert.equal(formatAmount(5), '0.05');
  assert.equal(percentOf(1050, 21), 221); // 220,5 → 221
  assert.equal(percentOf(6000, 15), 900);
});

test('computeInvoice: líneas, IVA por línea, IRPF y desglose', () => {
  const inv = computeInvoice([
    { description: 'A', unit_price: 60, vat_rate: 0 },
    { description: 'B', quantity: 2, unit_price: 10.05, vat_rate: 21 }
  ], { irpfRate: 15 });
  assert.equal(inv.subtotal_cents, 6000 + 2010);
  assert.equal(inv.vat_cents, 422); // 20,10 × 21% = 4,221 → 4,22
  assert.equal(inv.irpf_cents, 1202); // 80,10 × 15% = 12,015 → 12,02
  assert.equal(inv.total_cents, 8010 + 422 - 1202);
  assert.deepEqual(inv.vat_breakdown.map(b => b.vat_rate), [0, 21]);
  assert.throws(() => computeInvoice([{ unit_price: 'x' }]), /Importe/);
});

test('reglas de comisión: precedencia y vigencia', () => {
  const R = (id, extra) => ({ id, valid_from: '2031-01-01', valid_to: null, ...extra });
  const rules = [
    R('def', { psych_percent: 50 }),
    R('src', { lead_source: 'clinic', psych_percent: 55 }),
    R('svc', { service_type: 'couple', psych_percent: 56 }),
    R('svc-src', { service_type: 'couple', lead_source: 'clinic', psych_percent: 57 }),
    R('m', { member_id: 'M', psych_percent: 70 }),
    R('m-src', { member_id: 'M', lead_source: 'clinic', psych_percent: 60 }),
    R('m-svc', { member_id: 'M', service_type: 'couple', psych_percent: 75 }),
    R('m-svc-src', { member_id: 'M', service_type: 'couple', lead_source: 'clinic', psych_percent: 65 })
  ];
  const ctx = (o) => ({ memberId: 'M', serviceType: 'session', leadSource: 'own', date: '2031-06-01', ...o });
  assert.equal(resolveRule(rules, ctx({ serviceType: 'couple', leadSource: 'clinic' })).id, 'm-svc-src');
  assert.equal(resolveRule(rules, ctx({ serviceType: 'couple' })).id, 'm-svc');
  assert.equal(resolveRule(rules, ctx({ leadSource: 'clinic' })).id, 'm-src');
  assert.equal(resolveRule(rules, ctx({})).id, 'm');
  assert.equal(resolveRule(rules, ctx({ memberId: 'X', serviceType: 'couple', leadSource: 'clinic' })).id, 'svc-src');
  assert.equal(resolveRule(rules, ctx({ memberId: 'X', serviceType: 'couple' })).id, 'svc');
  assert.equal(resolveRule(rules, ctx({ memberId: 'X', leadSource: 'clinic' })).id, 'src');
  assert.equal(resolveRule(rules, ctx({ memberId: 'X' })).id, 'def');
  assert.equal(resolveRule([], ctx({})), null);

  // Vigencia: una regla nueva del mismo nivel sustituye a la anterior desde su fecha.
  const timeline = [
    { id: 'old', member_id: 'M', psych_percent: 60, valid_from: '2031-01-01', valid_to: null },
    { id: 'new', member_id: 'M', psych_percent: 65, valid_from: '2031-07-01', valid_to: null },
    { id: 'ended', member_id: 'M', psych_percent: 99, valid_from: '2030-01-01', valid_to: '2030-12-31' }
  ];
  assert.equal(resolveRule(timeline, ctx({ date: '2031-06-30' })).id, 'old');
  assert.equal(resolveRule(timeline, ctx({ date: '2031-07-01' })).id, 'new');
  assert.equal(resolveRule(timeline, ctx({ date: '2030-06-01' })).id, 'ended');

  assert.deepEqual(frozenTerms({ id: 'r', psych_percent: 60 }), { psych_percent: 60, psych_fixed_fee: null, commission_rule_id: 'r' });
  assert.deepEqual(frozenTerms({ id: 'r', psych_percent: null, fixed_fee: 35 }), { psych_percent: null, psych_fixed_fee: 35, commission_rule_id: 'r' });
  assert.match(validateRuleInput({ psych_percent: 50, fixed_fee: 10 }), /solo uno/);
  assert.match(validateRuleInput({ psych_percent: 120 }), /entre 0 y 100/);
  assert.equal(validateRuleInput({ psych_percent: 60, lead_source: 'clinic', valid_from: '2031-01-01' }), null);
  assert.equal(leadSourceOf({ acquisition_source: 'clinic_lead' }), 'clinic');
  assert.equal(leadSourceOf({ acquisition_source: 'own' }), 'own');
});

const appt = (o) => ({
  id: o.id || Math.random().toString(36).slice(2), status: 'completed', service_type: 'session',
  starts_at: '2031-05-05T10:00:00.000Z', ends_at: '2031-05-05T10:50:00.000Z', price: 60, ...o
});

test('liquidación: contratado (solo productividad)', () => {
  const s = buildSettlement({
    member: { billing_model: 'payroll' }, period: '2031-05',
    appointments: [appt({ price: 60 }), appt({ price: 70 }), appt({ status: 'cancelled', price: 60 }), appt({ status: 'no_show', price: 60 })]
  });
  assert.equal(s.invoice, null);
  assert.equal(s.summary.sessions, 2);
  assert.equal(s.summary.revenue, 130);
  assert.equal(s.summary.hours, 1.67);
});

test('liquidación: autónomo al que factura la clínica (factura del profesional con IRPF)', () => {
  const s = buildSettlement({
    member: { billing_model: 'org_invoices', irpf_rate: 15 }, period: '2031-05',
    appointments: [
      appt({ price: 60, psych_percent: 60 }),        // 36,00
      appt({ price: 55.55, psych_percent: 60 }),     // 33,33
      appt({ price: 80, psych_fixed_fee: 45 }),      // 45,00
      appt({ price: 60 })                            // sin regla → aviso, 0
    ],
    config: { seatPassThrough: 19 }
  });
  assert.equal(s.invoice_kind, 'psych_to_org');
  assert.equal(s.summary.psych_amount, 114.33);
  assert.equal(s.summary.clinic_amount, 141.22);
  assert.equal(s.invoice.subtotal, 114.33);
  assert.equal(s.invoice.vat, 0);
  assert.equal(s.invoice.irpf, 17.15); // 114,33 × 15 % = 17,1495 → 17,15
  assert.equal(s.invoice.total, 97.18);
  assert.equal(s.net_payable, 78.18); // − 19 € de licencia repercutida
  assert.deepEqual(s.warnings.map(w => w.code), ['SIN_REGLA']);
  assert.equal(psychShareCents({ price: 80, psych_fixed_fee: 100 }), 8000, 'el fijo nunca supera el precio');
});

test('liquidación: autónomo que factura él (comisión de la clínica con IVA)', () => {
  const s = buildSettlement({
    member: { billing_model: 'psych_invoices' }, period: '2031-05',
    appointments: [appt({ price: 60, psych_percent: 80 }), appt({ price: 60, psych_percent: 80 })]
  });
  assert.equal(s.invoice_kind, 'org_to_psych');
  assert.equal(s.invoice.subtotal, 24);
  assert.equal(s.invoice.vat, 5.04);
  assert.equal(s.invoice.irpf, 0);
  assert.equal(s.invoice.total, 29.04);
  assert.equal(s.net_payable, -29.04);
});

test('liquidación: alquiler de despacho (por horas de sala o cuota fija)', () => {
  const rooms = { r1: { name: 'Despacho 1', hourly_rate: 12 }, r2: { name: 'Despacho 2', hourly_rate: null } };
  const s = buildSettlement({
    member: { billing_model: 'fixed_rent', billing_profile: {} }, period: '2031-05', rooms,
    appointments: [
      appt({ room_id: 'r1' }), appt({ room_id: 'r1', starts_at: '2031-05-06T10:00:00Z', ends_at: '2031-05-06T11:30:00Z' }),
      appt({ room_id: 'r1', status: 'no_show' }), appt({ room_id: 'r1', status: 'cancelled' }), appt({ room_id: 'r2' })
    ]
  });
  // 50 + 90 + 50 = 190 min = 3,17 h × 12 € = 38,04 €
  assert.equal(s.invoice.lines.length, 1);
  assert.equal(s.invoice.lines[0].quantity, 3.17);
  assert.equal(s.invoice.subtotal, 38.04);
  assert.equal(s.invoice.vat, 7.99);
  assert.deepEqual(s.warnings.map(w => w.code), ['SALA_SIN_TARIFA']);

  const fixed = buildSettlement({ member: { billing_model: 'fixed_rent', billing_profile: { monthly_rent: 300 } }, period: '2031-05', appointments: [] });
  assert.equal(fixed.invoice.subtotal, 300);
  assert.equal(fixed.invoice.total, 363);
  assert.deepEqual(periodRange('2031-05'), { from: '2031-05-01T00:00:00.000Z', to: '2031-06-01T00:00:00.000Z' });
  assert.equal(periodRange('2031-13'), null);
});

test('Verifactu: huella idéntica al ejemplo oficial de la AEAT y encadenamiento', () => {
  const first = altaHashInput({
    issuerTaxId: '89890001K', seriesNumber: '12345678/G33', issueDate: '01-01-2024', invoiceType: 'F1',
    vatTotal: '12.35', total: '123.45', previousHash: '', generatedAt: '2024-01-01T19:20:30+01:00'
  });
  assert.equal(first, 'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00');
  const h1 = sha256Upper(first);
  assert.equal(h1, '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
  const h2 = sha256Upper(altaHashInput({
    issuerTaxId: '89890001K', seriesNumber: '12345679/G34', issueDate: '01-01-2024', invoiceType: 'F1',
    vatTotal: '12.35', total: '123.45', previousHash: h1, generatedAt: '2024-01-01T19:20:35+01:00'
  }));
  assert.equal(h2, 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97');
});

test('Verifactu: fechas, huso de Madrid y QR', () => {
  assert.equal(aeatDate('2031-05-07'), '07-05-2031');
  assert.equal(madridTimestamp(new Date('2031-01-15T10:00:00Z')), '2031-01-15T11:00:00+01:00'); // invierno
  assert.equal(madridTimestamp(new Date('2031-07-15T10:00:00Z')), '2031-07-15T12:00:00+02:00'); // verano
  const url = qrUrl({ issuerTaxId: 'B12345674', seriesNumber: 'C31-0001', issueDate: '07-05-2031', total: '60.00' });
  assert.equal(url, 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=B12345674&numserie=C31-0001&fecha=07-05-2031&importe=60.00');
  assert.match(qrUrl({ issuerTaxId: 'B1', seriesNumber: 'X', issueDate: 'd', total: '1' }, { mode: 'verifactu', env: 'test' }), /^https:\/\/prewww2\.aeat\.es\/wlpl\/TIKE-CONT\/ValidarQR\?/);
});

test('Verifactu: cadena por NIF emisor, idempotente por factura', async () => {
  const store = createStore({ driver: 'memory' });
  const inv = (id, nif, n) => ({ id, org_id: 'o', issuer_tax_id: nif, full_number: n, issue_date: '2031-05-07', vat_total: 0, total: 60 });
  const r1 = await ensureVerifactuRecord(store, inv('i1', 'B12345674', 'C31-0001'));
  const r2 = await ensureVerifactuRecord(store, inv('i2', 'B12345674', 'C31-0002'));
  const other = await ensureVerifactuRecord(store, inv('i3', '12345678Z', 'L31-0001'));
  assert.equal(r1.previous_hash, '');
  assert.equal(r2.previous_hash, r1.hash);
  assert.equal(other.previous_hash, '', 'otro NIF empieza su propia cadena');
  assert.equal(r1.invoice_type, 'F1');
  assert.equal((await ensureVerifactuRecord(store, inv('i1', 'B12345674', 'C31-0001'))).id, r1.id);
  // La huella se puede recalcular desde lo guardado.
  assert.equal(sha256Upper(altaHashInput({
    issuerTaxId: r2.issuer_tax_id, seriesNumber: r2.series_number, issueDate: r2.issue_date, invoiceType: r2.invoice_type,
    vatTotal: r2.vat_total, total: r2.total, previousHash: r2.previous_hash, generatedAt: r2.generated_at
  })), r2.hash);
  await assert.rejects(() => store.update('verifactu_records', r1.id, { hash: 'x' }), /solo inserción/);
});
