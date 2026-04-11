-- Add created_at column to entries table
-- This column is needed for ordering entries by creation date
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
