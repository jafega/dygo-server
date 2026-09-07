// email-optout.js — la baja, en un solo sitio.
//
// Regla de la casa: TODO email que no sea estrictamente de la cuenta lleva
// forma de darse de baja. Eso significa dos cosas a la vez, y hacen falta las
// dos:
//
//   1. El enlace visible en el pie, para quien lo busca.
//   2. Las cabeceras List-Unsubscribe / List-Unsubscribe-Post (RFC 8058), que
//      son las que hacen aparecer el botón nativo de "Cancelar suscripción"
//      arriba del todo en Gmail y Outlook. Sin ellas no hay botón, por mucho
//      enlace que lleve el pie — y Gmail penaliza al remitente que envía en
//      volumen sin ellas.
//
// La baja es por dirección de correo, no por usuario: la mitad de la gente a la
// que se escribe son leads que aún no tienen cuenta, y quien se da de baja
// espera dejar de recibir en esa dirección venga de donde venga el envío.
//
// Qué NO lleva baja, a propósito: facturas, recordatorios de sesión,
// invitaciones que le hace su psicólogo y restablecimientos de contraseña. Son
// gestiones de la cuenta o de su tratamiento, no comunicaciones comerciales;
// darles botón de baja confundiría a quien lo pulse esperando lo otro.

import crypto from 'crypto';
import { emailsBloqueados } from './user-block.js';

// La cabecera List-Unsubscribe-Post exige una URL https: un one-click sobre
// http lo rechazan los clientes de correo. FRONTEND_URL vale http en local y
// podria venir sin esquema, asi que la base se normaliza aqui en vez de
// confiar en como este puesta la variable.
const baseHttps = () => {
  const bruto = (process.env.FRONTEND_URL || 'https://mi.mainds.app').trim().replace(/\/+$/, '');
  if (/^https:\/\//i.test(bruto)) return bruto;
  // En desarrollo se respeta localhost tal cual: ahi no se envia correo real.
  if (/^http:\/\/(localhost|127\.0\.0\.1)/i.test(bruto)) return bruto;
  return bruto.replace(/^http:\/\//i, 'https://').replace(/^(?!https:\/\/)/i, 'https://');
};

const APP_URL = baseHttps();
const BUZON = 'info@mainds.app';

export const normalizarEmail = (email) => String(email || '').trim().toLowerCase();

/** Firma el email para que nadie pueda dar de baja a otro cambiando la URL. */
export const firmaBaja = (email) =>
  crypto.createHmac('sha256', process.env.SESSION_SECRET || 'mainds-baja')
    .update(normalizarEmail(email))
    .digest('hex')
    .slice(0, 20);

export const urlBaja = (email) => {
  const e = normalizarEmail(email);
  return `${APP_URL}/api/automation/optout?e=${encodeURIComponent(e)}&s=${firmaBaja(e)}`;
};

/**
 * Cabeceras que producen el botón nativo del cliente de correo.
 * El mailto: es el mecanismo de respaldo que exige la RFC cuando el
 * destinatario no puede seguir el enlace HTTPS.
 */
export const cabecerasBaja = (email) => ({
  'List-Unsubscribe': `<${urlBaja(email)}>, <mailto:${BUZON}?subject=unsubscribe>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
});

/** Pie con el enlace visible, en el mismo tono gris del resto del pie. */
export const pieBaja = (email) =>
  `<a href="${urlBaja(email)}" style="color:#94a3b8;text-decoration:underline">Dejar de recibir estos emails</a>`;

/**
 * Añade el pie de baja a un HTML que no lo lleve. Sirve para los emails que se
 * escriben a mano desde el CRM, donde quien redacta no va a acordarse.
 */
export const conPieBaja = (html, email) => {
  const cuerpo = String(html || '');
  if (cuerpo.includes('/api/automation/optout')) return cuerpo;
  const pie = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-family:Arial,sans-serif;font-size:12px;color:#94a3b8;text-align:center">
  mainds · Software para psicólogos · <a href="https://mainds.app" style="color:#94a3b8">mainds.app</a><br>
  ${pieBaja(email)}
</div>`;
  // Si viene un documento completo, el pie va dentro del body.
  if (/<\/body\s*>/i.test(cuerpo)) return cuerpo.replace(/<\/body\s*>/i, `${pie}</body>`);
  return cuerpo + pie;
};

/**
 * Devuelve el conjunto de direcciones a las que NO se puede escribir, de entre
 * las que se pasan. Son dos cosas distintas que aquí se suman:
 *
 *   - Las que se dieron de baja ellas mismas (email_optouts).
 *   - Las de cuentas que un superadmin ha bloqueado (users.blocked_at). El
 *     bloqueo va más allá de la baja: corta también el correo transaccional,
 *     así que los envíos de factura, recordatorio e invitación comprueban
 *     `emailBloqueado` aparte — ver backend/utils/user-block.js.
 *
 * Una sola consulta por cada cosa: se llama antes de cualquier envío, incluidos
 * los masivos.
 *
 * Ante un fallo de lectura devuelve un conjunto vacío y lo registra: preferimos
 * no bloquear un envío legítimo por un error transitorio, pero el fallo tiene
 * que verse en los logs.
 */
export async function suprimidos(supabase, emails) {
  const lista = [...new Set((emails || []).map(normalizarEmail).filter(Boolean))];
  if (!supabase || lista.length === 0) return new Set();
  const encontrados = new Set();
  try {
    const LOTE = 200;
    for (let i = 0; i < lista.length; i += LOTE) {
      const { data, error } = await supabase
        .from('email_optouts')
        .select('email')
        .in('email', lista.slice(i, i + LOTE));
      if (error) throw error;
      for (const r of data || []) encontrados.add(normalizarEmail(r.email));
    }
  } catch (err) {
    console.error('[email-optout] no se pudo leer email_optouts:', err?.message || err);
  }
  for (const e of await emailsBloqueados(supabase, lista)) encontrados.add(e);
  return encontrados;
}

/** Atajo para un único destinatario. */
export async function estaDadoDeBaja(supabase, email) {
  return (await suprimidos(supabase, [email])).has(normalizarEmail(email));
}
