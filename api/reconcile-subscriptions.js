// reconcile-subscriptions.js — Stripe es la verdad, Supabase se ajusta.
//
// Por qué existe:
//   Hasta ahora el estado de pago de un psicólogo sólo se actualizaba cuando
//   llegaba un webhook. Si un webhook se perdía (despliegue, URL mal
//   configurada, timeout), la fila de `subscriptions` se quedaba desfasada en
//   cualquiera de las dos direcciones:
//     - Stripe canceled / Supabase active  → el usuario sigue usando la app gratis.
//     - Stripe active   / Supabase null    → el usuario que paga se queda fuera.
//   `/api/admin/sync-stripe-subscriptions` ya existía, pero es manual y sólo
//   corre cuando alguien abre el panel de superadmin. Esto lo hace cada día.
//
// Además emite los eventos `paid` y `churned` en product_events cuando detecta
// una transición, así que el embudo queda registrado aunque el webhook fallara.
//
// Nota sobre la fuente de verdad: la clave canónica en subscriptions.data es
// `stripe_status`. Un valor null significa "nunca pasó por Stripe" (fila de
// prueba creada al registrarse), no "desconocido".

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { trackEvent, EVENTS } from '../backend/utils/events.js';

export const config = { api: { bodyParser: true } };

const PSYCH_PLAN_IDS = ['starter', 'mainder', 'supermainder'];
const DEFAULT_PLAN = 'starter';
const ACTIVE_STATUSES = ['active', 'trialing'];
const CHURN_STATUSES = ['canceled', 'unpaid', 'incomplete_expired'];

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_ID_STARTER || process.env.STRIPE_PRICE_ID || '']: 'starter',
  [process.env.STRIPE_PRICE_ID_MAINDER || '']: 'mainder',
  [process.env.STRIPE_PRICE_ID_SUPERMAINDER || '']: 'supermainder'
};

