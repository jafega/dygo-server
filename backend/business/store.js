// Adaptador de almacenamiento de mainds business (D3 / R3).
//
// Toda lectura y escritura de Business pasa por aquí. Tres drivers con la misma
// interfaz:
//   supabase → Postgres vía supabase-js (producción).
//   file     → un JSON local (desarrollo y QA sin Supabase).
//   memory   → en memoria (tests).
//
// Interfaz (todas async):
//   get(table, id)                                   → fila | null
//   list(table, { eq, in, gte, lte, contains, order, limit }) → filas
//     contains: { columna_array: valor } → filas cuyo array incluye el valor
//   insert(table, row | rows)                        → fila | filas
//   update(table, id, patch)                         → fila | null
//   remove(table, id)                                → boolean
//
// Garantías:
//   - Solo se tocan tablas de la lista blanca (organizations, org_*,
//     access_audit, verifactu_records). Cualquier otra → StoreError
//     TABLE_NOT_ALLOWED. Así Business nunca escribe en tablas Pro (D1).
//   - access_audit y verifactu_records son de solo inserción.
//   - Nunca devuelve más de MAX_LIMIT filas (R4).
//   - file/memory emulan las restricciones únicas clave → UNIQUE_VIOLATION.
//   - supabase: tabla inexistente → BUSINESS_NOT_MIGRATED (R2).
//   - Las tablas de Business NO pasan por la caché de server.js (R4).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_LIMIT = 500;

export class StoreError extends Error {
  constructor(code, message, { table, cause } = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    if (table) this.table = table;
    if (cause) this.cause = cause;
  }
}

// ── Lista blanca ────────────────────────────────────────────────────────────
const EXACT_TABLES = new Set(['organizations', 'access_audit', 'verifactu_records']);
const ORG_TABLE_RE = /^org_[a-z][a-z0-9_]*$/;
export const INSERT_ONLY_TABLES = new Set(['access_audit', 'verifactu_records']);

export function isAllowedTable(table) {
  return typeof table === 'string' && (EXACT_TABLES.has(table) || ORG_TABLE_RE.test(table));
}

function assertTable(table) {
  if (!isAllowedTable(table)) {
    throw new StoreError('TABLE_NOT_ALLOWED', `Tabla no permitida para Business: ${String(table)}`, { table: String(table) });
  }
}

function assertWritable(table, op) {
  if (INSERT_ONLY_TABLES.has(table)) {
    throw new StoreError('INSERT_ONLY_TABLE', `La tabla ${table} es de solo inserción: no admite ${op}`, { table });
  }
}

// ── Restricciones únicas emuladas en file/memory ───────────────────────────
// Reflejan los índices únicos de las migraciones business-00N. Si una columna
// del índice es null la fila no participa (como un índice único de Postgres).
// `ci` = columnas comparadas sin distinguir mayúsculas.
export const UNIQUE_KEYS = {
  organizations: [{ columns: ['slug'], ci: ['slug'] }],
  org_members: [
    { columns: ['org_id', 'email'], ci: ['email'] },
    { columns: ['org_id', 'user_id'] },
    { columns: ['invitation_token_hash'] }
  ],
  org_invoices: [{ columns: ['issuer_key', 'series', 'number'] }],
  org_settlements: [{ columns: ['org_id', 'member_id', 'period'] }],
  // Dos registros del mismo NIF no pueden encadenarse al mismo anterior.
  verifactu_records: [{ columns: ['issuer_tax_id', 'previous_hash'] }, { columns: ['invoice_id', 'record_type'] }],
  org_course_progress: [{ columns: ['member_id', 'module_id'] }]
};

function uniqueValue(row, key) {
  const parts = [];
  for (const col of key.columns) {
    let v = row[col];
    if (v === null || v === undefined) return null;
    if (key.ci?.includes(col) && typeof v === 'string') v = v.trim().toLowerCase();
    parts.push(JSON.stringify(v));
  }
  return parts.join('|');
}

function checkUnique(table, rows, candidate, ignoreId = null) {
  for (const key of UNIQUE_KEYS[table] || []) {
    const val = uniqueValue(candidate, key);
    if (val === null) continue;
    const clash = rows.some(r => r.id !== ignoreId && uniqueValue(r, key) === val);
    if (clash) {
      throw new StoreError('UNIQUE_VIOLATION', `Valor duplicado en ${table} (${key.columns.join(', ')})`, { table });
    }
  }
}

// ── Opciones de list ───────────────────────────────────────────────────────
function normalizeLimit(limit) {
  if (limit === undefined || limit === null) return MAX_LIMIT;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) throw new StoreError('BAD_QUERY', 'limit debe ser un entero positivo');
  if (n > MAX_LIMIT) throw new StoreError('LIMIT_TOO_LARGE', `limit máximo ${MAX_LIMIT}`);
  return n;
}

