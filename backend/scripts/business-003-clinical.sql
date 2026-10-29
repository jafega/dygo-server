-- business-003-clinical.sql
--
-- mainds business — Fase 2 (operativa clínica): sedes y salas, pacientes de la
-- clínica, agenda, historia clínica cifrada y consentimientos.
--
-- Reglas (docs/business/BACKLOG.md):
--   - Tablas propias (D1). RLS activado SIN políticas (solo service role).
--   - El contenido clínico se guarda SIEMPRE cifrado por la aplicación
--     (content_enc = 'enc:v1:…', AES-256-GCM). La base de datos nunca lo ve en claro.
--   - Las notas de historia clínica no se editan ni se borran: se corrigen con
--     una nota nueva que apunta a la anterior (amends_note_id).
--   - Idempotente. Ejecutar a mano después de business-002.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Sedes y salas ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_org_locations_org ON public.org_locations (org_id);
ALTER TABLE public.org_locations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.org_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  hourly_rate numeric(10,2),              -- alquiler por hora (modelo "alquiler de despacho")
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_org_rooms_org ON public.org_rooms (org_id);
ALTER TABLE public.org_rooms ENABLE ROW LEVEL SECURITY;

-- ── Pacientes de la clínica ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  email text,
  phone text,
  birth_date date,
  tax_id text,                            -- NIF/NIE para facturar
  address text,
  admin_notes text,                       -- notas administrativas (NUNCA clínicas)
  assigned_member_ids uuid[] NOT NULL DEFAULT '{}',
  acquisition_source text NOT NULL DEFAULT 'own',   -- own | clinic_lead | referral | other
  lead_id uuid,
  status text NOT NULL DEFAULT 'active',  -- active | discharged | archived
  created_by text,
  CONSTRAINT org_patients_status_chk CHECK (status IN ('active', 'discharged', 'archived')),
  CONSTRAINT org_patients_source_chk CHECK (acquisition_source IN ('own', 'clinic_lead', 'referral', 'other'))
);
CREATE INDEX IF NOT EXISTS idx_org_patients_org ON public.org_patients (org_id, status);
CREATE INDEX IF NOT EXISTS idx_org_patients_assigned ON public.org_patients USING gin (assigned_member_ids);
ALTER TABLE public.org_patients ENABLE ROW LEVEL SECURITY;

-- ── Agenda ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members(id),
  patient_id uuid REFERENCES public.org_patients(id),
  location_id uuid REFERENCES public.org_locations(id),
  room_id uuid REFERENCES public.org_rooms(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',     -- scheduled | completed | cancelled | no_show
  service_type text NOT NULL DEFAULT 'session', -- session | first_visit | couple | family | group | evaluation | other
  modality text NOT NULL DEFAULT 'in_person',   -- in_person | online
  price numeric(10,2),
  psych_percent numeric(5,2),                   -- congelado al crear (Fase 3)
  psych_fixed_fee numeric(10,2),                -- congelado al crear (Fase 3)
  commission_rule_id uuid,
  invoice_id uuid,                              -- factura de la clínica (Fase 3)
  admin_notes text,                             -- NUNCA clínicas
  created_by text,
  CONSTRAINT org_appointments_range_chk CHECK (ends_at > starts_at),
  CONSTRAINT org_appointments_status_chk CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  CONSTRAINT org_appointments_modality_chk CHECK (modality IN ('in_person', 'online'))
);
CREATE INDEX IF NOT EXISTS idx_org_appt_org_start ON public.org_appointments (org_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_org_appt_member_start ON public.org_appointments (member_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_org_appt_room_start ON public.org_appointments (room_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_org_appt_patient ON public.org_appointments (patient_id);
ALTER TABLE public.org_appointments ENABLE ROW LEVEL SECURITY;

-- ── Historia clínica y anotaciones privadas ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.org_patients(id),
  author_member_id uuid NOT NULL REFERENCES public.org_members(id),
  appointment_id uuid REFERENCES public.org_appointments(id),
  visibility text NOT NULL,                 -- clinical_record | private_annotation
  content_enc text NOT NULL,                -- 'enc:v1:…' (cifrado por la aplicación)
  amends_note_id uuid REFERENCES public.org_clinical_notes(id),
  CONSTRAINT org_notes_visibility_chk CHECK (visibility IN ('clinical_record', 'private_annotation')),
  CONSTRAINT org_notes_encrypted_chk CHECK (content_enc LIKE 'enc:v1:%')
);
CREATE INDEX IF NOT EXISTS idx_org_notes_patient ON public.org_clinical_notes (patient_id, created_at);
ALTER TABLE public.org_clinical_notes ENABLE ROW LEVEL SECURITY;

-- La historia clínica es inmutable: ni el service role puede editarla o borrarla.
CREATE OR REPLACE FUNCTION public.org_clinical_notes_protect_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.visibility = 'clinical_record' THEN
    RAISE EXCEPTION 'Las notas de historia clínica no se modifican ni se borran (% bloqueado)', TG_OP
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_org_clinical_notes_protect ON public.org_clinical_notes;
CREATE TRIGGER trg_org_clinical_notes_protect
  BEFORE UPDATE OR DELETE ON public.org_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.org_clinical_notes_protect_record();

-- ── Consentimientos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_consent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_by text
);
CREATE INDEX IF NOT EXISTS idx_org_consent_templates_org ON public.org_consent_templates (org_id);
ALTER TABLE public.org_consent_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.org_patients(id),
  template_id uuid REFERENCES public.org_consent_templates(id),
  template_name text NOT NULL,
  template_version integer NOT NULL,
  content_snapshot text NOT NULL,           -- copia literal del texto aceptado
  content_sha256 text NOT NULL,
  method text NOT NULL,                     -- papel_firmado | aceptacion_presencial
  signed_at timestamptz NOT NULL,
  registered_by uuid REFERENCES public.org_members(id),
  revoked_at timestamptz,
  CONSTRAINT org_patient_consents_method_chk CHECK (method IN ('papel_firmado', 'aceptacion_presencial'))
);
CREATE INDEX IF NOT EXISTS idx_org_patient_consents_patient ON public.org_patient_consents (patient_id);
ALTER TABLE public.org_patient_consents ENABLE ROW LEVEL SECURITY;
