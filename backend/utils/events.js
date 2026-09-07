// events.js — Capa 0 del embudo: eventos de producto.
//
// Antes de esto no había forma de saber dónde se caía la gente: los únicos
// datos eran filas de negocio (usuarios, sesiones, suscripciones) sin marca de
// cuándo pasó cada cosa por primera vez. Esta capa registra los hitos del
// recorrido de un psicólogo para que el panel diario y las automatizaciones
// (n8n) tengan algo a lo que reaccionar.
//
// Reglas de la casa:
//   - Nunca lanza. Un fallo al registrar un evento no puede tumbar la petición
//     que lo originó.
//   - Nunca bloquea. Se llama sin await desde los handlers.
//   - `once: true` usa el índice único de dedupe_key: el evento "primera vez"
//     se escribe una sola vez sin necesidad de leer antes.
//   - props es metadata corta (plan, origen, contadores). NUNCA contenido
//     clínico, audio ni base64 — ver el incidente de session_entry.

import { createClient } from '@supabase/supabase-js';

// Hitos del recorrido del psicólogo, en orden de embudo.
export const EVENTS = {
  // `signup` es SOLO de psicologos, a proposito. Las altas de paciente van a
  // `signup_patient` para que ninguna consulta que busque `signup` (el embudo,
  // el parte diario, el motor de campanas) los recoja por accidente y acaben
  // recibiendo correo comercial. Ver backend/utils/audiencia.js.
  SIGNUP: 'signup',
  SIGNUP_PATIENT: 'signup_patient',
  FIRST_PATIENT_ADDED: 'first_patient_added',
  FIRST_SESSION_RECORDED: 'first_session_recorded',
  FIRST_INVOICE: 'first_invoice',
  CHECKOUT_STARTED: 'checkout_started',
  PAID: 'paid',
  CHURNED: 'churned'
};

// Eventos de "primera vez": se registran una única vez por usuario.
const ONCE_BY_DEFAULT = new Set([
  EVENTS.SIGNUP,
  EVENTS.SIGNUP_PATIENT,
  EVENTS.FIRST_PATIENT_ADDED,
  EVENTS.FIRST_SESSION_RECORDED,
  EVENTS.FIRST_INVOICE
]);

let cachedClient = null;
let clientUnavailableLogged = false;

const getClient = () => {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    if (!clientUnavailableLogged) {
      console.warn('[events] Supabase no configurado — los eventos no se registran');
      clientUnavailableLogged = true;
    }
    return null;
  }
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cachedClient;
};

/**
 * Registra un evento de producto.
 *
 * @param {string} event    Nombre del evento (usa EVENTS.*).
 * @param {object} opts
 * @param {string} opts.userId  id de public.users (texto, no el auth_user_id).
 * @param {object} [opts.props] Metadata corta. Sin datos clínicos.
 * @param {boolean} [opts.once] Fuerza (o desactiva) la semántica "una sola vez".
 * @param {string|Date} [opts.at] Momento del evento; por defecto, ahora.
 * @returns {Promise<boolean>} true si la escritura no falló (un evento
 *   "primera vez" ya existente tambien devuelve true: PostgREST resuelve el
 *   duplicado con ON CONFLICT DO NOTHING, sin error). Nunca rechaza.
 */
export async function trackEvent(event, { userId, props = {}, once, at } = {}) {
  try {
    if (!event) return false;
    const supabase = getClient();
    if (!supabase) return false;

    const uid = userId == null ? null : String(userId);
    const isOnce = once === undefined ? ONCE_BY_DEFAULT.has(event) : !!once;

    const row = {
      user_id: uid,
      event,
      props: props && typeof props === 'object' ? props : {},
      dedupe_key: isOnce && uid ? `${event}:${uid}` : null
    };
    if (at) row.created_at = at instanceof Date ? at.toISOString() : at;

    const { error } = await supabase
      .from('product_events')
      .upsert([row], { onConflict: 'dedupe_key', ignoreDuplicates: true });

    if (error) {
      // 23505 = el evento "primera vez" ya existía. Es el caso normal, no un fallo.
      if (error.code === '23505') return false;
      console.warn(`[events] No se pudo registrar ${event}:`, error.message || error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[events] Error registrando ${event}:`, err?.message || err);
    return false;
  }
}

/**
 * Versión "dispara y olvida" para los handlers: no devuelve promesa que haya
 * que encadenar ni puede dejar un rechazo sin capturar.
 */
export function track(event, opts) {
  trackEvent(event, opts).catch(() => {});
}
