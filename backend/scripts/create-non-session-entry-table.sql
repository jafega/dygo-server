-- Crear tabla non_session_entry en Supabase
-- Esta tabla almacena entradas de historia clínica que NO están asociadas a una sesión
-- Estructura idéntica a session_entry pero sin session_id ni FK a sessions.
-- Fecha: 2026-04-22

CREATE TABLE IF NOT EXISTS public.non_session_entry (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  creator_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  transcript TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_non_session_entry_creator ON public.non_session_entry(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_non_session_entry_target  ON public.non_session_entry(target_user_id);
CREATE INDEX IF NOT EXISTS idx_non_session_entry_status  ON public.non_session_entry(status);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_non_session_entry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_non_session_entry_updated_at ON public.non_session_entry;
CREATE TRIGGER trigger_update_non_session_entry_updated_at
  BEFORE UPDATE ON public.non_session_entry
  FOR EACH ROW
  EXECUTE FUNCTION update_non_session_entry_updated_at();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.non_session_entry ENABLE ROW LEVEL SECURITY;

-- Políticas equivalentes a las de session_entry
DROP POLICY IF EXISTS "Users can view their own non session entries" ON public.non_session_entry;
CREATE POLICY "Users can view their own non session entries"
  ON public.non_session_entry
  FOR SELECT
  USING (
    auth.uid()::text = creator_user_id OR
    auth.uid()::text = target_user_id
  );

DROP POLICY IF EXISTS "Users can create non session entries as creator" ON public.non_session_entry;
CREATE POLICY "Users can create non session entries as creator"
  ON public.non_session_entry
  FOR INSERT
  WITH CHECK (auth.uid()::text = creator_user_id);

DROP POLICY IF EXISTS "Users can update their created non session entries" ON public.non_session_entry;
CREATE POLICY "Users can update their created non session entries"
  ON public.non_session_entry
  FOR UPDATE
  USING (auth.uid()::text = creator_user_id);