function normalizeOrder(order) {
  if (!order) return [];
  const arr = Array.isArray(order) ? order : [order];
  return arr.map(o => (typeof o === 'string'
    ? (o.startsWith('-') ? { column: o.slice(1), ascending: false } : { column: o, ascending: true })
    : { column: o.column, ascending: o.ascending !== false }));
}

const clone = (v) => (v === undefined ? undefined : structuredClone(v));

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;   // nulls al final (como Postgres en ASC)
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function matches(row, { eq, in: inn, gte, lte, contains } = {}) {
  for (const [col, v] of Object.entries(contains || {})) {
    if (!Array.isArray(row[col]) || !row[col].includes(v)) return false;
  }
  for (const [col, v] of Object.entries(eq || {})) {
    if (v === null) { if (row[col] !== null && row[col] !== undefined) return false; continue; }
    if (row[col] !== v) return false;
  }
  for (const [col, vals] of Object.entries(inn || {})) {
    if (!Array.isArray(vals) || !vals.includes(row[col])) return false;
  }
  for (const [col, v] of Object.entries(gte || {})) {
    if (row[col] === null || row[col] === undefined || compare(row[col], v) < 0) return false;
  }
  for (const [col, v] of Object.entries(lte || {})) {
    if (row[col] === null || row[col] === undefined || compare(row[col], v) > 0) return false;
  }
  return true;
}

function withDefaults(row) {
  const now = new Date().toISOString();
  const out = { ...row };
  if (out.id === undefined || out.id === null) out.id = crypto.randomUUID();
  if (out.created_at === undefined) out.created_at = now;
  return out;
}

// ── Driver local (file / memory) ───────────────────────────────────────────
function createLocalDriver({ load, persist }) {
  let data = null;
  let chain = Promise.resolve();

  const tables = () => {
    if (!data) {
      data = load() || {};
      if (!data.tables || typeof data.tables !== 'object') data = { tables: {} };
    }
    return data.tables;
  };
  const rowsOf = (table) => {
    const t = tables();
    if (!Array.isArray(t[table])) t[table] = [];
    return t[table];
  };
  // Serializa las escrituras: cada operación ve el estado de la anterior.
  const serial = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  return {
    async get(table, id) {
      return clone(rowsOf(table).find(r => r.id === id) || null);
    },
    async list(table, opts = {}) {
      const limit = normalizeLimit(opts.limit);
      let rows = rowsOf(table).filter(r => matches(r, opts));
      const order = normalizeOrder(opts.order);
      if (order.length) {
        rows = [...rows].sort((a, b) => {
          for (const o of order) {
            const c = compare(a[o.column], b[o.column]);
            if (c !== 0) return o.ascending ? c : -c;
          }
          return 0;
        });
      }
      return clone(rows.slice(0, limit));
    },
    insert(table, input) {
      return serial(() => {
        const rows = rowsOf(table);
        const many = Array.isArray(input);
        const prepared = (many ? input : [input]).map(withDefaults);
        const staged = [...rows];
        for (const row of prepared) {
          if (staged.some(r => r.id === row.id)) {
            throw new StoreError('UNIQUE_VIOLATION', `id duplicado en ${table}`, { table });
          }
          checkUnique(table, staged, row);
          staged.push(row);
        }
        tables()[table] = staged;
        persist(data);
        return clone(many ? prepared : prepared[0]);
      });
    },
    update(table, id, patch) {
      return serial(() => {
        const rows = rowsOf(table);
        const idx = rows.findIndex(r => r.id === id);
        if (idx === -1) return null;
        const { id: _ignored, ...rest } = patch || {};
        const next = { ...rows[idx], ...rest };
        checkUnique(table, rows, next, id);
        rows[idx] = next;
        persist(data);
        return clone(next);
      });
    },
    remove(table, id) {
      return serial(() => {
        const rows = rowsOf(table);
        const idx = rows.findIndex(r => r.id === id);
        if (idx === -1) return false;
        rows.splice(idx, 1);
        persist(data);
        return true;
      });
    }
  };
}

