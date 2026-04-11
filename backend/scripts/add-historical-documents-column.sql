-- Add dedicated historical_documents JSONB column to care_relationships
-- This moves document metadata out of the general 'data' JSONB to prevent
-- accidental overwrites during full DB sync (serverless race conditions).

-- Step 1: Add the column
ALTER TABLE public.care_relationships
  ADD COLUMN IF NOT EXISTS historical_documents JSONB DEFAULT NULL;

-- Step 2: Migrate existing data from data->'historicalDocuments' into the new column
UPDATE public.care_relationships
  SET historical_documents = data->'historicalDocuments'
  WHERE data->'historicalDocuments' IS NOT NULL
    AND historical_documents IS NULL;

-- Step 3: Remove historicalDocuments from the data JSONB to avoid duplication
UPDATE public.care_relationships
  SET data = data - 'historicalDocuments'
  WHERE data ? 'historicalDocuments';

-- Step 4: Create index for querying relationships that have documents
CREATE INDEX IF NOT EXISTS idx_care_relationships_has_documents
  ON public.care_relationships ((historical_documents IS NOT NULL))
  WHERE historical_documents IS NOT NULL;
