-- =============================================================================
-- DELETE INVOICES: Eliminar todas las facturas de daniel.m.mendezv@gmail.com
-- =============================================================================
--
-- INSTRUCCIONES: Ejecutar en el SQL Editor de Supabase.
--   1. Primero ejecuta SOLO el bloque "DRY RUN" para ver qué se va a borrar.
--   2. Si los números son correctos, ejecuta el bloque "EXECUTE".
--   3. En caso de error, el ROLLBACK dentro del EXCEPTION deshace todo automáticamente.
--
-- Relaciones FK que requieren desvinculación previa:
--   sessions.invoice_id  → invoices(id)  [SET NULL]
--   bono.invoice_id      → invoices(id)  [SET NULL]
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1) DRY RUN: Ver qué se va a borrar (ejecutar esto primero, NO borra nada)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_psych_id   text;
  v_invoice_ids text[];
BEGIN
  SELECT id INTO v_psych_id
    FROM public.users
    WHERE lower(user_email) = 'daniel.m.mendezv@gmail.com'
    LIMIT 1;

  IF v_psych_id IS NULL THEN
    RAISE NOTICE '❌ No se encontró usuario con email daniel.m.mendezv@gmail.com';
    RETURN;
  END IF;

  RAISE NOTICE '🔍 Psicólogo ID: %', v_psych_id;

  SELECT coalesce(array_agg(id), '{}') INTO v_invoice_ids
    FROM public.invoices
    WHERE psychologist_user_id = v_psych_id;

  RAISE NOTICE '📄 Facturas a eliminar:    %', array_length(v_invoice_ids, 1);
  RAISE NOTICE '🔗 Sesiones con invoice_id: %',
    (SELECT count(*) FROM public.sessions  WHERE invoice_id = ANY(v_invoice_ids));
  RAISE NOTICE '🔗 Bonos con invoice_id:    %',
    (SELECT count(*) FROM public.bono      WHERE invoice_id = ANY(v_invoice_ids));

  RAISE NOTICE '✅ DRY RUN completado. No se borró nada.';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2) EXECUTE: Desvincular y borrar facturas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_psych_id    text;
  v_invoice_ids text[];
  v_count       bigint;
BEGIN
  SELECT id INTO v_psych_id
    FROM public.users
    WHERE lower(user_email) = 'daniel.m.mendezv@gmail.com'
    LIMIT 1;

  IF v_psych_id IS NULL THEN
    RAISE EXCEPTION '❌ No se encontró usuario con email daniel.m.mendezv@gmail.com';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_invoice_ids
    FROM public.invoices
    WHERE psychologist_user_id = v_psych_id;

  IF array_length(v_invoice_ids, 1) IS NULL THEN
    RAISE NOTICE '⚠️  No hay facturas para este usuario. Nada que hacer.';
    RETURN;
  END IF;

  RAISE NOTICE '🗑 Eliminando % facturas del psicólogo %', array_length(v_invoice_ids, 1), v_psych_id;

  -- 1. Desvincular sessions (SET invoice_id = NULL)
  UPDATE public.sessions
    SET invoice_id = NULL
    WHERE invoice_id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  sessions desvinculadas:  %', v_count;

  -- 2. Desvincular bonos (SET invoice_id = NULL)
  UPDATE public.bono
    SET invoice_id = NULL
    WHERE invoice_id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  bonos desvinculados:     %', v_count;

  -- 3. Eliminar las facturas
  DELETE FROM public.invoices
    WHERE id = ANY(v_invoice_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE '  facturas eliminadas:     %', v_count;

  RAISE NOTICE '✅ Operación completada correctamente.';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Error: % — %', SQLSTATE, SQLERRM;
  RAISE; -- propaga el error para que Supabase haga ROLLBACK automático
END $$;
