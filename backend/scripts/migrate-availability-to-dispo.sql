-- Migración de disponibilidad de sessions a dispo
-- Este script migra todas las sesiones sin patient_user_id a la tabla dispo

-- 1. Insertar en dispo todas las sesiones disponibles (sin patient_user_id)
INSERT INTO dispo (id, psychologist_user_id, data, created_at)
SELECT 
  id,
  COALESCE(psychologist_user_id, "psychologistId") as psychologist_user_id,
  jsonb_build_object(
    'date', date,
    'startTime', "startTime",
    'endTime', "endTime",
    'type', COALESCE(type, 'online')
  ) as data,
  COALESCE(created_at, NOW()) as created_at
FROM sessions
WHERE 
  (patient_user_id IS NULL OR patient_user_id = '')
  AND (status = 'available' OR status IS NULL)
  AND (psychologist_user_id IS NOT NULL OR "psychologistId" IS NOT NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. Verificar cuántos registros se migraron
SELECT 
  'Registros migrados a dispo' as descripcion,
  COUNT(*) as total
FROM dispo
WHERE id IN (
  SELECT id 
  FROM sessions 
  WHERE (patient_user_id IS NULL OR patient_user_id = '')
    AND (status = 'available' OR status IS NULL)
);

-- 3. Eliminar de sessions las sesiones que ya están en dispo
DELETE FROM sessions
WHERE id IN (
  SELECT id 
  FROM dispo
);

-- 4. Verificar resultado final
SELECT 
  'Sesiones restantes en sessions' as descripcion,
  COUNT(*) as total
FROM sessions;

SELECT 
  'Disponibilidad en dispo' as descripcion,
  COUNT(*) as total
FROM dispo;
