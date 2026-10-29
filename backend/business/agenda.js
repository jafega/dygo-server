// Agenda de la clínica: sedes, salas, citas y agenda unificada (backlog F2.1, F2.3, F2.4).
//
//   GET  /api/org/me/busy?from&to                       bloques ocupados de TODOS mis espacios
//   GET  /api/org/:orgId/locations                       sedes con sus salas
//   POST/PATCH/DELETE /api/org/:orgId/locations[/:id]    (team.manage)
//   POST/PATCH/DELETE /api/org/:orgId/rooms[/:id]        (team.manage)
//   GET  /api/org/:orgId/appointments?from&to&memberId&roomId&locationId
//   POST /api/org/:orgId/appointments
//   PATCH /api/org/:orgId/appointments/:id
//
// Quien solo tiene agenda.view_busy ve las citas de otros como bloques
// "ocupado" sin datos del paciente.

import { asyncRoute, httpError, badRequest, forbidden, notFound } from './errors.js';
import { requireAction } from './workspace.js';
import { canSeePatient, patientDisplayName } from './clinical.js';
import {
  findConflicts, validateRange, validateSlot, toBusyBlocks, anyOverlap, overlaps, isBlocking
} from '../utils/agenda.js';
import { isPractitioner } from '../utils/orgPermissions.js';
import { freezeCommission } from './money.js';

export const SERVICE_TYPES = ['session', 'first_visit', 'couple', 'family', 'group', 'evaluation', 'other'];
export const MODALITIES = ['in_person', 'online'];
export const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];

const nowIso = () => new Date().toISOString();
const trimOrNull = (v, max = 500) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const money = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw badRequest('Importe no válido.');
  return Math.round(n * 100) / 100;
};

/** Citas de un rango que pueden solaparse con [start, end). */
async function appointmentsAround(store, eq, start, end) {
  const rows = await store.list('org_appointments', {
    eq, lte: { starts_at: new Date(end).toISOString() }, gte: { ends_at: new Date(start).toISOString() }, limit: 500
  });
  return rows.filter(a => overlaps(a.starts_at, a.ends_at, start, end));
}

/**
 * Bloques ocupados de un usuario fuera de la clínica `exceptOrgId`: sus otras
 * clínicas y su consulta personal (mainds pro). Solo inicio y fin.
 */
export async function busyElsewhere(ctx, userId, from, to, exceptOrgId = null) {
  if (!userId) return [];
  const { store, deps } = ctx;
  const blocks = [];
  const memberships = (await store.list('org_members', { eq: { user_id: String(userId), status: 'active' }, limit: 100 }))
    .filter(m => m.org_id !== exceptOrgId);
  for (const m of memberships) {
    const appts = await appointmentsAround(store, { member_id: m.id }, from, to);
    for (const b of toBusyBlocks(appts)) blocks.push({ ...b, source: 'org', org_id: m.org_id });
  }
  if (typeof deps?.readPersonalBusy === 'function') {
    try {
      const personal = await deps.readPersonalBusy(String(userId), new Date(from).toISOString(), new Date(to).toISOString());
      for (const b of personal || []) blocks.push({ starts_at: b.starts_at, ends_at: b.ends_at, source: 'personal' });
    } catch { /* la agenda personal no puede romper la de la clínica */ }
  }
  return blocks;
}

function projectAppointment(a, { full, patientName }) {
  if (!full) {
    return { id: a.id, member_id: a.member_id, room_id: a.room_id || null, location_id: a.location_id || null, starts_at: a.starts_at, ends_at: a.ends_at, busy: true };
  }
  return {
    id: a.id, member_id: a.member_id, patient_id: a.patient_id || null, patient_name: patientName ?? null,
    location_id: a.location_id || null, room_id: a.room_id || null,
    starts_at: a.starts_at, ends_at: a.ends_at, status: a.status,
    service_type: a.service_type, modality: a.modality,
    price: a.price ?? null, psych_percent: a.psych_percent ?? null, psych_fixed_fee: a.psych_fixed_fee ?? null,
    invoice_id: a.invoice_id || null, admin_notes: a.admin_notes || null, created_at: a.created_at
  };
}

