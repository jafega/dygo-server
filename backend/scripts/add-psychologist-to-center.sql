-- Script para agregar columna psychologist_user_id a la tabla center
-- Este script debe ejecutarse en el panel SQL de Supabase

-- Paso 1: Agregar la columna psychologist_user_id (permitir NULL temporalmente)
ALTER TABLE public.center 
ADD COLUMN IF NOT EXISTS psychologist_user_id text;

-- Paso 2: Crear la foreign key constraint
ALTER TABLE public.center 
ADD CONSTRAINT center_psychologist_user_id_fkey 
FOREIGN KEY (psychologist_user_id) 
REFERENCES public.users(id)
ON DELETE CASCADE;

-- Paso 3: (Opcional) Si hay datos existentes, puedes asignarles un psychologist_user_id
-- UPDATE public.center SET psychologist_user_id = 'tu-psychologist-id-aqui' WHERE psychologist_user_id IS NULL;

-- Paso 4: (Opcional) Hacer la columna NOT NULL después de asignar valores
-- ALTER TABLE public.center ALTER COLUMN psychologist_user_id SET NOT NULL;

-- Verificar la estructura de la tabla
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'center' 
AND table_schema = 'public';
