// Dinero de la clínica (backlog F3): emisores, datos fiscales del profesional,
// reglas de comisión, facturas (borrador → emitida → rectificada/pagada),
// exportación para la gestoría, liquidaciones mensuales y productividad.
//
// Separación total de mainds pro: nada de esto toca invoices ni
// allocateNextInvoiceNumber de server.js (D1).

import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { requireAction } from './workspace.js';
import { canSeePatient, patientDisplayName } from './clinical.js';
import { ensureVerifactuRecord, qrDataUrl, madridTimestamp } from './verifactu.js';
import { computeInvoice, fromCents, toCents } from '../utils/invoiceMath.js';
import { isValidTaxId, normalizeTaxId } from '../utils/nif.js';
import { resolveRule, frozenTerms, validateRuleInput, leadSourceOf } from '../utils/commissions.js';
import { buildSettlement, periodRange, BILLING_MODELS } from '../utils/settlements.js';
import { SERVICE_TYPES } from './agenda.js';

const nowIso = () => new Date().toISOString();
const todayMadrid = () => madridTimestamp(new Date()).slice(0, 10);
const trimOrNull = (v, max = 300) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const clientIp = (req) => String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

export const DEFAULT_EXEMPTION_TEXT = 'Operación exenta de IVA conforme al artículo 20.Uno.3º de la Ley 37/1992 (asistencia sanitaria).';
const SERVICE_LABELS = {
  session: 'Sesión de psicoterapia', first_visit: 'Primera visita', couple: 'Terapia de pareja', family: 'Terapia familiar',
  group: 'Terapia de grupo', evaluation: 'Evaluación psicológica', other: 'Servicio de psicología'
};
// Precio de la licencia por plan (€/mes) para repercutirla en la liquidación.
const SEAT_PRICE = { essential: 19, plus: 25 };
// Hasta este total una factura a un paciente sin NIF puede ser simplificada (F2).
const SIMPLIFIED_LIMIT_CENTS = 40000;

// ── Utilidades de emisores ──────────────────────────────────────────────────
const issuerKeyOf = (taxId) => `nif:${normalizeTaxId(taxId)}`;
const yearSuffix = (date) => String(date || todayMadrid()).slice(2, 4);
const fullNumber = (series, n) => `${series}-${String(n).padStart(4, '0')}`;

function entityIssuer(entity) {
  return {
    issuer_type: 'entity', billing_entity_id: entity.id, issuer_member_id: null,
    issuer_key: issuerKeyOf(entity.tax_id), issuer_name: entity.legal_name, issuer_tax_id: normalizeTaxId(entity.tax_id),
    issuer_address: [entity.address, entity.postal_code, entity.city, entity.province].filter(Boolean).join(', ') || null
  };
}

function memberProfile(member) {
  const p = member.billing_profile || {};
  if (!p.tax_id || !p.legal_name) {
    throw httpError(400, 'MISSING_BILLING_PROFILE', 'Faltan los datos fiscales del profesional (nombre fiscal y NIF) en "Mis datos fiscales".');
  }
  return p;
}

function memberIssuer(member) {
  const p = memberProfile(member);
  return {
    issuer_type: 'member', billing_entity_id: null, issuer_member_id: member.id,
    issuer_key: issuerKeyOf(p.tax_id), issuer_name: p.legal_name, issuer_tax_id: normalizeTaxId(p.tax_id),
    issuer_address: p.address || null
  };
}

async function defaultEntity(store, orgId) {
  const rows = await store.list('org_billing_entities', { eq: { org_id: orgId }, order: 'created_at', limit: 20 });
  const e = rows.find(r => r.active !== false);
  if (!e) throw httpError(400, 'MISSING_BILLING_ENTITY', 'La clínica no tiene datos fiscales (emisor). Añádelos en Facturación → Emisores.');
  return e;
}

/** Serie para un emisor en la fecha dada. */
function seriesFor(issuer, entity, member, date, { rectification = false } = {}) {
  const prefix = issuer.issuer_type === 'entity'
    ? (entity?.series_prefix || 'C')
    : (member?.billing_profile?.series_prefix || 'L');
  return `${rectification ? 'R' : ''}${prefix}${yearSuffix(date)}`;
}

/** Siguiente número de una serie (por NIF): el último + 1, o el inicial configurado. */
async function nextNumber(store, issuerKey, series, startNumbers = {}) {
  const [last] = await store.list('org_invoices', { eq: { issuer_key: issuerKey, series }, gte: { number: 1 }, order: '-number', limit: 1 });
  if (last) return Number(last.number) + 1;
  const start = Number(startNumbers?.[series]);
  return Number.isInteger(start) && start > 0 ? start : 1;
}

/**
 * Emite un borrador: número correlativo (reintenta si otro proceso se adelanta)
 * y registro Verifactu encadenado.
 */
export async function issueDraft(store, draft) {
  if (draft.status !== 'draft') throw httpError(409, 'INVOICE_NOT_DRAFT', 'La factura ya está emitida.');
  if (!(draft.lines || []).length) throw badRequest('La factura no tiene líneas.');
  let startNumbers = {};
  if (draft.issuer_type === 'entity' && draft.billing_entity_id) {
    startNumbers = (await store.get('org_billing_entities', draft.billing_entity_id))?.start_numbers || {};
  } else if (draft.issuer_member_id) {
    startNumbers = (await store.get('org_members', draft.issuer_member_id))?.billing_profile?.start_numbers || {};
  }
  const issueDate = todayMadrid();
  // La serie lleva el año de emisión.
  const series = draft.series.replace(/\d{2}$/, yearSuffix(issueDate));
  let issued = null;
  for (let attempt = 0; attempt < 5 && !issued; attempt++) {
    const n = await nextNumber(store, draft.issuer_key, series, startNumbers);
    try {
      issued = await store.update('org_invoices', draft.id, {
        series, number: n, full_number: fullNumber(series, n), status: 'issued',
        issue_date: issueDate, issued_at: nowIso(), updated_at: nowIso()
      });
    } catch (err) {
      if (err?.code !== 'UNIQUE_VIOLATION') throw err;
    }
  }
  if (!issued) throw httpError(409, 'NUMBERING_CONFLICT', 'No se pudo asignar número a la factura. Inténtalo de nuevo.');
  const record = await ensureVerifactuRecord(store, issued);
  return store.update('org_invoices', issued.id, { verifactu_record_id: record.id, verifactu_hash: record.hash, updated_at: nowIso() });
}

