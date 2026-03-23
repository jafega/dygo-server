-- Este script agrega la columna 'data' JSONB a las tablas sessions e invoices
-- SOLO ejecuta este script si las tablas YA EXISTEN pero NO tienen la columna 'data'

-- Agregar columna data a sessions si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'data'
    ) THEN
        ALTER TABLE sessions ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Columna data agregada a sessions';
    ELSE
        RAISE NOTICE 'La columna data ya existe en sessions';
    END IF;
END $$;

-- Agregar columna data a invoices si no existe
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'data'
    ) THEN
        ALTER TABLE invoices ADD COLUMN data JSONB NOT NULL DEFAULT '{}'::jsonb;
        RAISE NOTICE 'Columna data agregada a invoices';
    ELSE
        RAISE NOTICE 'La columna data ya existe en invoices';
    END IF;
END $$;

-- Verificar la estructura final
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('sessions', 'invoices')
ORDER BY table_name, ordinal_position;
