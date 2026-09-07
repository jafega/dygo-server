// user-block.js — el bloqueo de cuentas, en un solo sitio.
//
// Un superadmin puede bloquear una cuenta desde el panel. Bloqueada significa
// dos cosas, y hacen falta las dos para que el bloqueo sirva de algo:
//
//   1. No entra: ni con contraseña, ni con Google, ni con la sesión que ya
//      tuviera abierta. Se corta en el middleware de autenticación, no en la
//      pantalla de login, para que ninguna ruta se quede sin cubrir.
//   2. No recibe correo: ni comercial ni transaccional. Ni facturas, ni
//      recordatorios de sesión, ni invitaciones. Nada.
//
// Es distinto de la baja de email_optouts (esa la pide el destinatario y solo
// para comercial) y distinto de access_blocked de las suscripciones (eso lo
// decide Stripe cuando no hay pago). Esto es una decisión manual de la casa.
//
// El bloqueo se guarda en columnas de la tabla users (blocked_at/by/reason),
// no en users.data: ver backend/scripts/add-user-blocked-columns.sql.

const norm = (email) => String(email || '').trim().toLowerCase();

// ── Caché del conjunto de ids bloqueados ─────────────────────────────────────
// authenticateRequest se ejecuta en TODAS las peticiones autenticadas, así que
// no puede pagar una consulta cada vez. Lo normal es que no haya ninguna cuenta
// bloqueada y la consulta devuelva cero filas, pero aun así una por petición
// serían miles al día por nada.
//
// El precio de la caché es que un bloqueo tarda hasta 60s en cerrar las sesiones
// abiertas de esa persona en instancias que no sean la que atendió el bloqueo.
// A cambio, el endpoint de bloqueo invalida la caché de su propia instancia y
// revoca sus tokens en memoria, así que en local y en la instancia caliente es
// inmediato.
const TTL_MS = 60 * 1000;
let cache = { ids: new Set(), cargadoEn: 0, valida: false };

export function invalidarCacheBloqueos() {
  cache = { ids: new Set(), cargadoEn: 0, valida: false };
}

/**
 * Ids de las cuentas bloqueadas. Cacheado 60s.
 *
 * Ante un fallo de lectura devuelve lo último que supiéramos (y si no sabíamos
 * nada, un conjunto vacío) y lo registra: un error transitorio de la base de
 * datos no puede dejar a todo el mundo fuera de la aplicación.
 */
export async function idsBloqueados(supabase, { force = false } = {}) {
  if (!supabase) return new Set();
  const fresca = cache.valida && (Date.now() - cache.cargadoEn) < TTL_MS;
  if (fresca && !force) return cache.ids;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .not('blocked_at', 'is', null);
    if (error) throw error;
    cache = {
      ids: new Set((data || []).map(r => String(r.id))),
      cargadoEn: Date.now(),
      valida: true
    };
    return cache.ids;
  } catch (err) {
    console.error('[user-block] no se pudo leer las cuentas bloqueadas:', err?.message || err);
    return cache.ids;
  }
}

/** ¿Está bloqueada esta cuenta? Por id de usuario. */
export async function bloqueadoPorId(supabase, userId) {
  if (!supabase || !userId) return false;
  return (await idsBloqueados(supabase)).has(String(userId));
}

/**
 * De entre las direcciones que se pasan, las que pertenecen a una cuenta
 * bloqueada. Una sola consulta: se llama antes de cualquier envío, incluidos
 * los masivos.
 *
 * Sin caché a propósito: aquí no hay problema de volumen (se llama una vez por
 * envío, no una por petición) y un email que se cuela a una cuenta bloqueada no
 * se puede desenviar.
 */
export async function emailsBloqueados(supabase, emails) {
  const lista = [...new Set((emails || []).map(norm).filter(Boolean))];
  if (!supabase || lista.length === 0) return new Set();
  try {
    const encontrados = new Set();
    const LOTE = 200;
    for (let i = 0; i < lista.length; i += LOTE) {
      const { data, error } = await supabase
        .from('users')
        .select('user_email')
        .in('user_email', lista.slice(i, i + LOTE))
        .not('blocked_at', 'is', null);
      if (error) throw error;
      for (const r of data || []) encontrados.add(norm(r.user_email));
    }
    return encontrados;
  } catch (err) {
    console.error('[user-block] no se pudo comprobar el bloqueo por email:', err?.message || err);
    return new Set();
  }
}

/** Atajo para un único destinatario. */
export async function emailBloqueado(supabase, email) {
  return (await emailsBloqueados(supabase, [email])).has(norm(email));
}
