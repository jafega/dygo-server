// Inicio de la clínica (Fase 6, feedback de la titular).
//
//   GET /api/org/:orgId/home
//
// Un único resumen para la pantalla de entrada, filtrado por permisos:
//   - today:   mis citas de hoy (si atiendo pacientes) y la clínica hoy (agenda de todos);
//   - pending: lo que bloquea dinero o trabajo (citas pasadas sin cerrar, sin
//              facturar, borradores, solicitudes nuevas, liquidaciones por validar,
//              invitaciones sin aceptar). Cada bloque es null si no te toca;
//   - setup:   primeros pasos de la clínica (solo quien la configura).
// Cada bloque sigue la matriz de permisos: un psicólogo solo ve lo suyo y
// quien no gestiona la clínica no ve los primeros pasos.

import { asyncRoute } from './errors.js';
import { canSeePatient, patientDisplayName } from './clinical.js';
import { isPractitioner } from '../utils/orgPermissions.js';
import { madridOffsetMinutes } from '../utils/agenda.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TO_CLOSE_LIMIT = 50;

/** Inicio y fin (UTC) del día de hoy en Madrid. */
export function madridDayRange(now = new Date()) {
  const local = new Date(now.getTime() + madridOffsetMinutes(now) * 60000);
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(midnightAsUtc - madridOffsetMinutes(new Date(midnightAsUtc)) * 60000);
  const end = new Date(midnightAsUtc + DAY_MS - madridOffsetMinutes(new Date(midnightAsUtc + DAY_MS)) * 60000);
  return { date: new Date(midnightAsUtc).toISOString().slice(0, 10), start, end };
}

export function registerHomeRoutes(router, ctx) {
  const { store } = ctx;

  router.get('/home', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    const me = ws.member;
    const now = new Date();
    const { date, start, end } = madridDayRange(now);

    const members = await store.list('org_members', { eq: { org_id: ws.orgId }, limit: 500 });
    const nameOf = (id) => {
      const m = members.find(x => x.id === id);
      return m?.display_name || m?.email || 'Profesional';
    };
    const rooms = await store.list('org_rooms', { eq: { org_id: ws.orgId }, limit: 500 });
    const patients = new Map();
    const patientOf = async (id) => {
      if (!id) return null;
      if (!patients.has(id)) {
        const p = await store.get('org_patients', id);
        patients.set(id, p && p.org_id === ws.orgId ? p : null);
      }
      return patients.get(id);
    };
    const visibleName = async (id) => {
      const p = await patientOf(id);
      return p && canSeePatient(ws, p) ? patientDisplayName(p) : null;
    };

    // ── Hoy ──
    const todays = (await store.list('org_appointments', {
      eq: { org_id: ws.orgId }, gte: { starts_at: start.toISOString() }, lte: { starts_at: end.toISOString() }, order: 'starts_at', limit: 500
    })).filter(a => a.status !== 'cancelled' && new Date(a.starts_at) < end);
    const practitioner = isPractitioner(me) && ws.can('agenda.manage_own');
    let mine = null;
    if (practitioner) {
      mine = [];
      for (const a of todays.filter(x => x.member_id === me.id)) {
        mine.push({
          id: a.id, starts_at: a.starts_at, ends_at: a.ends_at, status: a.status, service_type: a.service_type,
          patient_id: a.patient_id || null, patient_name: await visibleName(a.patient_id),
          room_name: rooms.find(r => r.id === a.room_id)?.name || null, invoice_id: a.invoice_id || null
        });
      }
    }
    let clinic = null;
    if (ws.can('agenda.view_all')) {
      const counts = {};
      for (const a of todays) counts[a.member_id] = (counts[a.member_id] || 0) + 1;
      clinic = {
        total: todays.length,
        by_member: Object.entries(counts).map(([id, count]) => ({ member_id: id, name: nameOf(id), count })).sort((x, y) => y.count - x.count)
      };
    }

    // ── Pendientes ──
    const pending = { to_close: null, unbilled: null, drafts: null, leads_new: null, settlements_to_validate: null, invitations_pending: null };

    const manageAll = ws.can('agenda.manage_all');
    if (manageAll || ws.can('agenda.manage_own')) {
      const eq = { org_id: ws.orgId, status: 'scheduled', invoice_id: null };
      if (!manageAll) eq.member_id = me.id;
      const open = (await store.list('org_appointments', { eq, lte: { starts_at: now.toISOString() }, order: 'starts_at', limit: 500 }))
        .filter(a => new Date(a.ends_at) <= now);
      const items = [];
      for (const a of open.slice(0, TO_CLOSE_LIMIT)) {
        items.push({ id: a.id, starts_at: a.starts_at, member_id: a.member_id, member_name: nameOf(a.member_id), patient_name: await visibleName(a.patient_id) });
      }
      pending.to_close = { count: open.length, items };
    }

    if (ws.can('billing.manage')) {
      const done = (await store.list('org_appointments', { eq: { org_id: ws.orgId, status: 'completed', invoice_id: null }, limit: 500 }))
        .filter(a => a.patient_id);
      const priced = done.filter(a => a.price !== null && a.price !== undefined);
      pending.unbilled = {
        count: done.length,
        amount: Math.round(priced.reduce((s, a) => s + Number(a.price) * 100, 0)) / 100,
        without_price: done.length - priced.length
      };
      pending.drafts = (await store.list('org_invoices', { eq: { org_id: ws.orgId, status: 'draft' }, limit: 500 })).length;
    }

    if (ws.can('leads.manage')) {
      pending.leads_new = (await store.list('org_leads', { eq: { org_id: ws.orgId, status: 'nuevo' }, limit: 500 })).length;
    } else if (ws.can('leads.assigned')) {
      pending.leads_new = (await store.list('org_leads', { eq: { org_id: ws.orgId, status: 'nuevo', assigned_member_id: me.id }, limit: 500 })).length;
    }

    if (ws.can('settlements.own')) {
      pending.settlements_to_validate = (await store.list('org_settlements', { eq: { org_id: ws.orgId, member_id: me.id, status: 'draft' }, limit: 50 })).length;
    }

    if (ws.can('team.manage')) {
      pending.invitations_pending = members.filter(m => m.status === 'invited').length;
    }

    // ── Primeros pasos ──
    let setup = null;
    if (ws.can('team.manage') || ws.can('org.settings')) {
      const [entities, locations, anyPatient, anyAppt] = await Promise.all([
        store.list('org_billing_entities', { eq: { org_id: ws.orgId }, limit: 1 }),
        store.list('org_locations', { eq: { org_id: ws.orgId }, limit: 1 }),
        store.list('org_patients', { eq: { org_id: ws.orgId }, limit: 1 }),
        store.list('org_appointments', { eq: { org_id: ws.orgId }, limit: 1 })
      ]);
      const prices = ws.org.settings?.service_prices || {};
      setup = [
        { id: 'billing_entity', done: entities.length > 0 },
        { id: 'prices', done: Object.keys(prices).length > 0 },
        { id: 'location', done: locations.length > 0 && rooms.length > 0 },
        { id: 'team', done: members.filter(m => m.id !== me.id && ['active', 'invited'].includes(m.status)).length > 0 },
        { id: 'patient', done: anyPatient.length > 0 },
        { id: 'appointment', done: anyAppt.length > 0 }
      ];
      if (ws.plus) setup.push({ id: 'public_page', done: !!ws.org.settings?.public_page?.enabled });
    }

    res.json({ date, today: { mine, clinic }, pending, setup });
  }));
}
