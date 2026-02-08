-- Script para agregar columna patientnumber a care_relationships
-- y migrar los datos desde el campo data.patientNumber

-- 1. Agregar la columna patientnumber si no existe
ALTER TABLE care_relationships 
ADD COLUMN IF NOT EXISTS patientnumber integer;

-- 2. Migrar datos existentes desde data.patientNumber a patientnumber
UPDATE care_relationships
SET patientnumber = CAST(data->>'patientNumber' AS integer)
WHERE data->>'patientNumber' IS NOT NULL
  AND data->>'patientNumber' ~ '^[0-9]+$';

-- 3. Para los registros que no tienen patientNumber en data,
-- asignar números secuenciales por psicólogo
WITH numbered_relationships AS (
  SELECT 
    id,
    psychologist_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY psychologist_user_id 
      ORDER BY created_at
    ) as row_num
  FROM care_relationships
  WHERE patientnumber IS NULL
)
UPDATE care_relationships cr
SET patientnumber = nr.row_num + COALESCE(
  (SELECT MAX(patientnumber) 
   FROM care_relationships 
   WHERE psychologist_user_id = cr.psychologist_user_id 
     AND patientnumber IS NOT NULL), 
  0
)
FROM numbered_relationships nr
WHERE cr.id = nr.id;

-- 4. Verificar los resultados
SELECT 
  psychologist_user_id,
  patient_user_id,
  patientnumber,
  data->>'patientNumber' as old_patient_number,
  created_at
FROM care_relationships
ORDER BY psychologist_user_id, patientnumber;

-- 5. (Opcional) Limpiar el campo patientNumber del JSON data
-- DESCOMENTAR SOLO DESPUÉS DE VERIFICAR QUE TODO FUNCIONA CORRECTAMENTE
-- UPDATE care_relationships
-- SET data = data - 'patientNumber'
-- WHERE data ? 'patientNumber';
