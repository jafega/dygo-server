// cadencia.js — cuánto se puede insistir a la misma persona.
//
// La regla: NO se le manda un segundo email comercial a alguien que todavía no
// ha contestado al primero, hasta que pase un plazo. Si contesta, la regla se
// levanta sola y se le puede responder inmediatamente — eso es una
// conversación, no insistir.
//
// Vive aparte y no dentro de agent-api.js porque la tienen que compartir los
// tres sitios por los que sale correo comercial: los agentes, la aprobación
// manual de un borrador y las campañas de automatización. Cada uno de los tres
// creía que el control lo hacía otro, y así salieron dos emails a la misma
// persona con tres minutos de diferencia.
//
// Lo que NO cuenta como contacto previo:
//   - Un borrador: todavía no se ha escrito a nadie.
//   - El correo transaccional (facturas, recordatorios de sesión). No pasa por
//     admin_emails, así que esta consulta no lo ve, y es lo correcto: una
//     factura no es una insistencia comercial ni la bloquea.

/** Días por defecto antes de poder volver a escribir sin respuesta. */
export const DIAS_ENTRE_CONTACTOS = 7;

/**
 * ¿Hay un email comercial reciente a esta dirección sin respuesta?
 *
 * @returns {Promise<{bloqueado: boolean, motivo?: string, ultimoEnvio?: string,
 *                    diasDesde?: number, respondio?: boolean}>}
 */
export async function esperandoRespuesta(supabase, email, dias = DIAS_ENTRE_CONTACTOS) {
  if (!supabase || !email) return { bloqueado: false };

  const dir = String(email).trim();
  const variantes = dir === dir.toLowerCase() ? [dir] : [dir, dir.toLowerCase()];

  // Último email comercial que le salió de verdad. Se piden varios y se filtra
  // aquí: `resend_status` puede ser nulo en filas antiguas, y en PostgREST un
  // `neq` deja fuera los nulos, que es justo lo contrario de lo que interesa.
  // Ante la duda, una fila antigua cuenta como enviada: es el lado prudente.
  const { data: salidas, error } = await supabase
    .from('admin_emails')
    .select('id, created_at, subject, resend_status')
    .eq('mailbox', 'sales')
    .eq('direction', 'outbound')
    .in('to_email', variantes)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;

  const ultimo = (salidas || []).find(s => s.resend_status !== 'draft');
  if (!ultimo) return { bloqueado: false };

  const diasDesde = (Date.now() - new Date(ultimo.created_at).getTime()) / 86400000;
  if (diasDesde >= dias) return { bloqueado: false, ultimoEnvio: ultimo.created_at, diasDesde };

  // ¿Ha escrito ELLA después de ese envío? Si sí, la puerta se abre: responder
  // a quien te acaba de escribir no es insistir.
  const { count, error: errEntrada } = await supabase
    .from('admin_emails')
    .select('id', { count: 'exact', head: true })
    .eq('direction', 'inbound')
    .in('from_email', variantes)
    .gt('created_at', ultimo.created_at);
  if (errEntrada) throw errEntrada;

  if ((count || 0) > 0) {
    return { bloqueado: false, respondio: true, ultimoEnvio: ultimo.created_at, diasDesde };
  }

  return {
    bloqueado: true,
    motivo: 'espera_respuesta',
    ultimoEnvio: ultimo.created_at,
    diasDesde: Math.round(diasDesde * 10) / 10,
    respondio: false
  };
}

/** El plazo configurado, si hay uno en agent_config; si no, el de por defecto. */
export const diasDeCadencia = (config) => {
  const n = parseInt(config?.dias_entre_contactos, 10);
  return Number.isFinite(n) && n > 0 ? n : DIAS_ENTRE_CONTACTOS;
};
