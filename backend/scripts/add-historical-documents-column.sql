-- Add dedicated historical_documents JSONB column to care_relationships
-- This moves document metadata out of the general 'data' JSONB to prevent
-- accidental overwrites during full DB sync (serverless race conditions).

-- Step 1: Add the column
ALTER TABLE public.care_relationships
  ADD COLUMN IF NOT EXISTS historical_documents JSONB DEFAULT NULL;

-- Step 2: Migrate existing data from data->'historicalDocuments' into the new column
UPDATE public.care_relationships
  SET historical_documents = data->'historicalDocuments',
      data = data - 'historicalDocuments'
  WHERE data ? 'historicalDocuments'
    AND historical_documents IS NULL;
