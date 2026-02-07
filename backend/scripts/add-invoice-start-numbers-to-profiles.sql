-- Script para asegurar que la tabla psychologist_profiles puede almacenar
-- la configuración de números iniciales de factura
-- Fecha: 2026-02-06

-- Verificar que la tabla psychologist_profiles existe y tiene la columna data
-- (Esta tabla debería existir según SUPABASE_SCHEMA.md)

-- Verificar estructura actual
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'psychologist_profiles';

-- La columna 'data' debe ser de tipo JSONB y ya debería existir
-- Si no existe, crearla (normalmente ya debería existir):
-- ALTER TABLE psychologist_profiles ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Ejemplo de cómo se guardará la configuración de números iniciales:
-- UPDATE psychologist_profiles
-- SET data = jsonb_set(
--   COALESCE(data, '{}'::jsonb),
--   '{invoice_start_numbers}',
--   '{"2026": 50, "2027": 1}'::jsonb
-- )
-- WHERE user_id = 'ID_DEL_PSICOLOGO';

-- Para verificar los números iniciales de un psicólogo:
-- SELECT 
--   user_id,
--   data->'invoice_start_numbers' as invoice_start_numbers
-- FROM psychologist_profiles
-- WHERE user_id = 'ID_DEL_PSICOLOGO';
