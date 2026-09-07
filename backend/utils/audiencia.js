// audiencia.js — a quién se le puede escribir de ventas y a quién no.
//
// Regla dura del producto: las comunicaciones de captación, activación y
// seguimiento comercial van SOLO a psicólogos. Nunca a pacientes.
//
// No es una preferencia de estilo. Un paciente que recibe "añade tu primer
// paciente y empieza a usar mainds" entiende, con razón, que su terapeuta ha
// cedido su correo a un embudo de ventas. En un producto que maneja historia
// clínica eso es un daño de confianza que no se arregla con una disculpa.
//
// Qué SÍ sigue yendo a pacientes, y debe seguir yendo: los recordatorios de
// sus propias sesiones, las facturas, las invitaciones que les hace su
// psicólogo y los restablecimientos de contraseña. Son su cuenta y su
// tratamiento, no marketing. Esta regla no los toca.
//
// Criterio de decisión:
//   - Es usuario y is_psychologist = true  → se le puede escribir.
//   - Es usuario y is_psychologist = false → BLOQUEADO. Es un paciente.
//   - No es usuario de la app              → se le puede escribir. Es un
//     prospecto de una lista; no sabemos más, pero no consta como paciente.

const LOTE = 200;

const normalizar = (email) => String(email || '').trim().toLowerCase();

/**
 * De una lista de direcciones, devuelve las que pertenecen a un usuario que
 * NO es psicólogo. Son las que hay que excluir de cualquier envío comercial.
 *
 * Ante un fallo de lectura devuelve un conjunto vacío y lo registra. Es la
 * decisión menos mala: bloquear todos los envíos por un error transitorio de
 * red dejaría el sistema parado, y el registro deja rastro para revisarlo.
 *
 * @returns {Promise<Set<string>>} direcciones normalizadas a excluir
 */
export async function pacientes(supabase, emails) {
  const lista = [...new Set((emails || []).map(normalizar).filter(Boolean))];
  if (!supabase || lista.length === 0) return new Set();
  try {
    const encontrados = new Set();
    for (let i = 0; i < lista.length; i += LOTE) {
      const { data, error } = await supabase
        .from('users')
        .select('user_email, is_psychologist')
        .in('user_email', lista.slice(i, i + LOTE));
      if (error) throw error;
      for (const u of data || []) {
        if (!u.is_psychologist) encontrados.add(normalizar(u.user_email));
      }
    }
    return encontrados;
  } catch (err) {
    console.error('[audiencia] no se pudo comprobar el rol de los destinatarios:', err?.message || err);
    return new Set();
  }
}

/**
 * ¿Esta dirección es de un paciente? Atajo para un único destinatario.
 * Se usa como último cerrojo justo antes de enviar.
 */
export async function esPaciente(supabase, email) {
  return (await pacientes(supabase, [email])).has(normalizar(email));
}

/**
 * Filtra por id de usuario en vez de por email: lo que necesita el motor de
 * campañas, que trabaja con los usuarios ya cargados.
 *
 * @returns {Array} solo las filas de usuarios que son psicólogos
 */
export function soloPsicologos(filasDeUsuarios) {
  return (filasDeUsuarios || []).filter(u => u.is_psychologist === true);
}
