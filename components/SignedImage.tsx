/**
 * Adjuntos que viven en un bucket PRIVADO de Supabase Storage.
 *
 * Un <img src> o un <iframe src> no mandan las cabeceras de autenticación de la app,
 * así que primero se pide al backend una URL firmada de corta vida (que además
 * comprueba permisos) y solo entonces se pinta. Mientras resuelve se muestra un
 * placeholder; si no hay permiso o el fichero ya no existe, un aviso en lugar de un
 * icono roto.
 */

import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getSignedFileUrl } from '../services/signedFileUrl';

/**
 * Resuelve la URL firmada de un adjunto y la mantiene en estado.
 * Útil cuando la URL hace falta en un atributo que no admite carga diferida
 * (un <iframe src>), no solo en un <img>.
 */
export function useSignedUrl(refPath: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);

    if (!refPath) { setFailed(true); return; }

    getSignedFileUrl(refPath)
      .then(signed => {
        if (!alive) return;
        if (signed) setUrl(signed); else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });

    // Evita pintar el resultado de una petición vieja si el adjunto cambió.
    return () => { alive = false; };
  }, [refPath]);

  return { url, failed, markFailed: () => setFailed(true) };
}

interface SignedImageProps {
  /** Ruta `bucket/objeto` o URL guardada en la BD. */
  refPath: string | null | undefined;
  alt?: string;
  className?: string;
}

const SignedImage: React.FC<SignedImageProps> = ({ refPath, alt = '', className = '' }) => {
  const { url, failed, markFailed } = useSignedUrl(refPath);

  if (failed) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-slate-100 text-slate-400`}
        title="No disponible"
      >
        <ImageOff size={20} />
      </div>
    );
  }

  if (!url) {
    return <div className={`${className} bg-slate-100 animate-pulse`} aria-label="Cargando imagen" />;
  }

  return <img src={url} alt={alt} className={className} onError={markFailed} />;
};

export default SignedImage;
