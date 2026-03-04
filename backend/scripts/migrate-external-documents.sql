-- Migration: External Documents in Signatures
-- Run this in Supabase SQL editor

-- 1. Make template_id nullable (external docs don't come from a template)
ALTER TABLE public.signatures ALTER COLUMN template_id DROP NOT NULL;

-- 2. Add external_document_url column to store the Supabase Storage URL
ALTER TABLE public.signatures ADD COLUMN IF NOT EXISTS external_document_url text;

-- 3. Create the storage bucket for external documents (run in Supabase dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('external-documents', 'external-documents', true)
-- ON CONFLICT (id) DO NOTHING;
