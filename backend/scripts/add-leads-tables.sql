-- Migration: Create leads CRM tables for SuperAdmin sales pipeline
-- Run this in Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════
-- 1. leads — Main lead table
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Lead info
  email text NOT NULL UNIQUE,
  name text,
  phone text,
  company text,
  source text DEFAULT 'manual',

  -- Pipeline stage
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new','prueba','contacted','demo','won','lost','cancelled')),

  -- Link to app user (auto-populated when lead registers)
  app_user_id text REFERENCES public.users(id),
  app_registered_at timestamptz,
  app_plan text,
  app_is_subscribed boolean DEFAULT false,

  -- Metadata
  assigned_to text,
  tags text[] DEFAULT '{}',
  notes_count integer DEFAULT 0,
  last_contacted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_app_user_id ON public.leads(app_user_id);

-- ═══════════════════════════════════════════════════════════════
-- 2. lead_activities — Unified timeline (notes, emails, docs, events)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  type text NOT NULL
    CHECK (type IN ('note','email_sent','email_received','email_bulk','document','stage_change','app_event')),

  title text,
  body text,
  metadata jsonb DEFAULT '{}',
  created_by text
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_type ON public.lead_activities(type);

-- ═══════════════════════════════════════════════════════════════
-- 3. lead_email_templates — Reusable email templates
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.lead_email_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  variables text[] DEFAULT '{}',
  created_by text
);

-- ═══════════════════════════════════════════════════════════════
-- 4. Enable RLS (deny all by default — backend uses service_role)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_email_templates ENABLE ROW LEVEL SECURITY;
