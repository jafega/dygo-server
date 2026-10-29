// Lógica pura de captación de mainds business (backlog F4). Sin E/S.

export const LEAD_STATUSES = ['nuevo', 'contactado', 'primera_cita', 'paciente', 'descartado'];
export const LEAD_SOURCES = ['web', 'widget', 'telefono', 'whatsapp', 'otro'];
export const MANUAL_SOURCES = ['telefono', 'whatsapp', 'otro', 'web'];
export const RETENTION_DISCARDED_DAYS = 365;

// Avances permitidos. 'paciente' solo se alcanza convirtiendo el lead.
const TRANSITIONS = {
  nuevo: ['contactado', 'primera_cita', 'descartado'],
  contactado: ['primera_cita', 'descartado', 'nuevo'],
  primera_cita: ['contactado', 'descartado'],
  descartado: ['nuevo'],
  paciente: []
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Siguiente profesional en el reparto rotatorio.
 * @param {string[]} eligibleIds   profesionales que aceptan leads (orden estable)
 * @param {string|null} lastAssignedId  el último al que se asignó un lead
 */
export function nextRoundRobin(eligibleIds, lastAssignedId) {
  const ids = [...eligibleIds].sort();
  if (!ids.length) return null;
  const i = lastAssignedId ? ids.indexOf(lastAssignedId) : -1;
  return ids[(i + 1) % ids.length];
}

/** "Laura Gómez Ruiz" → { first_name: 'Laura', last_name: 'Gómez Ruiz' } */
export function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0] || 'Sin nombre', last_name: parts.slice(1).join(' ') || null };
}

/** ¿Hay que purgar este lead (descartado hace más de 12 meses)? */
export function isPurgeable(lead, now = new Date()) {
  if (lead.status !== 'descartado' || !lead.discarded_at) return false;
  return now.getTime() - new Date(lead.discarded_at).getTime() > RETENTION_DISCARDED_DAYS * 24 * 3600 * 1000;
}

const rate = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Métricas de conversión por canal y por profesional. */
export function leadMetrics(leads) {
  const bySource = {};
  const byMember = {};
  let converted = 0;
  for (const l of leads) {
    const ok = l.status === 'paciente';
    if (ok) converted++;
    const s = (bySource[l.source] ||= { source: l.source, leads: 0, converted: 0 });
    s.leads++;
    if (ok) s.converted++;
    if (l.assigned_member_id) {
      const m = (byMember[l.assigned_member_id] ||= { member_id: l.assigned_member_id, leads: 0, converted: 0 });
      m.leads++;
      if (ok) m.converted++;
    }
  }
  const finish = (o) => Object.values(o).map(x => ({ ...x, rate: rate(x.converted, x.leads) })).sort((a, b) => b.leads - a.leads);
  return {
    total: leads.length,
    converted,
    rate: rate(converted, leads.length),
    by_status: Object.fromEntries(LEAD_STATUSES.map(st => [st, leads.filter(l => l.status === st).length])),
    by_source: finish(bySource),
    by_member: finish(byMember)
  };
}
