-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.care_relationships (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text NOT NULL,
  CONSTRAINT care_relationships_pkey PRIMARY KEY (id),
  CONSTRAINT care_relationships_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT care_relationships_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
);
CREATE TABLE public.entries (
  id text NOT NULL,
  data jsonb NOT NULL,
  creator_user_id text NOT NULL,
  target_user_id text NOT NULL,
  CONSTRAINT entries_pkey PRIMARY KEY (id),
  CONSTRAINT entries_creator_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(id),
  CONSTRAINT entries_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id)
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
  CONSTRAINT psychologist_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT psychologist_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.sessions (
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  psychologist_user_id text NOT NULL,
  patient_user_id text,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_psychologist_user_id_fkey FOREIGN KEY (psychologist_user_id) REFERENCES public.users(id),
  CONSTRAINT sessions_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES public.users(id)
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