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
import { readFlags, resolveStoreDriver } from './flags.js';
import { createStore } from './store.js';
import { asyncRoute, sendError, notFound } from './errors.js';
import { createAuditRecorder } from './audit.js';
import { requireMember, enforceWritable } from './workspace.js';
import { buildMe, registerTopLevelRoutes, registerScopedRoutes } from './orgs.js';
import {
  readPriceIds, createSeatSync, registerBillingRoutes, handleOrgStripeEvent, isOrgStripeEvent
} from './billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_STORE_FILE = path.resolve(__dirname, '..', '.business-store.local.json');

const DISABLED_ME = Object.freeze({ enabled: false, memberships: [] });

/**
 * Crea los routers de Business.
 * @param {object} opts
 * @param {object|null} opts.store             Store (business/store.js) o null si Business no puede funcionar.
 * @param {Function} opts.authenticateRequest  Middleware de sesión de server.js (rellena req.authenticatedUserId).
 * @param {(email:string)=>boolean} opts.isSuperAdmin
 * @param {Function|object|null} [opts.stripe] Cliente de Stripe o factoría perezosa.
 * @param {object} [opts.deps]                 { flags, getUser(id), auditLog(action, details), sendEmail, frontendUrl, prices, env }
 * @returns {{ orgRouter: express.Router, publicRouter: express.Router, active: boolean, recordAccess: Function, ctx: object, handleStripeEvent: Function }}
 */
export function createBusinessRouter({ store, authenticateRequest, isSuperAdmin, stripe = null, deps = {} }) {
  if (typeof authenticateRequest !== 'function') throw new Error('createBusinessRouter necesita authenticateRequest');
  const flags = deps.flags || readFlags(deps.env || process.env);
  const active = !!(flags.enabled && store);
  const getUser = typeof deps.getUser === 'function' ? deps.getUser : async () => null;
  const recordAccess = createAuditRecorder({ store, fallback: deps.auditLog });
  const prices = deps.prices || readPriceIds(deps.env || process.env);
  const frontendUrl = String(deps.frontendUrl || (deps.env || process.env).FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const seats = store ? createSeatSync({ store, stripe, prices }) : { sync: async () => ({ ok: false }) };
  const ctx = {
    store, flags, isSuperAdmin, stripe, getUser, recordAccess, authenticateRequest,
    prices, frontendUrl, seats, sendEmail: deps.sendEmail || null,
    deps
  };

  const orgRouter = express.Router();
  const publicRouter = express.Router();

  // GET /api/org/me — siempre existe; es lo único que llama el frontend de Pro.
  orgRouter.get('/me', authenticateRequest, asyncRoute(async (req, res) => {
    if (!active) return res.json(DISABLED_ME);
    try {
      const user = await getUser(req.authenticatedUserId);
      return res.json(await buildMe(ctx, user, req.authenticatedUserId));
    } catch (err) {
      // R2: tablas sin migrar → Business apagado para este usuario, nunca 500.
      if (err?.code === 'BUSINESS_NOT_MIGRATED') return res.json(DISABLED_ME);
      throw err;
    }
  }));

  // Con Business apagado nada más existe (ni se pide sesión: no se revela nada).
  const gate = (req, res, next) => (active ? next() : sendError(res, notFound()));
  orgRouter.use(gate);
  publicRouter.use(gate);

  // Nivel superior: crear clínica, invitaciones, soporte.
  registerTopLevelRoutes(orgRouter, ctx);

  // Rutas de una clínica: sesión → miembro activo → suscripción (R8, R9).
  const scoped = express.Router({ mergeParams: true });
  scoped.use(requireMember(ctx), enforceWritable);
  registerScopedRoutes(scoped, ctx);
  registerBillingRoutes(scoped, ctx);
  for (const register of deps.registerScoped || []) register(scoped, ctx);
  orgRouter.use('/:orgId', authenticateRequest, scoped);

  for (const register of deps.registerPublic || []) register(publicRouter, ctx);

  const fallthrough = (req, res) => sendError(res, notFound());
  const onError = (err, req, res, next) => sendError(res, err); // eslint-disable-line no-unused-vars
  orgRouter.use(fallthrough);
  orgRouter.use(onError);
  publicRouter.use(fallthrough);
  publicRouter.use(onError);

  const handleStripeEvent = async (event) => {
    if (!active) return { handled: isOrgStripeEvent(event), ok: true };
    return handleOrgStripeEvent({ store }, event);
  };

  return { orgRouter, publicRouter, active, recordAccess, ctx, handleStripeEvent, isOrgStripeEvent };
}

/**
 * Monta Business en la app de server.js. Nunca lanza: si algo falla, Pro sigue
 * funcionando y Business queda apagado.
 * @returns {{ active:boolean, store:object|null, reason:string|null, handleStripeEvent:Function, isOrgStripeEvent:Function }}
 */
export function mountBusiness(app, {
  supabase = null,
  isServerless = false,
  authenticateRequest,
  isSuperAdmin,
  getUser,
  auditLog,
  sendEmail = null,
  stripe = null,
  env = process.env,
  logger = console,
  extraDeps = {}
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

  const { orgRouter, publicRouter, active, handleStripeEvent } = createBusinessRouter({
    store, authenticateRequest, isSuperAdmin, stripe,
    deps: { flags, getUser, auditLog, sendEmail, env, ...extraDeps }
  });
  app.use('/api/org', orgRouter);
  app.use('/api/public/org', publicRouter);

  logger.log(active
    ? `🏥 mainds business ACTIVO (store: ${store.driver})`
    : `🏥 mainds business apagado (${reason})`);
  return { active, store, reason, handleStripeEvent, isOrgStripeEvent };
}
