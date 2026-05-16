// Centralized currency configuration and formatting.
//
// Mainds opera con UNA moneda por psicólogo (sin conversiones). El psicólogo la
// fija en su perfil (ver `PsychologistProfilePanel`) y se persiste en
// `users.data.currency`. Los pacientes ven la moneda del psicólogo asociado o
// EUR por defecto.
//
// Para no propagar el código de moneda por cientos de componentes, mantenemos
// una "moneda activa" a nivel de módulo que se actualiza desde `App.tsx`
// cuando se carga el usuario. Las llamadas `formatMoney(n)` la usan por defecto.
// Para mostrar el importe de una entidad concreta con su propia moneda
// (p.ej. una factura histórica), se puede pasar el código explícitamente:
// `formatMoney(invoice.total, invoice.currency)`.

export type CurrencyCode = 'EUR' | 'USD' | 'MXN' | 'ARS' | 'COP' | 'CLP' | 'PEN' | 'UYU' | 'BRL';

interface CurrencyConfig {
  symbol: string;
  locale: string;
  label: string;
  /** Dígitos decimales por defecto (CLP/COP suelen ir sin decimales). */
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  EUR: { symbol: '€',   locale: 'es-ES', label: 'Euro (€)',                decimals: 2 },
  USD: { symbol: 'US$', locale: 'es-US', label: 'Dólar estadounidense (US$)', decimals: 2 },
  MXN: { symbol: '$',   locale: 'es-MX', label: 'Peso mexicano ($)',       decimals: 2 },
  ARS: { symbol: '$',   locale: 'es-AR', label: 'Peso argentino ($)',      decimals: 2 },
  COP: { symbol: '$',   locale: 'es-CO', label: 'Peso colombiano ($)',     decimals: 0 },
  CLP: { symbol: '$',   locale: 'es-CL', label: 'Peso chileno ($)',        decimals: 0 },
  PEN: { symbol: 'S/',  locale: 'es-PE', label: 'Sol peruano (S/)',        decimals: 2 },
  UYU: { symbol: '$U',  locale: 'es-UY', label: 'Peso uruguayo ($U)',      decimals: 2 },
  BRL: { symbol: 'R$',  locale: 'pt-BR', label: 'Real brasileño (R$)',     decimals: 2 },
};

const FALLBACK: CurrencyCode = 'EUR';

let activeCurrency: CurrencyCode = FALLBACK;

// Cargar de localStorage si está disponible (evita parpadeos al recargar
// antes de que App.tsx termine de hidratar el usuario).
if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem('mainds.activeCurrency');
    if (saved && saved in CURRENCIES) {
      activeCurrency = saved as CurrencyCode;
    }
  } catch {
    // ignore — localStorage puede estar bloqueado
  }
}

const listeners = new Set<(c: CurrencyCode) => void>();

export const getActiveCurrency = (): CurrencyCode => activeCurrency;

export const setActiveCurrency = (code: string | null | undefined): void => {
  const normalized = (code || '').toUpperCase();
  const next: CurrencyCode = (normalized in CURRENCIES ? normalized : FALLBACK) as CurrencyCode;
  if (next === activeCurrency) return;
  activeCurrency = next;
  try {
    window.localStorage.setItem('mainds.activeCurrency', next);
  } catch {
    // ignore
  }
  listeners.forEach(fn => {
    try { fn(next); } catch { /* noop */ }
  });
};

/** Suscripción para componentes que necesiten re-render al cambiar moneda. */
export const subscribeCurrency = (fn: (c: CurrencyCode) => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

const resolveCode = (code?: string | null): CurrencyCode => {
  if (!code) return activeCurrency;
  const upper = code.toUpperCase();
  return (upper in CURRENCIES ? upper : activeCurrency) as CurrencyCode;
};

/**
 * Formatea un importe con el símbolo y locale de la moneda indicada (o la
 * moneda activa si no se pasa ninguna).
 *
 *   formatMoney(1234.5)              -> "1.234,50 €"   (locale es-ES)
 *   formatMoney(1234.5, 'MXN')       -> "$1,234.50"     (locale es-MX)
 *   formatMoney(1234.5, 'CLP')       -> "$1.235"        (sin decimales)
 */
export const formatMoney = (
  amount: number | null | undefined,
  code?: string | null,
  opts: { decimals?: number } = {},
): string => {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const c = resolveCode(code);
  const cfg = CURRENCIES[c];
  const decimals = typeof opts.decimals === 'number' ? opts.decimals : cfg.decimals;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: c,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safe);
  } catch {
    // Fallback robusto si el runtime no soporta Intl con esa moneda.
    return `${cfg.symbol}${safe.toFixed(decimals)}`;
  }
};

/** Devuelve sólo el símbolo (útil para labels: "Precio (€)" / "Precio ($)"). */
export const currencySymbol = (code?: string | null): string =>
  CURRENCIES[resolveCode(code)].symbol;

/** Código de moneda activo o el indicado (útil al persistir). */
export const currencyCode = (code?: string | null): CurrencyCode => resolveCode(code);

/** Opciones para selects de moneda. */
export const CURRENCY_OPTIONS: Array<{ value: CurrencyCode; label: string }> =
  (Object.keys(CURRENCIES) as CurrencyCode[]).map(code => ({
    value: code,
    label: `${code} — ${CURRENCIES[code].label}`,
  }));
