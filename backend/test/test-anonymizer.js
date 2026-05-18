// Quick smoke test for backend/aiAnonymizer.js
// Run: node backend/test/test-anonymizer.js
import assert from 'node:assert/strict';
import {
  buildPiiDictionary,
  createAnonymizerState,
  anonymizeContents,
  anonymizeString,
  deanonymizeString,
  deanonymizeAny,
} from '../aiAnonymizer.js';

const db = {
  users: [
    { id: 'u1', name: 'María García Pérez', email: 'maria@example.com', phone: '+34 600 123 456', dni: '12345678Z' },
    { id: 'u2', name: 'Carlos López', email: 'carlos@clinic.es' },
    { id: 'p1', name: 'Dr. Ana Ruiz', email: 'ana.ruiz@clinic.es' },
    { id: 'other', name: 'Persona Externa', email: 'no-deberia@aparecer.com' },
  ],
  careRelationships: [
    { psychologist_user_id: 'p1', patient_user_id: 'u1' },
    { psychologist_user_id: 'p1', patient_user_id: 'u2' },
  ],
};

// --- Test 1: dictionary built for psychologist 'p1' includes p1 + u1 + u2, NOT 'other'
const dict = buildPiiDictionary('p1', db, null);
const values = dict.map(d => d.value.toLowerCase());
assert.ok(values.includes('maría garcía pérez'));
assert.ok(values.includes('carlos lópez') || values.includes('carlos lopez'));
assert.ok(values.includes('dr. ana ruiz'));
assert.ok(values.includes('maria@example.com'));
assert.ok(values.includes('12345678z'));
assert.ok(!values.includes('persona externa'), 'unrelated user must NOT be in dictionary');
console.log('✓ dictionary scope respects care_relationships');

// --- Test 2: anonymize a typical prompt
const state1 = createAnonymizerState();
const prompt = 'María García Pérez vino el martes. Su email es maria@example.com y su DNI 12345678Z. Carlos también asistió.';
const anon = anonymizeString(prompt, dict, state1);
assert.ok(!anon.includes('María'));
assert.ok(!anon.includes('maria@example.com'));
assert.ok(!anon.includes('12345678Z'));
assert.ok(!anon.includes('Carlos'));
assert.ok(anon.includes('[NOMBRE_'));
assert.ok(anon.includes('[EMAIL_'));
console.log('✓ anonymizeString replaces all dictionary PII:', anon);

// --- Test 3: de-anonymize restores original
const restored = deanonymizeString(anon, state1);
assert.equal(restored, prompt);
console.log('✓ deanonymizeString restores original exactly');

// --- Test 4: regex fallback catches free-form PII not in dict
const state2 = createAnonymizerState();
const prompt2 = 'El paciente envió un correo a desconocido@gmail.com con IBAN ES7620770024003102575766 y teléfono 612345678';
const anon2 = anonymizeString(prompt2, dict, state2);
assert.ok(!anon2.includes('desconocido@gmail.com'));
assert.ok(!anon2.includes('ES7620770024003102575766'));
assert.ok(!anon2.includes('612345678'));
console.log('✓ regex fallback catches free-form PII:', anon2);
assert.equal(deanonymizeString(anon2, state2), prompt2);
console.log('✓ free-form PII round-trips correctly');

// --- Test 5: contents shapes (string / array / parts)
const state3 = createAnonymizerState();
const contents = [
  { role: 'user', parts: [
    { text: 'Resume la sesión de María García Pérez.' },
    { inlineData: { mimeType: 'audio/webm', data: 'BINARY-BLOB-SHOULD-NOT-CHANGE-María' } },
  ] },
];
const anonContents = anonymizeContents(contents, dict, state3);
assert.ok(!JSON.stringify(anonContents.map(c => c.parts[0])).includes('María'));
// Binary blob must be untouched
assert.equal(anonContents[0].parts[1].inlineData.data, 'BINARY-BLOB-SHOULD-NOT-CHANGE-María');
console.log('✓ contents tree walked, inlineData preserved');

// --- Test 6: word-boundary safety — patient called "Mar" should not match "Marzo"
const dbShort = {
  users: [{ id: 'x', name: 'Mar' }],
  careRelationships: [{ psychologist_user_id: 'p1', patient_user_id: 'x' }],
};
const dict2 = buildPiiDictionary('p1', dbShort, null);
const state4 = createAnonymizerState();
const txt = 'En marzo Mar tuvo cita.';
const anon3 = anonymizeString(txt, dict2, state4);
assert.ok(anon3.includes('marzo'), 'should NOT replace inside "marzo": ' + anon3);
assert.ok(!anon3.match(/\bMar\b/), 'should replace standalone "Mar": ' + anon3);
console.log('✓ word boundary respected:', anon3);

// --- Test 7: deanonymizeAny on structured object
const state5 = createAnonymizerState();
const anon4 = anonymizeString('Paciente: María García Pérez', dict, state5);
const obj = { result: anon4, list: [anon4, { nested: anon4 }] };
const restored2 = deanonymizeAny(obj, state5);
assert.equal(restored2.result, 'Paciente: María García Pérez');
assert.equal(restored2.list[1].nested, 'Paciente: María García Pérez');
console.log('✓ deanonymizeAny works on nested objects');

console.log('\n✅ All anonymizer tests passed.');
