-- Añadir columna center_id a la tabla care_relationships
-- Ejecutar este script en Supabase SQL Editor

-- Añadir la columna center_id (puede ser null, ON DELETE SET NULL)
ALTER TABLE care_relationships 
ADD COLUMN IF NOT EXISTS center_id text;

-- Añadir foreign key constraint (opcional pero recomendado)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'care_relationships_center_id_fkey'
  ) THEN
    ALTER TABLE care_relationships 
    ADD CONSTRAINT care_relationships_center_id_fkey 
    FOREIGN KEY (center_id) 
    REFERENCES center(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

-- Crear índice para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_care_relationships_center_id 
ON care_relationships(center_id);

-- Verificar que la columna se creó correctamente
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'care_relationships' 
AND column_name = 'center_id';
