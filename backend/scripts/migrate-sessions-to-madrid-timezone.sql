-- ============================================================
-- MIGRACIÓN: Mover sesiones a horario de Madrid (Europe/Madrid)
-- ============================================================
-- PROBLEMA: Las sesiones tienen starts_on/ends_on almacenados como
-- si fueran UTC, pero las horas representan la hora LOCAL de Madrid
-- (es decir, se guardó "10:00" Madrid como "10:00 UTC" en lugar de
-- "09:00 UTC" en CET o "08:00 UTC" en CEST).
--
-- SOLUCIÓN: "Reinterpretar" el timestamp UTC almacenado como si
-- fuera hora local de Madrid y recalcular el UTC correcto.
--
-- Ejemplo (invierno, CET = UTC+1):
--   Antes:  starts_on = '2024-01-15 10:00:00+00'  (UTC, incorrecto)
--   Después: starts_on = '2024-01-15 09:00:00+00'  (UTC correcto → 10:00 Madrid)
--
-- Ejemplo (verano, CEST = UTC+2):
--   Antes:  starts_on = '2024-07-10 10:00:00+00'  (UTC, incorrecto)
--   Después: starts_on = '2024-07-10 08:00:00+00'  (UTC correcto → 10:00 Madrid)
--
-- IMPORTANTE: Ejecutar SOLO UNA VEZ. Hacer copia de seguridad antes.
-- ============================================================

-- Paso 1: Verificar cuántas sesiones se van a migrar
SELECT
  COUNT(*) AS total_sessions,
  MIN(starts_on) AS primera_sesion,
  MAX(starts_on) AS ultima_sesion
FROM sessions
WHERE starts_on IS NOT NULL;

-- Paso 2: Previsualizar los cambios (sin modificar datos)
SELECT
  id,
  starts_on                                                               AS starts_on_actual_utc,
  ends_on                                                                 AS ends_on_actual_utc,
  -- El timestamp UTC actual reinterpretado como hora local Madrid → nuevo UTC correcto
  timezone('Europe/Madrid', (starts_on AT TIME ZONE 'UTC')::timestamp)   AS starts_on_nuevo_utc,
  timezone('Europe/Madrid', (ends_on   AT TIME ZONE 'UTC')::timestamp)   AS ends_on_nuevo_utc,
  -- Hora guardada actualmente (leída como UTC)
  to_char(starts_on, 'HH24:MI')                                          AS hora_guardada_utc,
  -- Hora que se mostrará tras la migración (debe coincidir con hora_guardada_utc)
  to_char(
    timezone('Europe/Madrid', (starts_on AT TIME ZONE 'UTC')::timestamp),
    'HH24:MI'
  )                                                                       AS hora_madrid_resultado
FROM sessions
WHERE starts_on IS NOT NULL
ORDER BY starts_on DESC
LIMIT 20;

-- Paso 3: EJECUTAR LA MIGRACIÓN
-- Descomenta el bloque BEGIN...COMMIT cuando estés seguro de querer aplicarlo.

/*
BEGIN;

UPDATE sessions
SET
  starts_on = timezone('Europe/Madrid', (starts_on AT TIME ZONE 'UTC')::timestamp),
  ends_on   = timezone('Europe/Madrid', (ends_on   AT TIME ZONE 'UTC')::timestamp)
WHERE starts_on IS NOT NULL;

-- Verificar resultado
SELECT
  id,
  starts_on AS starts_on_nuevo,
  to_char(starts_on AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD HH24:MI TZ') AS hora_madrid
FROM sessions
WHERE starts_on IS NOT NULL
ORDER BY starts_on DESC
LIMIT 10;

COMMIT;
-- En caso de error: ROLLBACK;
*/
