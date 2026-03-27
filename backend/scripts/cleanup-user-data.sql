-- ============================================================
-- MAINDS: Limpieza de datos de usuarios
-- Ejecutar en Supabase SQL Editor (paso a paso)
-- ============================================================
-- PROBLEMA: El campo data JSONB tiene anidamiento recursivo
-- data.data.data.data... (hasta 35+ niveles) y campos duplicados
-- que ya existen como columnas de tabla (id, email, auth_user_id, etc.)
--
-- SOLUCIÓN: 
-- 1. Crear función para aplanar el anidamiento recursivo
-- 2. Poblar columnas de tabla desde los datos anidados (si faltan)
-- 3. Limpiar el JSONB dejando solo los campos que pertenecen a data
-- ============================================================

-- ============================================================
-- PASO 1: Crear función auxiliar
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
-- PASO 2: DRY RUN - Ver qué usuarios tienen anidamiento
-- (Ejecutar esto primero para ver el estado actual)
-- ============================================================
SELECT 
  id,
  user_email,
  auth_user_id,
  is_psychologist,
  master,
  octet_length(data::text) as bytes_antes,
  octet_length(
    (flatten_nested_data(data) 
      - 'id' - 'data' - 'is_psychologist' - 'isPsychologist' 
      - 'user_email' - 'psychologist_profile_id' - 'psycologist_profile_id' 
      - 'auth_user_id' - 'master' - 'role' - 'email' - 'created_at'
    )::text
  ) as bytes_despues,
  flatten_nested_data(data)->>'name' as nombre_recuperado,
  flatten_nested_data(data)->>'email' as email_recuperado,
  CASE WHEN data ? 'data' AND jsonb_typeof(data->'data') = 'object' 
    THEN 'SI' ELSE 'NO' END as tiene_anidamiento
FROM users
ORDER BY octet_length(data::text) DESC;


-- ============================================================
-- PASO 3: Poblar columnas de tabla desde datos anidados
-- (Solo actualiza si la columna está vacía)
-- ============================================================

-- 3a: Poblar user_email desde el campo email anidado
UPDATE users SET
  user_email = flatten_nested_data(data)->>'email'
WHERE user_email IS NULL 
  AND flatten_nested_data(data)->>'email' IS NOT NULL;

-- 3b: Poblar auth_user_id (con validación de FK contra auth.users)
UPDATE users u SET
  auth_user_id = au.id
FROM auth.users au
WHERE u.auth_user_id IS NULL 
  AND flatten_nested_data(u.data)->>'auth_user_id' IS NOT NULL
  AND flatten_nested_data(u.data)->>'auth_user_id' != 'null'
  AND flatten_nested_data(u.data)->>'auth_user_id' != ''
  AND au.id::text = flatten_nested_data(u.data)->>'auth_user_id';

-- 3c: Poblar master
UPDATE users SET
  master = (flatten_nested_data(data)->>'master')::boolean
WHERE master IS NULL 
  AND flatten_nested_data(data)->>'master' IS NOT NULL
  AND flatten_nested_data(data)->>'master' != 'null';

-- 3d: Preservar createdAt si solo existe created_at
-- (El código JS usa createdAt para cálculo de trial)
UPDATE users SET
  data = jsonb_set(
    data,
    '{createdAt}',
    to_jsonb(flatten_nested_data(data)->>'created_at')
  )
WHERE flatten_nested_data(data)->>'createdAt' IS NULL
  AND flatten_nested_data(data)->>'created_at' IS NOT NULL;


-- ============================================================
-- PASO 4: Aplanar y limpiar el JSONB de TODOS los usuarios
-- Elimina campos que pertenecen a columnas de tabla
-- Preserva: name, password, avatarUrl, phone, firstName, lastName,
--   address, city, postalCode, country, dni, taxId, tax_id,
--   billing_name, billing_address, billing_tax_id, has_temp_email,
--   googleId, supabaseId, isPremium, premiumUntil, createdAt,
--   registeredAt, displayName, username, dateOfBirth, updated_at,
--   stripeCustomerId, stripeSubscriptionId, y cualquier otro campo
--   que NO sea una columna de tabla
-- ============================================================
UPDATE users SET
  data = flatten_nested_data(data) 
    - 'id'                        -- PK de tabla
    - 'data'                      -- Causa anidamiento recursivo
    - 'is_psychologist'           -- Columna de tabla
    - 'isPsychologist'            -- Alias de is_psychologist
    - 'user_email'                -- Columna de tabla
    - 'psychologist_profile_id'   -- Columna de tabla
    - 'psycologist_profile_id'    -- Typo histórico
    - 'auth_user_id'              -- Columna de tabla
    - 'master'                    -- Columna de tabla
    - 'role'                      -- Deprecated
    - 'email'                     -- Ya está en user_email
    - 'created_at';               -- Se usa createdAt (camelCase)


-- ============================================================
-- PASO 5: Verificar resultados
-- ============================================================
SELECT 
  id,
  user_email,
  auth_user_id,
  is_psychologist,
  master,
  octet_length(data::text) as data_bytes,
  data,
  CASE WHEN data ? 'data' AND jsonb_typeof(data->'data') = 'object' 
    THEN '⚠️ TODAVÍA ANIDADO' ELSE '✅ LIMPIO' END as estado
FROM users
ORDER BY id;


-- ============================================================
-- PASO 6 (OPCIONAL): Eliminar la función auxiliar
-- ============================================================
-- DROP FUNCTION IF EXISTS flatten_nested_data(jsonb);
