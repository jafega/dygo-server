-- ============================================================
-- Migración: Restricción UNIQUE en número de factura
-- Propósito: Capa de seguridad final para garantizar que nunca
--            existan dos facturas con el mismo número para el
--            mismo psicólogo. El servidor ya genera el número
--            de forma atómica, pero esta restricción actúa como
--            red de seguridad a nivel de base de datos.
-- ============================================================

-- 1. Índice único parcial: solo facturas no canceladas
--    (una factura cancelada no "ocupa" el número a efectos
--    contables, pero el número nunca se reutiliza de todas formas).
--    Si prefieres incluir también las canceladas en la restricción,
--    usa la versión completa del paso 2.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_unique_number_active
  ON public.invoices (psychologist_user_id, "invoiceNumber")
  WHERE status <> 'cancelled';

-- 2. (Alternativa más estricta) Restricción UNIQUE incluyendo también
--    las canceladas — garantiza que ningún número pueda repetirse jamás.
--    Descomenta si quieres esta versión en lugar de la de arriba.
-- ALTER TABLE public.invoices
--   ADD CONSTRAINT invoices_psychologist_invoice_number_unique
--   UNIQUE (psychologist_user_id, "invoiceNumber");

-- 3. Verificar que no existen duplicados antes de aplicar la migración
--    (ejecutar esta consulta antes del paso 1 si hay dudas):
--
-- SELECT psychologist_user_id, "invoiceNumber", COUNT(*) AS cnt
-- FROM public.invoices
-- WHERE status <> 'cancelled'
-- GROUP BY psychologist_user_id, "invoiceNumber"
-- HAVING COUNT(*) > 1;
