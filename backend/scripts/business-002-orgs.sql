-- business-002-orgs.sql
--
-- mainds business — Fase 1 (núcleo multi-tenant): organizaciones (clínicas) y
-- sus miembros. Lo usan backend/business/orgs.js, workspace.js y billing.js.
--
-- Reglas (docs/business/BACKLOG.md, R7):
--   - Tablas propias: no se toca ninguna tabla de mainds pro (D1).
--   - RLS activado SIN políticas: solo el backend (service role) lee y escribe.
--   - users.id es text, así que user_id/created_by/invited_by son text.
--   - Idempotente: se puede ejecutar varias veces.
--
-- Ejecutar a mano en el SQL Editor de Supabase, después de business-001.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Organizaciones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  cif text,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_id text NOT NULL DEFAULT 'essential',          -- 'essential' | 'plus'
  billing_interval text NOT NULL DEFAULT 'month',     -- 'month' | 'year'
  status text NOT NULL DEFAULT 'trialing',            -- 'trialing' | 'active' | 'past_due' | 'canceled'
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  seats_billed integer,
  dpa_accepted_at timestamptz,
  dpa_version text,
  dpa_accepted_by text,
  created_by text NOT NULL,
  CONSTRAINT organizations_plan_chk CHECK (plan_id IN ('essential', 'plus')),
  CONSTRAINT organizations_interval_chk CHECK (billing_interval IN ('month', 'year')),
  CONSTRAINT organizations_status_chk CHECK (status IN ('trialing', 'active', 'past_due', 'canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key ON public.organizations (lower(slug));
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_sub ON public.organizations (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON public.organizations (stripe_customer_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ── Miembros ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text,                                       -- users.id; NULL hasta que acepta
  email text NOT NULL,                                -- en minúsculas
  display_name text,
  role text NOT NULL,                                 -- ver utils/orgPermissions.js
  is_clinical boolean NOT NULL DEFAULT false,         -- solo cuenta para el titular
  permissions_override jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { revoke: [], grant: [] }
  employment_type text NOT NULL DEFAULT 'employee',   -- 'employee' | 'freelance' | 'room_rental' | 'intern'
  billing_model text NOT NULL DEFAULT 'payroll',      -- 'payroll' | 'org_invoices' | 'psych_invoices' | 'fixed_rent'
  seat_billable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'invited',             -- 'invited' | 'active' | 'suspended' | 'left' | 'declined'
  invitation_token_hash text,
  invitation_expires_at timestamptz,
  invited_by text,
  joined_at timestamptz,
  left_at timestamptz,
  supervisor_member_id uuid REFERENCES public.org_members(id) ON DELETE SET NULL,
  irpf_rate numeric(5,2),
  public_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepts_leads boolean NOT NULL DEFAULT false,
  CONSTRAINT org_members_role_chk CHECK (role IN ('titular', 'gerente', 'director_clinico', 'psicologo', 'en_practicas', 'recepcion', 'contable')),
  CONSTRAINT org_members_status_chk CHECK (status IN ('invited', 'active', 'suspended', 'left', 'declined')),
  CONSTRAINT org_members_employment_chk CHECK (employment_type IN ('employee', 'freelance', 'room_rental', 'intern')),
  CONSTRAINT org_members_billing_chk CHECK (billing_model IN ('payroll', 'org_invoices', 'psych_invoices', 'fixed_rent'))
);

-- Un email aparece una sola vez por organización (las re-invitaciones reutilizan la fila).
CREATE UNIQUE INDEX IF NOT EXISTS org_members_org_email_key ON public.org_members (org_id, lower(email));
-- Una cuenta solo puede tener una membresía por organización.
CREATE UNIQUE INDEX IF NOT EXISTS org_members_org_user_key ON public.org_members (org_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_members_token_key ON public.org_members (invitation_token_hash) WHERE invitation_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON public.org_members (lower(email));
CREATE INDEX IF NOT EXISTS idx_org_members_org_status ON public.org_members (org_id, status);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.organizations IS 'mainds business F1: clínicas. RLS sin políticas (solo service role).';
COMMENT ON TABLE public.org_members IS 'mainds business F1: miembros de una clínica. RLS sin políticas (solo service role).';
