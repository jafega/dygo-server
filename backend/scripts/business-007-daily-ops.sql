-- business-007-daily-ops.sql
--
-- mainds business — Fase 6 (operativa diaria, feedback de la titular):
--   - precio por defecto por paciente (tarifa reducida, bonos sociales…);
--   - series de citas periódicas (cancelar "esta y las siguientes").
-- Las tarifas por servicio viven en organizations.settings.service_prices
-- (jsonb ya existente): no necesitan columna.
--
-- Aditiva e idempotente. Ejecutar a mano después de business-006.

ALTER TABLE public.org_patients ADD COLUMN IF NOT EXISTS default_price numeric(10,2);
ALTER TABLE public.org_appointments ADD COLUMN IF NOT EXISTS series_id uuid;

CREATE INDEX IF NOT EXISTS idx_org_appt_series ON public.org_appointments (series_id) WHERE series_id IS NOT NULL;
-- Pendientes de Inicio: citas programadas ya pasadas y realizadas sin facturar.
CREATE INDEX IF NOT EXISTS idx_org_appt_org_status ON public.org_appointments (org_id, status, starts_at);
