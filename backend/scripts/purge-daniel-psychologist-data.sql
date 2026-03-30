-- =============================================================================
-- PURGE: Eliminar todos los datos de psicólogo de Daniel (daniel.m.mendezv@gmail.com)
-- =============================================================================
-- 
-- INSTRUCCIONES: Ejecutar en el SQL Editor de Supabase.
--   1. Primero ejecuta SOLO el bloque "DRY RUN" para ver qué se va a borrar.
--   2. Si los números son correctos, ejecuta el bloque "EXECUTE" dentro de la transacción.
--   3. En caso de error, el ROLLBACK dentro del EXCEPTION deshace todo automáticamente.
--
-- Emails protegidos (NUNCA se borra su registro de users):
--   - garryjavi@gmail.com
--   - daniel.m.mendezv@gmail.com
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) DRY RUN: Ver qué se va a borrar (ejecutar esto primero, NO borra nada)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_psych_id text;
  v_no_auth_ids text[];
  v_has_auth_ids text[];
  v_protected_ids text[];
BEGIN
  -- Obtener el user ID de Daniel
  SELECT id INTO v_psych_id
    FROM public.users
    WHERE lower(user_email) = 'daniel.m.mendezv@gmail.com'
    LIMIT 1;

  IF v_psych_id IS NULL THEN
    RAISE NOTICE '❌ No se encontró usuario con email daniel.m.mendezv@gmail.com';
    RETURN;
  END IF;

  RAISE NOTICE '🔍 Psicólogo ID: %', v_psych_id;

  -- IDs protegidos
  SELECT array_agg(id) INTO v_protected_ids
    FROM public.users
    WHERE lower(user_email) IN ('garryjavi@gmail.com', 'daniel.m.mendezv@gmail.com');

  -- Pacientes SIN auth (se borrarán completamente)
  SELECT coalesce(array_agg(u.id), '{}') INTO v_no_auth_ids
    FROM public.care_relationships cr
    JOIN public.users u ON u.id = cr.patient_user_id
    WHERE cr.psychologist_user_id = v_psych_id
      AND u.auth_user_id IS NULL
      AND u.id != ALL(coalesce(v_protected_ids, '{}'));

  -- Pacientes CON auth (solo se borran datos del psicólogo)
  SELECT coalesce(array_agg(u.id), '{}') INTO v_has_auth_ids
    FROM public.care_relationships cr
    JOIN public.users u ON u.id = cr.patient_user_id
    WHERE cr.psychologist_user_id = v_psych_id
      AND u.auth_user_id IS NOT NULL
      AND u.id != ALL(coalesce(v_protected_ids, '{}'));

  RAISE NOTICE '📊 Pacientes sin auth (se borrarán): %', array_length(v_no_auth_ids, 1);
  RAISE NOTICE '📊 Pacientes con auth (solo relación): %', array_length(v_has_auth_ids, 1);
  RAISE NOTICE '   IDs sin auth: %', v_no_auth_ids;
  RAISE NOTICE '   IDs con auth: %', v_has_auth_ids;

  -- Contar lo que se borraría
  RAISE NOTICE '── Conteos de registros a eliminar ──';
  RAISE NOTICE 'sessions:          %', (SELECT count(*) FROM public.sessions WHERE psychologist_user_id = v_psych_id);
  RAISE NOTICE 'bono:              %', (SELECT count(*) FROM public.bono WHERE psychologist_user_id = v_psych_id);
  RAISE NOTICE 'invoices:          %', (SELECT count(*) FROM public.invoices WHERE psychologist_user_id = v_psych_id);
  RAISE NOTICE 'signatures (psych):%', (SELECT count(*) FROM public.signatures WHERE psych_user_id = v_psych_id);
  RAISE NOTICE 'templates (custom):%', (SELECT count(*) FROM public.templates WHERE psych_user_id = v_psych_id AND master = false);

  IF array_length(v_no_auth_ids, 1) > 0 THEN
    RAISE NOTICE '── Grupo A (sin auth) ──';
    RAISE NOTICE 'session_entry:     %', (SELECT count(*) FROM public.session_entry WHERE target_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'entries:           %', (SELECT count(*) FROM public.entries WHERE target_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'goals:             %', (SELECT count(*) FROM public.goals WHERE patient_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'settings:          %', (SELECT count(*) FROM public.settings WHERE user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'invitations:       %', (SELECT count(*) FROM public.invitations WHERE patient_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'signatures (pat):  %', (SELECT count(*) FROM public.signatures WHERE patient_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'care_relationships:%', (SELECT count(*) FROM public.care_relationships WHERE patient_user_id = ANY(v_no_auth_ids));
    RAISE NOTICE 'users (managed):   %', (SELECT count(*) FROM public.users WHERE id = ANY(v_no_auth_ids));
  END IF;

  IF array_length(v_has_auth_ids, 1) > 0 THEN
    RAISE NOTICE '── Grupo B (con auth) ──';
    RAISE NOTICE 'session_entry:     %', (SELECT count(*) FROM public.session_entry WHERE creator_user_id = v_psych_id AND target_user_id = ANY(v_has_auth_ids));
    RAISE NOTICE 'entries:           %', (SELECT count(*) FROM public.entries WHERE creator_user_id = v_psych_id AND target_user_id = ANY(v_has_auth_ids));
    RAISE NOTICE 'invitations:       %', (SELECT count(*) FROM public.invitations WHERE psychologist_user_id = v_psych_id AND patient_user_id = ANY(v_has_auth_ids));
    RAISE NOTICE 'care_relationships:%', (SELECT count(*) FROM public.care_relationships WHERE psychologist_user_id = v_psych_id AND patient_user_id = ANY(v_has_auth_ids));
  END IF;

  RAISE NOTICE '✅ DRY RUN completado. No se borró nada.';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) EXECUTE: Borrar datos (ejecutar SOLO después de revisar el dry run)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_psych_id text;
  v_no_auth_ids text[];
  v_has_auth_ids text[];
  v_protected_ids text[];
  v_count bigint;
BEGIN
  -- Obtener el user ID de Daniel
  SELECT id INTO v_psych_id
    FROM public.users
    WHERE lower(user_email) = 'daniel.m.mendezv@gmail.com'
    LIMIT 1;

  IF v_psych_id IS NULL THEN
    RAISE EXCEPTION '❌ No se encontró usuario con email daniel.m.mendezv@gmail.com';
  END IF;

  -- IDs protegidos
  SELECT array_agg(id) INTO v_protected_ids
    FROM public.users
    WHERE lower(user_email) IN ('garryjavi@gmail.com', 'daniel.m.mendezv@gmail.com');

  -- Pacientes SIN auth
  SELECT coalesce(array_agg(u.id), '{}') INTO v_no_auth_ids
    FROM public.care_relationships cr
    JOIN public.users u ON u.id = cr.patient_user_id
    WHERE cr.psychologist_user_id = v_psych_id
      AND u.auth_user_id IS NULL
      AND u.id != ALL(coalesce(v_protected_ids, '{}'));

  -- Pacientes CON auth
  SELECT coalesce(array_agg(u.id), '{}') INTO v_has_auth_ids
    FROM public.care_relationships cr
    JOIN public.users u ON u.id = cr.patient_user_id
    WHERE cr.psychologist_user_id = v_psych_id
      AND u.auth_user_id IS NOT NULL
      AND u.id != ALL(coalesce(v_protected_ids, '{}'));

  RAISE NOTICE '🗑 Purgando datos de psicólogo: % | sin-auth: % | con-auth: %',
    v_psych_id, array_length(v_no_auth_ids, 1), array_length(v_has_auth_ids, 1);

  -- ═══ Orden de borrado respeta FK constraints ═══

  -- 1. Sessions (FK → bono, invoices, session_entry)
  DELETE FROM public.sessions WHERE psychologist_user_id = v_psych_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  sessions:          % borradas', v_count;

  -- 2. Bonos (FK → invoices)
  DELETE FROM public.bono WHERE psychologist_user_id = v_psych_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  bono:              % borrados', v_count;

  -- 3. Invoices
  DELETE FROM public.invoices WHERE psychologist_user_id = v_psych_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  invoices:          % borradas', v_count;

  -- ═══ GRUPO A: Pacientes sin auth (borrar todo) ═══
  IF array_length(v_no_auth_ids, 1) > 0 THEN
    DELETE FROM public.session_entry WHERE target_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  session_entry (A): % borradas', v_count;

    DELETE FROM public.entries WHERE target_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  entries (A):       % borradas', v_count;

    DELETE FROM public.goals WHERE patient_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  goals (A):         % borrados', v_count;

    DELETE FROM public.settings WHERE user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  settings (A):      % borrados', v_count;

    DELETE FROM public.invitations WHERE patient_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  invitations (A):   % borradas', v_count;

    DELETE FROM public.signatures WHERE patient_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  signatures (A):    % borradas', v_count;

    DELETE FROM public.care_relationships WHERE patient_user_id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  care_rels (A):     % borradas', v_count;

    DELETE FROM public.users WHERE id = ANY(v_no_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  users (A):         % borrados', v_count;
  END IF;

  -- ═══ GRUPO B: Pacientes con auth (solo datos del psicólogo) ═══
  IF array_length(v_has_auth_ids, 1) > 0 THEN
    DELETE FROM public.session_entry
      WHERE creator_user_id = v_psych_id AND target_user_id = ANY(v_has_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  session_entry (B): % borradas', v_count;

    DELETE FROM public.entries
      WHERE creator_user_id = v_psych_id AND target_user_id = ANY(v_has_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  entries (B):       % borradas', v_count;

    DELETE FROM public.invitations
      WHERE psychologist_user_id = v_psych_id AND patient_user_id = ANY(v_has_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  invitations (B):   % borradas', v_count;

    DELETE FROM public.care_relationships
      WHERE psychologist_user_id = v_psych_id AND patient_user_id = ANY(v_has_auth_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  care_rels (B):     % borradas', v_count;
  END IF;

  -- ═══ Datos propios del psicólogo ═══
  DELETE FROM public.signatures WHERE psych_user_id = v_psych_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  signatures (psych):% borradas', v_count;

  DELETE FROM public.templates WHERE psych_user_id = v_psych_id AND master = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  templates:         % borradas', v_count;

  RAISE NOTICE '✅ Purge completado para daniel.m.mendezv@gmail.com';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Error: %. Todos los cambios se deshicieron (ROLLBACK).', SQLERRM;
  RAISE;
END $$;
