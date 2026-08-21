/**
 * URLs firmadas para adjuntos clínicos.
 *
 * POR QUÉ: los buckets de adjuntos eran públicos, así que el PDF de un paciente se
 * descargaba con la URL a pelo, sin autenticarse. Ahora los buckets son privados y hay
 * que pedir al backend una URL firmada de corta vida, que además comprueba que quien
 * la pide es el paciente, su psicólogo o un superadmin.
 *
 * La auth de la app va por cabeceras y un <img>/<a> no las envía, así que el patrón es:
 * pedir la URL firmada por `apiFetch` y usar ESA en el href/src.
 *
 * Acepta lo que haya guardado en la BD: una URL pública antigua o un `bucket/objeto`.
 * El backend sabe extraer el objeto de ambas formas, así que no hace falta migrar datos.
 */

import { apiFetch } from './authService';
import { API_URL } from './config';

const TTL_MS = 60 * 60 * 1000;        // el backend firma por 1 hora
const RENEW_MARGIN_MS = 5 * 60 * 1000; // se renueva 5 min antes de caducar

type CacheEntry = { url: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

/** ¿Es ya una URL firmada o de datos que no hace falta resolver? */
const needsSigning = (ref: string): boolean => {
  if (!ref) return false;
  if (ref.startsWith('data:') || ref.startsWith('blob:')) return false;
  // Una URL ya firmada trae token; si aún no ha caducado sirve tal cual, pero no
  // sabemos cuándo lo hace, así que se vuelve a firmar por seguridad.
  return true;
};

/**
 * Devuelve una URL firmada válida para el adjunto, o null si no se pudo firmar
 * (sin permiso, fichero borrado, backend caído). Cachea en memoria y colapsa
 * peticiones simultáneas para el mismo fichero.
 */
export async function getSignedFileUrl(ref: string | null | undefined): Promise<string | null> {
  if (!ref || !needsSigning(ref)) return ref || null;

  const now = Date.now();
  const hit = cache.get(ref);
  if (hit && hit.expiresAt - RENEW_MARGIN_MS > now) return hit.url;

  const pending = inflight.get(ref);
  if (pending) return pending;

  const task = (async (): Promise<string | null> => {
    try {
      const res = await apiFetch(`${API_URL}/storage/signed-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ref })
      });
      if (!res.ok) {
        console.warn('[signedFileUrl] no se pudo firmar', ref, res.status);
        return null;
      }
      const data = await res.json();
      if (!data?.signedUrl) return null;
      cache.set(ref, { url: data.signedUrl, expiresAt: Date.now() + TTL_MS });
      return data.signedUrl as string;
    } catch (err) {
      console.error('[signedFileUrl] error firmando', err);
      return null;
    } finally {
      inflight.delete(ref);
    }
  })();

  inflight.set(ref, task);
  return task;
}

/**
 * Abre el adjunto en una pestaña nueva, o lo descarga si se pasa `downloadName`.
 * Para usar en onClick de un enlace: resuelve la URL firmada y luego navega.
 */
export async function openSignedFile(
  ref: string | null | undefined,
  downloadName?: string
): Promise<void> {
  const url = await getSignedFileUrl(ref);
  if (!url) {
    alert('No se pudo abrir el archivo. Puede que ya no exista o que no tengas permiso.');
    return;
  }
  if (downloadName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Limpia la caché (p. ej. al cerrar sesión, para no dejar URLs firmadas vivas). */
export function clearSignedUrlCache(): void {
  cache.clear();
  inflight.clear();
}
