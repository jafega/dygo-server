/**
 * AUDITORÍA LIGERA — para saber QUÉ tumbó el servicio, sin tumbarlo tú al medirlo.
 *
 * Diseño, y por qué es así:
 *
 * 1. CERO BASE DE DATOS. No crea tablas ni escribe filas. Escribir métricas en Postgres
 *    en cada petición es exactamente el patrón que ya reventó este proyecto dos veces
 *    (DDL en cada cold start, dedupe en cada arranque). Aquí la persistencia la da
 *    `console.log`: una línea JSON por anomalía que aterriza en los logs de Vercel, que
 *    ya están persistidos y son buscables. Coste en BBDD: 0.
 *
 * 2. MEMORIA ACOTADA. Un ring buffer de tamaño fijo y un mapa de contadores por ruta con
 *    tope de claves. No crece nunca. En serverless cada instancia ve solo lo suyo: la
 *    foto en vivo es orientativa, el registro de verdad son las líneas de log.
 *
 * 3. MIDE LO QUE IMPORTA. La señal que habría cazado la caída de agosto de 2026 no era
 *    CPU ni conexiones: era el PESO DE LA RESPUESTA. Un listado devolvía 194 MB y el
 *    sidebar lo pedía cada 60 s. Por eso el middleware mide bytes de respuesta y
 *    duración por ruta, y `auditDbRead()` permite atribuir bytes a la tabla de origen
 *    en los listados que ya sabemos peligrosos.
 *
 * Cómo se usa cuando algo se cae:
 *   GET /api/_audit            → foto en vivo: peores rutas por peso y por latencia
 *   GET /api/_audit/selftest   → qué capa está caída (REST / Auth / Storage) y en cuánto
 *   En los logs de Vercel:  buscar  AUDIT_ANOMALY
 */

// ── Configuración (todo ajustable por entorno, con valores por defecto sensatos) ──
const SLOW_MS       = Number(process.env.AUDIT_SLOW_MS || 3000);
const HEAVY_BYTES   = Number(process.env.AUDIT_HEAVY_BYTES || 2_000_000);   // 2 MB
const DB_HEAVY_BYTES= Number(process.env.AUDIT_DB_HEAVY_BYTES || 1_000_000); // 1 MB
const RING_SIZE     = Number(process.env.AUDIT_RING_SIZE || 100);
const MAX_ROUTES    = 200;   // tope de claves del mapa de rutas
const MAX_TABLES    = 100;   // tope de claves del mapa de tablas
const ENABLED       = String(process.env.AUDIT_DISABLED || '').toLowerCase() !== 'true';

const bootedAt = Date.now();

// ── Estado en memoria, todo acotado ──
const ring = [];                 // últimas anomalías
const routeStats = new Map();    // ruta -> métricas agregadas
const tableStats = new Map();    // tabla -> bytes leídos
let totals = { requests: 0, anomalies: 0, errors: 0, bytesOut: 0 };

