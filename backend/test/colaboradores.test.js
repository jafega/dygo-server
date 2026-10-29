// node --test test/colaboradores.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularGanancia, validarEstructuraPagos, enmascararEmail } from '../utils/colaboradores.js';

const base = {
  active: true, payout_model: 'recurring', payout_amount_type: 'fixed',
  payout_amount: 10, payout_percent: 0, payout_min_months: 1, payout_max_months: null
};

test('recurrente fijo: paga cada mes', () => {
  const r = calcularGanancia(base, { importeNeto: 49, mesesPagados: 5, yaTienePagoUnico: false });
  assert.deepEqual(r.map(a => [a.type, a.amount]), [['recurring', 10]]);
});

test('recurrente %: sobre lo que paga sin IVA', () => {
  const colab = { ...base, payout_amount_type: 'percent', payout_percent: 20 };
  const r = calcularGanancia(colab, { importeNeto: 39.99, mesesPagados: 1, yaTienePagoUnico: false });
  assert.equal(r[0].amount, 8);
});

test('recurrente con tope: deja de pagar pasado el tope', () => {
  const colab = { ...base, payout_max_months: 12 };
  assert.equal(calcularGanancia(colab, { importeNeto: 49, mesesPagados: 12 }).length, 1);
  assert.equal(calcularGanancia(colab, { importeNeto: 49, mesesPagados: 13 }).length, 0);
});

test('pago único: solo al llegar a los meses mínimos, y una vez', () => {
  const colab = { ...base, payout_model: 'one_time', payout_amount: 50, payout_min_months: 3 };
  assert.equal(calcularGanancia(colab, { importeNeto: 49, mesesPagados: 2, yaTienePagoUnico: false }).length, 0);
  const r = calcularGanancia(colab, { importeNeto: 49, mesesPagados: 3, yaTienePagoUnico: false });
  assert.deepEqual(r.map(a => [a.type, a.amount]), [['one_time', 50]]);
  assert.equal(calcularGanancia(colab, { importeNeto: 49, mesesPagados: 4, yaTienePagoUnico: true }).length, 0);
});

test('colaborador dado de baja: no genera nada', () => {
  assert.equal(calcularGanancia({ ...base, active: false }, { importeNeto: 49, mesesPagados: 1 }).length, 0);
});

test('validarEstructuraPagos rechaza valores imposibles', () => {
  assert.equal(validarEstructuraPagos({ payout_model: 'x' }).ok, false);
  assert.equal(validarEstructuraPagos({ payout_percent: 120 }).ok, false);
  assert.equal(validarEstructuraPagos({ payout_min_months: 0 }).ok, false);
  const ok = validarEstructuraPagos({ payout_model: 'one_time', payout_amount_type: 'percent', payout_max_months: '' });
  assert.equal(ok.ok, true);
  assert.equal(ok.valores.payout_amount_type, 'fixed');
  assert.equal(ok.valores.payout_max_months, null);
});

test('enmascararEmail', () => {
  assert.equal(enmascararEmail('maria.lopez@gmail.com'), 'ma***@gmail.com');
  assert.equal(enmascararEmail(null), null);
});
