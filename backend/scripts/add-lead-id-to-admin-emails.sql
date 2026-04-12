-- Migration: Add lead_id column to admin_emails for CRM linkage
-- Run this in Supabase SQL Editor

ALTER TABLE public.admin_emails ADD COLUMN IF NOT EXISTS lead_id uuid;
ALTER TABLE public.admin_emails ADD COLUMN IF NOT EXISTS lead_name text;
ALTER TABLE public.admin_emails ADD COLUMN IF NOT EXISTS assigned_to text;

CREATE INDEX IF NOT EXISTS idx_admin_emails_lead_id ON public.admin_emails(lead_id) WHERE lead_id IS NOT NULL;
