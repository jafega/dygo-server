-- Script de migración para unificar IDs de usuario en care_relationships e invitations
-- Este script migra de psychologistId/patientId a psych_user_id/patient_user_id
-- IMPORTANTE: Ejecutar en Supabase SQL Editor

-- ============================================
-- PARTE 0: Migrar users (agregar columnas específicas)
-- ============================================

-- Paso 1: Agregar columnas específicas a users
DO $$
BEGIN
    -- Agregar email si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'email'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN email TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_users_email 
        ON public.users(email);
    END IF;

    -- Agregar name si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'name'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN name TEXT;
    END IF;

    -- Agregar role si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'users' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN role TEXT DEFAULT 'PATIENT';
    END IF;
END $$;

-- Paso 2: Migrar datos existentes de JSONB a columnas
UPDATE public.users 
SET email = COALESCE(email, data->>'email'),
    name = COALESCE(name, data->>'name'),
    role = COALESCE(role, data->>'role', 'PATIENT')
WHERE data IS NOT NULL;

-- Actualizar el campo data JSONB para incluir los campos
UPDATE public.users
SET data = data 
    || jsonb_build_object(
        'email', email,
        'name', name,
        'role', role
    )
WHERE data IS NOT NULL AND email IS NOT NULL;

-- ============================================
-- PARTE 1: Migrar care_relationships
-- ============================================

-- Paso 1: Agregar nuevas columnas a care_relationships
DO $$
BEGIN
    -- Agregar psych_user_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'care_relationships' 
        AND column_name = 'psych_user_id'
    ) THEN
        ALTER TABLE public.care_relationships 
        ADD COLUMN psych_user_id TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_care_relationships_psych_user_id 
        ON public.care_relationships(psych_user_id);
    END IF;

    -- Agregar patient_user_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'care_relationships' 
        AND column_name = 'patient_user_id'
    ) THEN
        ALTER TABLE public.care_relationships 
        ADD COLUMN patient_user_id TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_care_relationships_patient_user_id 
        ON public.care_relationships(patient_user_id);
    END IF;
    
    -- Agregar created_at si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'care_relationships' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE public.care_relationships 
        ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- Agregar ended_at si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'care_relationships' 
        AND column_name = 'ended_at'
    ) THEN
        ALTER TABLE public.care_relationships 
        ADD COLUMN ended_at TIMESTAMPTZ;
    END IF;
END $$;

-- Paso 2: Migrar datos existentes de JSONB a columnas
-- Primero desde el campo 'data' JSONB
UPDATE public.care_relationships 
SET psych_user_id = COALESCE(psych_user_id, data->>'psych_user_id', data->>'psychologistId'),
    patient_user_id = COALESCE(patient_user_id, data->>'patient_user_id', data->>'patientId'),
    created_at = COALESCE(created_at, 
        CASE 
            WHEN data->>'createdAt' IS NOT NULL 
            THEN to_timestamp((data->>'createdAt')::bigint / 1000.0)
            ELSE NOW()
        END
    ),
    ended_at = CASE 
        WHEN data->>'endedAt' IS NOT NULL 
        THEN to_timestamp((data->>'endedAt')::bigint / 1000.0)
        ELSE ended_at
    END
WHERE data IS NOT NULL;

-- También actualizar el campo data JSONB para incluir nuevos campos
UPDATE public.care_relationships
SET data = data 
    || jsonb_build_object(
        'psych_user_id', psych_user_id,
        'patient_user_id', patient_user_id,
        'createdAt', EXTRACT(EPOCH FROM created_at) * 1000,
        'endedAt', CASE WHEN ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM ended_at) * 1000 ELSE NULL END
    )
WHERE data IS NOT NULL AND psych_user_id IS NOT NULL;

-- ============================================
-- PARTE 2: Migrar invitations
-- ============================================

-- Paso 1: Agregar nuevas columnas a invitations
DO $$
BEGIN
    -- Agregar status si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN status TEXT DEFAULT 'PENDING';
    END IF;

    -- Agregar psych_user_id si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'psych_user_id'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN psych_user_id TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_invitations_psych_user_id 
        ON public.invitations(psych_user_id);
    END IF;

    -- Agregar psych_user_email si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'psych_user_email'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN psych_user_email TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_invitations_psych_user_email 
        ON public.invitations(psych_user_email);
    END IF;

    -- Agregar psych_user_name si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'psych_user_name'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN psych_user_name TEXT;
    END IF;

    -- Agregar patient_user_id si no existe (puede ser NULL si el paciente no existe aún)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'patient_user_id'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN patient_user_id TEXT;
        
        CREATE INDEX IF NOT EXISTS idx_invitations_patient_user_id 
        ON public.invitations(patient_user_id);
    END IF;

    -- Agregar patient_user_email si no existe (siempre debe tener valor)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'patient_user_email'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN patient_user_email TEXT NOT NULL DEFAULT '';
        
        CREATE INDEX IF NOT EXISTS idx_invitations_patient_user_email 
        ON public.invitations(patient_user_email);
    END IF;

    -- Agregar patient_user_name si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invitations' 
        AND column_name = 'patient_user_name'
    ) THEN
        ALTER TABLE public.invitations 
        ADD COLUMN patient_user_name TEXT;
    END IF;

    -- AgreMigrar datos existentes de JSONB a columnas