export function registerAgendaTopLevel(router, ctx) {
  router.get('/me/busy', ctx.authenticateRequest, asyncRoute(async (req, res) => {
    const range = validateRange(req.query.from, req.query.to);
    if (range.error) throw badRequest(range.error, 'INVALID_RANGE');
    const userId = String(req.authenticatedUserId);
    const blocks = await busyElsewhere(ctx, userId, range.from, range.to, null);
    // Nombre de cada clínica: el usuario es miembro de todas, puede verlo.
    const names = {};
    for (const b of blocks) {
      if (b.org_id && !names[b.org_id]) names[b.org_id] = (await ctx.store.get('organizations', b.org_id))?.name || null;
    }
    res.json({
      blocks: blocks
        .map(b => ({ starts_at: b.starts_at, ends_at: b.ends_at, source: b.source, org_id: b.org_id || null, org_name: b.org_id ? names[b.org_id] : null }))
        .sort((x, y) => x.starts_at.localeCompare(y.starts_at))
    });
  }));
}

export function registerAgendaRoutes(router, ctx) {
  const { store, recordAccess } = ctx;
  const orgOf = (req) => req.workspace.orgId;

  const loadIn = async (table, req, id, label) => {
    const row = id ? await store.get(table, String(id)) : null;
    if (!row || row.org_id !== orgOf(req)) throw notFound(`${label} no encontrada`);
    return row;
  };

  // ── Sedes y salas ──
  router.get('/locations', asyncRoute(async (req, res) => {
    const [locations, rooms] = await Promise.all([
      store.list('org_locations', { eq: { org_id: orgOf(req) }, order: 'name', limit: 200 }),
      store.list('org_rooms', { eq: { org_id: orgOf(req) }, order: 'name', limit: 500 })
    ]);
    const showRates = req.workspace.can('team.manage') || req.workspace.can('settlements.manage');
    res.json({
      locations: locations.map(l => ({
        id: l.id, name: l.name, address: l.address || null, active: l.active !== false,
        rooms: rooms.filter(r => r.location_id === l.id).map(r => ({
          id: r.id, name: r.name, active: r.active !== false, location_id: r.location_id,
          ...(showRates ? { hourly_rate: r.hourly_rate ?? null } : {})
        }))
      }))
    });
  }));

  router.post('/locations', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const name = trimOrNull(req.body?.name, 120);
    if (!name) throw badRequest('El nombre de la sede es obligatorio.');
    const loc = await store.insert('org_locations', { org_id: orgOf(req), name, address: trimOrNull(req.body?.address), active: true, updated_at: nowIso() });
    res.status(201).json({ location: { ...loc, rooms: [] } });
  }));

  router.patch('/locations/:id', requireAction('team.manage'), asyncRoute(async (req, res) => {
    await loadIn('org_locations', req, req.params.id, 'Sede');
    const patch = { updated_at: nowIso() };
    if (req.body?.name !== undefined) {
      patch.name = trimOrNull(req.body.name, 120);
      if (!patch.name) throw badRequest('El nombre de la sede es obligatorio.');
    }
    if (req.body?.address !== undefined) patch.address = trimOrNull(req.body.address);
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    res.json({ location: await store.update('org_locations', req.params.id, patch) });
  }));

  router.delete('/locations/:id', requireAction('team.manage'), asyncRoute(async (req, res) => {
    await loadIn('org_locations', req, req.params.id, 'Sede');
    const rooms = await store.list('org_rooms', { eq: { location_id: String(req.params.id) }, limit: 1 });
    if (rooms.length) throw httpError(409, 'LOCATION_HAS_ROOMS', 'La sede tiene salas. Elimínalas o desactiva la sede.');
    await store.remove('org_locations', String(req.params.id));
    res.json({ ok: true });
  }));

  router.post('/rooms', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const loc = await loadIn('org_locations', req, req.body?.location_id, 'Sede');
    const name = trimOrNull(req.body?.name, 120);
    if (!name) throw badRequest('El nombre de la sala es obligatorio.');
    const room = await store.insert('org_rooms', {
      org_id: orgOf(req), location_id: loc.id, name, hourly_rate: money(req.body?.hourly_rate) ?? null, active: true, updated_at: nowIso()
    });
    res.status(201).json({ room });
  }));

  router.patch('/rooms/:id', requireAction('team.manage'), asyncRoute(async (req, res) => {
    await loadIn('org_rooms', req, req.params.id, 'Sala');
    const patch = { updated_at: nowIso() };
    if (req.body?.name !== undefined) {
      patch.name = trimOrNull(req.body.name, 120);
      if (!patch.name) throw badRequest('El nombre de la sala es obligatorio.');
    }
    if (req.body?.hourly_rate !== undefined) patch.hourly_rate = money(req.body.hourly_rate);
    if (req.body?.active !== undefined) patch.active = req.body.active === true;
    res.json({ room: await store.update('org_rooms', req.params.id, patch) });
  }));

  router.delete('/rooms/:id', requireAction('team.manage'), asyncRoute(async (req, res) => {
    const room = await loadIn('org_rooms', req, req.params.id, 'Sala');
    const future = await store.list('org_appointments', { eq: { room_id: room.id, status: 'scheduled' }, gte: { starts_at: nowIso() }, limit: 1 });
    if (future.length) throw httpError(409, 'ROOM_HAS_APPOINTMENTS', 'La sala tiene citas futuras. Muévelas o cancélalas antes.');
    const any = await store.list('org_appointments', { eq: { room_id: room.id }, limit: 1 });
    // Con histórico, se desactiva en vez de borrar (las citas antiguas la referencian).
    if (any.length) await store.update('org_rooms', room.id, { active: false, updated_at: nowIso() });
    else await store.remove('org_rooms', room.id);
    res.json({ ok: true });
  }));

  // ── Citas ──
  router.get('/appointments', asyncRoute(async (req, res) => {
    const ws = req.workspace;
    if (!ws.can('agenda.view_all') && !ws.can('agenda.view_busy')) throw forbidden();
    const range = validateRange(req.query.from, req.query.to);
    if (range.error) throw badRequest(range.error, 'INVALID_RANGE');
    const eq = { org_id: ws.orgId };
    if (req.query.memberId) eq.member_id = String(req.query.memberId);
    if (req.query.roomId) eq.room_id = String(req.query.roomId);
    if (req.query.locationId) eq.location_id = String(req.query.locationId);
    const rows = await store.list('org_appointments', {
      eq, gte: { starts_at: range.from.toISOString() }, lte: { starts_at: range.to.toISOString() }, order: 'starts_at', limit: 500
    });
    const viewAll = ws.can('agenda.view_all');
    const patientIds = [...new Set(rows.map(a => a.patient_id).filter(Boolean))];
    const patients = new Map();
    for (const id of patientIds) {
      const p = await store.get('org_patients', id);
      if (p && p.org_id === ws.orgId) patients.set(id, p);
    }
    const out = rows.map(a => {
      const mine = a.member_id === ws.member.id;
      const full = mine || viewAll;
      const p = a.patient_id ? patients.get(a.patient_id) : null;
      const patientName = full && p && canSeePatient(ws, p) ? patientDisplayName(p) : null;
      return projectAppointment(a, { full, patientName });
    });
    res.json({ appointments: out });
  }));

  async function validateAppointmentInput(req, body, existing = null) {
    const ws = req.workspace;
    const memberId = body.member_id !== undefined ? String(body.member_id) : existing?.member_id || ws.member.id;
    const manageAll = ws.can('agenda.manage_all');
    if (!manageAll) {
      if (!ws.can('agenda.manage_own')) throw forbidden();
      if (memberId !== ws.member.id) throw forbidden('Solo puedes gestionar tu propia agenda.');
    }
    const member = memberId === ws.member.id ? ws.member : await store.get('org_members', memberId);
    if (!member || member.org_id !== ws.orgId || member.status !== 'active' || !isPractitioner(member)) {
      throw badRequest('El profesional no es un miembro clínico activo de la clínica.');
    }

    let patient = null;
    const patientId = body.patient_id !== undefined ? body.patient_id : existing?.patient_id;
    if (patientId) {
      patient = await store.get('org_patients', String(patientId));
      if (!patient || patient.org_id !== ws.orgId) throw badRequest('Paciente no encontrado.');
      if (!canSeePatient(ws, patient)) throw forbidden('Ese paciente no está asignado a ti.');
      if (patient.status === 'archived') throw badRequest('El paciente está archivado.');
    } else if (!existing) {
      throw badRequest('Indica el paciente.');
    }

    let room = null;
    const roomId = body.room_id !== undefined ? body.room_id : existing?.room_id;
    if (roomId) {
      room = await store.get('org_rooms', String(roomId));
      if (!room || room.org_id !== ws.orgId) throw badRequest('Sala no encontrada.');
      if (room.active === false && (!existing || existing.room_id !== room.id)) throw badRequest('La sala está desactivada.');
    }

    const slot = validateSlot(body.starts_at ?? existing?.starts_at, body.ends_at ?? existing?.ends_at);
    if (slot.error) throw badRequest(slot.error, 'INVALID_SLOT');

    const serviceType = body.service_type ?? existing?.service_type ?? 'session';
    if (!SERVICE_TYPES.includes(serviceType)) throw badRequest('Tipo de servicio no válido.');
    const modality = body.modality ?? existing?.modality ?? (room ? 'in_person' : 'online');
    if (!MODALITIES.includes(modality)) throw badRequest('Modalidad no válida.');
    const status = body.status ?? existing?.status ?? 'scheduled';
    if (!STATUSES.includes(status)) throw badRequest('Estado no válido.');

    return { member, patient, room, slot, serviceType, modality, status };
  }

  async function checkConflicts(req, candidate) {
    if (!isBlocking(candidate)) return [];
    const around = await appointmentsAround(store, { org_id: req.workspace.orgId }, candidate.starts_at, candidate.ends_at);
    const { room, professional } = findConflicts(around, candidate);
    if (room) throw httpError(409, 'ROOM_CONFLICT', 'La sala ya está ocupada en ese horario.');
    if (professional) throw httpError(409, 'PROFESSIONAL_CONFLICT', 'El profesional ya tiene una cita en ese horario.');
    return [];
  }

  async function crossWorkspaceWarnings(req, member, startsAt, endsAt) {
    if (!member.user_id) return [];
    const blocks = await busyElsewhere(ctx, member.user_id, startsAt, endsAt, req.workspace.orgId);
    return anyOverlap(blocks, startsAt, endsAt) ? ['CONFLICT_OTHER_WORKSPACE'] : [];
  }

  router.post('/appointments', asyncRoute(async (req, res) => {
    const body = req.body || {};
    const v = await validateAppointmentInput(req, body);
    const row = {
      org_id: req.workspace.orgId,
      member_id: v.member.id,
      patient_id: v.patient?.id || null,
      location_id: v.room?.location_id || trimOrNull(body.location_id, 64),
      room_id: v.room?.id || null,
      starts_at: v.slot.starts_at,
      ends_at: v.slot.ends_at,
      status: 'scheduled',
      service_type: v.serviceType,
      modality: v.modality,
      price: money(body.price) ?? null,
      admin_notes: trimOrNull(body.admin_notes, 1000),
      created_by: String(req.authenticatedUserId),
      updated_at: nowIso()
    };
    if (row.location_id && !v.room) {
      const loc = await store.get('org_locations', row.location_id);
      if (!loc || loc.org_id !== req.workspace.orgId) throw badRequest('Sede no encontrada.');
    }
    // La regla de comisión vigente se congela en la cita (cambiarla después no altera el pasado).
    Object.assign(row, await freezeCommission(store, req.workspace.orgId, v.member, v.patient, row));
    await checkConflicts(req, row);
    const warnings = await crossWorkspaceWarnings(req, v.member, row.starts_at, row.ends_at);
    const appt = await store.insert('org_appointments', row);
    await recordAccess({ org_id: req.workspace.orgId, actor_user_id: String(req.authenticatedUserId), action: 'agenda.appointment_created', resource_type: 'appointment', resource_id: appt.id });
    res.status(201).json({
      appointment: projectAppointment(appt, { full: true, patientName: v.patient ? patientDisplayName(v.patient) : null }),
      warnings
    });
  }));

  router.patch('/appointments/:id', asyncRoute(async (req, res) => {
    const existing = await loadIn('org_appointments', req, req.params.id, 'Cita');
    const ws = req.workspace;
    if (!ws.can('agenda.manage_all') && !(ws.can('agenda.manage_own') && existing.member_id === ws.member.id)) throw forbidden();
    const body = req.body || {};
    const touchesMoney = ['starts_at', 'ends_at', 'member_id', 'patient_id', 'price', 'service_type'].some(k => body[k] !== undefined);
    if (existing.invoice_id && (touchesMoney || (body.status && body.status !== existing.status))) {
      throw httpError(409, 'APPOINTMENT_INVOICED', 'La cita ya está facturada. Rectifica la factura si hay que cambiarla.');
    }
    const v = await validateAppointmentInput(req, body, existing);
    const patch = {
      member_id: v.member.id,
      patient_id: v.patient?.id ?? existing.patient_id ?? null,
      room_id: v.room?.id ?? (body.room_id === null ? null : existing.room_id ?? null),
      starts_at: v.slot.starts_at,
      ends_at: v.slot.ends_at,
      status: v.status,
      service_type: v.serviceType,
      modality: v.modality,
      updated_at: nowIso()
    };
    if (v.room) patch.location_id = v.room.location_id;
    if (body.price !== undefined) patch.price = money(body.price);
    if (body.admin_notes !== undefined) patch.admin_notes = trimOrNull(body.admin_notes, 1000);
    // Si cambia quién atiende o el tipo de servicio, se vuelve a congelar la regla.
    if (patch.member_id !== existing.member_id || patch.service_type !== existing.service_type) {
      Object.assign(patch, await freezeCommission(store, ws.orgId, v.member, v.patient, { ...existing, ...patch }));
    }
    const candidate = { ...existing, ...patch };
    const moved = patch.starts_at !== new Date(existing.starts_at).toISOString() || patch.ends_at !== new Date(existing.ends_at).toISOString() ||
      patch.room_id !== (existing.room_id || null) || patch.member_id !== existing.member_id ||
      (isBlocking(candidate) && !isBlocking(existing));
    if (moved) await checkConflicts(req, candidate);
    const warnings = moved ? await crossWorkspaceWarnings(req, v.member, patch.starts_at, patch.ends_at) : [];
    const updated = await store.update('org_appointments', existing.id, patch);
    await recordAccess({ org_id: ws.orgId, actor_user_id: String(req.authenticatedUserId), action: 'agenda.appointment_updated', resource_type: 'appointment', resource_id: existing.id });
    const p = updated.patient_id ? await store.get('org_patients', updated.patient_id) : null;
    res.json({ appointment: projectAppointment(updated, { full: true, patientName: p && canSeePatient(ws, p) ? patientDisplayName(p) : null }), warnings });
  }));
}
