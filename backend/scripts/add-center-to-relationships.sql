-- Script para agregar columna center_id a la tabla care_relationships
-- Este script debe ejecutarse en el panel SQL de Supabase

-- Paso 1: Agregar la columna center_id (permite NULL)
ALTER TABLE public.care_relationships 
ADD COLUMN IF NOT EXISTS center_id text;

-- Paso 2: Crear la foreign key constraint
ALTER TABLE public.care_relationships 
ADD CONSTRAINT care_relationships_center_id_fkey 
FOREIGN KEY (center_id) 
REFERENCES public.center(id)
ON DELETE SET NULL;

-- Paso 3: Crear índice para mejorar performance en consultas
CREATE INDEX IF NOT EXISTS idx_care_relationships_center_id 
ON public.care_relationships(center_id);

-- Verificar la estructura de la tabla
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'care_relationships' 
AND table_schema = 'public'
ORDER BY ordinal_position;
