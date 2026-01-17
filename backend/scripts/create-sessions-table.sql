-- Script para crear la tabla sessions en Supabase
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para mejorar rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_sessions_psychologist ON sessions USING btree ((data->>'psychologistId'));
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions USING btree ((data->>'patientId'));
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions USING btree ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions USING btree ((data->>'date'));

-- Habilitar RLS (Row Level Security) - opcional pero recomendado
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Política de seguridad: permitir todo acceso a usuarios autenticados
-- Ajusta estas políticas según tus necesidades de seguridad
CREATE POLICY "Enable all access for authenticated users" ON sessions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Ver los datos actuales (debería estar vacío inicialmente)
SELECT COUNT(*) as total_sessions FROM sessions;
