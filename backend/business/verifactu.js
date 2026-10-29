// Verifactu (RD 1007/2023, Orden HAC/1177/2024) para las facturas de las
// clínicas (backlog F3.4, docs/business/VERIFACTU.md).
//
// Qué hace:
//   - Registro de facturación de alta por cada factura emitida, con la huella
//     SHA-256 oficial encadenada con el registro anterior DEL MISMO NIF EMISOR.
//   - URL del QR de cotejo y su imagen.
// Qué NO hace (sesión propia, ver VERIFACTU.md):
//   - Enviar los registros a la AEAT, firmarlos (XAdES) ni el registro de eventos.
//   - Por eso la factura NO lleva la leyenda "VERI*FACTU" y los registros
//     quedan en status 'pending_submission'.
//
// Importante: la huella depende de la representación EXACTA de cada campo. Los
// importes se representan con formatAmount (punto decimal, 2 decimales); el
// envío por XML tendrá que usar exactamente los mismos textos.

import crypto from 'node:crypto';
import { formatAmount, toCents } from '../utils/invoiceMath.js';

export const QR_ENDPOINTS = {
  // Modo "no verifactu" (sin envío inmediato), que es el estado actual.
  noverifactu: {
    production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
    test: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu'
  },
  verifactu: {
    production: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR',
    test: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR'
  }
};

/** Fecha 'YYYY-MM-DD' (o Date) → 'dd-mm-aaaa'. */
export function aeatDate(d) {
  const s = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}-${m}-${y}`;
}

/** Instante → 'aaaa-mm-ddThh:mm:ss+hh:mm' en hora de Madrid (con su huso). */
export function madridTimestamp(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(hour), Number(p.minute), Number(p.second));
  const offsetMin = Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Cadena oficial sobre la que se calcula la huella de un registro de alta. */
export function altaHashInput({ issuerTaxId, seriesNumber, issueDate, invoiceType, vatTotal, total, previousHash, generatedAt }) {
  return [
    `IDEmisorFactura=${String(issuerTaxId).trim()}`,
    `NumSerieFactura=${String(seriesNumber).trim()}`,
    `FechaExpedicionFactura=${issueDate}`,
    `TipoFactura=${invoiceType}`,
    `CuotaTotal=${vatTotal}`,
    `ImporteTotal=${total}`,
    `Huella=${previousHash || ''}`,
    `FechaHoraHusoGenRegistro=${generatedAt}`
  ].join('&');
}

/** SHA-256 en hexadecimal mayúsculas. */
export const sha256Upper = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();

/** URL del QR de cotejo de una factura. */
export function qrUrl({ issuerTaxId, seriesNumber, issueDate, total }, { mode = 'noverifactu', env = 'production' } = {}) {
  const base = (QR_ENDPOINTS[mode] || QR_ENDPOINTS.noverifactu)[env === 'test' ? 'test' : 'production'];
  const qs = new URLSearchParams({ nif: issuerTaxId, numserie: seriesNumber, fecha: issueDate, importe: total });
  return `${base}?${qs.toString()}`;
}

/** Imagen PNG (data URL) del QR. qrcode se carga bajo demanda. */
export async function qrDataUrl(url) {
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
}

const readEnv = (env = process.env) => ({
  mode: env.VERIFACTU_MODE === 'verifactu' ? 'verifactu' : 'noverifactu',
  env: env.VERIFACTU_ENV === 'test' ? 'test' : 'production'
});

/**
 * Crea (si no existe) el registro de alta de una factura emitida, encadenado
 * con el último registro del mismo NIF emisor. Idempotente por invoice_id.
 * Dos emisiones simultáneas del mismo NIF no pueden encadenar con la misma
 * huella anterior (índice único issuer_tax_id+previous_hash): se reintenta.
 */
export async function ensureVerifactuRecord(store, invoice, { now = () => new Date(), env = process.env } = {}) {
  const [existing] = await store.list('verifactu_records', { eq: { invoice_id: invoice.id }, limit: 1 });
  if (existing) return existing;
  if (!invoice.issuer_tax_id) throw new Error('La factura no tiene NIF del emisor');
  const cfg = readEnv(env);
  const issueDate = aeatDate(invoice.issue_date);
  const invoiceType = invoice.aeat_type || (invoice.rectifies_invoice_id ? 'R4' : 'F1');
  const vatTotal = formatAmount(toCents(invoice.vat_total));
  const total = formatAmount(toCents(invoice.total));

  for (let attempt = 0; attempt < 4; attempt++) {
    const [prev] = await store.list('verifactu_records', { eq: { issuer_tax_id: invoice.issuer_tax_id }, order: '-chain_index', limit: 1 });
    const previousHash = prev?.hash || '';
    const generatedAt = madridTimestamp(now());
    const input = altaHashInput({
      issuerTaxId: invoice.issuer_tax_id, seriesNumber: invoice.full_number, issueDate, invoiceType,
      vatTotal, total, previousHash, generatedAt
    });
    const row = {
      org_id: invoice.org_id,
      invoice_id: invoice.id,
      record_type: 'alta',
      issuer_tax_id: invoice.issuer_tax_id,
      series_number: invoice.full_number,
      issue_date: issueDate,
      invoice_type: invoiceType,
      vat_total: vatTotal,
      total,
      previous_hash: previousHash,
      chain_index: (prev?.chain_index || 0) + 1,
      generated_at: generatedAt,
      hash: sha256Upper(input),
      qr_url: qrUrl({ issuerTaxId: invoice.issuer_tax_id, seriesNumber: invoice.full_number, issueDate, total }, cfg),
      mode: cfg.mode,
      status: 'pending_submission'
    };
    try {
      return await store.insert('verifactu_records', row);
    } catch (err) {
      if (err?.code !== 'UNIQUE_VIOLATION') throw err;
      // Otro registro del mismo NIF se encadenó a la vez: se recalcula.
      const [again] = await store.list('verifactu_records', { eq: { invoice_id: invoice.id }, limit: 1 });
      if (again) return again;
    }
  }
  throw new Error('No se pudo encadenar el registro de facturación');
}
