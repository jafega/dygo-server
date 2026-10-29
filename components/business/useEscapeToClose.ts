import { useEffect } from 'react';

/**
 * Escape cierra el último modal abierto. Todos los modales de mainds business
 * son `role="dialog" aria-modal="true"` con un botón `aria-label="Cerrar"`:
 * pulsarlo reutiliza el cierre de cada modal (sin duplicar su lógica).
 */
export function useEscapeToClose() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      const close = dialogs[dialogs.length - 1]?.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]');
      if (close) {
        e.preventDefault();
        close.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
