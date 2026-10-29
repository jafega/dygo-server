// Liquidaciones mensuales clínica ↔ profesional (backlog F3.6). Lógica pura.
//
// Cuatro modelos (org_members.billing_model):
//   payroll         Contratado: la clínica factura y paga nómina. Solo informe
//                   de productividad; no hay factura entre ellos.
//   org_invoices    Autónomo, factura la clínica al paciente: el profesional
//                   factura a la clínica su parte (psych_to_org), con IRPF.
//   psych_invoices  Autónomo, factura el profesional al paciente: la clínica
//                   le factura su comisión (org_to_psych), con IVA.
//   fixed_rent      Alquiler de despacho: la clínica le factura la cuota fija o
//                   las horas de sala (org_to_psych), con IVA.
//
// Todo en céntimos (R11). El reparto usa lo CONGELADO en cada cita al crearla
// (psych_percent / psych_fixed_fee): cambiar una regla no altera el pasado.

import { toCents, fromCents, percentOf, computeInvoice } from './invoiceMath.js';

export const BILLING_MODELS = ['payroll', 'org_invoices', 'psych_invoices', 'fixed_rent'];
export const DEFAULT_IRPF = 15;
export const DEFAULT_COMMERCIAL_VAT = 21;

const REVENUE_STATUSES = new Set(['completed']);
const ROOM_USE_STATUSES = new Set(['completed', 'no_show']);

const minutes = (a) => Math.max(0, Math.round((new Date(a.ends_at) - new Date(a.starts_at)) / 60000));

/** Parte del profesional de una cita, en céntimos (o null si no hay regla congelada). */
export function psychShareCents(appt) {
  const price = toCents(appt.price);
  if (appt.psych_fixed_fee !== null && appt.psych_fixed_fee !== undefined) return Math.min(price, toCents(appt.psych_fixed_fee));
  if (appt.psych_percent !== null && appt.psych_percent !== undefined) return percentOf(price, appt.psych_percent);
  return null;
}

/** Periodo 'YYYY-MM' → { from, to } ISO (mes natural en UTC). */
export function periodRange(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ''))) return null;
  const [y, m] = period.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
}

