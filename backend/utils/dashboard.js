// KPIs del panel del dueño de la clínica (backlog F5.5). Lógica pura.
//
// Definiciones:
//   - Producción: suma de precios de las citas realizadas del periodo, por
//     profesional y por sede.
//   - Facturado: total de las facturas a pacientes emitidas en el periodo
//     (incluye rectificativas, que restan).
//   - Ocupación de salas: minutos reservados (citas no canceladas con sala) /
//     minutos disponibles (salas activas × días laborables × 12 h, de 8 a 20).
//   - No-show: no presentados / (realizadas + no presentados).

import { toCents, fromCents } from './invoiceMath.js';

const OPEN_MINUTES_PER_DAY = 12 * 60;

/** Días laborables (lunes a viernes) entre dos instantes [from, to). */
export function workingDays(from, to) {
  let n = 0;
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  while (d < end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

const minutes = (a) => Math.max(0, Math.round((new Date(a.ends_at) - new Date(a.starts_at)) / 60000));
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * @param {object} p
 * @param {{from:string,to:string}} p.range
 * @param {Array} p.appointments  citas del periodo
 * @param {Array} p.invoices      facturas a pacientes emitidas en el periodo
 * @param {Array} p.rooms         salas de la clínica
 * @param {Array} p.locations     sedes
 * @param {Array} p.patients      pacientes de la clínica
 * @param {Array} p.leads         solicitudes creadas en el periodo
 * @param {Array} p.settlements   liquidaciones del periodo
 * @param {Record<string,string>} p.memberNames
 */
export function computeDashboard({ range, appointments = [], invoices = [], rooms = [], locations = [], patients = [], leads = [], settlements = [], memberNames = {} }) {
  const done = appointments.filter(a => a.status === 'completed');
  const noShow = appointments.filter(a => a.status === 'no_show');

  const byMember = new Map();
  const byLocation = new Map();
  let production = 0;
  for (const a of done) {
    const c = toCents(a.price);
    production += c;
    const m = byMember.get(a.member_id) || { member_id: a.member_id, name: memberNames[a.member_id] || 'Profesional', sessions: 0, cents: 0 };
    m.sessions++;
    m.cents += c;
    byMember.set(a.member_id, m);
    const locId = a.location_id || 'online';
    const l = byLocation.get(locId) || { location_id: a.location_id || null, name: a.location_id ? (locations.find(x => x.id === a.location_id)?.name || 'Sede') : 'Online', sessions: 0, cents: 0 };
    l.sessions++;
    l.cents += c;
    byLocation.set(locId, l);
  }

  const invoiced = invoices.filter(i => i.kind === 'patient' && i.status !== 'draft').reduce((s, i) => s + toCents(i.total), 0);

  const activeRooms = rooms.filter(r => r.active !== false);
  const available = activeRooms.length * workingDays(range.from, range.to) * OPEN_MINUTES_PER_DAY;
  const roomIds = new Set(activeRooms.map(r => r.id));
  const booked = appointments.filter(a => a.status !== 'cancelled' && a.room_id && roomIds.has(a.room_id)).reduce((s, a) => s + minutes(a), 0);
  const byRoom = activeRooms.map(r => {
    const mins = appointments.filter(a => a.status !== 'cancelled' && a.room_id === r.id).reduce((s, a) => s + minutes(a), 0);
    const avail = workingDays(range.from, range.to) * OPEN_MINUTES_PER_DAY;
    return { room_id: r.id, name: r.name, occupancy: pct(mins, avail), hours: Math.round((mins / 60) * 10) / 10 };
  });

  const seenPatients = new Set(done.map(a => a.patient_id).filter(Boolean));
  const converted = leads.filter(l => l.status === 'paciente').length;
  const pendingSettlements = settlements.filter(s => s.status !== 'paid');

  return {
    period: range,
    production: fromCents(production),
    invoiced: fromCents(invoiced),
    sessions: done.length,
    no_shows: noShow.length,
    no_show_rate: pct(noShow.length, done.length + noShow.length),
    cancelled: appointments.filter(a => a.status === 'cancelled').length,
    room_occupancy: pct(booked, available),
    rooms: byRoom,
    patients_active: patients.filter(p => p.status === 'active').length,
    patients_seen: seenPatients.size,
    leads: leads.length,
    leads_converted: converted,
    lead_conversion: pct(converted, leads.length),
    settlements_pending: pendingSettlements.length,
    settlements_pending_amount: fromCents(pendingSettlements.reduce((s, x) => s + Math.abs(toCents(x.data?.net_payable || 0)), 0)),
    by_member: [...byMember.values()].map(m => ({ member_id: m.member_id, name: m.name, sessions: m.sessions, production: fromCents(m.cents) })).sort((a, b) => b.production - a.production),
    by_location: [...byLocation.values()].map(l => ({ location_id: l.location_id, name: l.name, sessions: l.sessions, production: fromCents(l.cents) })).sort((a, b) => b.production - a.production)
  };
}
