// Matriz de permisos de mainds business (plan §1.3, backlog F1.1).
//
// Única fuente de verdad de "quién puede hacer qué" dentro de una clínica. Los
// handlers nunca comprueban roles a mano: preguntan `can(member, action)`.
//
// Reglas:
//   - Cada rol tiene un preset de acciones.
//   - El titular que además atiende pacientes (`is_clinical`) suma los
//     permisos clínicos de un psicólogo. Si no, NO ve la historia clínica:
//     solo puede usar el acceso de emergencia (break-glass), que se audita.
//   - `permissions_override = { revoke: [...], grant: [...] }`:
//       revoke quita cualquier acción salvo las reservadas al titular;
//       grant solo concede acciones DELEGABLES. Nunca concede clinical.*,
//       audit.*, org.* ni team.manage, y nada a recepción/contable que
//       toque datos clínicos.
//   - Un miembro que no está `active` no tiene ningún permiso.

export const ROLES = Object.freeze([
  'titular', 'gerente', 'director_clinico', 'psicologo', 'en_practicas', 'recepcion', 'contable'
]);

export const ROLE_LABELS = Object.freeze({
  titular: 'Titular',
  gerente: 'Gerente / Administración',
  director_clinico: 'Director/a clínico/a',
  psicologo: 'Psicólogo/a',
  en_practicas: 'Psicólogo/a en prácticas',
  recepcion: 'Recepción',
  contable: 'Contable / Gestoría'
});

export const ACTIONS = Object.freeze([
  'org.subscription', 'org.delete', 'org.settings',
  'team.manage',
  'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all', 'agenda.manage_own',
  'patients.contact_all', 'patients.contact_assigned',
  'clinical.read_assigned', 'clinical.read_all', 'clinical.break_glass',
  'billing.manage', 'billing.own', 'billing.read_export',
  'settlements.manage', 'settlements.own', 'settlements.read',
  'leads.manage', 'leads.assigned',
  'library.manage', 'library.consume',
  'audit.view'
]);

const ACTION_SET = new Set(ACTIONS);

// Roles que ocupan licencia (los que atienden pacientes). El titular, solo si
// es clínico.
export const CLINICAL_ROLES = Object.freeze(['director_clinico', 'psicologo', 'en_practicas']);

// Permisos clínicos de quien atiende pacientes (se suman al titular clínico).
const PRACTITIONER = [
  'agenda.view_busy', 'agenda.manage_own',
  'patients.contact_assigned',
  'clinical.read_assigned',
  'billing.own', 'settlements.own',
  'leads.assigned',
  'library.consume'
];

const PRESETS = {
  titular: [
    'org.subscription', 'org.delete', 'org.settings',
    'team.manage',
    'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all',
    'patients.contact_all',
    'clinical.break_glass',
    'billing.manage', 'billing.read_export',
    'settlements.manage', 'settlements.read',
    'leads.manage',
    'library.manage', 'library.consume',
    'audit.view'
  ],
  gerente: [
    'org.settings',
    'team.manage',
    'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all',
    'patients.contact_all',
    'billing.manage', 'billing.read_export',
    'settlements.manage', 'settlements.read',
    'leads.manage',
    'library.manage', 'library.consume'
  ],
  // El director también atiende pacientes: sus citas, su facturación y su liquidación.
  director_clinico: [
    ...PRACTITIONER,
    'agenda.view_all',
    'patients.contact_all',
    'clinical.read_all',
    'leads.manage',
    'library.manage',
    'audit.view'
  ],
  psicologo: [...PRACTITIONER],
  // En prácticas: sin facturación propia ni leads; sus notas las revisa el supervisor.
  en_practicas: [
    'agenda.view_busy', 'agenda.manage_own',
    'patients.contact_assigned',
    'clinical.read_assigned',
    'settlements.own',
    'library.consume'
  ],
  recepcion: [
    'agenda.view_all', 'agenda.view_busy', 'agenda.manage_all',
    'patients.contact_all',
    'billing.manage',
    'leads.manage'
  ],
  contable: [
    'billing.read_export',
    'settlements.read'
  ]
};

// Solo el titular. Ni se delegan ni se revocan.
export const OWNER_ONLY = Object.freeze(['org.subscription', 'org.delete']);

