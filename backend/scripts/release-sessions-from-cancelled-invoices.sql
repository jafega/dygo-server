-- =====================================================================
-- Libera sesiones y bonos asociados a facturas que ya están canceladas
-- (incluyendo las que fueron sustituidas por una rectificativa).
--
-- Útil para limpiar el histórico de casos en los que se creó una
-- factura rectificativa pero el invoice_id no se desasignó de las
-- sesiones / bonos vinculados a la factura original.
--
-- Ejecutar en el editor SQL de Supabase (proyecto de producción).
-- Es idempotente: volver a ejecutarlo no hace nada si ya está limpio.
-- =====================================================================

-- 1) (Opcional) Ver qué se va a liberar ANTES de actualizar
SELECT
  s.id            AS session_id,
  s.invoice_id    AS current_invoice_id,
  i.status        AS invoice_status,
  i."invoiceNumber" AS invoice_number
FROM public.sessions s
JOIN public.invoices i ON i.id = s.invoice_id
WHERE i.status = 'cancelled';

SELECT
  b.id            AS bono_id,
  b.invoice_id    AS current_invoice_id,
  i.status        AS invoice_status,
  i."invoiceNumber" AS invoice_number
FROM public.bono b
JOIN public.invoices i ON i.id = b.invoice_id
WHERE i.status = 'cancelled';

-- 2) Liberar sesiones cuyo invoice_id apunta a una factura cancelada
UPDATE public.sessions s
SET invoice_id = NULL
FROM public.invoices i
WHERE s.invoice_id = i.id
  AND i.status = 'cancelled';

-- 3) Liberar bonos cuyo invoice_id apunta a una factura cancelada
UPDATE public.bono b
SET invoice_id = NULL
FROM public.invoices i
WHERE b.invoice_id = i.id
  AND i.status = 'cancelled';

-- 4) Verificación posterior: ambas consultas deben devolver 0 filas
SELECT COUNT(*) AS sessions_still_linked_to_cancelled
FROM public.sessions s
JOIN public.invoices i ON i.id = s.invoice_id
WHERE i.status = 'cancelled';

SELECT COUNT(*) AS bonos_still_linked_to_cancelled
FROM public.bono b
JOIN public.invoices i ON i.id = b.invoice_id
WHERE i.status = 'cancelled';
