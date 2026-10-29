// Fase 0.5 — utils/fieldCrypto.js (AES-256-GCM, formato enc:v1:<iv>:<tag>:<data>).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptField, decryptField, isEncrypted, getEncryptionKey, isEncryptionConfigured
} from '../utils/fieldCrypto.js';

const KEY = crypto.randomBytes(32).toString('hex');
const OTHER_KEY = crypto.randomBytes(32).toString('hex');
const TEXT = 'Nota clínica: el paciente refiere ansiedad. ñáéíóú 😊';

test('ida y vuelta', () => {
  const enc = encryptField(TEXT, { key: KEY });
  assert.ok(isEncrypted(enc));
  assert.match(enc, /^enc:v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.ok(!enc.includes('ansiedad'));
  assert.equal(decryptField(enc, { key: KEY }), TEXT);
});

test('cadena vacía también hace ida y vuelta', () => {
  assert.equal(decryptField(encryptField('', { key: KEY }), { key: KEY }), '');
});

test('IV distinto en cada cifrado', () => {
  const a = encryptField(TEXT, { key: KEY });
  const b = encryptField(TEXT, { key: KEY });
  assert.notEqual(a, b);
  assert.notEqual(a.split(':')[2], b.split(':')[2]);
});

test('error si se altera el dato, la etiqueta o el IV', () => {
  const enc = encryptField(TEXT, { key: KEY });
  const [p1, p2, iv, tag, data] = enc.split(':');
  const flip = (s) => {
    const buf = Buffer.from(s, 'base64url');
    buf[0] ^= 0x01;
    return buf.toString('base64url');
  };
  for (const bad of [
    [p1, p2, iv, tag, flip(data)].join(':'),
    [p1, p2, iv, flip(tag), data].join(':'),
    [p1, p2, flip(iv), tag, data].join(':'),
    [p1, p2, iv, tag].join(':')
  ]) {
    assert.throws(() => decryptField(bad, { key: KEY }), { code: 'DECRYPTION_FAILED' });
  }
});

test('error con otra clave', () => {
  const enc = encryptField(TEXT, { key: KEY });
  assert.throws(() => decryptField(enc, { key: OTHER_KEY }), { code: 'DECRYPTION_FAILED' });
});

test('AAD: el valor queda atado a su contexto', () => {
  const enc = encryptField(TEXT, { key: KEY, aad: 'nota:1' });
  assert.equal(decryptField(enc, { key: KEY, aad: 'nota:1' }), TEXT);
  assert.throws(() => decryptField(enc, { key: KEY, aad: 'nota:2' }), { code: 'DECRYPTION_FAILED' });
});

test('texto en claro antiguo pasa sin cambios (incluso sin clave)', () => {
  assert.equal(decryptField('texto antiguo sin cifrar', { key: KEY }), 'texto antiguo sin cifrar');
  assert.equal(decryptField('texto antiguo sin cifrar', { key: '' }), 'texto antiguo sin cifrar');
  assert.equal(decryptField(null, { key: KEY }), null);
  assert.equal(decryptField(undefined, { key: KEY }), undefined);
  assert.equal(encryptField(null, { key: KEY }), null);
});

test('no cifra dos veces', () => {
  const enc = encryptField(TEXT, { key: KEY });
  assert.equal(encryptField(enc, { key: KEY }), enc);
});

test('error si falta la clave (o no es de 64 hex)', () => {
  for (const key of ['', 'abc', 'z'.repeat(64), null]) {
    assert.throws(() => encryptField(TEXT, { key }), { code: 'ENCRYPTION_NOT_CONFIGURED' });
  }
  const enc = encryptField(TEXT, { key: KEY });
  assert.throws(() => decryptField(enc, { key: '' }), { code: 'ENCRYPTION_NOT_CONFIGURED' });
  assert.equal(isEncryptionConfigured(''), false);
  assert.equal(isEncryptionConfigured(KEY), true);
});

test('la clave se lee de CLINICAL_ENCRYPTION_KEY por defecto', () => {
  const prev = process.env.CLINICAL_ENCRYPTION_KEY;
  try {
    delete process.env.CLINICAL_ENCRYPTION_KEY;
    assert.throws(() => encryptField(TEXT), { code: 'ENCRYPTION_NOT_CONFIGURED' });
    process.env.CLINICAL_ENCRYPTION_KEY = KEY;
    assert.equal(decryptField(encryptField(TEXT)), TEXT);
    assert.equal(getEncryptionKey().length, 32);
  } finally {
    if (prev === undefined) delete process.env.CLINICAL_ENCRYPTION_KEY;
    else process.env.CLINICAL_ENCRYPTION_KEY = prev;
  }
});

test('solo cifra texto', () => {
  assert.throws(() => encryptField(123, { key: KEY }), TypeError);
});