// Acciones que el gestor del equipo puede conceder a un miembro concreto.
export const DELEGABLE = Object.freeze([
  'agenda.view_all', 'agenda.manage_all',
  'patients.contact_all',
  'billing.manage', 'billing.read_export',
  'settlements.read',
  'leads.manage', 'leads.assigned',
  'library.manage'
]);

// Roles sin acceso a datos clínicos: no reciben nada que los exponga.
const NON_CLINICAL_ROLES = new Set(['recepcion', 'contable', 'gerente']);
const CLINICAL_DATA_ACTIONS = new Set(['clinical.read_assigned', 'clinical.read_all', 'clinical.break_glass', 'audit.view']);

export const isValidRole = (role) => ROLES.includes(role);
export const isValidAction = (action) => ACTION_SET.has(action);

/** ¿Este miembro ocupa licencia facturable? */
export function isSeatBillable(member) {
  if (!member) return false;
  if (CLINICAL_ROLES.includes(member.role)) return true;
  return member.role === 'titular' && !!member.is_clinical;
}

/** Acciones del preset de un rol (sin overrides). */
export function rolePreset(role, { isClinical = false } = {}) {
  const base = PRESETS[role];
  if (!base) return [];
  const set = new Set(base);
  if (role === 'titular' && isClinical) for (const a of PRACTITIONER) set.add(a);
  return [...set];
}

/**
 * Normaliza un override y descarta lo que no está permitido para ese rol.
 * @returns {{ revoke: string[], grant: string[] }}
 */
export function sanitizeOverride(role, override) {
  const o = override && typeof override === 'object' ? override : {};
  const uniq = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter(isValidAction))];
  const revoke = uniq(o.revoke).filter(a => !OWNER_ONLY.includes(a));
  const grant = uniq(o.grant).filter(a =>
    DELEGABLE.includes(a) &&
    !(NON_CLINICAL_ROLES.has(role) && CLINICAL_DATA_ACTIONS.has(a))
  );
  return { revoke, grant };
}

/**
 * Validación estricta para la API: devuelve el primer motivo de rechazo o null.
 * (La API rechaza en vez de descartar en silencio.)
 */
export function validateOverride(role, override) {
  if (override === undefined || override === null) return null;
  if (typeof override !== 'object' || Array.isArray(override)) return 'permissions_override debe ser un objeto { revoke, grant }';
  for (const key of Object.keys(override)) {
    if (key !== 'revoke' && key !== 'grant') return `Clave no válida en permissions_override: ${key}`;
  }
  for (const key of ['revoke', 'grant']) {
    const arr = override[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return `${key} debe ser una lista`;
    for (const a of arr) if (!isValidAction(a)) return `Acción desconocida: ${a}`;
  }
  for (const a of override.revoke || []) {
    if (OWNER_ONLY.includes(a)) return `No se puede quitar ${a}`;
  }
  for (const a of override.grant || []) {
    if (!DELEGABLE.includes(a)) return `No se puede conceder ${a}`;
    if (NON_CLINICAL_ROLES.has(role) && CLINICAL_DATA_ACTIONS.has(a)) return `No se puede conceder ${a} a ${role}`;
  }
  return null;
}

/** Lista final de acciones de un miembro (vacía si no está activo). */
export function effectivePermissions(member) {
  if (!member || member.status !== 'active' || !isValidRole(member.role)) return [];
  const set = new Set(rolePreset(member.role, { isClinical: !!member.is_clinical }));
  const { revoke, grant } = sanitizeOverride(member.role, member.permissions_override);
  for (const a of grant) set.add(a);
  for (const a of revoke) set.delete(a);
  if (member.role !== 'titular') for (const a of OWNER_ONLY) set.delete(a);
  return ACTIONS.filter(a => set.has(a));
}

/** ¿Puede este miembro hacer esta acción? */
export function can(member, action) {
  if (!isValidAction(action)) throw new Error(`Acción desconocida: ${action}`);
  return effectivePermissions(member).includes(action);
}

/** ¿El miembro atiende pacientes (tiene agenda/historia propias)? */
export function isPractitioner(member) {
  return effectivePermissions(member).includes('agenda.manage_own');
}
