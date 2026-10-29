// Validación de identificadores fiscales españoles: NIF (DNI), NIE y CIF.
// Lógica pura (backlog F3.1).

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';
// Tipos de CIF cuyo control es siempre letra / siempre dígito.
const CIF_LETTER_ONLY = new Set(['P', 'Q', 'R', 'S', 'W', 'N']);
const CIF_DIGIT_ONLY = new Set(['A', 'B', 'E', 'H']);

/** Quita espacios, guiones y puntos, y pasa a mayúsculas. */
export const normalizeTaxId = (v) => String(v || '').toUpperCase().replace(/[\s.-]/g, '');

export function isValidDni(v) {
  const s = normalizeTaxId(v);
  if (!/^\d{8}[A-Z]$/.test(s)) return false;
  return DNI_LETTERS[Number(s.slice(0, 8)) % 23] === s[8];
}

export function isValidNie(v) {
  const s = normalizeTaxId(v);
  if (!/^[XYZ]\d{7}[A-Z]$/.test(s)) return false;
  const num = { X: '0', Y: '1', Z: '2' }[s[0]] + s.slice(1, 8);
  return DNI_LETTERS[Number(num) % 23] === s[8];
}

export function isValidCif(v) {
  const s = normalizeTaxId(v);
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) return false;
  const digits = s.slice(1, 8);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else {
      sum += d;
    }
  }
  const control = (10 - (sum % 10)) % 10;
  const last = s[8];
  const type = s[0];
  const okDigit = last === String(control);
  const okLetter = last === CIF_CONTROL_LETTERS[control];
  if (CIF_LETTER_ONLY.has(type)) return okLetter;
  if (CIF_DIGIT_ONLY.has(type)) return okDigit;
  return okDigit || okLetter;
}

/** ¿Es un NIF, NIE o CIF válido? */
export const isValidTaxId = (v) => isValidDni(v) || isValidNie(v) || isValidCif(v);

/** Tipo de identificador (o null si no es válido). */
export function taxIdKind(v) {
  if (isValidDni(v)) return 'nif';
  if (isValidNie(v)) return 'nie';
  if (isValidCif(v)) return 'cif';
  return null;
}
