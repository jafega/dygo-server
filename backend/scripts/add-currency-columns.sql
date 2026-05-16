-- Internacionalización de moneda: añade columna `currency` a las tablas que
-- guardan importes monetarios fuera del JSONB `data` (que ya admite el campo
-- sin migración). Ejecuta este script una vez en Supabase para habilitar
-- monedas distintas a EUR en los bonos persistidos.
--
-- Idempotente: usa IF NOT EXISTS. Default 'EUR' para que los registros
-- existentes mantengan la moneda histórica.

ALTER TABLE IF EXISTS bono
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';

-- Para invoices la moneda vive en el JSONB `data` (no requiere ALTER).
-- Si en el futuro se promueve a columna directa, descomenta:
-- ALTER TABLE IF EXISTS invoices
--   ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';

-- Suscripciones de psicólogos / pacientes ya tienen `currency` desde Stripe.