const PERIOD_LABEL = (period) => {
  const [y, m] = period.split('-').map(Number);
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${names[m - 1]} de ${y}`;
};

/**
 * Calcula la liquidación de un miembro en un periodo.
 * @param {object} p
 * @param {object} p.member         org_members (billing_model, irpf_rate, billing_profile)
 * @param {string} p.period         'YYYY-MM'
 * @param {Array}  p.appointments   citas del miembro en el periodo
 * @param {Record<string, {hourly_rate:number|null, name:string}>} [p.rooms]
 * @param {object} [p.config]       { psychToOrgVatRate=0, commercialVatRate=21, seatPassThrough=0 (€), monthlyRent=null (€) }
 */
export function buildSettlement({ member, period, appointments, rooms = {}, config = {} }) {
  const model = member.billing_model || 'payroll';
  if (!BILLING_MODELS.includes(model)) throw new Error(`Modelo económico desconocido: ${model}`);
  const label = PERIOD_LABEL(period);
  const done = (appointments || []).filter(a => REVENUE_STATUSES.has(a.status));
  const warnings = [];
  const lines = [];
  let revenue = 0;
  let psychTotal = 0;
  let clinicTotal = 0;
  let minutesTotal = 0;

  for (const a of done) {
    const price = toCents(a.price);
    const share = psychShareCents(a);
    if (a.price === null || a.price === undefined) warnings.push({ code: 'SIN_PRECIO', appointment_id: a.id });
    if (share === null && model !== 'payroll' && model !== 'fixed_rent') warnings.push({ code: 'SIN_REGLA', appointment_id: a.id });
    const psych = share ?? 0;
    revenue += price;
    psychTotal += psych;
    clinicTotal += price - psych;
    minutesTotal += minutes(a);
    lines.push({
      appointment_id: a.id, date: a.starts_at, service_type: a.service_type || 'session', minutes: minutes(a),
      price: fromCents(price), psych_amount: fromCents(psych), clinic_amount: fromCents(price - psych),
      psych_percent: a.psych_percent ?? null, psych_fixed_fee: a.psych_fixed_fee ?? null
    });
  }

  const summary = {
    sessions: done.length,
    hours: Math.round((minutesTotal / 60) * 100) / 100,
    revenue: fromCents(revenue),
    psych_amount: fromCents(psychTotal),
    clinic_amount: fromCents(clinicTotal)
  };

  if (model === 'payroll') {
    return { model, period, invoice_kind: null, lines, summary, invoice: null, deductions: [], net_payable: null, warnings };
  }

  let invoiceLines = [];
  let irpfRate = 0;
  let invoiceKind;
  if (model === 'org_invoices') {
    invoiceKind = 'psych_to_org';
    irpfRate = member.irpf_rate === null || member.irpf_rate === undefined ? DEFAULT_IRPF : Number(member.irpf_rate);
    invoiceLines = psychTotal > 0 ? [{
      description: `Servicios profesionales de psicología prestados en ${label} (${done.length} ${done.length === 1 ? 'sesión' : 'sesiones'})`,
      quantity: 1, unit_price: fromCents(psychTotal), vat_rate: Number(config.psychToOrgVatRate ?? 0)
    }] : [];
  } else if (model === 'psych_invoices') {
    invoiceKind = 'org_to_psych';
    invoiceLines = clinicTotal > 0 ? [{
      description: `Comisión por gestión y cesión de espacio — ${label} (${done.length} ${done.length === 1 ? 'sesión' : 'sesiones'})`,
      quantity: 1, unit_price: fromCents(clinicTotal), vat_rate: Number(config.commercialVatRate ?? DEFAULT_COMMERCIAL_VAT)
    }] : [];
  } else {
    invoiceKind = 'org_to_psych';
    const vat = Number(config.commercialVatRate ?? DEFAULT_COMMERCIAL_VAT);
    const monthly = config.monthlyRent ?? member.billing_profile?.monthly_rent ?? null;
    if (monthly !== null && monthly !== undefined && Number(monthly) > 0) {
      invoiceLines = [{ description: `Alquiler de despacho — ${label}`, quantity: 1, unit_price: Number(monthly), vat_rate: vat }];
    } else {
      // Por horas de sala reservadas (citas realizadas o no presentadas).
      const byRoom = new Map();
      for (const a of (appointments || []).filter(x => ROOM_USE_STATUSES.has(x.status) && x.room_id)) {
        const room = rooms[a.room_id];
        if (!room || room.hourly_rate === null || room.hourly_rate === undefined) {
          warnings.push({ code: 'SALA_SIN_TARIFA', appointment_id: a.id });
          continue;
        }
        const cur = byRoom.get(a.room_id) || { room, minutes: 0 };
        cur.minutes += minutes(a);
        byRoom.set(a.room_id, cur);
      }
      invoiceLines = [...byRoom.values()].map(({ room, minutes: mins }) => ({
        description: `Alquiler de ${room.name} — ${label} (${Math.round((mins / 60) * 100) / 100} h)`,
        quantity: Math.round((mins / 60) * 100) / 100,
        unit_price: Number(room.hourly_rate),
        vat_rate: vat
      }));
    }
  }

  const invoice = computeInvoice(invoiceLines, { irpfRate });
  const deductions = [];
  if (model === 'org_invoices' && Number(config.seatPassThrough) > 0) {
    deductions.push({ concept: 'Licencia de mainds business repercutida', amount: Number(config.seatPassThrough) });
  }
  const deductionsCents = deductions.reduce((s, d) => s + toCents(d.amount), 0);
  // Positivo: la clínica paga al profesional. En org_to_psych paga el profesional.
  const net = invoiceKind === 'psych_to_org' ? invoice.total_cents - deductionsCents : -invoice.total_cents;

  return {
    model, period, invoice_kind: invoiceKind, lines, summary,
    invoice: {
      lines: invoice.lines,
      irpf_rate: irpfRate,
      subtotal: fromCents(invoice.subtotal_cents),
      vat: fromCents(invoice.vat_cents),
      irpf: fromCents(invoice.irpf_cents),
      total: fromCents(invoice.total_cents)
    },
    deductions,
    net_payable: fromCents(net),
    warnings
  };
}
