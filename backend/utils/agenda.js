// Lógica pura de agenda de mainds business (backlog F2.3).
//
// Intervalos semiabiertos [inicio, fin): una cita que termina a las 11:00 no
// choca con otra que empieza a las 11:00. Las citas canceladas no ocupan.

export const MAX_RANGE_DAYS = 62;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_APPOINTMENT_HOURS = 12;

/** Estados que ocupan sala y profesional. */
export const BLOCKING_STATUSES = Object.freeze(['scheduled', 'completed', 'no_show']);

const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** ¿Se solapan [aStart, aEnd) y [bStart, bEnd)? */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return ms(aStart) < ms(bEnd) && ms(bStart) < ms(aEnd);
}

/** ¿Esta cita ocupa hueco? */
export const isBlocking = (appt) => BLOCKING_STATUSES.includes(appt?.status || 'scheduled');

/**
 * Conflictos de una cita candidata con las existentes.
 * @param {Array} existing   citas de la clínica
 * @param {{ id?, member_id, room_id?, starts_at, ends_at }} candidate
 * @returns {{ room: object|null, professional: object|null }}
 */
export function findConflicts(existing, candidate) {
  let room = null;
  let professional = null;
  for (const a of existing || []) {
    if (candidate.id && a.id === candidate.id) continue;
    if (!isBlocking(a)) continue;
    if (!overlaps(a.starts_at, a.ends_at, candidate.starts_at, candidate.ends_at)) continue;
    if (!room && candidate.room_id && a.room_id === candidate.room_id) room = a;
    if (!professional && a.member_id === candidate.member_id) professional = a;
    if (room && professional) break;
  }
  return { room, professional };
}

/** Normaliza un instante ISO. Devuelve null si no es una fecha válida. */
export function parseInstant(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Valida el rango de una consulta de agenda.
 * @returns {{ from: Date, to: Date } | { error: string }}
 */
export function validateRange(from, to, maxDays = MAX_RANGE_DAYS) {
  const f = parseInstant(from);
  const t = parseInstant(to);
  if (!f || !t) return { error: 'Indica un rango de fechas válido (from y to).' };
  if (t <= f) return { error: 'La fecha final debe ser posterior a la inicial.' };
  if (t.getTime() - f.getTime() > maxDays * DAY_MS) return { error: `El rango máximo es de ${maxDays} días.` };
  return { from: f, to: t };
}

/**
 * Valida inicio y fin de una cita.
 * @returns {{ starts_at: string, ends_at: string } | { error: string }}
 */
export function validateSlot(startsAt, endsAt) {
  const s = parseInstant(startsAt);
  const e = parseInstant(endsAt);
  if (!s || !e) return { error: 'Fecha u hora de la cita no válidas.' };
  if (e <= s) return { error: 'La cita debe terminar después de empezar.' };
  if (e.getTime() - s.getTime() > MAX_APPOINTMENT_HOURS * 3600 * 1000) return { error: `Una cita no puede durar más de ${MAX_APPOINTMENT_HOURS} horas.` };
  return { starts_at: s.toISOString(), ends_at: e.toISOString() };
}

/** Bloques ocupados (solo inicio y fin) de una lista de citas. */
export function toBusyBlocks(appointments) {
  return (appointments || [])
    .filter(isBlocking)
    .map(a => ({ starts_at: new Date(a.starts_at).toISOString(), ends_at: new Date(a.ends_at).toISOString() }));
}

/** ¿Algún bloque ocupado se solapa con [start, end)? */
export const anyOverlap = (blocks, start, end) =>
  (blocks || []).some(b => overlaps(b.starts_at, b.ends_at, start, end));
