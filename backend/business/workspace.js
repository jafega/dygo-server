// Contexto de espacio de trabajo de una clínica (R8, R9).
//
// Toda ruta /api/org/:orgId/* pasa por authenticateRequest → requireMember.
//   - Si quien llama no es miembro activo de la organización → 404 (no se
//     revela que la organización existe).
//   - req.workspace = { orgId, org, member, permissions, can(action), access, plus }.
// Ser superadmin NO da acceso: el soporte usa /api/org/admin/* (sin datos clínicos).

import { effectivePermissions } from '../utils/orgPermissions.js';
import { asyncRoute, httpError, notFound, forbidden } from './errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de acceso de una organización (R9).
 * full: en prueba vigente o suscripción activa. read_only: el resto.
 */
export function orgAccess(org, now = new Date()) {
  if (!org) return { level: 'read_only', trial: false, trialDaysLeft: 0 };
  const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const inTrial = org.status === 'trialing' && !!trialEnd && trialEnd.getTime() > now.getTime();
  const trialDaysLeft = inTrial ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / DAY_MS)) : 0;
  if (inTrial) return { level: 'full', trial: true, trialDaysLeft };
  if (org.status === 'active') return { level: 'full', trial: false, trialDaysLeft: 0 };
  return { level: 'read_only', trial: false, trialDaysLeft: 0 };
}

/** ¿Tiene la organización las funciones de Business Plus? (En prueba, sí.) */
export function hasPlus(org, now = new Date()) {
  if (!org) return false;
  if (org.plan_id === 'plus' && org.status === 'active') return true;
  return orgAccess(org, now).trial;
}

/** Membresía activa de un usuario en una organización, o null. */
export async function findActiveMembership(store, orgId, userId) {
  if (!orgId || !userId) return null;
  const rows = await store.list('org_members', { eq: { org_id: String(orgId), user_id: String(userId) }, limit: 5 });
  return rows.find(m => m.status === 'active') || null;
}

/** Middleware: exige ser miembro activo de :orgId. */
export function requireMember(ctx) {
  const { store } = ctx;
  return asyncRoute(async (req, res, next) => {
    const orgId = String(req.params.orgId || '');
    // Los ids son uuid; cualquier otra cosa no existe (y no se consulta).
    if (!/^[0-9a-f-]{8,64}$/i.test(orgId)) throw notFound();
    const org = await store.get('organizations', orgId);
    if (!org) throw notFound();
    const member = await findActiveMembership(store, orgId, req.authenticatedUserId);
    if (!member) throw notFound();
    const permissions = effectivePermissions(member);
    const access = orgAccess(org);
    req.workspace = {
      orgId: org.id,
      org,
      member,
      permissions,
      can: (action) => permissions.includes(action),
      access,
      plus: hasPlus(org)
    };
    next();
  });
}

/** Middleware: exige una acción concreta (403 si falta). */
export const requireAction = (action) => (req, res, next) => {
  if (!req.workspace?.can(action)) return next(forbidden());
  return next();
};

/** Lanza 403 si el miembro no tiene la acción. Para usar dentro de handlers. */
export function assertCan(req, action) {
  if (!req.workspace?.can(action)) throw forbidden();
}

/** Lanza 402 si la organización no tiene Plus (R9). */
export function assertPlus(req) {
  if (!req.workspace?.plus) {
    throw httpError(402, 'PLAN_UPGRADE_REQUIRED', 'Esta función está incluida en mainds business Plus.');
  }
}

// Rutas que se pueden usar aunque la suscripción esté caducada (R9): pagar,
// salir de la clínica y reducir el equipo (para bajar licencias).
const READ_ONLY_EXEMPT = [
  /^\/billing(\/|$)/,
  /^\/leave$/,
  /^\/close$/, // cerrar una clínica caducada también tiene que poder hacerse
  /^\/members\/[^/]+\/suspend$/,
  /^\/members\/[^/]+$/ // DELETE (baja)
];

/**
 * Middleware (R9): con la suscripción caducada solo se puede leer. Las
 * mutaciones devuelven 402 salvo las exentas.
 */
export function enforceWritable(req, res, next) {
  const ws = req.workspace;
  if (!ws || ws.access.level === 'full') return next();
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  // req.path es relativo al punto de montaje /:orgId
  const rel = req.path || '';
  const exempt = READ_ONLY_EXEMPT.some(re => re.test(rel)) &&
    !(/^\/members\/[^/]+$/.test(rel) && req.method !== 'DELETE');
  if (exempt) return next();
  return next(httpError(402, 'ORG_SUBSCRIPTION_REQUIRED',
    'La suscripción de la clínica no está activa. El titular puede reactivarla desde Suscripción.'));
}
