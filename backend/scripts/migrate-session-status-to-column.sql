-- Migración: Mover status de sessions.data a sessions.status
-- Paso 1: Agregar columna status a la tabla sessions
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS status TEXT;

-- Paso 2: Migrar datos existentes de data->>'status' a la columna status
-- Si no hay status en data, asignar 'scheduled' por defecto
UPDATE sessions 
SET status = COALESCE(
  (data->>'status'),
  CASE 
    WHEN data->>'patient_user_id' IS NOT NULL OR data->>'patientId' IS NOT NULL 
    THEN 'scheduled' 
    ELSE 'available' 
  END
)
WHERE status IS NULL;

-- Paso 3: Establecer 'scheduled' como valor por defecto
ALTER TABLE sessions 
ALTER COLUMN status SET DEFAULT 'scheduled';

-- Paso 4: Hacer la columna NOT NULL (después de llenar los datos)
ALTER TABLE sessions 
ALTER COLUMN status SET NOT NULL;

-- Paso 5: Agregar constraint para validar valores permitidos
ALTER TABLE sessions 
DROP CONSTRAINT IF EXISTS sessions_status_check;

ALTER TABLE sessions 
ADD CONSTRAINT sessions_status_check 
CHECK (status IN ('scheduled', 'completed', 'cancelled', 'available', 'paid'));

-- Paso 6: Crear índice para mejorar consultas por status
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Paso 7: Remover el campo status de la columna data (JSONB)
UPDATE sessions 
SET data = data - 'status';

COMMENT ON COLUMN sessions.status IS 'Estado de la sesión: scheduled, completed, cancelled, available, paid';
