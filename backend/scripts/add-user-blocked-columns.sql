-- add-user-blocked-columns.sql
--
-- Bloqueo de cuentas desde el panel de superadmin.
--
-- Van como columnas de tabla y NO dentro de users.data a proposito: es un flag
-- de control de acceso y varios endpoints reescriben `data` entero a partir de
-- un objeto en memoria (ver cleanUserDataForStorage en backend/server.js). Si
-- el bloqueo viviera ahi, una escritura con datos viejos lo borraria sin que
-- nadie se enterara.
--
-- Nullable y sin default: NULL = cuenta normal. Con fecha = bloqueada.
-- Idempotente: se puede ejecutar mas de una vez sin romper nada.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS blocked_at     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS blocked_by     text,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

-- Indice parcial: la consulta que importa es "damelas todas las bloqueadas",
-- que se hace en cada peticion autenticada (con cache de 60s). Lo normal es
-- que la tabla no tenga ninguna, y el indice parcial ocupa casi nada.
CREATE INDEX IF NOT EXISTS users_blocked_at_idx
  ON public.users (blocked_at)
  WHERE blocked_at IS NOT NULL;

COMMENT ON COLUMN public.users.blocked_at     IS 'Fecha en que un superadmin bloqueo la cuenta. NULL = activa.';
COMMENT ON COLUMN public.users.blocked_by     IS 'Email del superadmin que la bloqueo.';
COMMENT ON COLUMN public.users.blocked_reason IS 'Motivo opcional, solo visible en el panel de superadmin.';
