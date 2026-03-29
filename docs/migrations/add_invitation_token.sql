-- Migration: add invitation_token column to users table
-- Run in Supabase SQL editor

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS invitation_token text;

-- Optional: add a unique index so tokens are unique per user
CREATE UNIQUE INDEX IF NOT EXISTS users_invitation_token_unique
  ON public.users (invitation_token)
  WHERE invitation_token IS NOT NULL;
