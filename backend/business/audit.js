// Auditoría de accesos (tabla access_audit, migración business-001-foundations.sql).
//
// Registra QUIÉN accedió a QUÉ y cuándo (lecturas de historia clínica, accesos
// de emergencia, cambios sensibles). Se usa en Business y también en el
// espacio personal.
//
// Reglas:
//   - recordAccess() NUNCA lanza: una auditoría que falla no puede tumbar la
//     petición. Si no se puede escribir en access_audit, deja la entrada en el
//     auditLog de server.js (consola / audit.log).
//   - Nunca se guarda ni se loguea contenido clínico, ni nombres ni emails de
//     pacientes (R10): solo ids. La `justification` (motivo de un acceso de
//     emergencia) va a la tabla pero NO al log de respaldo.

const MAX_TEXT = 500;

const str = (v, max = 200) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, max));

/** Construye la fila de access_audit a partir de una entrada libre. */
export function buildAuditRow(entry = {}) {
  return {
    org_id: str(entry.org_id ?? entry.orgId),
    actor_user_id: str(entry.actor_user_id ?? entry.actorUserId),
    action: str(entry.action, 100),
    resource_type: str(entry.resource_type ?? entry.resourceType, 100),
    resource_id: str(entry.resource_id ?? entry.resourceId),
    patient_user_id: str(entry.patient_user_id ?? entry.patientUserId),
    justification: str(entry.justification, MAX_TEXT),
    ip: str(entry.ip, 100),
    at: entry.at ? new Date(entry.at).toISOString() : new Date().toISOString()
  };
}

const defaultFallback = (action, details) => {
  try { console.log(`[AUDIT] ${JSON.stringify({ timestamp: new Date().toISOString(), action, ...details })}`); } catch { /* nunca lanza */ }
};

/**
 * Guarda una entrada de auditoría. Devuelve true si quedó en access_audit y
 * false si se tuvo que usar el respaldo. Nunca lanza.
 * @param {object|null} store   Store de Business (o null si no hay).
 * @param {object} entry        { org_id?, actor_user_id, action, resource_type?, resource_id?, patient_user_id?, justification?, ip?, at? }
 * @param {{ fallback?: (action:string, details:object)=>void }} [opts]
 */
export async function recordAccess(store, entry, { fallback = defaultFallback } = {}) {
  let row;
  try {
    row = buildAuditRow(entry);
    if (!row.action || !row.actor_user_id) throw new Error('Entrada de auditoría incompleta');
    if (!store) throw new Error('Sin store');
    await store.insert('access_audit', row);
    return true;
  } catch (err) {
    try {
      const { justification, ...safe } = row || {};
      fallback('ACCESS_AUDIT_FALLBACK', {
        ...safe,
        has_justification: !!justification,
        reason: err?.code || err?.message || 'error'
      });
    } catch { /* ni el respaldo puede romper la petición */ }
    return false;
  }
}

/** Atajo para no pasar store y fallback en cada llamada. */
export function createAuditRecorder({ store, fallback } = {}) {
  return (entry) => recordAccess(store, entry, fallback ? { fallback } : undefined);
}
