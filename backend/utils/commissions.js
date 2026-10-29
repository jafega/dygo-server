// Reglas de comisión de mainds business (backlog F3.5). Lógica pura.
//
// Una regla dice cuánto se queda el profesional de una cita: un porcentaje del
// precio (psych_percent) o un importe fijo (fixed_fee). Cada regla puede
// acotarse por miembro, tipo de servicio y origen del paciente ('clinic' si lo
// captó la clínica, 'own' si lo trajo el profesional), y tiene vigencia.
//
// Gana la regla vigente más específica:
//   miembro+servicio+origen > miembro+servicio > miembro+origen > miembro >
//   servicio+origen > servicio > origen > regla por defecto (sin acotar)
// y, a igual especificidad, la de valid_from más reciente.

export const LEAD_SOURCES = ['clinic', 'own'];

/** Origen a efectos de comisión a partir del paciente. */
export const leadSourceOf = (patient) => (patient?.acquisition_source === 'clinic_lead' ? 'clinic' : 'own');

const dayOf = (d) => {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d).toISOString().slice(0, 10);
};

/** ¿Está vigente la regla en esa fecha (YYYY-MM-DD)? */
export function isRuleActive(rule, date) {
  const day = dayOf(date);
  if (rule.active === false) return false;
  if (rule.valid_from && dayOf(rule.valid_from) > day) return false;
  if (rule.valid_to && dayOf(rule.valid_to) < day) return false;
  return true;
}

/** Especificidad de una regla (0 = por defecto, 7 = miembro+servicio+origen). */
export const specificity = (r) => (r.member_id ? 4 : 0) + (r.service_type ? 2 : 0) + (r.lead_source ? 1 : 0);

/**
 * Regla aplicable a una cita, o null.
 * @param {Array} rules
 * @param {{ memberId: string, serviceType?: string, leadSource?: 'clinic'|'own', date: string|Date }} ctx
 */
export function resolveRule(rules, { memberId, serviceType = 'session', leadSource = 'own', date }) {
  let best = null;
  for (const r of rules || []) {
    if (!isRuleActive(r, date)) continue;
    if (r.member_id && r.member_id !== memberId) continue;
    if (r.service_type && r.service_type !== serviceType) continue;
    if (r.lead_source && r.lead_source !== leadSource) continue;
    if (!best) { best = r; continue; }
    const a = specificity(r);
    const b = specificity(best);
    if (a > b || (a === b && dayOf(r.valid_from || '0000-01-01') > dayOf(best.valid_from || '0000-01-01'))) best = r;
  }
  return best;
}

/** Valores que se congelan en la cita al crearla. */
export function frozenTerms(rule) {
  if (!rule) return { psych_percent: null, psych_fixed_fee: null, commission_rule_id: null };
  return {
    psych_percent: rule.fixed_fee !== null && rule.fixed_fee !== undefined ? null : Number(rule.psych_percent),
    psych_fixed_fee: rule.fixed_fee !== null && rule.fixed_fee !== undefined ? Number(rule.fixed_fee) : null,
    commission_rule_id: rule.id || null
  };
}

/** Valida los datos de una regla. Devuelve el motivo del rechazo o null. */
export function validateRuleInput(r) {
  const hasPercent = r.psych_percent !== null && r.psych_percent !== undefined && r.psych_percent !== '';
  const hasFee = r.fixed_fee !== null && r.fixed_fee !== undefined && r.fixed_fee !== '';
  if (hasPercent === hasFee) return 'Indica un porcentaje o un importe fijo (solo uno de los dos).';
  if (hasPercent) {
    const p = Number(r.psych_percent);
    if (!Number.isFinite(p) || p < 0 || p > 100) return 'El porcentaje debe estar entre 0 y 100.';
  }
  if (hasFee) {
    const f = Number(r.fixed_fee);
    if (!Number.isFinite(f) || f < 0 || f > 100000) return 'Importe fijo no válido.';
  }
  if (r.lead_source && !LEAD_SOURCES.includes(r.lead_source)) return 'Origen no válido.';
  if (r.valid_from && !/^\d{4}-\d{2}-\d{2}$/.test(r.valid_from)) return 'Fecha de inicio no válida.';
  if (r.valid_to && !/^\d{4}-\d{2}-\d{2}$/.test(r.valid_to)) return 'Fecha de fin no válida.';
  if (r.valid_from && r.valid_to && r.valid_to < r.valid_from) return 'La fecha de fin es anterior a la de inicio.';
  return null;
}