/** Normaliza el path para que los ids no exploten el mapa de rutas. */
function normalizePath(p) {
  return String(p || '/')
    .split('?')[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n')
    .slice(0, 120);
}

function push(entry) {
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
}

function bump(map, key, cap, init, apply) {
  let v = map.get(key);
  if (!v) {
    if (map.size >= cap) return null;   // tope: no crecer más
    v = init();
    map.set(key, v);
  }
  apply(v);
  return v;
}

/**
 * Registra los bytes que una lectura trajo de una tabla concreta.
 * Se llama a mano en los listados que ya sabemos que pueden pesar. Barato:
 * un JSON.stringify solo cuando el resultado supera el umbral es demasiado caro,
 * así que se le pasa el número de filas y se estima por muestreo de la primera.
 */
export function auditDbRead(table, rows, ms) {
  if (!ENABLED || !Array.isArray(rows)) return;
  // Estimación por muestreo: peso de la primera fila x nº de filas. Evita serializar
  // el resultado completo solo para medirlo (que sería el mismo pecado que medimos).
  let bytes = 0;
  if (rows.length) {
    try { bytes = Buffer.byteLength(JSON.stringify(rows[0])) * rows.length; } catch { bytes = 0; }
  }
  bump(tableStats, String(table).slice(0, 60), MAX_TABLES,
    () => ({ reads: 0, rows: 0, bytesEst: 0, maxBytesEst: 0, maxMs: 0 }),
    v => {
      v.reads++; v.rows += rows.length; v.bytesEst += bytes;
      if (bytes > v.maxBytesEst) v.maxBytesEst = bytes;
      if (ms > v.maxMs) v.maxMs = ms || 0;
    });

  if (bytes > DB_HEAVY_BYTES) {
    totals.anomalies++;
    const anomaly = {
      kind: 'db_heavy_read', table: String(table), rows: rows.length,
      bytesEst: bytes, ms: ms || null, at: new Date().toISOString()
    };
    push(anomaly);
    console.log('AUDIT_ANOMALY ' + JSON.stringify(anomaly));
  }
  return bytes;
}

/**
 * Middleware Express. Mide estado, duración y BYTES DE RESPUESTA por ruta.
 * No toca el body ni lo copia: solo suma las longitudes que pasan por write/end.
 */
export function auditMiddleware(req, res, next) {
  if (!ENABLED) return next();

  const started = process.hrtime.bigint();
  let bytesOut = 0;

  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  res.write = (chunk, ...rest) => {
    if (chunk) bytesOut += Buffer.byteLength(chunk);
    return origWrite(chunk, ...rest);
  };
  res.end = (chunk, ...rest) => {
    if (chunk) { try { bytesOut += Buffer.byteLength(chunk); } catch { /* stream */ } }
    return origEnd(chunk, ...rest);
  };

  res.on('finish', () => {
    try {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const route = `${req.method} ${normalizePath(req.originalUrl || req.url)}`;
      const status = res.statusCode;

      totals.requests++;
      totals.bytesOut += bytesOut;
      if (status >= 500) totals.errors++;

      bump(routeStats, route, MAX_ROUTES,
        () => ({ n: 0, err: 0, totalMs: 0, maxMs: 0, totalBytes: 0, maxBytes: 0 }),
        v => {
          v.n++; v.totalMs += ms; v.totalBytes += bytesOut;
          if (ms > v.maxMs) v.maxMs = ms;
          if (bytesOut > v.maxBytes) v.maxBytes = bytesOut;
          if (status >= 500) v.err++;
        });

      const slow = ms > SLOW_MS;
      const heavy = bytesOut > HEAVY_BYTES;
      const failed = status >= 500;
      if (slow || heavy || failed) {
        totals.anomalies++;
        const anomaly = {
          kind: failed ? 'http_error' : heavy ? 'http_heavy' : 'http_slow',
          route, status, ms: Math.round(ms), bytesOut,
          userId: req.authenticatedUserId || null,
          at: new Date().toISOString()
        };
        push(anomaly);
        // Una sola línea, buscable en los logs de Vercel por "AUDIT_ANOMALY".
        console.log('AUDIT_ANOMALY ' + JSON.stringify(anomaly));
      }
    } catch { /* la auditoría NUNCA debe romper una respuesta */ }
  });

  next();
}

const kB = (n) => Math.round(n / 1024);

/** Foto en vivo de ESTA instancia. Sin tocar la base de datos. */
export function getAuditSnapshot() {
  const routes = [...routeStats.entries()].map(([route, v]) => ({
    route, n: v.n, errors: v.err,
    avgMs: Math.round(v.totalMs / v.n),
    maxMs: Math.round(v.maxMs),
    avgKB: kB(v.totalBytes / v.n),
    maxKB: kB(v.maxBytes)
  }));

  return {
    enabled: ENABLED,
    note: 'Serverless: cada instancia ve solo sus propias peticiones. El registro '
        + 'duradero son las lineas AUDIT_ANOMALY en los logs de Vercel.',
    instanceUptimeSec: Math.round((Date.now() - bootedAt) / 1000),
    thresholds: { slowMs: SLOW_MS, heavyBytes: HEAVY_BYTES, dbHeavyBytes: DB_HEAVY_BYTES },
    totals: { ...totals, bytesOutMB: +(totals.bytesOut / 1048576).toFixed(2) },
    // Lo que de verdad interesa mirar primero cuando algo va mal:
    worstByWeight: [...routes].sort((a, b) => b.maxKB - a.maxKB).slice(0, 10),
    worstByLatency: [...routes].sort((a, b) => b.maxMs - a.maxMs).slice(0, 10),
    tables: [...tableStats.entries()]
      .map(([table, v]) => ({ table, reads: v.reads, rows: v.rows, maxKBEst: kB(v.maxBytesEst), maxMs: Math.round(v.maxMs) }))
      .sort((a, b) => b.maxKBEst - a.maxKBEst),
    recentAnomalies: [...ring].reverse()
  };
}

/**
 * Comprueba capa por capa qué responde y en cuánto. Durante una caída dice
 * inmediatamente si el problema es PostgREST, Auth, Storage o la propia función.
 * Peticiones minúsculas: limit=1 y HEAD donde se puede.
 */
export async function runSelfTest({ supabaseUrl, anonKey, serviceKey } = {}) {
  const url = supabaseUrl || process.env.SUPABASE_URL;
  const anon = anonKey || process.env.SUPABASE_ANON_KEY;
  const svc = serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const out = { at: new Date().toISOString(), checks: [] };

  if (!url || !anon) {
    out.checks.push({ layer: 'config', ok: false, detail: 'Faltan SUPABASE_URL / SUPABASE_ANON_KEY' });
    return out;
  }

  const probe = async (layer, path, headers) => {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${url}${path}`, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      const body = await r.text();
      out.checks.push({
        layer, ok: r.ok, status: r.status, ms: Date.now() - t0, bytes: body.length,
        // 522/544 = Cloudflare no alcanza la instancia: el problema NO es tu codigo.
        hint: r.status === 522 || r.status === 544
          ? 'La instancia de Supabase no responde al edge (no es el codigo de la app)'
          : undefined
      });
    } catch (err) {
      out.checks.push({ layer, ok: false, ms: Date.now() - t0, error: err.name === 'AbortError' ? 'timeout 8s' : err.message });
    }
  };

  await probe('rest', '/rest/v1/users?select=id&limit=1', { apikey: anon, Authorization: `Bearer ${svc || anon}` });
  await probe('auth', '/auth/v1/settings', { apikey: anon });
  await probe('storage', '/storage/v1/bucket', { apikey: anon, Authorization: `Bearer ${svc || anon}` });

  out.ok = out.checks.every(c => c.ok);
  out.verdict = out.ok
    ? 'Todas las capas responden.'
    : out.checks.some(c => c.status === 522 || c.status === 544)
      ? 'La instancia de Supabase esta caida o saturada: reiniciala desde el dashboard.'
      : 'Alguna capa falla: mira el detalle de cada check.';
  return out;
}

/** Reinicia los contadores de esta instancia (util al empezar a reproducir un problema). */
export function resetAudit() {
  ring.length = 0;
  routeStats.clear();
  tableStats.clear();
  totals = { requests: 0, anomalies: 0, errors: 0, bytesOut: 0 };
}
