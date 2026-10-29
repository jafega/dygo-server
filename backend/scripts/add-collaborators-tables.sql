-- add-collaborators-tables.sql
--
-- Programa de colaboradores de mainds (ver backend/utils/colaboradores.js).
--
-- Un colaborador es un usuario al que un superadmin da de alta. Mientras está
-- activo tiene mainds premium sin pagar, y los códigos de descuento que el
-- superadmin le crea (en Stripe) le traen leads. Por cada lead que paga gana
-- dinero según la estructura de pagos que el superadmin elige para él:
--
--   one_time  → un pago fijo por lead cuando el lead lleva X meses pagados.
--   recurring → cada mes que el lead paga: un importe fijo, o un % de lo que
--               paga (sin IVA). Opcionalmente con un tope de meses.
--
-- Lo ganado va a una "bolsa": collaborator_earnings es un libro de apuntes.
-- Las ganancias suman y los pagos que hace el superadmin restan. El saldo es la
-- suma. Nunca se edita un apunte: si algo está mal se corrige con un ajuste.
--
-- Run this in Supabase SQL Editor. Idempotente: se puede ejecutar varias veces.

-- ═══════════════════════════════════════════════════════════════
-- 1. collaborators — quién es colaborador y cómo se le paga
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.collaborators (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  user_id text NOT NULL UNIQUE REFERENCES public.users(id),
  email text,
  name text,

  -- Activo = tiene premium incluido, ve su área y sus leads generan dinero.
  active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,

  -- Estructura de pagos
  payout_model text NOT NULL DEFAULT 'recurring'
    CHECK (payout_model IN ('one_time', 'recurring')),
  -- 'fixed' = payout_amount € ; 'percent' = payout_percent % de lo que paga el lead (sin IVA).
  -- En one_time solo tiene sentido 'fixed'.
  payout_amount_type text NOT NULL DEFAULT 'fixed'
    CHECK (payout_amount_type IN ('fixed', 'percent')),
  payout_amount numeric(10,2) NOT NULL DEFAULT 0,
  payout_percent numeric(5,2) NOT NULL DEFAULT 0,
  -- one_time: meses pagados que tiene que llevar el lead para generar el pago.
  payout_min_months integer NOT NULL DEFAULT 1 CHECK (payout_min_months >= 1),
  -- recurring: tope de meses que se pagan por lead. NULL = sin tope.
  payout_max_months integer CHECK (payout_max_months IS NULL OR payout_max_months >= 1),

  notes text,
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_collaborators_active ON public.collaborators(active);

-- ═══════════════════════════════════════════════════════════════
-- 2. collaborator_codes — códigos de descuento (promotion codes de Stripe)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.collaborator_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,

  code text NOT NULL,
  percent_off numeric(5,2) NOT NULL,
  -- NULL = el descuento dura para siempre.
  duration_months integer,
  max_redemptions integer,

  stripe_coupon_id text NOT NULL,
  stripe_promotion_code_id text NOT NULL UNIQUE,

  active boolean NOT NULL DEFAULT true,
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_collaborator_codes_collab ON public.collaborator_codes(collaborator_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_codes_code ON public.collaborator_codes(upper(code));

-- ═══════════════════════════════════════════════════════════════
-- 3. collaborator_referrals — cada suscripción que entró con un código
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.collaborator_referrals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  code_id uuid REFERENCES public.collaborator_codes(id) ON DELETE SET NULL,
  code text,

  referred_user_id text,
  referred_email text,
  referred_name text,
  subscription_type text,         -- 'psychologist' | 'patient'
  plan_id text,

  stripe_customer_id text,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_status text,

  -- Facturas cobradas (> 0 €). Sirve de contador de meses y de idempotencia.
  paid_invoice_ids jsonb NOT NULL DEFAULT '[]',
  months_paid integer NOT NULL DEFAULT 0,
  total_paid numeric(10,2) NOT NULL DEFAULT 0,
  first_paid_at timestamptz,
  last_paid_at timestamptz,
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_collaborator_referrals_collab ON public.collaborator_referrals(collaborator_id);

-- ═══════════════════════════════════════════════════════════════
-- 4. collaborator_earnings — la bolsa (libro de apuntes)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.collaborator_earnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  collaborator_id uuid NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.collaborator_referrals(id) ON DELETE SET NULL,

  -- one_time / recurring: ganancias (positivas). payout: pago al colaborador
  -- (negativo). adjustment: corrección manual (cualquier signo).
  type text NOT NULL CHECK (type IN ('one_time', 'recurring', 'payout', 'adjustment')),
  amount numeric(10,2) NOT NULL,
  description text,
  stripe_invoice_id text,
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_collaborator_earnings_collab ON public.collaborator_earnings(collaborator_id);
-- Idempotencia del webhook de Stripe: una factura no genera dos veces dinero,
-- y un lead no genera dos veces el pago único.
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_earnings_invoice
  ON public.collaborator_earnings(stripe_invoice_id, type) WHERE stripe_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_earnings_one_time
  ON public.collaborator_earnings(referral_id) WHERE type = 'one_time';

-- Solo el backend (service role) toca estas tablas.
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_earnings ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- 5. Un cliente, un colaborador (para siempre)
-- ═══════════════════════════════════════════════════════════════
-- El lead es el cliente, no la suscripción: si cancela y vuelve, la nueva
-- suscripción se cuelga de la misma fila (ver referidoDeSuscripcion).
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_referrals_user
  ON public.collaborator_referrals(referred_user_id) WHERE referred_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_collaborator_referrals_customer
  ON public.collaborator_referrals(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