/** Congela la regla de comisión en una cita (la usa la agenda al crearla). */
export async function freezeCommission(store, orgId, member, patient, appt) {
  const rules = await store.list('org_commission_rules', { eq: { org_id: orgId }, limit: 500 });
  const rule = resolveRule(rules, {
    memberId: member.id, serviceType: appt.service_type || 'session', leadSource: leadSourceOf(patient), date: appt.starts_at
  });
  return frozenTerms(rule);
}

function projectInvoice(i) {
  return {
    id: i.id, kind: i.kind, status: i.status, series: i.series, number: i.number ?? null, full_number: i.full_number || null,
    aeat_type: i.aeat_type, issue_date: i.issue_date || null, issued_at: i.issued_at || null,
    issuer_type: i.issuer_type, billing_entity_id: i.billing_entity_id || null, issuer_member_id: i.issuer_member_id || null,
    issuer_name: i.issuer_name, issuer_tax_id: i.issuer_tax_id, issuer_address: i.issuer_address || null,
    recipient_type: i.recipient_type, recipient_patient_id: i.recipient_patient_id || null, recipient_member_id: i.recipient_member_id || null,
    recipient_name: i.recipient_name, recipient_tax_id: i.recipient_tax_id || null, recipient_address: i.recipient_address || null,
    member_id: i.member_id || null, lines: i.lines || [], vat_breakdown: i.vat_breakdown || [],
    subtotal: Number(i.subtotal), vat_total: Number(i.vat_total), irpf_rate: Number(i.irpf_rate || 0), irpf_total: Number(i.irpf_total || 0),
    total: Number(i.total), exemption_text: i.exemption_text || null,
    rectifies_invoice_id: i.rectifies_invoice_id || null, rectification_reason: i.rectification_reason || null,
    settlement_id: i.settlement_id || null, appointment_ids: i.appointment_ids || [], notes: i.notes || null,
    paid_at: i.paid_at || null, payment_method: i.payment_method || null, verifactu_hash: i.verifactu_hash || null,
    created_at: i.created_at
  };
}

/** Importes de una factura a partir de sus líneas. */
function totalsFor(lines, irpfRate = 0) {
  const c = computeInvoice(lines, { irpfRate });
  return {
    lines: c.lines, vat_breakdown: c.vat_breakdown,
    subtotal: fromCents(c.subtotal_cents), vat_total: fromCents(c.vat_cents),
    irpf_rate: Number(irpfRate) || 0, irpf_total: fromCents(c.irpf_cents), total: fromCents(c.total_cents),
    total_cents: c.total_cents
  };
}

