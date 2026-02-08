-- Script de migración para agregar números de paciente a las relaciones existentes
-- Este script asigna números secuenciales a los pacientes de cada psicólogo basándose en la fecha de creación de la relación

-- Paso 1: Actualizar todas las relaciones que no tienen patientNumber en data JSONB
-- Asignar números secuenciales por psicólogo basándose en created_at (más antigua = número más bajo)

WITH numbered_patients AS (
  SELECT 
    id,
    psychologist_user_id,
    patient_user_id,
    created_at,
    data,
    ROW_NUMBER() OVER (
      PARTITION BY psychologist_user_id 
      ORDER BY created_at ASC
    ) as patient_number
  FROM care_relationships
  WHERE (data->>'patientNumber') IS NULL
)
UPDATE care_relationships cr
SET data = jsonb_set(
  COALESCE(cr.data, '{}'::jsonb),
  '{patientNumber}',
  to_jsonb(np.patient_number::integer)
)
FROM numbered_patients np
WHERE cr.id = np.id;

-- Paso 2: Asegurar que todos los pacientes nuevos tengan active = true por defecto
UPDATE care_relationships
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{active}',
  'true'::jsonb
)
WHERE (data->>'active') IS NULL;

-- Verificación: Mostrar el resultado
SELECT 
  cr.id,
  cr.psychologist_user_id,
  cr.patient_user_id,
  cr.created_at,
  cr.data->>'patientNumber' as patient_number,
  cr.data->>'active' as active,
  u.name as patient_name
FROM care_relationships cr
LEFT JOIN users u ON u.id = cr.patient_user_id
ORDER BY cr.psychologist_user_id, (cr.data->>'patientNumber')::integer;
