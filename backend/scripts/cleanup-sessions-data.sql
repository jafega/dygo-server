-- ============================================================
-- DYGO: Limpieza de datos de sesiones
-- Ejecutar en Supabase SQL Editor (paso a paso)
-- ============================================================
-- PROBLEMA: El campo data JSONB tiene anidamiento recursivo
-- data.data.data.data... (hasta 20+ niveles) y campos duplicados
-- que ya existen como columnas de tabla (id, status, starts_on,
-- ends_on, price, paid, percent_psych, etc.)
--
-- SOLUCIÓN:
-- 1. Reutilizar / crear función flatten_nested_data (misma que users)
-- 2. Poblar columnas de tabla desde los datos anidados (si faltan)
-- 3. Limpiar el JSONB dejando solo los campos que pertenecen a data
-- ============================================================

-- ============================================================
-- PASO 1: Crear función auxiliar (si no existe ya de cleanup-user-data.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION flatten_nested_data(obj jsonb) RETURNS jsonb AS $$
DECLARE
  current jsonb := obj;
  inner_data jsonb;
  outer_fields jsonb;
  max_depth int := 100; -- Protección contra bucles infinitos
  i int := 0;
BEGIN
  IF current IS NULL OR jsonb_typeof(current) != 'object' THEN
    RETURN current;
  END IF;

  -- Descender por la cadena data.data.data... hasta el nivel hoja
  -- En cada nivel, los campos del nivel exterior tienen prioridad sobre los interiores
  WHILE current ? 'data'
    AND jsonb_typeof(current->'data') = 'object'
    AND i < max_depth
  LOOP
    inner_data := current->'data';
    outer_fields := current - 'data';
    -- Merge: inner primero, outer sobreescribe (misma lógica que el JS)
    current := inner_data || outer_fields;
    i := i + 1;
  END LOOP;

  RETURN current;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================
-- PASO 2: DRY RUN - Ver qué sesiones tienen anidamiento
-- (Ejecutar esto primero para ver el estado actual)
-- ============================================================
SELECT
  id,
  psychologist_user_id,
  patient_user_id,
  status,
  starts_on,
  octet_length(data::text) as bytes_antes,
  octet_length(
    (flatten_nested_data(data)
      - 'id' - 'data' - 'created_at'
      - 'psychologist_user_id' - 'patient_user_id'
      - 'status' - 'starts_on' - 'ends_on'
      - 'price' - 'paid' - 'percent_psych'
      - 'session_entry_id' - 'invoice_id' - 'bonus_id'
      - 'session_name'
    )::text
  ) as bytes_despues,
  flatten_nested_data(data)->>'type' as tipo_recuperado,
  flatten_nested_data(data)->>'patientName' as paciente_recuperado,
  CASE WHEN data ? 'data' AND jsonb_typeof(data->'data') = 'object'
    THEN 'SI' ELSE 'NO' END as tiene_anidamiento,
  CASE
    WHEN data ? 'data' AND jsonb_typeof(data->'data') = 'object'
    THEN (
      SELECT count(*)::text FROM (
        WITH RECURSIVE depth(obj, n) AS (
          SELECT data, 1
          UNION ALL
          SELECT obj->'data', n + 1
          FROM depth
          WHERE obj ? 'data' AND jsonb_typeof(obj->'data') = 'object' AND n < 100
        )
        SELECT n FROM depth ORDER BY n DESC LIMIT 1
      ) sub
    )
    ELSE '0'
  END as niveles_anidamiento
FROM sessions
ORDER BY octet_length(data::text) DESC;


-- ============================================================
-- PASO 3: Poblar columnas de tabla desde datos anidados
-- (Solo actualiza si la columna está vacía o es nula)
-- ============================================================

-- 3a: Poblar starts_on si falta (desde campo starts_on anidado en data)
UPDATE sessions SET
  starts_on = (flatten_nested_data(data)->>'starts_on')::timestamptz
WHERE starts_on IS NULL
  AND flatten_nested_data(data)->>'starts_on' IS NOT NULL
  AND flatten_nested_data(data)->>'starts_on' != '';

-- 3b: Poblar ends_on si falta
UPDATE sessions SET
  ends_on = (flatten_nested_data(data)->>'ends_on')::timestamptz
WHERE ends_on IS NULL
  AND flatten_nested_data(data)->>'ends_on' IS NOT NULL
  AND flatten_nested_data(data)->>'ends_on' != '';

-- 3c: Poblar status si falta
UPDATE sessions SET
  status = COALESCE(flatten_nested_data(data)->>'status', 'scheduled')
WHERE status IS NULL
  AND flatten_nested_data(data)->>'status' IS NOT NULL;

-- 3d: Poblar price si falta
UPDATE sessions SET
  price = (flatten_nested_data(data)->>'price')::double precision
WHERE price IS NULL
  AND flatten_nested_data(data)->>'price' IS NOT NULL
  AND flatten_nested_data(data)->>'price' != 'null';

-- 3e: Poblar percent_psych si falta
UPDATE sessions SET
  percent_psych = (flatten_nested_data(data)->>'percent_psych')::double precision
WHERE percent_psych IS NULL
  AND flatten_nested_data(data)->>'percent_psych' IS NOT NULL
  AND flatten_nested_data(data)->>'percent_psych' != 'null';

-- 3f: Poblar session_name si falta
UPDATE sessions SET
  session_name = flatten_nested_data(data)->>'session_name'
WHERE session_name IS NULL
  AND flatten_nested_data(data)->>'session_name' IS NOT NULL
  AND flatten_nested_data(data)->>'session_name' != 'null';


-- ============================================================
-- PASO 4: Aplanar y limpiar el JSONB de TODAS las sesiones
-- Elimina campos que pertenecen a columnas de tabla.
-- Preserva: type, notes, patientId, patientName, patientPhone,
--   paymentMethod, psychologistId, schedule_timezone, timezone,
--   userId, meetLink, google_calendar_event_id, date, startTime,
--   endTime, y cualquier otro campo que NO sea columna de tabla.
-- ============================================================
UPDATE sessions SET
  data = flatten_nested_data(data)
    - 'id'                    -- PK de tabla
    - 'data'                  -- Causa anidamiento recursivo
    - 'created_at'            -- Columna de tabla
    - 'psychologist_user_id'  -- Columna de tabla
    - 'patient_user_id'       -- Columna de tabla
    - 'status'                -- Columna de tabla
    - 'starts_on'             -- Columna de tabla
    - 'ends_on'               -- Columna de tabla
    - 'price'                 -- Columna de tabla
    - 'paid'                  -- Columna de tabla
    - 'percent_psych'         -- Columna de tabla
    - 'session_entry_id'      -- Columna de tabla
    - 'invoice_id'            -- Columna de tabla
    - 'bonus_id'              -- Columna de tabla
    - 'session_name';         -- Columna de tabla


-- ============================================================
-- PASO 5: Verificar resultados
-- ============================================================
SELECT
  id,
  psychologist_user_id,
  patient_user_id,
  status,
  starts_on,
  octet_length(data::text) as data_bytes,
  data,
  CASE WHEN data ? 'data' AND jsonb_typeof(data->'data') = 'object'
    THEN '⚠️ TODAVÍA ANIDADO' ELSE '✅ LIMPIO' END as estado
FROM sessions
ORDER BY starts_on DESC;


-- ============================================================
-- PASO 6 (OPCIONAL): Eliminar la función auxiliar
-- (Solo si no la necesitas para users también)
-- ============================================================
-- DROP FUNCTION IF EXISTS flatten_nested_data(jsonb);