-- Migrar desde el campo 'data' JSONB
UPDATE public.invitations 
SET status = COALESCE(status, data->>'status', 'PENDING'),
    psych_user_id = COALESCE(psych_user_id, data->>'psych_user_id', data->>'psychologistId'),
    psych_user_email = COALESCE(psych_user_email, data->>'psych_user_email', data->>'psychologistEmail'),
    psych_user_name = COALESCE(psych_user_name, data->>'psych_user_name', data->>'psychologistName'),
    patient_user_id = COALESCE(patient_user_id, data->>'patient_user_id', data->>'patientId'),
    patient_user_email = COALESCE(patient_user_email, data->>'patient_user_email', data->>'patientEmail'),
    patient_user_name = COALESCE(patient_user_name, data->>'patient_user_name', data->>'patientName'),
    patient_first_name = COALESCE(patient_first_name, data->>'patient_first_name', data->>'patientFirstName'),
    patient_last_name = COALESCE(patient_last_name, data->>'patient_last_name', data->>'patientLastName')
WHERE data IS NOT NULL;

-- También actualizar el campo data JSONB para incluir nuevos campos
UPDATE public.invitations
SET data = data 
    || jsonb_build_object(
        'status', status,
        'psych_user_id', psych_user_id,
        'psych_user_email', psych_user_email,
        'psych_user_name', psych_user_name,
        'patient_user_id', patient_user_id,
        'patient_user_email', patient_user_email,
        'patient_user_name', patient_user_name,
        'patient_first_name', patient_first_name,
        'patient_last_name', patient_last_name
    )
WHERE data IS NOT NULL AND psych_user_emailuser_email = data->>'psychologistEmail',
    psych_user_name = data->>'psychologistName',
    patient_user_id = data->>'patientId',
    patient_user_email = data->>'patientEmail',
    patient_user_name = data->>'patientName',
    patient_first_name = data->>'patientFirstName',
    patient_last_name = data->>'patientLastName'
WHERE psych_user_id IS NULL 
  AND data ? 'psychologistId';

-- Paso 3: También actualizar el campo data JSONB para incluir nuevos campos
UPDATE public.invitations
SET data = data 
    || jsonb_build_object(
        'psych_user_id', COALESCE(psych_user_id, data->>'psychologistId'),
        'psych_user_email', COALESCE(psych_user_email, data->>'psychologistEmail'),
        'psych_user_name', COALESCE(psych_user_name, data->>'psychologistName'),
        'patient_user_id', COALESCE(patient_user_id, data->>'patientId'),
        'patient_user_email', COALESCE(patient_user_email, data->>'patientEmail'),
        'patient_user_name', COALESCE(patient_user_name, data->>'patientName'),
        'patient_first_name', COALESCE(patient_first_name, data->>'patientFirstName'),
        'patient_last_name', COALESCE(patient_last_name, data->>'patientLastName')
    )
WHERE data IS NOT NULL;

-- ============================================
-- PARTE 3: Verificación
-- ============================================

-- Verificar migración de care_relationships
SELECT 
    COUNT(*) as total,
    COUNT(psych_user_id) as con_psych_user_id,
    COUNT(patient_user_id) as con_patient_user_id,
    COUNT(psychologistId) as con_psychologistId_legacy,
    COUNT(patientId) as con_patientId_legacy
FROM public.care_relationships;

-- Verificar migración de invitations
SELECT 
    COUNT(*) as total,
    COUNT(psych_user_id) as con_psych_user_id,
    COUNT(patient_user_email) as con_patient_user_email,
    COUNT(psychologistId) as con_psychologistId_legacy,
    COUNT(patientEmail) as con_patientEmail_legacy
FROM public.invitations;
created_at) as con_created_at
FROM public.care_relationships;

-- Verificar migración de invitations
SELECT 
    COUNT(*) as total,
    COUNT(psych_user_id) as con_psych_user_id,
    COUNT(psych_user_email) as con_psych_user_email,
    COUNT(patient_user_email) as con_patient_user_email,
    COUNT(patient_user_id) as con_patient_user_id_filled,
    COUNT(*) - COUNT(patient_user_id) as con_patient_user_id_null
FROM public.invitations;

-- ============================================
-- PARTE 4: Índices ya creados en los bloques DO
-- (No es necesario volver a crearlos)
-- ============================================

-- ============================================
-- NOTAS IMPORTANTES:
-- ============================================
-- 1. Los campos legacy (psychologistId, patientId, etc.) se mantienen 
--    en el campo JSONB 'data' para compatibilidad temporal
-- 2. Las nuevas columnas (psych_user_id, patient_user_id) son las principales
-- 3. En invitations, patient_user_id puede ser NULL si el paciente no existe aún
-- 4. patient_user_email en invitations SIEMPRE debe tener valor
-- 5. El código del backend está diseñado para usar las nuevas columnas
-- 6. Los índices se crean automáticamente en los bloques DO
-- ============================================