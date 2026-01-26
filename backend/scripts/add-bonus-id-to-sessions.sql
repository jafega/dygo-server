-- Agregar columna bonus_id a la tabla sessions
-- Esta columna almacenará la referencia al bono asignado a la sesión

ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS bonus_id bigint;

-- Agregar foreign key constraint hacia la tabla bono
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_bonus_id_fkey 
FOREIGN KEY (bonus_id) 
REFERENCES public.bono(id) 
ON DELETE SET NULL;

-- Agregar índice para mejorar las consultas que filtran por bonus_id
CREATE INDEX IF NOT EXISTS idx_sessions_bonus_id ON public.sessions(bonus_id);

-- Agregar constraint para asegurar que una sesión no puede tener invoice_id y bonus_id al mismo tiempo
ALTER TABLE public.sessions 
ADD CONSTRAINT check_invoice_or_bonus 
CHECK (
  (invoice_id IS NULL OR bonus_id IS NULL)
);

COMMENT ON COLUMN public.sessions.bonus_id IS 'ID del bono al que está asignada esta sesión. Una sesión no puede tener invoice_id y bonus_id al mismo tiempo.';
