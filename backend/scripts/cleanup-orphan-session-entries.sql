-- Cleanup: Delete orphan session_entries not linked to any session
-- Date: 2026-04-12
-- Run this in Supabase SQL Editor

-- 1. Preview orphan entries (session_entry_id not referenced by any session, AND session_id column is null or points to non-existent session)
SELECT se.id, se.status, se.session_id, se.data->>'session_id' AS data_session_id, se.creator_user_id, se.target_user_id
FROM session_entry se
WHERE NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.session_entry_id = se.id
)
AND (
    se.session_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM sessions s2 WHERE s2.id = se.session_id)
)
AND (
    se.data->>'session_id' IS NULL
    OR NOT EXISTS (SELECT 1 FROM sessions s3 WHERE s3.id = se.data->>'session_id')
);

-- 2. Delete orphan entries
DELETE FROM session_entry se
WHERE NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.session_entry_id = se.id
)
AND (
    se.session_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM sessions s2 WHERE s2.id = se.session_id)
)
AND (
    se.data->>'session_id' IS NULL
    OR NOT EXISTS (SELECT 1 FROM sessions s3 WHERE s3.id = se.data->>'session_id')
);

-- 3. Verify: count remaining orphans (should be 0)
SELECT COUNT(*) AS remaining_orphans
FROM session_entry se
WHERE NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.session_entry_id = se.id
)
AND (
    se.session_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM sessions s2 WHERE s2.id = se.session_id)
);
