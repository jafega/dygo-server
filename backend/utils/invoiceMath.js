// Cálculo de facturas en céntimos enteros (R11). Lógica pura.
//
// Redondeo half-up por línea (y por cuota de cada línea), sumas en céntimos.
// Nunca se suman decimales en coma flotante.

/** Euros (número o texto) → céntimos enteros, redondeo half-up (y simétrico en negativos). */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`Importe no válido: ${value}`);
  const sign = n < 0 ? -1 : 1;
  // Se redondea primero a 6 decimales para absorber errores de coma flotante (0.1+0.2).
  const abs = Math.round(Math.abs(n) * 1e6) / 1e6;
  return sign * Math.floor(abs * 100 + 0.5 + 1e-9);
}

/** Céntimos → euros con 2 decimales (número). */
export const fromCents = (c) => Math.round(c) / 100;

/** Céntimos → texto con punto decimal y 2 decimales ("60.00", "-12.35"). */
export function formatAmount(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Porcentaje de un importe en céntimos, half-up. */
export function percentOf(cents, rate) {
  const r = Number(rate) || 0;
  const sign = cents < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(cents) * r) / 100 + 0.5 + 1e-9);
}

/**
 * Calcula una factura.
 * @param {Array<{description:string, quantity?:number, unit_price:number, vat_rate?:number}>} lines
 * @param {{ irpfRate?: number }} [opts]
 * @returns {{ lines: Array, subtotal_cents, vat_cents, irpf_cents, total_cents, vat_breakdown: Array }}
 */
export function computeInvoice(lines, { irpfRate = 0 } = {}) {
  const out = [];
  let subtotal = 0;
  let vat = 0;
  const byRate = new Map();
  for (const l of lines || []) {
    const qty = l.quantity === undefined || l.quantity === null ? 1 : Number(l.quantity);
    if (!Number.isFinite(qty) || qty === 0) throw new Error('Cantidad no válida');
    const unit = toCents(l.unit_price);
    const base = Math.round(unit * qty);
    const rate = Number(l.vat_rate) || 0;
    const lineVat = percentOf(base, rate);
    subtotal += base;
    vat += lineVat;
    const b = byRate.get(rate) || { vat_rate: rate, base_cents: 0, vat_cents: 0 };
    b.base_cents += base;
    b.vat_cents += lineVat;
    byRate.set(rate, b);
    out.push({
      ...l,
      quantity: qty,
      unit_price: fromCents(unit),
      vat_rate: rate,
      base: fromCents(base),
      vat: fromCents(lineVat),
      amount: fromCents(base + lineVat)
    });
  }
  const irpf = percentOf(subtotal, irpfRate);
  return {
    lines: out,
    subtotal_cents: subtotal,
    vat_cents: vat,
    irpf_cents: irpf,
    total_cents: subtotal + vat - irpf,
    vat_breakdown: [...byRate.values()].map(b => ({ vat_rate: b.vat_rate, base: fromCents(b.base_cents), vat: fromCents(b.vat_cents) }))
  };
}
