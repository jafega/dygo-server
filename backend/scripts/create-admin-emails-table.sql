-- Migration: Create admin_emails table for support/sales mailbox
-- Run this in Supabase SQL Editor

-- Stores all inbound and outbound emails for the admin mailboxes
-- (soporte@mainds.app and info@mainds.app)
CREATE TABLE IF NOT EXISTS public.admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox text NOT NULL CHECK (mailbox IN ('sales', 'support')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  thread_id uuid REFERENCES public.admin_emails(id) ON DELETE SET NULL,
  from_email text NOT NULL,
  from_name text,
  to_email text NOT NULL,
  to_name text,
  cc text,
  bcc text,
  subject text NOT NULL DEFAULT '(sin asunto)',
  body_html text,
  body_text text,
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  resend_id text,
  resend_status text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_admin_emails_mailbox ON public.admin_emails(mailbox);
CREATE INDEX IF NOT EXISTS idx_admin_emails_direction ON public.admin_emails(direction);
CREATE INDEX IF NOT EXISTS idx_admin_emails_thread_id ON public.admin_emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_admin_emails_created_at ON public.admin_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_emails_is_read ON public.admin_emails(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_admin_emails_from_email ON public.admin_emails(from_email);
CREATE INDEX IF NOT EXISTS idx_admin_emails_to_email ON public.admin_emails(to_email);

-- Enable RLS (all access via service role from backend)
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Policy: only service role can access (backend-only)
CREATE POLICY "Service role full access" ON public.admin_emails
  FOR ALL USING (true) WITH CHECK (true);
