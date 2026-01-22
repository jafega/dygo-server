-- Script para actualizar relaciones existentes con valores por defecto
-- Ejecutar este script en Supabase SQL Editor

-- Actualizar todas las relaciones que tengan NULL en default_session_price
UPDATE care_relationships
SET 
  default_session_price = 0,
  default_psych_percent = 100
WHERE 
  default_session_price IS NULL 
  OR default_psych_percent IS NULL;

-- Verificar que todas las relaciones tienen valores
SELECT 
  id, 
  psychologist_user_id, 
  patient_user_id, 
  default_session_price, 
  default_psych_percent
FROM care_relationships
ORDER BY created_at DESC;
