-- business-006-knowledge.sql
--
-- mainds business — Fase 5 (conocimiento): biblioteca de la clínica,
-- cursos con progreso y registro de supervisión.
--
-- Reglas:
--   - Tablas propias (D1). RLS activado SIN políticas (solo service role).
--   - Las notas de supervisión pueden contener información clínica: se guardan
--     cifradas por la aplicación (notes_enc = 'enc:v1:…').
--   - Idempotente. Ejecutar a mano después de business-005.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.org_library_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'protocolo',     -- protocolo | material | plantilla | enlace
  title text NOT NULL,
  body text,                                  -- Markdown
  url text,
  tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by text,
  CONSTRAINT org_library_items_kind_chk CHECK (kind IN ('protocolo', 'material', 'plantilla', 'enlace'))
);
CREATE INDEX IF NOT EXISTS idx_org_library_items_org ON public.org_library_items (org_id, active);
ALTER TABLE public.org_library_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  required_for text[] NOT NULL DEFAULT '{}',  -- roles para los que es obligatorio (onboarding)
  active boolean NOT NULL DEFAULT true,
  created_by text
);
CREATE INDEX IF NOT EXISTS idx_org_courses_org ON public.org_courses (org_id);
ALTER TABLE public.org_courses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.org_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  url text,
  minutes integer NOT NULL DEFAULT 30,
  position integer NOT NULL DEFAULT 0,
  CONSTRAINT org_course_modules_minutes_chk CHECK (minutes > 0 AND minutes <= 1440)
);
CREATE INDEX IF NOT EXISTS idx_org_course_modules_course ON public.org_course_modules (course_id, position);
ALTER TABLE public.org_course_modules ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.org_courses(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.org_course_modules(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members(id) ON DELETE CASCADE,
  minutes integer NOT NULL,                   -- copia de los minutos del módulo al completarlo
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_course_progress_member_module_key ON public.org_course_progress (member_id, module_id);
CREATE INDEX IF NOT EXISTS idx_org_course_progress_org ON public.org_course_progress (org_id, member_id);
ALTER TABLE public.org_course_progress ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.org_supervision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supervisor_member_id uuid NOT NULL REFERENCES public.org_members(id),
  supervisee_member_id uuid NOT NULL REFERENCES public.org_members(id),
  session_date date NOT NULL,
  minutes integer NOT NULL,
  topics text[] NOT NULL DEFAULT '{}',
  notes_enc text,                             -- 'enc:v1:…' (cifrado por la aplicación)
  created_by text,
  CONSTRAINT org_supervision_minutes_chk CHECK (minutes > 0 AND minutes <= 1440),
  CONSTRAINT org_supervision_notes_chk CHECK (notes_enc IS NULL OR notes_enc LIKE 'enc:v1:%'),
  CONSTRAINT org_supervision_distinct_chk CHECK (supervisor_member_id <> supervisee_member_id)
);
CREATE INDEX IF NOT EXISTS idx_org_supervision_org ON public.org_supervision_logs (org_id, session_date DESC);
ALTER TABLE public.org_supervision_logs ENABLE ROW LEVEL SECURITY;
