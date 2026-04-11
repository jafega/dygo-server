-- Migration: Add session_id column to session_entry table
-- Purpose: Move session_id from JSONB data column to a dedicated table column,
--          then delete orphan entries not linked to any session.
-- Date: 2026-04-12
-- Run this in Supabase SQL Editor

-- 1. Add the new column (nullable initially for migration)
ALTER TABLE session_entry ADD COLUMN IF NOT EXISTS session_id TEXT DEFAULT NULL;

-- 2. Migrate existing data from JSONB to the new column
UPDATE session_entry
SET session_id = data->>'session_id'
WHERE data->>'session_id' IS NOT NULL
  AND session_id IS NULL;

-- 3. Also populate from sessions table where session_entry_id is set
UPDATE session_entry se
SET session_id = s.id
FROM sessions s
WHERE s.session_entry_id = se.id
  AND se.session_id IS NULL;

-- 4. Verify before deleting — see which entries have no session_id
SELECT id, creator_user_id, target_user_id, status, data->>'session_id' AS data_session_id
FROM session_entry
WHERE session_id IS NULL;

-- 5. Delete orphan entries that are not linked to any session
DELETE FROM session_entry
WHERE session_id IS NULL;

-- 6. Remove session_id from JSONB data to avoid duplication
UPDATE session_entry
SET data = data - 'session_id'
WHERE data ? 'session_id';

-- 7. Add foreign key constraint to sessions table
ALTER TABLE session_entry
  ADD CONSTRAINT session_entry_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES sessions(id);

-- 8. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_entry_session_id ON session_entry (session_id);

-- 9. Add unique constraint to prevent duplicate entries per session
ALTER TABLE session_entry
  ADD CONSTRAINT session_entry_session_id_unique UNIQUE (session_id);

-- 10. Verify migration
SELECT
  COUNT(*) AS total_entries,
  COUNT(session_id) AS with_session_id,
  COUNT(CASE WHEN data->>'session_id' IS NOT NULL THEN 1 END) AS still_in_jsonb
FROM session_entry;