export default async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurada' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase no configurado' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const dryRun = String(req.query?.dryRun || '') === '1';

  try {
    /* ── 1. Todas las suscripciones de Stripe (son pocas: sólo quien paga) ── */
    const stripeSubs = [];
    for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) {
      stripeSubs.push(sub);
    }

    /* ── 2. Estado actual en Supabase ── */
    const [subsRes, usersRes] = await Promise.all([
      supabase.from('subscriptions').select('id, data'),
      supabase.from('users').select('id, user_email').eq('is_psychologist', true)
    ]);
    if (subsRes.error) throw subsRes.error;
    if (usersRes.error) throw usersRes.error;

    const rowsById = {};
    for (const r of subsRes.data || []) rowsById[r.id] = { id: r.id, ...(r.data || {}) };

    const userIdByEmail = {};
    const knownUserIds = new Set();
    for (const u of usersRes.data || []) {
      knownUserIds.add(String(u.id));
      const email = (u.user_email || '').toLowerCase();
      if (email) userIdByEmail[email] = String(u.id);
    }

    /* ── 3. Emparejar cada suscripción de Stripe con un psicólogo ── */
    // Orden de resolución: metadata de la suscripción → metadata del cliente →
    // email del cliente. Es el mismo orden que usa el checkout al crearlas.
    const byUser = new Map();

    for (const s of stripeSubs) {
      if (s.metadata?.subscription_type === 'patient') continue; // otra tabla

      const customer = typeof s.customer === 'object' ? s.customer : null;
      const customerId = customer?.id || (typeof s.customer === 'string' ? s.customer : null);

      let userId = s.metadata?.psychologist_user_id
        || customer?.metadata?.user_id
        || (customer?.email ? userIdByEmail[customer.email.toLowerCase()] : null);

      if (!userId || !knownUserIds.has(String(userId))) continue;
      userId = String(userId);

      const isActiveLike = ACTIVE_STATUSES.includes(s.status) || ['past_due', 'incomplete'].includes(s.status);
      const prev = byUser.get(userId);

      // Un usuario puede tener varias suscripciones históricas: gana la activa
      // y, a igualdad, la más reciente.
      if (!prev
        || (isActiveLike && !prev.isActiveLike)
        || (isActiveLike === prev.isActiveLike && (s.created || 0) > (prev.sub.created || 0))) {
        byUser.set(userId, { sub: s, customerId, isActiveLike });
      }
    }

    /* ── 4. Comparar y corregir ── */
    const changes = [];
    const errors = [];

    for (const [userId, info] of byUser.entries()) {
      const row = rowsById[userId] || { id: userId };
      const s = info.sub;

      const activePriceId = s.items?.data?.[0]?.price?.id;
      let planId = row.plan_id || DEFAULT_PLAN;
      if (activePriceId && PRICE_TO_PLAN[activePriceId]) planId = PRICE_TO_PLAN[activePriceId];
      else if (s.metadata?.plan_id && PSYCH_PLAN_IDS.includes(s.metadata.plan_id)) planId = s.metadata.plan_id;

      const next = {
        psychologist_user_id: userId,
        stripe_customer_id: info.customerId,
        stripe_subscription_id: s.id,
        stripe_status: s.status,
        plan_id: planId,
        access_blocked: !ACTIVE_STATUSES.includes(s.status),
        quantity: s.items?.data?.[0]?.quantity ?? row.quantity ?? 0,
        cancel_at_period_end: s.cancel_at_period_end ?? false,
        current_period_end: s.items?.data?.[0]?.current_period_end ?? s.current_period_end ?? null,
        trial_started_at: row.trial_started_at ?? null
      };

      const drifted = Object.keys(next).some(k => {
        if (k === 'trial_started_at') return false;
        return row[k] !== next[k];
      });
      if (!drifted) continue;

      const wasActive = ACTIVE_STATUSES.includes(row.stripe_status);
      const isActive = ACTIVE_STATUSES.includes(next.stripe_status);

      const change = {
        user_id: userId,
        from: row.stripe_status ?? null,
        to: next.stripe_status,
        plan_id: next.plan_id,
        transition: !wasActive && isActive ? 'paid'
          : wasActive && !isActive ? 'churned'
            : 'drift'
      };

      if (dryRun) {
        changes.push({ ...change, applied: false });
        continue;
      }

      const { error } = await supabase
        .from('subscriptions')
        .upsert([{ id: userId, data: next }], { onConflict: 'id' });

      if (error) {
        errors.push({ user_id: userId, error: error.message || String(error) });
        continue;
      }

      // El evento sólo se emite si el webhook no lo registró ya: `paid` y
      // `churned` no son "una sola vez", así que se deduplica comprobando que
      // no haya uno igual en las últimas 24 h.
      if (change.transition === 'paid' || change.transition === 'churned') {
        const event = change.transition === 'paid' ? EVENTS.PAID : EVENTS.CHURNED;
        const { count } = await supabase
          .from('product_events')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('event', event)
          .gte('created_at', new Date(Date.now() - 86400000).toISOString());

        if (!count) {
          await trackEvent(event, {
            userId,
            once: false,
            props: {
              plan_id: next.plan_id,
              stripe_status: next.stripe_status,
              source: 'reconcile-subscriptions'
            }
          });
        }
      }

      changes.push({ ...change, applied: true });
    }

    /* ── 5. Filas de Supabase que dicen "activo" y Stripe no conoce ── */
    // Caso peligroso: acceso concedido sin cobro detrás.
    const orphans = [];
    for (const [id, row] of Object.entries(rowsById)) {
      if (!ACTIVE_STATUSES.includes(row.stripe_status)) continue;
      if (byUser.has(id)) continue;
      orphans.push({ user_id: id, stripe_status: row.stripe_status, stripe_subscription_id: row.stripe_subscription_id || null });
    }

    const summary = {
      ok: true,
      dry_run: dryRun,
      stripe_subscriptions: stripeSubs.length,
      matched: byUser.size,
      changed: changes.length,
      paid: changes.filter(c => c.transition === 'paid').length,
      churned: changes.filter(c => c.transition === 'churned').length,
      drift: changes.filter(c => c.transition === 'drift').length,
      orphans_active_in_supabase_only: orphans,
      errors,
      changes
    };

    console.log(`[reconcile-subscriptions] ${summary.changed} filas corregidas de ${summary.matched} emparejadas`
      + (orphans.length ? ` | ${orphans.length} activas sin respaldo en Stripe` : ''));

    return res.status(200).json(summary);
  } catch (err) {
    console.error('[reconcile-subscriptions] error:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'reconciliación fallida' });
  }
}
