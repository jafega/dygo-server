-- Script para renombrar la columna patiente_user_id a patient_user_id
-- en las tablas sessions e invoices
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase

-- ============================================
-- 1. TABLA SESSIONS
-- ============================================

-- Eliminar constraint de foreign key existente
ALTER TABLE sessions 
DROP CONSTRAINT IF EXISTS sessions_patiente_user_id_fkey;

-- Renombrar la columna
ALTER TABLE sessions 
RENAME COLUMN patiente_user_id TO patient_user_id;

-- Recrear el constraint con el nombre correcto
ALTER TABLE sessions 
ADD CONSTRAINT sessions_patient_user_id_fkey 
FOREIGN KEY (patient_user_id) REFERENCES users(id);

-- ============================================
-- 2. TABLA INVOICES
-- ============================================

-- Eliminar constraint de foreign key existente
ALTER TABLE invoices 
DROP CONSTRAINT IF EXISTS invoices_patiente_user_id_fkey;

-- Renombrar la columna
ALTER TABLE invoices 
RENAME COLUMN patiente_user_id TO patient_user_id;

-- Recrear el constraint con el nombre correcto
ALTER TABLE invoices 
ADD CONSTRAINT invoices_patient_user_id_fkey 
FOREIGN KEY (patient_user_id) REFERENCES users(id);

-- ============================================
-- 3. VERIFICACIÓN
-- ============================================

-- Verificar las columnas de sessions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'sessions' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar las columnas de invoices
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'invoices' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar los constraints
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name IN ('sessions', 'invoices')
AND constraint_type = 'FOREIGN KEY'
ORDER BY table_name, constraint_name;
