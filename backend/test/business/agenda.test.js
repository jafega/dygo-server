// F2.3 — Detector de solapes y validación de rangos de la agenda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, findConflicts, validateRange, validateSlot, toBusyBlocks, anyOverlap } from '../../utils/agenda.js';

const T = (h, m = 0) => `2030-05-06T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;

test('overlaps: intervalos semiabiertos (bordes contiguos no chocan)', () => {
  assert.equal(overlaps(T(10), T(11), T(11), T(12)), false);
  assert.equal(overlaps(T(11), T(12), T(10), T(11)), false);
  assert.equal(overlaps(T(10), T(11), T(10, 30), T(11, 30)), true);
  assert.equal(overlaps(T(10), T(12), T(10, 30), T(11)), true); // contenido
  assert.equal(overlaps(T(10), T(11), T(10), T(11)), true);     // idéntico
});

test('findConflicts: sala y profesional; las canceladas no cuentan', () => {
  const existing = [
    { id: 'a', member_id: 'm1', room_id: 'r1', starts_at: T(10), ends_at: T(11), status: 'scheduled' },
    { id: 'b', member_id: 'm2', room_id: 'r2', starts_at: T(10), ends_at: T(11), status: 'cancelled' },
    { id: 'c', member_id: 'm3', room_id: 'r3', starts_at: T(12), ends_at: T(13), status: 'no_show' }
  ];
  let c = findConflicts(existing, { member_id: 'm9', room_id: 'r1', starts_at: T(10, 30), ends_at: T(11, 30) });
  assert.equal(c.room?.id, 'a');
  assert.equal(c.professional, null);

  c = findConflicts(existing, { member_id: 'm1', room_id: 'r9', starts_at: T(10, 30), ends_at: T(11, 30) });
  assert.equal(c.professional?.id, 'a');
  assert.equal(c.room, null);

  // Sala r2 libre: la cita que la ocupaba está cancelada.
  c = findConflicts(existing, { member_id: 'm9', room_id: 'r2', starts_at: T(10), ends_at: T(11) });
  assert.deepEqual(c, { room: null, professional: null });

  // Contigua: no choca.
  c = findConflicts(existing, { member_id: 'm1', room_id: 'r1', starts_at: T(11), ends_at: T(12) });
  assert.deepEqual(c, { room: null, professional: null });

  // Al reprogramar una cita no choca consigo misma.
  c = findConflicts(existing, { id: 'a', member_id: 'm1', room_id: 'r1', starts_at: T(10, 15), ends_at: T(11, 15) });
  assert.deepEqual(c, { room: null, professional: null });

  // Online (sin sala): solo cuenta el profesional.
  c = findConflicts(existing, { member_id: 'm3', room_id: null, starts_at: T(12, 30), ends_at: T(13, 30) });
  assert.equal(c.professional?.id, 'c');
});

test('validateRange: obligatorio, ordenado y como máximo 62 días', () => {
  assert.ok(validateRange(undefined, T(10)).error);
  assert.ok(validateRange('basura', T(10)).error);
  assert.ok(validateRange(T(11), T(10)).error);
  assert.match(validateRange('2030-01-01', '2030-04-01').error, /62 días/);
  const ok = validateRange('2030-01-01', '2030-03-01');
  assert.ok(ok.from instanceof Date && ok.to instanceof Date);
});

test('validateSlot: fin posterior al inicio y duración máxima', () => {
  assert.ok(validateSlot(T(10), T(10)).error);
  assert.ok(validateSlot(T(10), T(9)).error);
  assert.ok(validateSlot('2030-05-06T00:00:00Z', '2030-05-06T13:00:00Z').error);
  assert.deepEqual(validateSlot(T(10), T(11)), { starts_at: T(10), ends_at: T(11) });
});

test('bloques ocupados: solo inicio y fin, sin canceladas', () => {
  const blocks = toBusyBlocks([
    { id: 'x', patient_id: 'p', starts_at: T(9), ends_at: T(10), status: 'scheduled' },
    { id: 'y', patient_id: 'p', starts_at: T(10), ends_at: T(11), status: 'cancelled' }
  ]);
  assert.deepEqual(blocks, [{ starts_at: T(9), ends_at: T(10) }]);
  assert.equal(anyOverlap(blocks, T(9, 30), T(9, 45)), true);
  assert.equal(anyOverlap(blocks, T(10), T(11)), false);
});
