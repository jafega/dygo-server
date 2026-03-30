-- Migration: Add archived column to templates table
-- Run this in Supabase SQL Editor

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Index for filtering non-archived templates efficiently
CREATE INDEX IF NOT EXISTS templates_archived_idx ON public.templates (archived);
