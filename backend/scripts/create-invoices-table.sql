-- Script para crear la tabla invoices en Supabase
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices para mejorar rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_invoices_psychologist ON invoices USING btree ((data->>'psychologistId'));
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices USING btree ((data->>'patientId'));
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices USING btree ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices USING btree ((data->>'invoiceNumber'));

-- Habilitar RLS (Row Level Security)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Política de seguridad: permitir todo acceso a usuarios autenticados
CREATE POLICY "Enable all access for authenticated users" ON invoices
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Ver los datos actuales (debería estar vacío inicialmente)
SELECT COUNT(*) as total_invoices FROM invoices;
