// Cifrado de campos clínicos (R10) con AES-256-GCM.
//
// Formato del valor cifrado:  enc:v1:<iv>:<tag>:<data>   (base64url, IV de 12 bytes)
//
// - La clave sale de CLINICAL_ENCRYPTION_KEY: 64 caracteres hexadecimales
//   (32 bytes). Sin clave válida, cifrar (o descifrar algo cifrado) lanza un
//   error con code 'ENCRYPTION_NOT_CONFIGURED' → la ruta debe responder 503.
// - decryptField deja pasar tal cual el texto en claro antiguo (lo que no
//   empieza por 'enc:v1:'), para poder migrar datos poco a poco.
// - Un valor cifrado alterado (o descifrado con otra clave / otro AAD) lanza
//   error con code 'DECRYPTION_FAILED'. Nunca devuelve basura.
// - `aad` (opcional) ata el cifrado a su contexto (p. ej. 'org_clinical_notes:<id>')
//   para que no se pueda copiar un valor cifrado de una fila a otra.
//
// Solo usa node:crypto (R13).

import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class FieldCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FieldCryptoError';
    this.code = code;
  }
}

/** Devuelve la clave (Buffer de 32 bytes) o lanza ENCRYPTION_NOT_CONFIGURED. */
export function getEncryptionKey(key = process.env.CLINICAL_ENCRYPTION_KEY) {
  if (Buffer.isBuffer(key)) {
    if (key.length === 32) return key;
  } else if (typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key.trim())) {
    return Buffer.from(key.trim(), 'hex');
  }
  throw new FieldCryptoError('ENCRYPTION_NOT_CONFIGURED',
    'El cifrado de datos clínicos no está configurado (CLINICAL_ENCRYPTION_KEY: 64 caracteres hex).');
}

/** ¿Está configurada una clave válida? */
export function isEncryptionConfigured(key = process.env.CLINICAL_ENCRYPTION_KEY) {
  try { getEncryptionKey(key); return true; } catch { return false; }
}

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);

/**
 * Cifra un texto. null/undefined pasan tal cual. Un valor ya cifrado no se
 * vuelve a cifrar.
 * @param {string|null|undefined} plaintext
 * @param {{ key?: string|Buffer, aad?: string }} [opts]
 */
export function encryptField(plaintext, { key, aad } = {}) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (typeof plaintext !== 'string') throw new TypeError('encryptField solo cifra texto');
  if (isEncrypted(plaintext)) return plaintext;
  const k = getEncryptionKey(key === undefined ? process.env.CLINICAL_ENCRYPTION_KEY : key);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, k, iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(Buffer.from(String(aad), 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${data.toString('base64url')}`;
}

/**
 * Descifra un valor. Lo que no tiene el prefijo enc:v1: (texto en claro
 * antiguo, null, números...) se devuelve sin cambios.
 * @param {*} value
 * @param {{ key?: string|Buffer, aad?: string }} [opts]
 */
export function decryptField(value, { key, aad } = {}) {
  if (!isEncrypted(value)) return value;
  const k = getEncryptionKey(key === undefined ? process.env.CLINICAL_ENCRYPTION_KEY : key);
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new FieldCryptoError('DECRYPTION_FAILED', 'Valor cifrado con formato inválido');
  try {
    const [iv, tag, data] = parts.map(p => Buffer.from(p, 'base64url'));
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('longitud');
    const decipher = crypto.createDecipheriv(ALGO, k, iv, { authTagLength: TAG_BYTES });
    if (aad) decipher.setAAD(Buffer.from(String(aad), 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    throw new FieldCryptoError('DECRYPTION_FAILED', 'No se pudo descifrar el valor (alterado o clave incorrecta)');
  }
}
