-- Migration: Add calendar_id column to sessions table
-- Purpose: Move google_calendar_event_id from JSONB data column to a dedicated table column
-- Date: 2026-04-11
-- Run this in Supabase SQL Editor

-- 1. Add the new column
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS calendar_id TEXT DEFAULT NULL;

-- 2. Migrate existing data from JSONB to the new column
UPDATE sessions
SET calendar_id = data->>'google_calendar_event_id'
WHERE data->>'google_calendar_event_id' IS NOT NULL
  AND calendar_id IS NULL;

-- 3. Remove the field from JSONB data to avoid duplication
UPDATE sessions
SET data = data - 'google_calendar_event_id'
WHERE data ? 'google_calendar_event_id';

-- 4. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sessions_calendar_id ON sessions (calendar_id) WHERE calendar_id IS NOT NULL;

-- 5. Verify migration
SELECT
  COUNT(*) AS total_sessions,
  COUNT(calendar_id) AS with_calendar_id,
  COUNT(CASE WHEN data->>'google_calendar_event_id' IS NOT NULL THEN 1 END) AS still_in_jsonb
FROM sessions;
