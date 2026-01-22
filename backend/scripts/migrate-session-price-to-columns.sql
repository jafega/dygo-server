-- Migración: Mover price, percent_psych y paid de sessions.data a columnas directas
-- Ejecutar en Supabase SQL Editor

-- Paso 1: Agregar las columnas a la tabla sessions
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS percent_psych NUMERIC(5, 4),
ADD COLUMN IF NOT EXISTS paid BOOLEAN;

-- Paso 2: Migrar datos existentes del JSONB data a las columnas
UPDATE sessions 
SET 
  price = CASE 
    WHEN data->>'price' IS NOT NULL AND data->>'price' != '' 
    THEN (data->>'price')::NUMERIC 
    ELSE 0 
  END,
  percent_psych = CASE 
    WHEN data->>'percent_psych' IS NOT NULL AND data->>'percent_psych' != '' 
    THEN (data->>'percent_psych')::NUMERIC 
    ELSE 0.7 
  END,
  paid = CASE 
    WHEN data->>'paid' IS NOT NULL 
    THEN (data->>'paid')::BOOLEAN 
    ELSE false 
  END
WHERE price IS NULL OR percent_psych IS NULL OR paid IS NULL;

-- Paso 3: Establecer valores por defecto
ALTER TABLE sessions 
ALTER COLUMN price SET DEFAULT 0,
ALTER COLUMN percent_psych SET DEFAULT 0.7,
ALTER COLUMN paid SET DEFAULT false;

-- Paso 4: Hacer las columnas NOT NULL
ALTER TABLE sessions 
ALTER COLUMN price SET NOT NULL,
ALTER COLUMN percent_psych SET NOT NULL,
ALTER COLUMN paid SET NOT NULL;

-- Paso 5: Agregar constraints de validación
ALTER TABLE sessions 
DROP CONSTRAINT IF EXISTS sessions_price_check;

ALTER TABLE sessions 
ADD CONSTRAINT sessions_price_check 
CHECK (price >= 0);

ALTER TABLE sessions 
DROP CONSTRAINT IF EXISTS sessions_percent_psych_check;

ALTER TABLE sessions 
ADD CONSTRAINT sessions_percent_psych_check 
CHECK (percent_psych >= 0 AND percent_psych <= 1);

-- Paso 6: Crear índices
CREATE INDEX IF NOT EXISTS idx_sessions_price ON sessions(price);
CREATE INDEX IF NOT EXISTS idx_sessions_paid ON sessions(paid);

-- Paso 7: Remover los campos del JSONB data
UPDATE sessions 
SET data = data - 'price' - 'percent_psych' - 'paid';

-- Paso 8: Comentarios
COMMENT ON COLUMN sessions.price IS 'Precio de la sesión en euros';
COMMENT ON COLUMN sessions.percent_psych IS 'Porcentaje del psicólogo (0.7 = 70%)';
COMMENT ON COLUMN sessions.paid IS 'Indica si la sesión ha sido pagada';

-- Verificar
SELECT 
  id, 
  price, 
  percent_psych, 
  paid,
  status,
  data->>'patientName' as patient_name
FROM sessions 
LIMIT 10;
