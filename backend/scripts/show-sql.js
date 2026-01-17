// Script para crear la tabla sessions en Supabase usando Management API
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas');
  process.exit(1);
}

const SQL = `
-- Crear tabla sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_sessions_psychologist ON sessions USING btree ((data->>'psychologistId'));
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions USING btree ((data->>'patientId'));
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions USING btree ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions USING btree ((data->>'date'));

-- Habilitar RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Crear política de acceso
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'sessions' 
        AND policyname = 'Enable all access for authenticated users'
    ) THEN
        CREATE POLICY "Enable all access for authenticated users" ON sessions
            FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
`.trim();

async function createTable() {
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectRef) {
    console.error('❌ No se pudo extraer el project ref de SUPABASE_URL');
    process.exit(1);
  }

  console.log('🔧 Proyecto Supabase:', projectRef);
  console.log('🌐 URL:', SUPABASE_URL);
  console.log('\n📋 Por favor, ejecuta este SQL en Supabase SQL Editor:\n');
  console.log('🔗 https://app.supabase.com/project/' + projectRef + '/sql/new\n');
  console.log('─'.repeat(70));
  console.log(SQL);
  console.log('─'.repeat(70));
  console.log('\n✅ Después de ejecutar el SQL, la tabla sessions estará lista.');
  console.log('💡 Luego reinicia el servidor backend con: node server.js\n');
}

createTable();
