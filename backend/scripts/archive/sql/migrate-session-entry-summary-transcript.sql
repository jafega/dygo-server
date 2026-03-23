-- Migración para mover summary y transcript de data JSONB a columnas específicas
-- Fecha: 2026-02-05
-- Descripción: Extrae data->>'summary' y data->>'transcript' a las columnas summary y transcript

-- Paso 1: Verificar cuántos registros tienen summary o transcript en data
SELECT 
  COUNT(*) as total_entries,
  COUNT(data->>'summary') as entries_with_summary_in_data,
  COUNT(data->>'transcript') as entries_with_transcript_in_data,
  COUNT(summary) as entries_with_summary_column,
  COUNT(transcript) as entries_with_transcript_column
FROM session_entry;

-- Paso 2: Migrar summary desde data JSONB a la columna summary
-- Solo actualizar si la columna está vacía/null y existe en data
UPDATE session_entry
SET summary = data->>'summary'
WHERE 
  (summary IS NULL OR summary = '')
  AND data ? 'summary'
  AND data->>'summary' IS NOT NULL
  AND data->>'summary' != '';

-- Paso 3: Migrar transcript desde data JSONB a la columna transcript
-- Solo actualizar si la columna está vacía/null y existe en data
UPDATE session_entry
SET transcript = data->>'transcript'
WHERE 
  (transcript IS NULL OR transcript = '')
  AND data ? 'transcript'
  AND data->>'transcript' IS NOT NULL
  AND data->>'transcript' != '';

-- Paso 4: Limpiar summary y transcript de data JSONB
-- Esto elimina las claves 'summary' y 'transcript' del objeto JSONB
UPDATE session_entry
SET data = data - 'summary' - 'transcript'
WHERE data ? 'summary' OR data ? 'transcript';

-- Paso 5: Verificar los resultados de la migración
SELECT 
  COUNT(*) as total_entries,
  COUNT(summary) as entries_with_summary,
  COUNT(transcript) as entries_with_transcript,
  AVG(LENGTH(summary)) as avg_summary_length,
  AVG(LENGTH(transcript)) as avg_transcript_length,
  COUNT(CASE WHEN data ? 'summary' THEN 1 END) as remaining_summary_in_data,
  COUNT(CASE WHEN data ? 'transcript' THEN 1 END) as remaining_transcript_in_data
FROM session_entry;

-- Paso 6 (opcional): Ver ejemplos de entradas migradas
SELECT 
  id,
  creator_user_id,
  target_user_id,
  status,
  LENGTH(summary) as summary_length,
  LENGTH(transcript) as transcript_length,
  LEFT(summary, 100) as summary_preview,
  data
FROM session_entry
WHERE summary IS NOT NULL OR transcript IS NOT NULL
LIMIT 5;