export function registerMoneyRoutes(router, ctx) {
  const { store, recordAccess } = ctx;
  const audit = (req, action, extra = {}) => recordAccess({
    org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action, ip: clientIp(req), ...extra
  });
  const canSeeAllBilling = (ws) => ws.can('billing.manage') || ws.can('billing.read_export');
  const loadIn = async (table, req, id, label) => {
    const row = id ? await store.get(table, String(id)) : null;
    if (!row || row.org_id !== req.workspace.orgId) throw notFound(`${label} no encontrada`);
    return row;
  };

  // ── Emisores ──
  router.get('/billing-entities', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!canSeeAllBilling(ws) && !ws.can('settlements.manage') && !ws.can('org.settings')) throw forbidden();
    res.json({ entities: await store.list('org_billing_entities', { eq: { org_id: ws.orgId }, order: 'created_at', limit: 20 }) });
  }));

  const entityFields = (body, partial) => {
    const out = {};
    if (!partial || body.legal_name !== undefined) {
      out.legal_name = trimOrNull(body.legal_name, 200);
      if (!out.legal_name) throw badRequest('La razón social es obligatoria.');
    }
    if (!partial || body.tax_id !== undefined) {
      const t = normalizeTaxId(body.tax_id);
      if (!isValidTaxId(t)) throw badRequest('El NIF/CIF no es válido.', 'INVALID_TAX_ID');
      out.tax_id = t;
    }
    for (const k of ['address', 'postal_code', 'city', 'province', 'email']) if (body[k] !== undefined) out[k] = trimOrNull(body[k], 200);
    if (body.iban !== undefined) out.iban = trimOrNull(body.iban, 40)?.replace(/\s/g, '').toUpperCase() || null;
    if (body.series_prefix !== undefined) {
      const p = String(body.series_prefix || '').trim().toUpperCase();
      if (!/^[A-Z]{1,4}$/.test(p) || p.startsWith('R')) throw badRequest('El prefijo de serie debe tener de 1 a 4 letras y no empezar por R (reservada a rectificativas).');
      out.series_prefix = p;
    }
    if (body.start_numbers !== undefined) {
      const sn = body.start_numbers && typeof body.start_numbers === 'object' ? body.start_numbers : {};
      for (const [k, v] of Object.entries(sn)) if (!/^R?[A-Z]{1,4}\d{2}$/.test(k) || !Number.isInteger(Number(v)) || Number(v) < 1) throw badRequest('Número inicial no válido.');
      out.start_numbers = Object.fromEntries(Object.entries(sn).map(([k, v]) => [k, Number(v)]));
    }
    if (body.vat_exempt !== undefined) out.vat_exempt = body.vat_exempt !== false;
    if (body.exemption_text !== undefined) out.exemption_text = trimOrNull(body.exemption_text, 500);
    if (body.active !== undefined) out.active = body.active !== false;
    return out;
  };

  router.post('/billing-entities', requireAction('org.settings'), asyncRoute(async (req, res) => {
    const e = await store.insert('org_billing_entities', {
      org_id: req.workspace.orgId, series_prefix: 'C', start_numbers: {}, vat_exempt: true, active: true,
      ...entityFields(req.body || {}, false), updated_at: nowIso()
    });
    res.status(201).json({ entity: e });
  }));

  router.patch('/billing-entities/:id', requireAction('org.settings'), asyncRoute(async (req, res) => {
    const e = await loadIn('org_billing_entities', req, req.params.id, 'Emisor');
    const fields = entityFields(req.body || {}, true);
    if (fields.tax_id && fields.tax_id !== e.tax_id) {
      const [used] = await store.list('org_invoices', { eq: { billing_entity_id: e.id }, gte: { number: 1 }, limit: 1 });
      if (used) throw httpError(409, 'ENTITY_HAS_INVOICES', 'Este emisor ya tiene facturas emitidas: no se puede cambiar su NIF. Crea un emisor nuevo.');
    }
    res.json({ entity: await store.update('org_billing_entities', e.id, { ...fields, updated_at: nowIso() }) });
  }));

  // ── Datos fiscales del profesional (para sus facturas a la clínica) ──
  router.get('/members/me/billing-profile', asyncRoute(async (req, res) => {
    res.json({ billing_profile: req.workspace.member.billing_profile || {} });
  }));

  router.put('/members/me/billing-profile', asyncRoute(async (req, res) => {
    const b = req.body || {};
    const profile = {};
    profile.legal_name = trimOrNull(b.legal_name, 200);
    const t = normalizeTaxId(b.tax_id);
    if (t && !isValidTaxId(t)) throw badRequest('El NIF no es válido.', 'INVALID_TAX_ID');
    profile.tax_id = t || null;
    profile.address = trimOrNull(b.address, 300);
    if (b.series_prefix) {
      const p = String(b.series_prefix).trim().toUpperCase();
      if (!/^[A-Z]{1,4}$/.test(p) || p.startsWith('R')) throw badRequest('El prefijo de serie debe tener de 1 a 4 letras y no empezar por R.');
      profile.series_prefix = p;
    }
    if (b.iban !== undefined) profile.iban = trimOrNull(b.iban, 40)?.replace(/\s/g, '').toUpperCase() || null;
    // La cuota de alquiler la fija la clínica, no el profesional: se conserva.
    const prev = req.workspace.member.billing_profile || {};
    if (prev.monthly_rent !== undefined) profile.monthly_rent = prev.monthly_rent;
    if (prev.start_numbers) profile.start_numbers = prev.start_numbers;
    const m = await store.update('org_members', req.workspace.member.id, { billing_profile: profile, updated_at: nowIso() });
    res.json({ billing_profile: m.billing_profile });
  }));

  // Cuota fija de alquiler de un miembro (la fija la clínica).
  router.put('/members/:memberId/rent', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const m = await store.get('org_members', String(req.params.memberId));
    if (!m || m.org_id !== req.workspace.orgId) throw notFound('Miembro no encontrado');
    const v = req.body?.monthly_rent;
    const rent = v === null || v === '' || v === undefined ? null : Number(v);
    if (rent !== null && (!Number.isFinite(rent) || rent < 0 || rent > 100000)) throw badRequest('Cuota no válida.');
    const updated = await store.update('org_members', m.id, { billing_profile: { ...(m.billing_profile || {}), monthly_rent: rent }, updated_at: nowIso() });
    res.json({ monthly_rent: updated.billing_profile.monthly_rent });
  }));

  // ── Reglas de comisión ──
  router.get('/commission-rules', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const all = await store.list('org_commission_rules', { eq: { org_id: ws.orgId }, order: 'created_at', limit: 500 });
    if (ws.can('team.manage') || ws.can('settlements.manage') || ws.can('settlements.read')) return res.json({ rules: all });
    if (!ws.can('settlements.own')) throw forbidden();
    // Cada profesional ve las reglas que le aplican.
    res.json({ rules: all.filter(r => !r.member_id || r.member_id === ws.member.id) });
  }));

  const ruleFields = async (req, body) => {
    const r = {
      member_id: body.member_id || null,
      service_type: body.service_type || null,
      lead_source: body.lead_source || null,
      psych_percent: body.psych_percent === '' || body.psych_percent === undefined ? null : body.psych_percent,
      fixed_fee: body.fixed_fee === '' || body.fixed_fee === undefined ? null : body.fixed_fee,
      valid_from: body.valid_from || todayMadrid(),
      valid_to: body.valid_to || null
    };
    const err = validateRuleInput(r);
    if (err) throw badRequest(err, 'INVALID_RULE');
    if (r.service_type && !SERVICE_TYPES.includes(r.service_type)) throw badRequest('Tipo de servicio no válido.');
    if (r.member_id) {
      const m = await store.get('org_members', String(r.member_id));
      if (!m || m.org_id !== req.workspace.orgId) throw badRequest('Miembro no encontrado.');
    }
    if (r.psych_percent !== null) r.psych_percent = Number(r.psych_percent);
    if (r.fixed_fee !== null) r.fixed_fee = Number(r.fixed_fee);
    return r;
  };

  router.post('/commission-rules', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const rule = await store.insert('org_commission_rules', {
      org_id: req.workspace.orgId, active: true, created_by: String(req.authenticatedUserId), updated_at: nowIso(),
      ...(await ruleFields(req, req.body || {}))
    });
    await audit(req, 'billing.commission_rule_created', { resource_type: 'commission_rule', resource_id: rule.id });
    res.status(201).json({ rule });
  }));

  // Las reglas no se editan (las citas guardan cuál se aplicó): se cierran con
  // fecha de fin y se crea otra nueva.
  router.patch('/commission-rules/:id', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const r = await loadIn('org_commission_rules', req, req.params.id, 'Regla');
    const patch = { updated_at: nowIso() };
    if (req.body?.valid_to !== undefined) {
      const v = req.body.valid_to || null;
      if (v && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < String(r.valid_from).slice(0, 10))) throw badRequest('Fecha de fin no válida.');
      patch.valid_to = v;
    }
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    res.json({ rule: await store.update('org_commission_rules', r.id, patch) });
  }));

  // ── Citas facturables ──
  router.get('/billing/billable', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const manage = ws.can('billing.manage');
    if (!manage && !ws.can('billing.own')) throw forbidden();
    const eq = { org_id: ws.orgId, status: 'completed' };
    if (req.query.patientId) eq.patient_id = String(req.query.patientId);
    if (!manage) eq.member_id = ws.member.id;
    const rows = (await store.list('org_appointments', { eq, order: '-starts_at', limit: 500 })).filter(a => !a.invoice_id && a.patient_id);
    const out = [];
    const patients = new Map();
    for (const a of rows) {
      if (!patients.has(a.patient_id)) patients.set(a.patient_id, await store.get('org_patients', a.patient_id));
      const p = patients.get(a.patient_id);
      if (!p || !canSeePatient(ws, p) && !manage) continue;
      out.push({ id: a.id, patient_id: a.patient_id, patient_name: p ? patientDisplayName(p) : null, member_id: a.member_id, starts_at: a.starts_at, service_type: a.service_type, price: a.price ?? null });
    }
    res.json({ appointments: out });
  }));

  // ── Facturas ──
  const canTouchInvoice = (ws, inv) => (inv.issuer_type === 'entity' ? ws.can('billing.manage') : inv.issuer_member_id === ws.member.id);

  router.get('/invoices', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const all = canSeeAllBilling(ws);
    if (!all && !ws.can('billing.own') && !ws.can('settlements.own')) throw forbidden();
    const opts = { eq: { org_id: ws.orgId }, order: '-created_at', limit: 500 };
    if (req.query.status) opts.eq.status = String(req.query.status);
    if (req.query.kind) opts.eq.kind = String(req.query.kind);
    if (req.query.from) opts.gte = { issue_date: String(req.query.from) };
    if (req.query.to) opts.lte = { issue_date: String(req.query.to) };
    let rows = await store.list('org_invoices', opts);
    if (!all) {
      const me = ws.member.id;
      rows = rows.filter(i => i.member_id === me || i.issuer_member_id === me || i.recipient_member_id === me);
    }
    res.json({ invoices: rows.map(projectInvoice) });
  }));

  router.post('/invoices', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const body = req.body || {};
    const issuerKind = body.issuer === 'member' ? 'member' : 'entity';
    if (issuerKind === 'entity' && !ws.can('billing.manage')) throw forbidden();
    if (issuerKind === 'member') {
      if (!ws.can('billing.own') || !['psych_invoices', 'fixed_rent'].includes(ws.member.billing_model)) {
        throw forbidden('Solo emiten sus propias facturas los profesionales que facturan directamente a sus pacientes.');
      }
    }
    const patient = await loadIn('org_patients', req, body.patient_id, 'Paciente');
    const ids = Array.isArray(body.appointment_ids) ? [...new Set(body.appointment_ids.map(String))] : [];
    if (!ids.length) throw badRequest('Selecciona las citas a facturar.');
    if (ids.length > 100) throw badRequest('Demasiadas citas en una factura.');
    const appts = [];
    for (const id of ids) {
      const a = await store.get('org_appointments', id);
      if (!a || a.org_id !== ws.orgId || a.patient_id !== patient.id) throw badRequest('Alguna cita no corresponde a este paciente.');
      if (a.status !== 'completed') throw badRequest('Solo se facturan citas realizadas.', 'APPOINTMENT_NOT_COMPLETED');
      if (a.invoice_id) throw httpError(409, 'APPOINTMENT_ALREADY_INVOICED', 'Alguna cita ya está facturada.');
      if (a.price === null || a.price === undefined) throw badRequest('Alguna cita no tiene precio. Pónselo en la agenda o define las tarifas en Facturación.', 'MISSING_PRICE');
      if (issuerKind === 'member' && a.member_id !== ws.member.id) throw forbidden('Solo puedes facturar tus citas.');
      appts.push(a);
    }
    let entity = null;
    if (issuerKind === 'entity') {
      entity = body.billing_entity_id ? await loadIn('org_billing_entities', req, body.billing_entity_id, 'Emisor') : await defaultEntity(store, ws.orgId);
    }
    const draft = await createPatientDraft(req, { patient, appts, issuerKind, entity, recipientTaxIdInput: body.recipient_tax_id, notes: body.notes });
    res.status(201).json({ invoice: projectInvoice(draft) });
  }));

  /**
   * Borrador de factura a un paciente con sus citas (individual y en lote usan
   * lo mismo: IVA, NIF, F1/F2 y reserva de las citas).
   */
  async function createPatientDraft(req, { patient, appts, issuerKind, entity, recipientTaxIdInput, notes }) {
    const ws = req.workspace;
    const issuer = issuerKind === 'entity' ? entityIssuer(entity) : memberIssuer(ws.member);
    const vatExempt = entity ? entity.vat_exempt !== false : true;
    const lines = [...appts]
      .sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)))
      .map(a => ({
        description: `${SERVICE_LABELS[a.service_type] || SERVICE_LABELS.other} — ${new Date(a.starts_at).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })}`,
        quantity: 1, unit_price: Number(a.price), vat_rate: vatExempt ? 0 : 21, appointment_id: a.id
      }));
    const totals = totalsFor(lines, 0);
    const recipientTaxId = normalizeTaxId(recipientTaxIdInput ?? patient.tax_id) || null;
    if (recipientTaxId && !isValidTaxId(recipientTaxId)) throw badRequest('El NIF del paciente no es válido.', 'INVALID_TAX_ID');
    if (!recipientTaxId && totals.total_cents > SIMPLIFIED_LIMIT_CENTS) {
      throw badRequest('Para facturas de más de 400 € hace falta el NIF del paciente.', 'RECIPIENT_TAX_ID_REQUIRED');
    }
    const memberIds = [...new Set(appts.map(a => a.member_id))];
    const draft = await store.insert('org_invoices', {
      org_id: ws.orgId, kind: 'patient', ...issuer,
      recipient_type: 'patient', recipient_patient_id: patient.id, recipient_member_id: null,
      recipient_name: patientDisplayName(patient), recipient_tax_id: recipientTaxId, recipient_address: patient.address || null,
      member_id: memberIds.length === 1 ? memberIds[0] : null,
      series: seriesFor(issuer, entity, ws.member, todayMadrid()), number: null, full_number: null,
      aeat_type: recipientTaxId ? 'F1' : 'F2',
      lines: totals.lines, vat_breakdown: totals.vat_breakdown, subtotal: totals.subtotal, vat_total: totals.vat_total,
      irpf_rate: 0, irpf_total: 0, total: totals.total,
      exemption_text: vatExempt ? (entity?.exemption_text || DEFAULT_EXEMPTION_TEXT) : null,
      status: 'draft', appointment_ids: appts.map(a => a.id), notes: trimOrNull(notes, 1000),
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    // Las citas quedan reservadas por el borrador (nadie puede facturarlas dos veces).
    for (const a of appts) await store.update('org_appointments', a.id, { invoice_id: draft.id, updated_at: nowIso() });
    await audit(req, 'billing.invoice_drafted', { resource_type: 'invoice', resource_id: draft.id });
    return draft;
  }

  // ── Facturación en lote (Fase 6) ──
  // Un borrador por paciente con todas sus citas realizadas sin facturar hasta
  // `to` (incluido). Lo que no se puede facturar se devuelve con el motivo.
  router.post('/invoices/bulk', requireAction('billing.manage'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const to = trimOrNull(req.body?.to, 10) || todayMadrid();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw badRequest('Fecha no válida (AAAA-MM-DD).');
    const from = trimOrNull(req.body?.from, 10);
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw badRequest('Fecha no válida (AAAA-MM-DD).');
    const entity = req.body?.billing_entity_id ? await loadIn('org_billing_entities', req, req.body.billing_entity_id, 'Emisor') : await defaultEntity(store, ws.orgId);
    const onlyPatients = Array.isArray(req.body?.patient_ids) ? new Set(req.body.patient_ids.map(String)) : null;
    // Como mucho 500 citas por pasada (límite del store); lo que quede sale en la siguiente.
    const rows = (await store.list('org_appointments', { eq: { org_id: ws.orgId, status: 'completed', invoice_id: null }, order: 'starts_at', limit: 500 }))
      .filter(a => a.patient_id && madridTimestamp(new Date(a.starts_at)).slice(0, 10) <= to)
      .filter(a => !from || madridTimestamp(new Date(a.starts_at)).slice(0, 10) >= from)
      .filter(a => !onlyPatients || onlyPatients.has(a.patient_id));
    const byPatient = new Map();
    for (const a of rows) {
      if (!byPatient.has(a.patient_id)) byPatient.set(a.patient_id, []);
      byPatient.get(a.patient_id).push(a);
    }
    const created = [];
    const skipped = [];
    for (const [patientId, appts] of byPatient) {
      const patient = await store.get('org_patients', patientId);
      if (!patient || patient.org_id !== ws.orgId) continue;
      const name = patientDisplayName(patient);
      const withPrice = appts.filter(a => a.price !== null && a.price !== undefined);
      const noPrice = appts.length - withPrice.length;
      if (noPrice) skipped.push({ patient_id: patientId, patient_name: name, appointments: noPrice, code: 'MISSING_PRICE', reason: `${noPrice === 1 ? 'Una cita' : `${noPrice} citas`} sin precio` });
      // Una factura tiene como mucho 100 líneas; el resto queda para la siguiente pasada.
      const batch = withPrice.slice(0, 100);
      if (!batch.length) continue;
      try {
        const draft = await createPatientDraft(req, { patient, appts: batch, issuerKind: 'entity', entity });
        created.push({ id: draft.id, patient_id: patientId, patient_name: name, appointments: batch.length, total: draft.total });
      } catch (err) {
        if (!err.status || err.status >= 500) throw err;
        skipped.push({ patient_id: patientId, patient_name: name, appointments: batch.length, code: err.code, reason: err.message });
      }
    }
    res.status(created.length ? 201 : 200).json({ created, skipped });
  }));

  // Emitir varios borradores de una vez. Cada uno se emite (número + Verifactu)
  // por separado: si uno falla, los demás siguen.
  router.post('/invoices/issue-batch', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))] : [];
    if (!ids.length || ids.length > 200) throw badRequest('Indica entre 1 y 200 borradores.');
    const issued = [];
    const failed = [];
    for (const id of ids) {
      const inv = await store.get('org_invoices', id);
      if (!inv || inv.org_id !== ws.orgId || !canTouchInvoice(ws, inv)) { failed.push({ id, reason: 'No encontrada' }); continue; }
      try {
        const done = await issueDraft(store, inv);
        await audit(req, 'billing.invoice_issued', { resource_type: 'invoice', resource_id: inv.id });
        issued.push({ id: done.id, full_number: done.full_number });
      } catch (err) {
        if (!err.status || err.status >= 500) throw err;
        failed.push({ id, reason: err.message });
      }
    }
    res.json({ issued, failed });
  }));

  router.get('/invoices/export.csv', requireAction('billing.read_export'), asyncRoute(async (req, res) => {
    const opts = { eq: { org_id: req.workspace.orgId }, gte: { number: 1 }, order: 'issue_date', limit: 500 };
    if (req.query.from) opts.gte = { ...opts.gte, issue_date: String(req.query.from) };
    if (req.query.to) opts.lte = { issue_date: String(req.query.to) };
    const rows = (await store.list('org_invoices', opts)).filter(i => i.status !== 'draft');
    const dec = (n) => Number(n || 0).toFixed(2).replace('.', ',');
    const esc = (v) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const KIND = { patient: 'Paciente', psych_to_org: 'Profesional a clínica', org_to_psych: 'Clínica a profesional' };
    const header = ['Fecha', 'Número', 'Tipo AEAT', 'Concepto', 'Emisor', 'NIF emisor', 'Destinatario', 'NIF destinatario', 'Base imponible', 'IVA', 'Retención IRPF', 'Total', 'Estado', 'Rectifica a'];
    const byId = new Map(rows.map(r => [r.id, r]));
    const lines = rows.map(i => [
      i.issue_date, i.full_number, i.aeat_type, KIND[i.kind], i.issuer_name, i.issuer_tax_id, i.recipient_name, i.recipient_tax_id || '',
      dec(i.subtotal), dec(i.vat_total), dec(i.irpf_total), dec(i.total), i.status,
      i.rectifies_invoice_id ? (byId.get(i.rectifies_invoice_id)?.full_number || '') : ''
    ].map(esc).join(';'));
    await audit(req, 'billing.exported', { resource_type: 'invoices', resource_id: `${req.query.from || ''}..${req.query.to || ''}` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="facturas-${req.query.from || 'inicio'}-${req.query.to || 'hoy'}.csv"`);
    res.send(`﻿${[header.join(';'), ...lines].join('\r\n')}\r\n`);
  }));

  router.get('/invoices/:id', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    const mine = [inv.member_id, inv.issuer_member_id, inv.recipient_member_id].includes(ws.member.id);
    if (!canSeeAllBilling(ws) && !(mine && (ws.can('billing.own') || ws.can('settlements.own')))) throw notFound('Factura no encontrada');
    let verifactu = null;
    let qr = null;
    if (inv.status !== 'draft') {
      const [rec] = await store.list('verifactu_records', { eq: { invoice_id: inv.id }, limit: 1 });
      const record = rec || await ensureVerifactuRecord(store, inv); // se autorrepara si faltaba
      verifactu = { hash: record.hash, previous_hash: record.previous_hash, generated_at: record.generated_at, qr_url: record.qr_url, status: record.status, invoice_type: record.invoice_type };
      qr = await qrDataUrl(record.qr_url).catch(() => null);
    }
    res.json({ invoice: projectInvoice(inv), verifactu, qr_data_url: qr });
  }));

  router.patch('/invoices/:id', asyncRoute(async (req, res) => {
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    if (!canTouchInvoice(req.workspace, inv)) throw forbidden();
    if (inv.status !== 'draft') throw httpError(409, 'INVOICE_IMMUTABLE', 'Una factura emitida no se modifica: emite una rectificativa.');
    const patch = { updated_at: nowIso() };
    if (req.body?.notes !== undefined) patch.notes = trimOrNull(req.body.notes, 1000);
    if (req.body?.recipient_tax_id !== undefined) {
      const t = normalizeTaxId(req.body.recipient_tax_id) || null;
      if (t && !isValidTaxId(t)) throw badRequest('NIF no válido.', 'INVALID_TAX_ID');
      if (!t && toCents(inv.total) > SIMPLIFIED_LIMIT_CENTS) throw badRequest('Para facturas de más de 400 € hace falta el NIF.', 'RECIPIENT_TAX_ID_REQUIRED');
      patch.recipient_tax_id = t;
      if (inv.kind === 'patient') patch.aeat_type = t ? 'F1' : 'F2';
    }
    if (req.body?.recipient_address !== undefined) patch.recipient_address = trimOrNull(req.body.recipient_address);
    res.json({ invoice: projectInvoice(await store.update('org_invoices', inv.id, patch)) });
  }));

  router.delete('/invoices/:id', asyncRoute(async (req, res) => {
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    if (!canTouchInvoice(req.workspace, inv)) throw forbidden();
    if (inv.status !== 'draft') throw httpError(409, 'INVOICE_IMMUTABLE', 'Una factura emitida no se borra: emite una rectificativa.');
    for (const id of inv.appointment_ids || []) {
      const a = await store.get('org_appointments', id);
      if (a && a.invoice_id === inv.id) await store.update('org_appointments', a.id, { invoice_id: null, updated_at: nowIso() });
    }
    await store.remove('org_invoices', inv.id);
    res.json({ ok: true });
  }));

  router.post('/invoices/:id/issue', asyncRoute(async (req, res) => {
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    if (!canTouchInvoice(req.workspace, inv)) throw forbidden();
    const issued = await issueDraft(store, inv);
    await audit(req, 'billing.invoice_issued', { resource_type: 'invoice', resource_id: inv.id });
    res.json({ invoice: projectInvoice(issued) });
  }));

  router.post('/invoices/:id/rectify', asyncRoute(async (req, res) => {
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    if (!canTouchInvoice(req.workspace, inv)) throw forbidden();
    if (!['issued', 'paid'].includes(inv.status)) throw httpError(409, 'INVOICE_NOT_ISSUED', 'Solo se rectifica una factura emitida y no rectificada.');
    if (inv.rectifies_invoice_id) throw httpError(409, 'INVOICE_IS_RECTIFICATION', 'Una rectificativa no se vuelve a rectificar.');
    const reason = trimOrNull(req.body?.reason, 500);
    if (!reason) throw badRequest('Indica el motivo de la rectificación.');
    const negLines = (inv.lines || []).map(l => ({ description: l.description, quantity: -Number(l.quantity || 1), unit_price: Number(l.unit_price), vat_rate: Number(l.vat_rate || 0) }));
    const totals = totalsFor(negLines, Number(inv.irpf_rate || 0));
    const draft = await store.insert('org_invoices', {
      org_id: inv.org_id, kind: inv.kind,
      issuer_type: inv.issuer_type, billing_entity_id: inv.billing_entity_id, issuer_member_id: inv.issuer_member_id,
      issuer_key: inv.issuer_key, issuer_name: inv.issuer_name, issuer_tax_id: inv.issuer_tax_id, issuer_address: inv.issuer_address,
      recipient_type: inv.recipient_type, recipient_patient_id: inv.recipient_patient_id, recipient_member_id: inv.recipient_member_id,
      recipient_name: inv.recipient_name, recipient_tax_id: inv.recipient_tax_id, recipient_address: inv.recipient_address,
      member_id: inv.member_id,
      series: `R${inv.series.replace(/^R/, '')}`, number: null, full_number: null,
      aeat_type: inv.aeat_type === 'F2' ? 'R5' : 'R4',
      lines: totals.lines, vat_breakdown: totals.vat_breakdown, subtotal: totals.subtotal, vat_total: totals.vat_total,
      irpf_rate: totals.irpf_rate, irpf_total: totals.irpf_total, total: totals.total,
      exemption_text: inv.exemption_text, status: 'draft',
      rectifies_invoice_id: inv.id, rectification_reason: reason, settlement_id: inv.settlement_id,
      appointment_ids: [], created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    const issued = await issueDraft(store, draft);
    await store.update('org_invoices', inv.id, { status: 'rectified', updated_at: nowIso() });
    // Anulada la factura, sus citas vuelven a ser facturables.
    for (const id of inv.appointment_ids || []) {
      const a = await store.get('org_appointments', id);
      if (a && a.invoice_id === inv.id) await store.update('org_appointments', a.id, { invoice_id: null, updated_at: nowIso() });
    }
    // Una liquidación cuya factura se rectifica vuelve a validarse.
    if (inv.settlement_id) {
      const s = await store.get('org_settlements', inv.settlement_id);
      if (s && s.invoice_id === inv.id) await store.update('org_settlements', s.id, { status: 'validated', invoice_id: null, updated_at: nowIso() });
    }
    await audit(req, 'billing.invoice_rectified', { resource_type: 'invoice', resource_id: inv.id });
    res.status(201).json({ invoice: projectInvoice(issued) });
  }));

  router.post('/invoices/:id/mark-paid', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const inv = await loadIn('org_invoices', req, req.params.id, 'Factura');
    const canPay = ws.can('billing.manage') || inv.issuer_member_id === ws.member.id;
    if (!canPay) throw forbidden();
    if (inv.status !== 'issued') throw httpError(409, 'INVOICE_NOT_PAYABLE', 'Solo se marca como pagada una factura emitida.');
    const method = ['transferencia', 'tarjeta', 'efectivo', 'bizum', 'domiciliacion', 'otro'].includes(req.body?.method) ? req.body.method : 'otro';
    const updated = await store.update('org_invoices', inv.id, { status: 'paid', paid_at: nowIso(), payment_method: method, updated_at: nowIso() });
    res.json({ invoice: projectInvoice(updated) });
  }));

  // ── Liquidaciones ──
  const settlementConfig = (org, member) => ({
    psychToOrgVatRate: Number(org.settings?.psych_to_org_vat_rate ?? 0),
    commercialVatRate: Number(org.settings?.commercial_vat_rate ?? 21),
    seatPassThrough: org.settings?.pass_seat_cost && member.seat_billable ? (SEAT_PRICE[org.plan_id] || 0) : 0
  });

  const projectSettlement = (s, memberNames) => ({
    id: s.id, member_id: s.member_id, member_name: memberNames[s.member_id] || null, period: s.period,
    billing_model: s.billing_model, status: s.status, data: s.data, validated_at: s.validated_at || null,
    invoice_id: s.invoice_id || null, paid_at: s.paid_at || null, updated_at: s.updated_at || s.created_at
  });
  const memberNames = async (orgId) => {
    const ms = await store.list('org_members', { eq: { org_id: orgId }, limit: 500 });
    return { ms, names: Object.fromEntries(ms.map(m => [m.id, m.display_name || m.email])) };
  };

  router.post('/settlements/generate', requireAction('settlements.manage'), asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const period = String(req.body?.period || '');
    const range = periodRange(period);
    if (!range) throw badRequest('Periodo no válido (AAAA-MM).');
    const { ms, names } = await memberNames(ws.orgId);
    const rooms = Object.fromEntries((await store.list('org_rooms', { eq: { org_id: ws.orgId }, limit: 500 })).map(r => [r.id, r]));
    const out = [];
    for (const m of ms) {
      if (!BILLING_MODELS.includes(m.billing_model) || m.billing_model === 'payroll') continue;
      if (m.status !== 'active' && !(m.left_at && m.left_at >= range.from)) continue;
      const appts = await store.list('org_appointments', { eq: { member_id: m.id }, gte: { starts_at: range.from }, lte: { starts_at: range.to }, limit: 500 });
      const inPeriod = appts.filter(a => new Date(a.starts_at) < new Date(range.to));
      const data = buildSettlement({ member: m, period, appointments: inPeriod, rooms, config: settlementConfig(ws.org, m) });
      const empty = !data.invoice || (data.invoice.lines.length === 0 && data.lines.length === 0);
      const [existing] = await store.list('org_settlements', { eq: { org_id: ws.orgId, member_id: m.id, period }, limit: 1 });
      if (existing) {
        if (existing.status === 'draft') out.push(await store.update('org_settlements', existing.id, { data, billing_model: m.billing_model, updated_at: nowIso() }));
        else out.push(existing);
        continue;
      }
      if (empty) continue;
      out.push(await store.insert('org_settlements', { org_id: ws.orgId, member_id: m.id, period, billing_model: m.billing_model, status: 'draft', data, updated_at: nowIso() }));
    }
    await audit(req, 'billing.settlements_generated', { resource_type: 'settlements', resource_id: period });
    res.json({ settlements: out.map(s => projectSettlement(s, names)) });
  }));

  router.get('/settlements', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const all = ws.can('settlements.manage') || ws.can('settlements.read');
    if (!all && !ws.can('settlements.own')) throw forbidden();
    const eq = { org_id: ws.orgId };
    if (req.query.period) eq.period = String(req.query.period);
    if (!all) eq.member_id = ws.member.id;
    const { names } = await memberNames(ws.orgId);
    const rows = await store.list('org_settlements', { eq, order: '-period', limit: 500 });
    res.json({ settlements: rows.map(s => projectSettlement(s, names)) });
  }));

  const loadSettlement = async (req) => {
    const ws = req.workspace;
    const s = await loadIn('org_settlements', req, req.params.id, 'Liquidación');
    const all = ws.can('settlements.manage') || ws.can('settlements.read');
    if (!all && s.member_id !== ws.member.id) throw notFound('Liquidación no encontrada');
    return s;
  };

  router.post('/settlements/:id/validate', asyncRoute(async (req, res) => {
    const s = await loadSettlement(req);
    // Solo el propio profesional da su conformidad a su liquidación.
    if (s.member_id !== req.workspace.member.id) throw forbidden('Solo el profesional puede validar su liquidación.');
    if (s.status !== 'draft') throw httpError(409, 'SETTLEMENT_NOT_DRAFT', 'Esta liquidación ya está validada.');
    const updated = await store.update('org_settlements', s.id, { status: 'validated', validated_at: nowIso(), validated_by: String(req.authenticatedUserId), updated_at: nowIso() });
    const { names } = await memberNames(req.workspace.orgId);
    res.json({ settlement: projectSettlement(updated, names) });
  }));

  router.post('/settlements/:id/invoice', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const s = await loadSettlement(req);
    if (s.status !== 'validated') throw httpError(409, 'SETTLEMENT_NOT_VALIDATED', 'La liquidación tiene que estar validada por el profesional.');
    const data = s.data || {};
    if (!data.invoice || !data.invoice.lines?.length) throw badRequest('Esta liquidación no genera factura.');
    const member = await store.get('org_members', s.member_id);
    const entity = await defaultEntity(store, ws.orgId);
    let issuer;
    let recipient;
    if (data.invoice_kind === 'psych_to_org') {
      // La factura es del profesional: solo él la emite.
      if (s.member_id !== ws.member.id) throw forbidden('Esta factura la emite el profesional desde su liquidación.');
      issuer = memberIssuer(member);
      recipient = {
        recipient_type: 'org', recipient_patient_id: null, recipient_member_id: null,
        recipient_name: entity.legal_name, recipient_tax_id: entity.tax_id,
        recipient_address: [entity.address, entity.postal_code, entity.city].filter(Boolean).join(', ') || null
      };
    } else {
      if (!ws.can('settlements.manage')) throw forbidden();
      issuer = entityIssuer(entity);
      const p = memberProfile(member);
      recipient = {
        recipient_type: 'member', recipient_patient_id: null, recipient_member_id: member.id,
        recipient_name: p.legal_name, recipient_tax_id: normalizeTaxId(p.tax_id), recipient_address: p.address || null
      };
    }
    const lines = data.invoice.lines.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, vat_rate: l.vat_rate }));
    const totals = totalsFor(lines, data.invoice.irpf_rate || 0);
    const vatExempt = totals.vat_total === 0 && data.invoice_kind === 'psych_to_org';
    const draft = await store.insert('org_invoices', {
      org_id: ws.orgId, kind: data.invoice_kind, ...issuer, ...recipient, member_id: member.id,
      series: seriesFor(issuer, entity, member, todayMadrid()), number: null, full_number: null, aeat_type: 'F1',
      lines: totals.lines, vat_breakdown: totals.vat_breakdown, subtotal: totals.subtotal, vat_total: totals.vat_total,
      irpf_rate: totals.irpf_rate, irpf_total: totals.irpf_total, total: totals.total,
      exemption_text: vatExempt ? DEFAULT_EXEMPTION_TEXT : null, status: 'draft',
      settlement_id: s.id, appointment_ids: [], notes: `Liquidación ${s.period}`,
      created_by: String(req.authenticatedUserId), updated_at: nowIso()
    });
    const issued = await issueDraft(store, draft);
    const updated = await store.update('org_settlements', s.id, { status: 'invoiced', invoice_id: issued.id, updated_at: nowIso() });
    await audit(req, 'billing.settlement_invoiced', { resource_type: 'settlement', resource_id: s.id });
    const { names } = await memberNames(ws.orgId);
    res.status(201).json({ settlement: projectSettlement(updated, names), invoice: projectInvoice(issued) });
  }));

  router.post('/settlements/:id/mark-paid', requireAction('settlements.manage'), asyncRoute(async (req, res) => {
    const s = await loadSettlement(req);
    if (s.status !== 'invoiced') throw httpError(409, 'SETTLEMENT_NOT_INVOICED', 'Primero hay que emitir la factura de la liquidación.');
    const updated = await store.update('org_settlements', s.id, { status: 'paid', paid_at: nowIso(), updated_at: nowIso() });
    if (s.invoice_id) {
      const inv = await store.get('org_invoices', s.invoice_id);
      if (inv && inv.status === 'issued') await store.update('org_invoices', inv.id, { status: 'paid', paid_at: nowIso(), payment_method: 'transferencia', updated_at: nowIso() });
    }
    const { names } = await memberNames(req.workspace.orgId);
    res.json({ settlement: projectSettlement(updated, names) });
  }));

  // ── Productividad (sobre todo para contratados) ──
  router.get('/reports/productivity', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const range = periodRange(String(req.query.period || ''));
    if (!range) throw badRequest('Periodo no válido (AAAA-MM).');
    const all = ws.can('settlements.manage') || ws.can('settlements.read');
    if (!all && !ws.can('settlements.own')) throw forbidden();
    const { ms, names } = await memberNames(ws.orgId);
    const targets = ms.filter(m => (all || m.id === ws.member.id) && m.status !== 'invited' && m.status !== 'declined');
    const out = [];
    for (const m of targets) {
      const appts = (await store.list('org_appointments', { eq: { member_id: m.id }, gte: { starts_at: range.from }, lte: { starts_at: range.to }, limit: 500 }))
        .filter(a => new Date(a.starts_at) < new Date(range.to));
      if (!appts.length) continue;
      const s = buildSettlement({ member: { ...m, billing_model: 'payroll' }, period: req.query.period, appointments: appts });
      out.push({
        member_id: m.id, member_name: names[m.id], billing_model: m.billing_model, ...s.summary,
        no_shows: appts.filter(a => a.status === 'no_show').length,
        cancelled: appts.filter(a => a.status === 'cancelled').length
      });
    }
    res.json({ period: req.query.period, members: out });
  }));
}
