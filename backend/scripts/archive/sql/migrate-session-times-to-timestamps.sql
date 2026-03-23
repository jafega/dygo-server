-- Migración: Mover date/startTime/endTime de sessions.data a columnas starts_on y ends_on
-- Paso 1: Agregar columnas starts_on y ends_on a la tabla sessions
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS starts_on TIMESTAMPTZ;

ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS ends_on TIMESTAMPTZ;

-- Paso 2: Migrar datos existentes de data a las nuevas columnas
-- Combinamos date + startTime/endTime y asumimos timezone del psicólogo
-- Por defecto usaremos Europe/Madrid si no hay timezone del psicólogo
UPDATE sessions 
SET 
  starts_on = (
    ((data->>'date') || ' ' || (data->>'startTime') || ':00')::timestamp 
    AT TIME ZONE COALESCE(
      (SELECT data->>'timezone' FROM psychologist_profiles WHERE user_id = sessions.psychologist_user_id),
      'Europe/Madrid'
    )
  ),
  ends_on = (
    ((data->>'date') || ' ' || (data->>'endTime') || ':00')::timestamp 
    AT TIME ZONE COALESCE(
      (SELECT data->>'timezone' FROM psychologist_profiles WHERE user_id = sessions.psychologist_user_id),
      'Europe/Madrid'
    )
  )
WHERE 
  starts_on IS NULL 
  AND data->>'date' IS NOT NULL 
  AND data->>'startTime' IS NOT NULL 
  AND data->>'endTime' IS NOT NULL;

-- Paso 3: Crear índices para mejorar consultas por fechas
CREATE INDEX IF NOT EXISTS idx_sessions_starts_on ON sessions(starts_on);
CREATE INDEX IF NOT EXISTS idx_sessions_ends_on ON sessions(ends_on);

-- Paso 4: Remover los campos date, startTime, endTime de la columna data (JSONB)
UPDATE sessions 
SET data = data - 'date' - 'startTime' - 'endTime';

COMMENT ON COLUMN sessions.starts_on IS 'Fecha y hora de inicio de la sesión con timezone';
COMMENT ON COLUMN sessions.ends_on IS 'Fecha y hora de fin de la sesión con timezone';
