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

// ── Flujo del webhook con Stripe y Supabase simulados ───────────────────────
import { registrarFacturaCobrada, actualizarEstadoReferido } from '../utils/colaboradores.js';

// Supabase en memoria: solo lo que usa colaboradores.js.
function fakeSupabase(tablas) {
  let n = 0;
  const unicos = { collaborator_earnings: e => `${e.stripe_invoice_id}|${e.type}` };
  return {
    from(t) {
      const rows = (tablas[t] ||= []);
      let filtros = [], op = 'select', payload = null;
      const match = r => filtros.every(([k, v]) => String(r[k]) === String(v));
      const run = () => {
        if (op === 'insert') {
          for (const p of payload) {
            const clave = unicos[t]?.(p);
            if (clave && !clave.startsWith('undefined') && rows.some(r => unicos[t](r) === clave)) {
              return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
            }
            if (t === 'collaborator_referrals' && rows.some(r => r.stripe_subscription_id === p.stripe_subscription_id)) {
              return { data: null, error: { message: 'duplicate key' } };
            }
          }
          const ins = payload.map(p => ({ id: `id${++n}`, created_at: new Date().toISOString(), paid_invoice_ids: [], months_paid: 0, total_paid: 0, ...p }));
          rows.push(...ins);
          return { data: ins, error: null };
        }
        if (op === 'update') {
          const hit = rows.filter(match); hit.forEach(r => Object.assign(r, payload));
          return { data: hit, error: null };
        }
        return { data: rows.filter(match), error: null };
      };
      const q = {
        select() { return q; }, eq(k, v) { filtros.push([k, v]); return q; }, limit() { return q; },
        insert(p) { op = 'insert'; payload = p; return q; }, update(p) { op = 'update'; payload = p; return q; },
        maybeSingle: async () => { const r = run(); return { data: r.data?.[0] || null, error: r.error }; },
        single: async () => { const r = run(); return { data: r.data?.[0] || null, error: r.error }; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); }
      };
      return q;
    }
  };
}

test('webhook: lead con código → referido + comisiones, idempotente y sin auto-referido', async () => {
  const tablas = {
    collaborators: [{ id: 'col1', user_id: 'laura', active: true, payout_model: 'recurring', payout_amount_type: 'percent', payout_percent: 20, payout_amount: 0, payout_min_months: 1, payout_max_months: 2 }],
    collaborator_codes: [{ id: 'k1', collaborator_id: 'col1', code: 'LAURA20', stripe_promotion_code_id: 'promo_1' }],
    users: [{ id: 'pablo', user_email: 'pablo@x.com', data: { name: 'Pablo' } }]
  };
  const sb = fakeSupabase(tablas);
  const stripe = { subscriptions: { retrieve: async () => ({ status: 'active', customer: 'cus_1', metadata: { psychologist_user_id: 'pablo', subscription_type: 'psychologist', plan_id: 'pro' } }) } };
  const factura = (id, cents, tax = 0) => ({ id, subscription: 'sub_1', customer: 'cus_1', amount_paid: cents, tax, discount: { promotion_code: 'promo_1' } });

  // Prueba a 0 €: crea el lead, no cuenta mes ni comisión.
  await registrarFacturaCobrada(sb, stripe, factura('in_0', 0));
  assert.equal(tablas.collaborator_referrals.length, 1);
  assert.equal(tablas.collaborator_referrals[0].referred_email, 'pablo@x.com');
  assert.equal((tablas.collaborator_earnings || []).length, 0);

  // Mes 1: 40 € + 8,40 IVA → 20 % de 40 = 8 €.
  await registrarFacturaCobrada(sb, stripe, factura('in_1', 4840, 840));
  // Reintento del mismo webhook: nada nuevo.
  await registrarFacturaCobrada(sb, stripe, factura('in_1', 4840, 840));
  assert.equal(tablas.collaborator_earnings.length, 1);
  assert.equal(tablas.collaborator_earnings[0].amount, 8);
  assert.equal(tablas.collaborator_referrals[0].months_paid, 1);

  // Mes 2 cobra; mes 3 supera el tope de 2 → sin comisión. Tras el cupón la factura ya no trae descuento.
  await registrarFacturaCobrada(sb, stripe, { ...factura('in_2', 4840, 840) });
  await registrarFacturaCobrada(sb, stripe, { ...factura('in_3', 4840, 840), discount: null });
  assert.equal(tablas.collaborator_earnings.length, 2);
  assert.equal(tablas.collaborator_referrals[0].months_paid, 3);

  // Baja en Stripe → estado del lead.
  await actualizarEstadoReferido(sb, { id: 'sub_1', status: 'canceled' }, { borrada: true });
  assert.equal(tablas.collaborator_referrals[0].stripe_status, 'canceled');

  // La propia colaboradora usando su código: no cuenta.
  const stripeSelf = { subscriptions: { retrieve: async () => ({ status: 'active', metadata: { psychologist_user_id: 'laura' } }) } };
  await registrarFacturaCobrada(sb, stripeSelf, { ...factura('in_x', 4840), subscription: 'sub_self' });
  assert.equal(tablas.collaborator_referrals.length, 1);

  // Factura sin código de colaborador: ni se pregunta a Stripe.
  const stripeNo = { subscriptions: { retrieve: async () => { throw new Error('no debería llamarse'); } } };
  assert.equal(await registrarFacturaCobrada(sb, stripeNo, { id: 'in_y', subscription: 'sub_otro', amount_paid: 1000 }), null);
});
