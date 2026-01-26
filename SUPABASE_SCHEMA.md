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
  CONSTRAINT care_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT care_relationships_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_center_id_fkey FOREIGN KEY (center_id) REFERENCES public.center(id)
);
CREATE TABLE public.center (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  psychologist_user_id text NOT NULL,
  center_name text NOT NULL,
  cif text NOT NULL,
  address text NOT NULL,
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
  creator_user_id text NOT NULL,
  target_user_id text NOT NULL,
  entry_type text NOT NULL,
  center_id text,
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
  -- data.invoice_type: 'patient' | 'center' (tipo de factura)
  -- data.centerId: text (solo para invoice_type='center', referencia al centro)
  -- data.sessionIds: array (solo para invoice_type='patient', sesiones incluidas)
  -- data.bonoIds: array (solo para invoice_type='patient', bonos incluidos)
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text,
  amount double precision NOT NULL,
  tax double precision NOT NULL,
  total double precision NOT NULL,
  status text NOT NULL,
  psych_invoice_id text,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT invoices_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
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
  CONSTRAINT session_entry_pkey PRIMARY KEY (id),
  CONSTRAINT session_entry_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT session_entry_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id)
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
CREATE TABLE public.users (
  id text NOT NULL,
  data jsonb NOT NULL,
  is_psychologist boolean NOT NULL DEFAULT false,
  user_email text,
  psychologist_profile_id text,
  auth_user_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id),
  CONSTRAINT users_psychologist_profile_id_fkey FOREIGN KEY (psychologist_profile_id) REFERENCES public.psychologist_profiles(id)
);