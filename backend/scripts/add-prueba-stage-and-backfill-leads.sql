-- Migration: Add 'prueba' stage to leads + backfill existing psychologists as leads
-- Run this in Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- 1. Update the CHECK constraint to include 'prueba' stage
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_stage_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_stage_check
  CHECK (stage IN ('new','prueba','contacted','demo','won','lost','cancelled'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Move existing app_registration leads in 'demo' to 'prueba'
--    (those auto-created at signup that haven't been contacted yet)
-- ═══════════════════════════════════════════════════════════════
UPDATE public.leads
SET stage = 'prueba', updated_at = now()
WHERE source = 'app_registration'
  AND stage = 'demo'
  AND app_is_subscribed = false;

-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill: insert psychologists who registered but don't have
--    a lead record yet
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.leads (
  email, name, phone, company, source, stage,
  app_user_id, app_registered_at, app_plan, app_is_subscribed
)
SELECT
  lower(u.user_email)                         AS email,
  u.data->>'name'                             AS name,
  u.data->>'phone'                            AS phone,
  NULL                                        AS company,
  'app_registration'                          AS source,
  -- Determine stage based on current subscription status
  CASE
    WHEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = u.id
        AND (s.data->>'stripe_status') IN ('active','trialing')
    ) THEN 'won'
    WHEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = u.id
        AND ((s.data->>'stripe_status') = 'canceled' OR (s.data->>'cancel_at_period_end')::boolean = true)
    ) THEN 'cancelled'
    ELSE 'prueba'
  END                                         AS stage,
  u.id                                        AS app_user_id,
  now()                                       AS app_registered_at,
  (SELECT s.data->>'plan_id' FROM public.subscriptions s
   WHERE s.id = u.id
   ORDER BY s.created_at DESC LIMIT 1)        AS app_plan,
  COALESCE(
    (SELECT (s.data->>'stripe_status') IN ('active','trialing') FROM public.subscriptions s
     WHERE s.id = u.id
     ORDER BY s.created_at DESC LIMIT 1),
    false
  )                                           AS app_is_subscribed
FROM public.users u
WHERE u.is_psychologist = true
  AND u.user_email IS NOT NULL
  AND lower(u.user_email) NOT IN (SELECT lower(l.email) FROM public.leads l)
ON CONFLICT (email) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. Create activity records for backfilled leads
-- ═══════════════════════════════════════════════════════════════
INSERT INTO public.lead_activities (lead_id, type, title, metadata)
SELECT
  l.id,
  'app_event',
  'Lead creado por backfill de usuarios existentes',
  jsonb_build_object('event', 'backfill', 'user_id', l.app_user_id)
FROM public.leads l
WHERE l.source = 'app_registration'
  AND l.app_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_activities la
    WHERE la.lead_id = l.id
  );
