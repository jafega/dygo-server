-- Crear tabla session_entry en Supabase
-- Esta tabla almacena las entradas/notas de sesiones

CREATE TABLE IF NOT EXISTS public.session_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_session_entry_creator ON public.session_entry(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_session_entry_target ON public.session_entry(target_user_id);
CREATE INDEX IF NOT EXISTS idx_session_entry_session ON public.session_entry(session_id);
CREATE INDEX IF NOT EXISTS idx_session_entry_status ON public.session_entry(status);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_session_entry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_entry_updated_at
  BEFORE UPDATE ON public.session_entry
  FOR EACH ROW
  EXECUTE FUNCTION update_session_entry_updated_at();

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.session_entry ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso (ajusta según tus necesidades)
-- Los usuarios pueden ver session_entries donde son creator o target
CREATE POLICY "Users can view their own session entries"
  ON public.session_entry
  FOR SELECT
  USING (
    auth.uid() = creator_user_id OR 
    auth.uid() = target_user_id
  );

-- Los usuarios pueden insertar session_entries donde son creator
CREATE POLICY "Users can create session entries as creator"
  ON public.session_entry
  FOR INSERT
  WITH CHECK (auth.uid() = creator_user_id);

-- Los usuarios pueden actualizar session_entries donde son creator
CREATE POLICY "Users can update their created session entries"
  ON public.session_entry
  FOR UPDATE
  USING (auth.uid() = creator_user_id);

-- Service role puede hacer todo (usado por el backend)
CREATE POLICY "Service role has full access to session_entry"
  ON public.session_entry
  FOR ALL
  USING (auth.role() = 'service_role');
