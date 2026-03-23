-- Crear tabla psychologist_profiles en Supabase
CREATE TABLE IF NOT EXISTS psychologist_profiles (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsquedas
CREATE INDEX IF NOT EXISTS idx_psychologist_profiles_id ON psychologist_profiles(id);

-- Habilitar RLS (Row Level Security)
ALTER TABLE psychologist_profiles ENABLE ROW LEVEL SECURITY;

-- Política: Permitir todas las operaciones (ajustar según necesidades de seguridad)
CREATE POLICY "Enable all operations for psychologist_profiles" ON psychologist_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verificar estructura
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'psychologist_profiles'
ORDER BY ordinal_position;
