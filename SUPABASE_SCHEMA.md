-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.bono (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  psychologist_user_id text NOT NULL,
  pacient_user_id text NOT NULL,
  total_sessions_amount integer NOT NULL CHECK (total_sessions_amount > 0),
  total_price_bono_amount double precision NOT NULL CHECK (total_price_bono_amount > 0::double precision),
  invoice_id text,
  paid boolean NOT NULL DEFAULT false,
  percent_psych double precision CHECK (percent_psych <= 100::double precision),
  CONSTRAINT bono_pkey PRIMARY KEY (id),
  CONSTRAINT bono_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT bono_pacient_user_id_fkey FOREIGN KEY (pacient_user_id) REFERENCES public.users(id),
  CONSTRAINT bono_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.care_relationships (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text NOT NULL,
  default_session_price double precision NOT NULL,
  default_psych_percent double precision NOT NULL,
  center_id text,
  active boolean,
  historical_info text,
  patientnumber bigint,
  status text,
  CONSTRAINT care_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT care_relationships_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.center(id)
);
CREATE TABLE public.center (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  center_name text NOT NULL,
  cif text NOT NULL,
  address text NOT NULL,
  psychologist_user_id text NOT NULL,
  nombre_comercial text,
  direccion_comercial text,
  CONSTRAINT center_pkey PRIMARY KEY (id),
  CONSTRAINT center_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.dispo (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  CONSTRAINT dispo_pkey PRIMARY KEY (id),
  CONSTRAINT dipo_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.entries (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  creator_user_id text NOT NULL,
  target_user_id text NOT NULL,
  entry_type text NOT NULL,
  center_id text,
  transcript text,
  summary text,
  CONSTRAINT entries_pkey PRIMARY KEY (id),
  CONSTRAINT entries_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT entries_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id),
  CONSTRAINT entries_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.center(id)
);
CREATE TABLE public.goals (
  id text NOT NULL,
  data jsonb NOT NULL,
  patient_user_id text NOT NULL,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.invitations (
  id text NOT NULL,
  data jsonb NOT NULL,
  psychologist_user_id text NOT NULL,
  patient_user_id text,
  psychologist_email text,
  invited_patient_email text,
  CONSTRAINT invitations_pkey PRIMARY KEY (id),
  CONSTRAINT invitations_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT invitations_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.invoices (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text,
  amount double precision NOT NULL,
  tax double precision NOT NULL,
  total double precision NOT NULL,
  status text NOT NULL,
  psych_invoice_id text,
  invoice_date date NOT NULL,
  invoiceNumber text NOT NULL,
  irpf_percent double precision,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT invoices_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.patient_subscriptions (
  id text NOT NULL,
  patient_user_id text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_status text,
  plan_id text NOT NULL DEFAULT 'patient_premium'::text,
  access_blocked boolean NOT NULL DEFAULT false,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  current_period_end bigint,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT patient_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT patient_subscriptions_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.psychologist_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  psychologist_user_id text NOT NULL,
  name text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL DEFAULT ''::text,
  file_type text NOT NULL DEFAULT 'application/octet-stream'::text,
  CONSTRAINT psychologist_materials_pkey PRIMARY KEY (id),
  CONSTRAINT psychologist_materials_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.psychologist_profiles (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id text NOT NULL,
  locations ARRAY,
  CONSTRAINT psychologist_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT psychologist_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.session_entry (
  id text NOT NULL,
  data jsonb NOT NULL,
  creator_user_id text NOT NULL,
  target_user_id text NOT NULL,
  status text NOT NULL,
  summary text,
  transcript text,
  session_id text,
  CONSTRAINT session_entry_pkey PRIMARY KEY (id),
  CONSTRAINT session_entry_session_id_unique UNIQUE (session_id),
  CONSTRAINT session_entry_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT session_entry_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id),
  CONSTRAINT session_entry_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.sessions (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'::text CHECK (status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text, 'available'::text])),
  starts_on timestamp with time zone NOT NULL,
  ends_on timestamp with time zone NOT NULL,
  price double precision NOT NULL,
  paid boolean NOT NULL,
  percent_psych double precision NOT NULL CHECK (percent_psych <= 100::double precision AND percent_psych >= 0::double precision),
  session_entry_id text,
  invoice_id text,
  bonus_id bigint,
  session_name text,
  calendar_id text,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT sessions_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id),
  CONSTRAINT sessions_session_entry_id_fkey FOREIGN KEY (session_entry_id) REFERENCES public.session_entry(id),
  CONSTRAINT sessions_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT sessions_bonus_id_fkey FOREIGN KEY (bonus_id) REFERENCES public.bono(id)
);
CREATE TABLE public.settings (
  id text NOT NULL,
  data jsonb NOT NULL,
  user_id text,
  CONSTRAINT settings_pkey PRIMARY KEY (id),
  CONSTRAINT settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.signatures (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  template_id bigint,
  psych_user_id text NOT NULL,
  patient_user_id text NOT NULL,
  content text NOT NULL,
  signed boolean NOT NULL,
  signature_date timestamp with time zone,
  external_document_url text,
  CONSTRAINT signatures_pkey PRIMARY KEY (id),
  CONSTRAINT signatures_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id),
  CONSTRAINT signatures_psych_user_id_fkey FOREIGN KEY (psych_user_id) REFERENCES public.users(id),
  CONSTRAINT signatures_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.subscriptions (
  id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.templates (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  content text NOT NULL,
  psych_user_id text,
  master boolean,
  template_name text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  CONSTRAINT templates_pkey PRIMARY KEY (id),
  CONSTRAINT templates_psych_user_id_fkey FOREIGN KEY (psych_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id text NOT NULL,
  data jsonb NOT NULL,
  is_psychologist boolean NOT NULL DEFAULT false,
  user_email text,
  psychologist_profile_id text,
  auth_user_id uuid,
  master boolean,
  invitation_token text,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id),
  CONSTRAINT users_psychologist_profile_id_fkey FOREIGN KEY (psychologist_profile_id) REFERENCES public.psychologist_profiles(id)
);
CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email text NOT NULL,
  name text,
  phone text,
  company text,
  source text DEFAULT 'manual'::text,
  stage text NOT NULL DEFAULT 'new'::text CHECK (stage = ANY (ARRAY['new'::text, 'contacted'::text, 'demo'::text, 'won'::text, 'lost'::text, 'cancelled'::text])),
  app_user_id text,
  app_registered_at timestamp with time zone,
  app_plan text,
  app_is_subscribed boolean DEFAULT false,
  assigned_to text,
  tags text[] DEFAULT '{}'::text[],
  notes_count integer DEFAULT 0,
  last_contacted_at timestamp with time zone,
  CONSTRAINT leads_pkey PRIMARY KEY (id),
  CONSTRAINT leads_email_key UNIQUE (email),
  CONSTRAINT leads_app_user_id_fkey FOREIGN KEY (app_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.lead_activities (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  lead_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['note'::text, 'email_sent'::text, 'email_received'::text, 'email_bulk'::text, 'document'::text, 'stage_change'::text, 'app_event'::text])),
  title text,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by text,
  CONSTRAINT lead_activities_pkey PRIMARY KEY (id),
  CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE
);
CREATE TABLE public.lead_email_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  variables text[] DEFAULT '{}'::text[],
  created_by text,
  CONSTRAINT lead_email_templates_pkey PRIMARY KEY (id)
);
-- ═══ mainds business (backend/scripts/business-00N-*.sql) ═══
-- business-001-foundations.sql — Fase 0. RLS activado sin políticas; solo inserción (trigger).
CREATE TABLE public.access_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  at timestamp with time zone NOT NULL DEFAULT now(),
  org_id uuid,
  actor_user_id text NOT NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  patient_user_id text,
  justification text,
  ip text,
  CONSTRAINT access_audit_pkey PRIMARY KEY (id)
);
-- business-002-orgs.sql — Fase 1. RLS activado sin políticas.
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL,              -- único (lower)
  legal_name text,
  cif text,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_id text NOT NULL DEFAULT 'essential',        -- essential | plus
  billing_interval text NOT NULL DEFAULT 'month',   -- month | year
  status text NOT NULL DEFAULT 'trialing',          -- trialing | active | past_due | canceled
  trial_ends_at timestamp with time zone,
  stripe_customer_id text,
  stripe_subscription_id text,
  seats_billed integer,
  dpa_accepted_at timestamp with time zone,
  dpa_version text,
  dpa_accepted_by text,
  created_by text NOT NULL,
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.org_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,            -- FK organizations(id) ON DELETE CASCADE
  user_id text,                    -- users.id (NULL hasta aceptar); único por org
  email text NOT NULL,             -- único por org (lower)
  display_name text,
  role text NOT NULL,              -- titular | gerente | director_clinico | psicologo | en_practicas | recepcion | contable
  is_clinical boolean NOT NULL DEFAULT false,
  permissions_override jsonb NOT NULL DEFAULT '{}'::jsonb,
  employment_type text NOT NULL DEFAULT 'employee', -- employee | freelance | room_rental | intern
  billing_model text NOT NULL DEFAULT 'payroll',    -- payroll | org_invoices | psych_invoices | fixed_rent
  seat_billable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'invited',           -- invited | active | suspended | left | declined
  invitation_token_hash text,                       -- sha256 del token; único
  invitation_expires_at timestamp with time zone,
  invited_by text,
  joined_at timestamp with time zone,
  left_at timestamp with time zone,
  supervisor_member_id uuid,       -- FK org_members(id)
  irpf_rate numeric(5,2),
  public_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepts_leads boolean NOT NULL DEFAULT false,
  CONSTRAINT org_members_pkey PRIMARY KEY (id)
);
-- business-003-clinical.sql — Fase 2. RLS activado sin políticas. Ver el fichero
-- para índices, CHECKs y el trigger que hace inmutables las notas de historia.
-- org_locations(id, org_id, name, address, active)
-- org_rooms(id, org_id, location_id, name, hourly_rate, active)
-- org_patients(id, org_id, first_name, last_name, email, phone, birth_date, tax_id, address,
--              admin_notes, assigned_member_ids uuid[], acquisition_source, lead_id, status, created_by)
-- org_appointments(id, org_id, member_id, patient_id, location_id, room_id, starts_at, ends_at, status,
--                  service_type, modality, price, psych_percent, psych_fixed_fee, commission_rule_id,
--                  invoice_id, admin_notes, created_by)
-- org_clinical_notes(id, org_id, patient_id, author_member_id, appointment_id, visibility,
--                    content_enc 'enc:v1:…', amends_note_id)   -- historia inmutable (trigger)
-- org_consent_templates(id, org_id, name, content, version, active, created_by)
-- org_patient_consents(id, org_id, patient_id, template_id, template_name, template_version,
--                      content_snapshot, content_sha256, method, signed_at, registered_by, revoked_at)
-- business-004-money.sql — Fase 3. RLS activado sin políticas. Ver el fichero para
-- CHECKs, índices únicos y triggers (factura emitida inmutable; verifactu solo inserción).
-- org_members.billing_profile jsonb (nombre fiscal, NIF, dirección, prefijo de serie, IBAN, cuota de alquiler)
-- org_billing_entities(id, org_id, legal_name, tax_id, address, postal_code, city, province, iban, email,
--                      series_prefix, start_numbers, vat_exempt, exemption_text, active)
-- org_commission_rules(id, org_id, member_id, service_type, lead_source, psych_percent | fixed_fee,
--                      valid_from, valid_to, active, created_by)
-- org_invoices(id, org_id, kind, issuer_type, billing_entity_id, issuer_member_id, issuer_key 'nif:<NIF>',
--              issuer_*, recipient_*, member_id, series, number, full_number, aeat_type, lines, vat_breakdown,
--              subtotal, vat_total, irpf_rate, irpf_total, total, exemption_text, status, issue_date, issued_at,
--              rectifies_invoice_id, rectification_reason, settlement_id, appointment_ids, notes, paid_at,
--              payment_method, verifactu_record_id, verifactu_hash, created_by)
--   UNIQUE (issuer_key, series, number) WHERE number IS NOT NULL
-- org_settlements(id, org_id, member_id, period 'YYYY-MM', billing_model, status, data, validated_at,
--                 validated_by, invoice_id, paid_at)   UNIQUE (org_id, member_id, period)
-- verifactu_records(id, org_id, invoice_id, record_type, issuer_tax_id, series_number, issue_date,
--                   invoice_type, vat_total, total, previous_hash, chain_index, generated_at, hash, qr_url,
--                   mode, status)   UNIQUE (issuer_tax_id, previous_hash), UNIQUE (invoice_id, record_type)
-- business-005-leads.sql — Fase 4. RLS activado sin políticas.
-- org_leads(id, org_id, name, email, phone, reason, modality, preferences, preferred_member_id, source,
--           utm, consent_at, consent_version, status, assigned_member_id, assigned_at, patient_id,
--           discarded_at, converted_at, events, ip_hash (sin IP en claro), created_by)
-- Configuración de la página pública: organizations.settings.public_page; perfil público: org_members.public_profile.
-- business-006-knowledge.sql — Fase 5. RLS activado sin políticas.
-- org_library_items(id, org_id, kind, title, body, url, tags text[], active, created_by)
-- org_courses(id, org_id, title, description, required_for text[], active, created_by)
-- org_course_modules(id, org_id, course_id, title, body, url, minutes, position)
-- org_course_progress(id, org_id, course_id, module_id, member_id, minutes, completed_at)  UNIQUE (member_id, module_id)
-- org_supervision_logs(id, org_id, supervisor_member_id, supervisee_member_id, session_date, minutes, topics,
--                      notes_enc 'enc:v1:…', created_by)
