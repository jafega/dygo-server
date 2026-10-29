// Flags de mainds business (R1) y elección del driver de almacenamiento (R3).
//
//   BUSINESS_ENABLED       'true' para encender Business. Por defecto apagado.
//   BUSINESS_BETA_EMAILS   Lista separada por comas: solo esas cuentas (y los
//                          superadmin) pueden CREAR organizaciones. Los
//                          invitados se unen siempre.
//   BUSINESS_STORE         'supabase' | 'file' | 'memory'. Por defecto:
//                          supabase si hay cliente; si no, file.
//   BUSINESS_STORE_FILE    Ruta del fichero del driver file.
//   BUSINESS_DPA_VERSION   Versión vigente del contrato de encargo (DPA) que
//                          se acepta al crear una clínica.

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBool = (v) => TRUE_VALUES.has(String(v || '').trim().toLowerCase());

const parseList = (v) => String(v || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Borrador pendiente de revisión legal (docs/business/legal/DPA_v1.md).
export const DEFAULT_DPA_VERSION = 'v1-borrador';

export const STORE_DRIVERS = ['supabase', 'file', 'memory'];

export function readFlags(env = process.env) {
  return {
    enabled: parseBool(env.BUSINESS_ENABLED),
    betaEmails: parseList(env.BUSINESS_BETA_EMAILS),
    requestedStore: String(env.BUSINESS_STORE || '').trim().toLowerCase() || null,
    storeFile: String(env.BUSINESS_STORE_FILE || '').trim() || null,
    dpaVersion: String(env.BUSINESS_DPA_VERSION || '').trim() || DEFAULT_DPA_VERSION
  };
}

export const isBusinessEnabled = (env = process.env) => readFlags(env).enabled;

/**
 * ¿Puede esta cuenta crear organizaciones? Solo la lista beta y los superadmin.
 * @param {string} email
 * @param {{ betaEmails: string[], isSuperAdmin?: (email:string)=>boolean }} opts
 */
export function canCreateOrganization(email, { betaEmails = [], isSuperAdmin } = {}) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (typeof isSuperAdmin === 'function' && isSuperAdmin(e)) return true;
  return betaEmails.includes(e);
}

/**
 * Decide qué driver usar.
 * - Por defecto supabase si hay cliente; si no, file.
 * - En serverless sin Supabase Business queda deshabilitado (el FS es efímero).
 * - Un driver pedido que no se puede usar deja Business deshabilitado, nunca
 *   cae a otro en silencio.
 * @returns {{ driver: 'supabase'|'file'|'memory'|null, reason: string|null }}
 */
export function resolveStoreDriver({ requested = null, hasSupabase = false, isServerless = false } = {}) {
  if (requested && !STORE_DRIVERS.includes(requested)) {
    return { driver: null, reason: `BUSINESS_STORE desconocido: ${requested}` };
  }
  const driver = requested || (hasSupabase ? 'supabase' : 'file');
  if (driver === 'supabase' && !hasSupabase) {
    return { driver: null, reason: 'BUSINESS_STORE=supabase pero Supabase no está configurado' };
  }
  if (driver !== 'supabase' && isServerless) {
    return { driver: null, reason: 'En serverless Business solo funciona con Supabase' };
  }
  return { driver, reason: null };
}
