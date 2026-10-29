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

// ── Fase 6: tarifas y citas periódicas ──────────────────────────────────────

export const MAX_REPEAT_COUNT = 26;

const toPrice = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

/**
 * Precio de una cita: el indicado; si no, el del paciente; si no, la tarifa
 * del servicio en la clínica. `null` si no hay ninguno.
 */
export function resolvePrice({ explicit, patient, servicePrices, serviceType }) {
  const given = toPrice(explicit);
  if (given !== null) return given;
  const own = toPrice(patient?.default_price);
  if (own !== null) return own;
  return toPrice(servicePrices?.[serviceType || 'session']);
}

/** Valida y normaliza las tarifas por servicio (`{ session: 60, … }`). */
export function normalizeServicePrices(input, serviceTypes) {
  if (input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return { error: 'Tarifas no válidas.' };
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!serviceTypes.includes(k)) return { error: `Servicio desconocido: ${k}.` };
    if (v === null || v === '') continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { error: 'Importe de tarifa no válido.' };
    out[k] = Math.round(n * 100) / 100;
  }
  return { prices: out };
}

/** Minutos de diferencia con UTC en Madrid (60 en invierno, 120 en verano). */
export function madridOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

/**
 * Suma días manteniendo la hora de reloj de España: una sesión de los lunes a
 * las 10:00 sigue a las 10:00 después del cambio de hora.
 */
export function addDaysLocal(iso, days) {
  const d = new Date(iso);
  const naive = new Date(d.getTime() + days * DAY_MS);
  return new Date(naive.getTime() + (madridOffsetMinutes(d) - madridOffsetMinutes(naive)) * 60000).toISOString();
}

/**
 * Huecos de una serie periódica, incluida la primera cita.
 * @param {{ every_weeks?: number, count?: number }} repeat
 * @returns {{ slots: Array<{starts_at, ends_at}> } | { error: string }}
 */
export function repeatSlots(startsAt, endsAt, repeat) {
  const every = Number(repeat?.every_weeks ?? 1);
  const count = Number(repeat?.count);
  if (![1, 2, 3, 4].includes(every)) return { error: 'La repetición debe ser cada 1, 2, 3 o 4 semanas.' };
  if (!Number.isInteger(count) || count < 2 || count > MAX_REPEAT_COUNT) {
    return { error: `Indica entre 2 y ${MAX_REPEAT_COUNT} citas en la serie.` };
  }
  const slots = [];
  for (let i = 0; i < count; i++) {
    slots.push({ starts_at: addDaysLocal(startsAt, i * every * 7), ends_at: addDaysLocal(endsAt, i * every * 7) });
  }
  return { slots };
}
