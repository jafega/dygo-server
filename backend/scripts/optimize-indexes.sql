-- =============================================================================
-- OPTIMIZACIÓN: Crear índices en Supabase para acelerar las queries más lentas
-- =============================================================================
-- Ejecutar en el SQL Editor de Supabase.
-- Estos índices son idempotentes (IF NOT EXISTS) — se pueden re-ejecutar sin riesgo.
--
-- Basado en pg_stat_statements:
--   session_entry SELECT *         →  44.66% del tiempo total (media 2.8s)
--   sessions SELECT *              →  11.05% del tiempo total
--   session_entry WHERE creator    →   7.69% del tiempo total
--   users SELECT *                 →   5.64% del tiempo total
--   care_relationships SELECT *    →   2.96% del tiempo total
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) session_entry — TOP OFFENDER (44% del tiempo de DB)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_entry_creator ON public.session_entry(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_session_entry_target  ON public.session_entry(target_user_id);
CREATE INDEX IF NOT EXISTS idx_session_entry_status  ON public.session_entry(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) sessions — 11% del tiempo de DB
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_psych     ON public.sessions(psychologist_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_patient   ON public.sessions(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status    ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_starts_on ON public.sessions(starts_on);
CREATE INDEX IF NOT EXISTS idx_sessions_ends_on   ON public.sessions(ends_on);
CREATE INDEX IF NOT EXISTS idx_sessions_invoice   ON public.sessions(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) care_relationships — 3% del tiempo de DB
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_care_rel_psych   ON public.care_relationships(psychologist_user_id);
CREATE INDEX IF NOT EXISTS idx_care_rel_patient ON public.care_relationships(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_care_rel_active  ON public.care_relationships(active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) invoices — 2% del tiempo de DB
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_psych   ON public.invoices(psychologist_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON public.invoices(patient_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) users — LOGIN/AUTH (5.6% del tiempo, 572 llamadas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_email        ON public.users(user_email);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) bono
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bono_psych   ON public.bono(psychologist_user_id);
CREATE INDEX IF NOT EXISTS idx_bono_patient ON public.bono(pacient_user_id);
CREATE INDEX IF NOT EXISTS idx_bono_invoice ON public.bono(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) goals, invitations, dispo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_goals_patient     ON public.goals(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_psych ON public.invitations(psychologist_user_id);
CREATE INDEX IF NOT EXISTS idx_dispo_psych       ON public.dispo(psychologist_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) ANALYZE — Actualizar estadísticas del query planner tras los índices
-- ─────────────────────────────────────────────────────────────────────────────
ANALYZE public.session_entry;
ANALYZE public.sessions;
ANALYZE public.care_relationships;
ANALYZE public.invoices;
ANALYZE public.users;
ANALYZE public.bono;
ANALYZE public.goals;
ANALYZE public.invitations;
ANALYZE public.dispo;