function createFileDriver(filePath) {
  if (!filePath) throw new Error('El driver file necesita una ruta');
  const abs = path.resolve(filePath);
  return createLocalDriver({
    load: () => {
      if (!fs.existsSync(abs)) return null;
      const txt = fs.readFileSync(abs, 'utf-8');
      return txt.trim() ? JSON.parse(txt) : null;
    },
    persist: (data) => {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const tmp = `${abs}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, abs);
    }
  });
}

function createMemoryDriver(initial = null) {
  return createLocalDriver({
    load: () => (initial ? structuredClone(initial) : null),
    persist: () => {}
  });
}

// ── Driver Supabase ────────────────────────────────────────────────────────
const NOT_MIGRATED_CODES = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);

function mapSupabaseError(error, table) {
  const code = error?.code;
  if (NOT_MIGRATED_CODES.has(code)) {
    return new StoreError('BUSINESS_NOT_MIGRATED', `Tabla o columna sin migrar (${table})`, { table });
  }
  if (code === '23505') return new StoreError('UNIQUE_VIOLATION', `Valor duplicado en ${table}`, { table });
  // No se copia error.message/details: pueden incluir valores de la fila.
  return new StoreError('STORE_ERROR', `Error de base de datos en ${table} (${code || 'sin código'})`, { table });
}

function createSupabaseDriver(supabase) {
  if (!supabase || typeof supabase.from !== 'function') throw new Error('El driver supabase necesita un cliente');
  const run = async (table, query) => {
    const { data, error } = await query;
    if (error) throw mapSupabaseError(error, table);
    return data;
  };
  return {
    async get(table, id) {
      const rows = await run(table, supabase.from(table).select('*').eq('id', id).limit(1));
      return rows?.[0] || null;
    },
    async list(table, opts = {}) {
      const limit = normalizeLimit(opts.limit);
      let q = supabase.from(table).select('*');
      for (const [col, v] of Object.entries(opts.eq || {})) q = v === null ? q.is(col, null) : q.eq(col, v);
      for (const [col, vals] of Object.entries(opts.in || {})) q = q.in(col, vals);
      for (const [col, v] of Object.entries(opts.gte || {})) q = q.gte(col, v);
      for (const [col, v] of Object.entries(opts.lte || {})) q = q.lte(col, v);
      for (const [col, v] of Object.entries(opts.contains || {})) q = q.contains(col, [v]);
      for (const o of normalizeOrder(opts.order)) q = q.order(o.column, { ascending: o.ascending });
      q = q.limit(limit);
      return (await run(table, q)) || [];
    },
    async insert(table, input) {
      const many = Array.isArray(input);
      const rows = await run(table, supabase.from(table).insert(many ? input : [input]).select());
      return many ? rows : rows?.[0] || null;
    },
    async update(table, id, patch) {
      const { id: _ignored, ...rest } = patch || {};
      const rows = await run(table, supabase.from(table).update(rest).eq('id', id).select());
      return rows?.[0] || null;
    },
    async remove(table, id) {
      const rows = await run(table, supabase.from(table).delete().eq('id', id).select('id'));
      return (rows || []).length > 0;
    }
  };
}

// ── Fábrica ────────────────────────────────────────────────────────────────
/**
 * @param {{ driver: 'supabase'|'file'|'memory', supabase?: any, file?: string, initial?: object }} opts
 */
export function createStore({ driver, supabase, file, initial, schema = null } = {}) {
  let impl;
  // schema: { tabla: Set(columnas) } (business/schema.js). Solo en local: cada
  // escritura se comprueba contra las columnas reales de las migraciones.
  const assertColumns = (table, rowOrRows) => {
    if (!schema) return;
    const cols = schema[table];
    if (!cols) throw new StoreError('SCHEMA_MISMATCH', `La tabla ${table} no existe en las migraciones`, { table });
    for (const row of Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]) {
      for (const k of Object.keys(row || {})) {
        if (!cols.has(k)) throw new StoreError('SCHEMA_MISMATCH', `Columna ${table}.${k} no existe en las migraciones`, { table });
      }
    }
  };
  if (driver === 'supabase') impl = createSupabaseDriver(supabase);
  else if (driver === 'file') impl = createFileDriver(file);
  else if (driver === 'memory') impl = createMemoryDriver(initial);
  else throw new Error(`Driver de store desconocido: ${driver}`);

  return Object.freeze({
    driver,
    async get(table, id) {
      assertTable(table);
      return impl.get(table, id);
    },
    async list(table, opts = {}) {
      assertTable(table);
      return impl.list(table, opts);
    },
    async insert(table, rowOrRows) {
      assertTable(table);
      if (!rowOrRows || typeof rowOrRows !== 'object') throw new StoreError('BAD_QUERY', 'insert necesita una fila');
      assertColumns(table, rowOrRows);
      return impl.insert(table, rowOrRows);
    },
    async update(table, id, patch) {
      assertTable(table);
      assertWritable(table, 'update');
      assertColumns(table, patch);
      return impl.update(table, id, patch);
    },
    async remove(table, id) {
      assertTable(table);
      assertWritable(table, 'remove');
      return impl.remove(table, id);
    }
  });
}
