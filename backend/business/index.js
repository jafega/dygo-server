// mainds business — punto de entrada del backend.
//
// server.js solo hace `mountBusiness(app, {...})` (R5). Todo lo de clínicas vive
// en backend/business/* y sus datos en tablas propias (organizations, org_*),
// nunca en las tablas de mainds pro (D1).
//
// Rutas montadas:
//   /api/org/*          API privada (requiere sesión).
//   /api/public/org/*   API pública (página de la clínica, widget; Fase 4).
//
// Con BUSINESS_ENABLED apagado (o sin almacenamiento utilizable):
//   GET /api/org/me → 200 { enabled:false, memberships:[] }
//   cualquier otra ruta de /api/org y /api/public/org → 404

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFlags, resolveStoreDriver, canCreateOrganization } from './flags.js';
import { createStore } from './store.js';
import { asyncRoute, sendError, notFound } from './errors.js';
import { createAuditRecorder } from './audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STORE_FILE = path.resolve(__dirname, '..', '.business-store.local.json');

const DISABLED_ME = Object.freeze({ enabled: false, memberships: [] });

const emailOf = (user) => String(user?.email || user?.user_email || user?.data?.email || '').trim().toLowerCase();

/**
 * Crea los routers de Business.
 * @param {object} opts
 * @param {object|null} opts.store             Store (business/store.js) o null si Business no puede funcionar.
 * @param {Function} opts.authenticateRequest  Middleware de sesión de server.js (rellena req.authenticatedUserId).
 * @param {(email:string)=>boolean} opts.isSuperAdmin
 * @param {Function|null} [opts.stripe]        Factoría perezosa del cliente de Stripe (Fase 1).
 * @param {object} [opts.deps]                 { flags, getUser(id), auditLog(action, details) }
 * @returns {{ orgRouter: express.Router, publicRouter: express.Router, active: boolean, recordAccess: Function, ctx: object }}
 */
export function createBusinessRouter({ store, authenticateRequest, isSuperAdmin, stripe = null, deps = {} }) {
  if (typeof authenticateRequest !== 'function') throw new Error('createBusinessRouter necesita authenticateRequest');
  const flags = deps.flags || readFlags();
  const active = !!(flags.enabled && store);
  const getUser = typeof deps.getUser === 'function' ? deps.getUser : async () => null;
  const recordAccess = createAuditRecorder({ store, fallback: deps.auditLog });
  // Disponible para las rutas de fases siguientes.
  const ctx = { store, flags, isSuperAdmin, stripe, getUser, recordAccess };

  const orgRouter = express.Router();
  const publicRouter = express.Router();

  // GET /api/org/me — siempre existe; es lo único que llama el frontend de Pro.
  orgRouter.get('/me', authenticateRequest, asyncRoute(async (req, res) => {
    if (!active) return res.json(DISABLED_ME);

    let memberRows;
    try {
      memberRows = await store.list('org_members', { eq: { user_id: String(req.authenticatedUserId) }, limit: 100 });
    } catch (err) {
      // R2: tablas sin migrar → Business apagado para este usuario, nunca 500.
      if (err?.code === 'BUSINESS_NOT_MIGRATED') return res.json(DISABLED_ME);
      throw err;
    }

    const user = await getUser(req.authenticatedUserId);
    const canCreateOrg = canCreateOrganization(emailOf(user), { betaEmails: flags.betaEmails, isSuperAdmin });

    const memberships = [];
    for (const m of memberRows) {
      if (m.status !== 'active') continue;
      const org = await store.get('organizations', m.org_id);
      if (!org) continue;
      memberships.push({
        orgId: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url || null,
        role: m.role, status: m.status
      });
    }
    return res.json({ enabled: true, canCreateOrg, memberships });
  }));

  // Con Business apagado nada más existe (ni se pide sesión: no se revela nada).
  const gate = (req, res, next) => (active ? next() : sendError(res, notFound()));
  orgRouter.use(gate);
  publicRouter.use(gate);

  // Aquí se registrarán las rutas de las fases 1-5, que reciben `ctx`.

  orgRouter.use((req, res) => sendError(res, notFound()));
  publicRouter.use((req, res) => sendError(res, notFound()));

  return { orgRouter, publicRouter, active, recordAccess, ctx };
}

/**
 * Monta Business en la app de server.js. Nunca lanza: si algo falla, Pro sigue
 * funcionando y Business queda apagado.
 */
export function mountBusiness(app, {
  supabase = null,
  isServerless = false,
  authenticateRequest,
  isSuperAdmin,
  getUser,
  auditLog,
  stripe = null,
  env = process.env,
  logger = console
} = {}) {
  const flags = readFlags(env);
  let store = null;
  let reason = flags.enabled ? null : 'BUSINESS_ENABLED apagado';
  try {
    if (flags.enabled) {
      const r = resolveStoreDriver({ requested: flags.requestedStore, hasSupabase: !!supabase, isServerless });
      if (r.driver) {
        store = createStore({ driver: r.driver, supabase, file: flags.storeFile || DEFAULT_STORE_FILE });
      } else {
        reason = r.reason;
      }
    }
  } catch (err) {
    store = null;
    reason = `No se pudo crear el store: ${err?.message || err}`;
  }

  const { orgRouter, publicRouter, active } = createBusinessRouter({
    store, authenticateRequest, isSuperAdmin, stripe,
    deps: { flags, getUser, auditLog }
  });
  app.use('/api/org', orgRouter);
  app.use('/api/public/org', publicRouter);

  logger.log(active
    ? `🏥 mainds business ACTIVO (store: ${store.driver})`
    : `🏥 mainds business apagado (${reason})`);
  return { active, store, reason };
}
