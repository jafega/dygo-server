-- Migration: Add 'details' text column to leads table
-- Run this in Supabase SQL Editor

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS details text DEFAULT NULL;
