// resend-webhook.js — verificación de firma y reglas de supresión del correo.
//
// El webhook de Resend es un endpoint público: sin verificar la firma,
// cualquiera que conozca la URL puede meter emails falsos en el buzón de
// ventas o marcar envíos como rebotados. Con agentes que leen ese buzón y
// actúan sobre lo que encuentran, eso deja de ser higiene y pasa a ser la
// puerta de entrada.
//
// Resend firma con Svix. El esquema es HMAC-SHA256 sobre
// "<svix-id>.<svix-timestamp>.<cuerpo crudo>", con la clave en base64 detrás
// del prefijo "whsec_". La cabecera svix-signature puede traer varias firmas
// separadas por espacios (rotación de clave): basta con que una encaje.

import crypto from 'crypto';

// Margen de reloj admitido. Svix recomienda 5 minutos: protege contra reenvío
// de un webhook capturado hace horas.
const TOLERANCIA_SEGUNDOS = 5 * 60;

/**
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
export function verificarFirmaResend({ cuerpoCrudo, cabeceras, secreto }) {
  if (!secreto) return { ok: false, motivo: 'sin_secreto' };

  const id = cabeceras['svix-id'] || cabeceras['webhook-id'];
  const timestamp = cabeceras['svix-timestamp'] || cabeceras['webhook-timestamp'];
  const firmas = cabeceras['svix-signature'] || cabeceras['webhook-signature'];
  if (!id || !timestamp || !firmas) return { ok: false, motivo: 'faltan_cabeceras' };

  const edad = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(edad) || edad > TOLERANCIA_SEGUNDOS) {
    return { ok: false, motivo: 'timestamp_fuera_de_rango' };
  }

  const clave = Buffer.from(String(secreto).replace(/^whsec_/, ''), 'base64');
  const esperada = crypto
    .createHmac('sha256', clave)
    .update(`${id}.${timestamp}.${cuerpoCrudo}`)
    .digest('base64');

  const esperadaBuf = Buffer.from(esperada);
  // Las firmas vienen como "v1,<base64> v1,<base64>". Se comparan todas en
  // tiempo constante: un early-return por longitud ya filtraría información.
  for (const parte of String(firmas).split(' ')) {
    const valor = parte.includes(',') ? parte.split(',')[1] : parte;
    const recibidaBuf = Buffer.from(valor || '');
    if (recibidaBuf.length !== esperadaBuf.length) continue;
    if (crypto.timingSafeEqual(recibidaBuf, esperadaBuf)) return { ok: true };
  }
  return { ok: false, motivo: 'firma_no_coincide' };
}

// ── Supresión automática ───────────────────────────────────────────────────

// Una queja de spam es la señal más grave que existe: si sigues escribiendo a
// quien te ha denunciado, el daño no es a esa persona, es a la entrega de todo
// tu dominio.
export const EVENTOS_QUE_SUPRIMEN = new Set([
  'email.complained',   // marcado como spam
  'email.bounced',      // rebote (se filtra por tipo mas abajo)
  'email.suppressed'    // Resend ya lo tenia en su propia lista
]);

/**
 * Un rebote blando (buzón lleno, servidor caído un rato) no debe suprimir para
 * siempre. Solo los permanentes.
 */
export function esRebotePermanente(data) {
  const tipo = String(data?.bounce?.type || data?.bounce_type || '').toLowerCase();
  if (tipo) return tipo.includes('permanent') || tipo === 'hard';
  // Sin campo de tipo, se mira el subtipo/mensaje: Resend no siempre lo manda.
  const texto = `${data?.bounce?.subType || ''} ${data?.bounce?.message || ''}`.toLowerCase();
  if (!texto.trim()) return false;
  return /no.?such.?user|does not exist|invalid.?recipient|mailbox.?unavailable|user unknown|permanent/.test(texto);
}

export function motivoDeSupresion(tipoEvento, data) {
  if (tipoEvento === 'email.complained') return 'queja_spam';
  if (tipoEvento === 'email.suppressed') return 'suprimido_por_resend';
  if (tipoEvento === 'email.bounced') return esRebotePermanente(data) ? 'rebote_permanente' : null;
  return null;
}

