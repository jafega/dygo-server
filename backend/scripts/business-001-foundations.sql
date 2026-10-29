-- business-001-foundations.sql
--
-- mainds business — Fase 0 (cimientos).
--
-- access_audit: registro de QUIÉN accedió a QUÉ y cuándo (lecturas de historia
-- clínica, accesos de emergencia "break-the-glass", cambios sensibles). Lo usa
-- backend/business/audit.js → recordAccess(). Sirve para Business y también
-- para el espacio personal (org_id NULL).
--
-- Reglas:
--   - Solo inserción: un trigger impide UPDATE y DELETE (también al service
--     role, que se salta RLS pero no los triggers). Si hay que corregir algo se
--     inserta una entrada nueva.
--   - RLS activado SIN políticas: solo el backend (service role) lee y escribe.
--   - Nunca contenido clínico ni nombres/emails de pacientes: solo ids. La
--     `justification` es el motivo que escribe el profesional en un acceso de
--     emergencia.
--   - Sin claves foráneas a users/organizations: la auditoría tiene que
--     sobrevivir aunque se borre el usuario o la organización.
--
-- Ejecutar a mano en el SQL Editor de Supabase. Idempotente: se puede
-- ejecutar varias veces.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  at timestamptz NOT NULL DEFAULT now(),
  org_id uuid,                      -- NULL = espacio personal
  actor_user_id text NOT NULL,      -- users.id de quien accede
  action text NOT NULL,             -- p. ej. 'clinical.read', 'clinical.break_glass'
  resource_type text,               -- p. ej. 'clinical_note', 'patient'
  resource_id text,
  patient_user_id text,             -- users.id del paciente afectado (si aplica)
  justification text,               -- motivo (obligatorio en break-the-glass)
  ip text
);

CREATE INDEX IF NOT EXISTS idx_access_audit_org_at ON public.access_audit (org_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_patient_at ON public.access_audit (patient_user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_actor_at ON public.access_audit (actor_user_id, at DESC);

ALTER TABLE public.access_audit ENABLE ROW LEVEL SECURITY;

-- Solo inserción
CREATE OR REPLACE FUNCTION public.access_audit_block_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'access_audit es de solo inserción (% bloqueado)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_access_audit_block_changes ON public.access_audit;
CREATE TRIGGER trg_access_audit_block_changes
  BEFORE UPDATE OR DELETE ON public.access_audit
  FOR EACH ROW EXECUTE FUNCTION public.access_audit_block_changes();

COMMENT ON TABLE public.access_audit IS
  'mainds business F0: auditoría de accesos. Solo inserción, RLS sin políticas, sin contenido clínico.';
