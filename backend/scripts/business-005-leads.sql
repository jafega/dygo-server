-- business-005-leads.sql
--
-- mainds business — Fase 4 (captación): solicitudes de cita (leads) que llegan
-- por la página pública de la clínica, su widget o se apuntan a mano.
--
-- Reglas:
--   - Tablas propias (D1). RLS activado SIN políticas (solo service role).
--   - No se guarda la IP en claro: solo un hash con sal por clínica (ip_hash),
--     para limitar abusos.
--   - Base jurídica: consentimiento del interesado (consent_at + versión del
--     texto). Los leads descartados se purgan a los 12 meses.
--   - La configuración de la página pública vive en organizations.settings
--     (public_page) y el perfil público de cada profesional en
--     org_members.public_profile: no hacen falta columnas nuevas.
--   - Idempotente. Ejecutar a mano después de business-004.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.org_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  reason text,
  modality text,                          -- in_person | online | any
  preferences text,
  preferred_member_id uuid REFERENCES public.org_members(id) ON DELETE SET NULL,
  source text NOT NULL,                   -- web | widget | telefono | whatsapp | otro
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_at timestamptz,
  consent_version text,
  status text NOT NULL DEFAULT 'nuevo',   -- nuevo | contactado | primera_cita | paciente | descartado
  assigned_member_id uuid REFERENCES public.org_members(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  patient_id uuid REFERENCES public.org_patients(id) ON DELETE SET NULL,
  discarded_at timestamptz,
  converted_at timestamptz,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,   -- historial: [{at, by, type, from?, to?, note?}]
  ip_hash text,
  created_by text,
  CONSTRAINT org_leads_status_chk CHECK (status IN ('nuevo', 'contactado', 'primera_cita', 'paciente', 'descartado')),
  CONSTRAINT org_leads_source_chk CHECK (source IN ('web', 'widget', 'telefono', 'whatsapp', 'otro')),
  CONSTRAINT org_leads_contact_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_org_leads_org_status ON public.org_leads (org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_leads_assigned ON public.org_leads (assigned_member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_leads_ip ON public.org_leads (org_id, ip_hash, created_at DESC);
ALTER TABLE public.org_leads ENABLE ROW LEVEL SECURITY;

-- La página pública se busca por slug.
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations (slug);
