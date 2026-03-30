-- ============================================================
-- Migration: Tiered plans for psychologists + patient premium
-- ============================================================

-- 1. Add plan_id to the subscriptions table (jsonb data column)
--    Since subscriptions uses a simple (id, data, created_at) schema,
--    the plan info will be stored inside the data jsonb column.
--    No schema change needed for Supabase subscriptions table.

-- 2. Create patient_subscriptions table for patient premium (AI voice diary)
CREATE TABLE IF NOT EXISTS public.patient_subscriptions (
  id text NOT NULL,
  patient_user_id text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_status text, -- active, trialing, past_due, canceled
  plan_id text NOT NULL DEFAULT 'patient_premium', -- future-proof for more patient plans
  access_blocked boolean NOT NULL DEFAULT false,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end bigint, -- Unix timestamp (seconds)
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT patient_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT patient_subscriptions_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);

-- Index for fast lookups by patient
CREATE INDEX IF NOT EXISTS idx_patient_subscriptions_patient_user_id
  ON public.patient_subscriptions(patient_user_id);

-- Index for webhook lookups by Stripe customer/subscription
CREATE INDEX IF NOT EXISTS idx_patient_subscriptions_stripe_customer
  ON public.patient_subscriptions(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_patient_subscriptions_stripe_sub
  ON public.patient_subscriptions(stripe_subscription_id);

-- 3. Enable RLS on patient_subscriptions
ALTER TABLE public.patient_subscriptions ENABLE ROW LEVEL SECURITY;

-- Patients can read their own subscription
CREATE POLICY "patient_subscriptions_select_own" ON public.patient_subscriptions
  FOR SELECT USING (patient_user_id = auth.uid()::text);

-- Service role can do everything
CREATE POLICY "patient_subscriptions_service_all" ON public.patient_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Helper: count active relationships per psychologist (for plan enforcement)
CREATE OR REPLACE FUNCTION public.count_active_relationships(psych_id text)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM public.care_relationships
  WHERE psychologist_user_id = psych_id
    AND (active IS NULL OR active = true);
$$;