// ── Bajas pedidas por respuesta ────────────────────────────────────────────

// Deliberadamente conservador: solo frases que no admiten otra lectura. Un
// falso positivo aquí silencia a un cliente potencial que solo estaba
// preguntando algo, y eso es peor que dejar pasar una baja que ademas tiene
// su boton y su enlace en cada email.
const PATRONES_BAJA = [
  /\bunsubscribe\b/i,
  // Cubre dar / darme / dame / dadme / danos de baja. El (?!\s+a\s)
  // descarta "dar de baja A un paciente": en un producto para psicologos esa
  // frase es una gestion de la app, no una peticion de dejar de recibir correo.
  /\bd(?:a|\u00e1|ar|ad)(?:me|nos)?\s+de\s+baja\b(?!\s+a\s)/i,
  /\bbaja\s+de\s+(la\s+)?(lista|newsletter|distribuci[oó]n)\b/i,
  /\bborr(a|ad|adme|arme)\s+de\s+(la\s+|vuestra\s+|su\s+)?(lista|base\s+de\s+datos)\b/i,
  /\bno\s+(me\s+)?(quiero|deseo)\s+recibir\s+(m[aá]s\s+)?(correos?|emails?|mensajes)\b/i,
  /\bdejad(me)?\s+de\s+(escribir|enviar|mandar)\b/i,
  /\bno\s+(me\s+)?volv[aá]is\s+a\s+escribir\b/i,
  /\bstop\s+emails?\b/i,
  /\bremove\s+me\s+from\b/i
];

/**
 * ¿La respuesta pide dejar de recibir correo?
 * Se mira solo el principio del mensaje: el texto citado del email anterior
 * viene despues y contiene nuestro propio pie con la palabra "baja", que
 * dispararia un falso positivo en casi todas las respuestas.
 */
export function pideBaja({ asunto = '', texto = '' } = {}) {
  const cuerpo = String(texto || '')
    // Corta en la linea de cita tipica ("El 3 de mayo... escribió:", "> ...").
    .split(/\n\s*>|\bEl\s+\d{1,2}\s+de\s+\w+|-{2,}\s*Mensaje original|From:\s/i)[0]
    .slice(0, 600);
  const objetivo = `${asunto}\n${cuerpo}`;
  return PATRONES_BAJA.some(p => p.test(objetivo));
}


// ── Respuestas automaticas y correo que no es de una persona ───────────────
//
// Esto se decide en el servidor, no con el modelo. Tres razones: es
// determinista, es gratis, y sobre todo el email ni llega a la cola del bot,
// asi que no se gasta una llamada a Claude en un "estoy de vacaciones".
//
// Las cabeceras vienen del webhook de Resend y se guardan en
// admin_emails.metadata.headers.

const CABECERAS_AUTOMATICAS = [
  'auto-submitted',        // RFC 3834: auto-replied / auto-generated
  'x-autoreply',
  'x-autorespond',
  'x-auto-response-suppress',
  'x-mailer-daemon-error',
  'list-id',               // viene de una lista de distribucion
  'list-unsubscribe'       // boletin o correo masivo, no una persona
];

const REMITENTES_AUTOMATICOS = [
  'mailer-daemon@', 'postmaster@', 'no-reply@', 'noreply@', 'no_reply@',
  'donotreply@', 'do-not-reply@', 'bounce', 'bounces@', 'notifications@',
  'notification@', 'automated@', 'auto-confirm@', 'newsletter@', 'info-noreply@'
];

const ASUNTOS_AUTOMATICOS = [
  /fuera\s+de\s+la\s+oficina/i,
  /out\s+of\s+(the\s+)?office/i,
  /respuesta\s+autom[aá]tica/i,
  /automatic\s+repl(y|ies)/i,
  /auto(matic)?[-\s]?reply/i,
  /ausencia\s+temporal/i,
  /estar[eé]\s+de\s+vacaciones/i,
  /de\s+vacaciones\s+hasta/i,
  /undeliverable/i,
  /(mail|delivery)\s+(delivery\s+)?(failed|failure|status\s+notification)/i,
  /devoluci[oó]n\s+de\s+correo/i,
  /no\s+se\s+ha\s+podido\s+entregar/i,
  /correo\s+no\s+entregado/i,
  /^re:\s*$/i,
  /confirmaci[oó]n\s+de\s+recepci[oó]n/i,
  /acuse\s+de\s+recibo/i
];

/**
 * ¿Esto lo ha escrito una maquina y no una persona?
 *
 * @param {object} o
 * @param {string} o.asunto
 * @param {string} o.from       direccion del remitente
 * @param {object} [o.cabeceras] cabeceras del email, tal como las guarda el webhook
 * @returns {string|null} motivo si es automatico, null si parece humano
 */
export function esRespuestaAutomatica({ asunto = '', from = '', cabeceras = {} } = {}) {
  const claves = Object.keys(cabeceras || {}).map(k => k.toLowerCase());
  for (const c of CABECERAS_AUTOMATICAS) {
    if (!claves.includes(c)) continue;
    // Auto-Submitted: no es la unica cabecera valida, pero "no" significa
    // explicitamente que SI lo escribio una persona. Hay que respetarlo.
    if (c === 'auto-submitted') {
      const valor = String(cabeceras[Object.keys(cabeceras).find(k => k.toLowerCase() === c)] || '').toLowerCase();
      if (valor && valor !== 'no') return 'cabecera_auto_submitted';
      continue;
    }
    return 'cabecera_' + c.replace(/-/g, '_');
  }

  const remitente = String(from || '').toLowerCase();
  if (REMITENTES_AUTOMATICOS.some(r => remitente.includes(r))) return 'remitente_automatico';

  if (ASUNTOS_AUTOMATICOS.some(re => re.test(String(asunto || '')))) return 'asunto_automatico';

  return null;
}

// ── "No me interesa" y "no me mandeis propuestas" ──────────────────────────
//
// Distinto de pideBaja(): ahi se pide dejar de recibir correo. Aqui se
// rechaza la propuesta comercial. El efecto practico es el mismo — no se
// vuelve a escribir — pero conviene distinguirlos en la ficha del lead: uno
// es una baja y el otro es un no comercial, y para el analista no significan
// lo mismo.
const PATRONES_NO_INTERESA = [
  /\bno\s+(me\s+)?(interesa|interesan)\b/i,
  /\bno\s+(estoy|estamos)\s+interesad[oa]s?\b/i,
  /\bgracias\s*,?\s*pero\s+no\b/i,
  /\bno\s+(lo\s+)?necesito\b/i,
  /\bno\s+(nos\s+)?hace\s+falta\b/i,
  /\bya\s+(tengo|tenemos|uso|usamos)\s+(otro|otra|un|una)\b/i,
  /\bno\s+(me\s+)?(envi[eé]is|mand[eé]is|enviar)\s+(m[aá]s\s+)?(propuestas?|ofertas?|publicidad|comercial)/i,
  /\bsin\s+inter[eé]s\s+comercial\b/i,
  /\bno\s+deseo\s+recibir\s+(propuestas?|ofertas?|informaci[oó]n)\s+comercial/i,
  /\bnot\s+interested\b/i,
  /\bno\s+thank\s?you\b/i,
  /\bplease\s+remove\b/i
];

/**
 * ¿Esta rechazando que se le contacte comercialmente?
 * Igual que pideBaja(), se mira solo el principio del mensaje: el texto
 * citado del email anterior viene despues y falsearia el resultado.
 */
export function noQuierePropuestas({ asunto = '', texto = '' } = {}) {
  const cuerpo = String(texto || '')
    .split(/\n\s*>|\bEl\s+\d{1,2}\s+de\s+\w+|-{2,}\s*Mensaje original|From:\s/i)[0]
    .slice(0, 600);
  return PATRONES_NO_INTERESA.some(re => re.test(asunto + '\n' + cuerpo));
}
