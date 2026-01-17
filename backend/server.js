// server.js (ES Modules)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();


// --- CONFIGURACIÓN PARA ES MODULES ---
// En ES Modules no existe __dirname, así que lo recreamos:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURACIÓN BÁSICA ---
const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'db.json');
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.VERCEL_ENV);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_REST_ONLY = String(process.env.SUPABASE_REST_ONLY || '').toLowerCase() === 'true';
const DISALLOW_LOCAL_PERSISTENCE = String(process.env.DISALLOW_LOCAL_PERSISTENCE || 'true').toLowerCase() === 'true';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();



// --- MIDDLEWARE ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://dygo.vercel.app',
  'https://dygo-frontend.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-UserId']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Reemplaza a body-parser

// Block local persistence when configured (force remote storage like Supabase/Postgres)
app.use((req, res, next) => {
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const hasRemote = !!pgPool || !!supabaseAdmin;
  if (isWrite && DISALLOW_LOCAL_PERSISTENCE && !hasRemote) {
    return res.status(503).json({
      error: 'Persistencia remota no disponible. Configura Supabase/DB antes de guardar.'
    });
  }
  return next();
});

// Block reads when local persistence is disallowed and no remote is configured
app.use((req, res, next) => {
  const hasRemote = !!pgPool || !!supabaseAdmin;
  const isApi = req.path.startsWith('/api');
  const isHealth = req.path === '/api/health' || req.path === '/api/dbinfo';
  if (DISALLOW_LOCAL_PERSISTENCE && !hasRemote && isApi && !isHealth) {
    return res.status(503).json({
      error: 'Persistencia remota no disponible. Configura Supabase/DB para leer datos.'
    });
  }
  return next();
});

// --- ACCESO A "BASE DE DATOS" (db.json o SQLite opcional) ---
const createInitialDb = () => ({
  users: [],
  entries: [],
  goals: [],
  invitations: [],
  settings: {},
  sessions: [],
  invoices: [],
  psychologistProfiles: {}
});

// If you want durable persistence across restarts on platforms like Render, set USE_SQLITE=true
// and optionally SQLITE_DB_FILE to a persistent volume path. Otherwise the default db.json is used.
const USE_SQLITE = String(process.env.USE_SQLITE || '').toLowerCase() === 'true';
const SQLITE_DB_FILE = process.env.SQLITE_DB_FILE || path.join(__dirname, 'database.sqlite');
let sqliteDb = null;
let pgPool = null;
let supabaseAdmin = null;
let supabaseDbCache = null;
const USE_POSTGRES = !!process.env.DATABASE_URL && !SUPABASE_REST_ONLY;

if (USE_SQLITE) {
  try {
    const Database = (await import('better-sqlite3')).default;
    sqliteDb = new Database(SQLITE_DB_FILE);
    // Simple key-value store table: table, id, data (JSON)
    sqliteDb.prepare(`CREATE TABLE IF NOT EXISTS store (
      table_name TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (table_name, id)
    )`).run();

    console.log('✅ SQLite persistence enabled:', SQLITE_DB_FILE);
  } catch (err) {
    console.error('❌ Unable to enable SQLite persistence, falling back to db.json (install better-sqlite3?)', err);
    sqliteDb = null;
  }
}

if (USE_POSTGRES) {
  try {
    const { Pool } = await import('pg');
    const isServerless = IS_SERVERLESS;
    const rawConnectionString = process.env.DATABASE_URL;
    let parsedUrl = null;
    let isSupabaseHost = false;
    let isPoolerHost = false;

    if (rawConnectionString) {
      try {
        parsedUrl = new URL(rawConnectionString);
        isSupabaseHost = parsedUrl.hostname.endsWith('.supabase.com');
        isPoolerHost = parsedUrl.hostname.endsWith('.pooler.supabase.com') || parsedUrl.port === '6543';
      } catch (e) {
        parsedUrl = null;
      }
    }

    const poolConfig = {
      max: Number(process.env.PG_POOL_MAX || (isServerless ? 1 : 10)),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT || 20000),
      keepAlive: true,
      allowExitOnIdle: true
    };

    if (parsedUrl) {
      poolConfig.host = parsedUrl.hostname;
      poolConfig.port = Number(parsedUrl.port || 5432);
      poolConfig.user = decodeURIComponent(parsedUrl.username || '');
      poolConfig.password = decodeURIComponent(parsedUrl.password || '');
      poolConfig.database = parsedUrl.pathname.replace('/', '');
    } else if (rawConnectionString) {
      poolConfig.connectionString = rawConnectionString;
    }

    // If using Supabase pooler, enable pgbouncer mode to avoid prepared statements
    if (isPoolerHost || String(process.env.SUPABASE_PGBOUNCER || '').toLowerCase() === 'true') {
      poolConfig.pgbouncer = true;
    }

    // Log safe connection info (no password) to debug Vercel env usage
    try {
      if (process.env.DATABASE_URL) {
        const safeUrl = new URL(process.env.DATABASE_URL);
        console.log('ℹ️ Postgres connection info', {
          host: safeUrl.hostname,
          port: safeUrl.port,
          user: safeUrl.username,
          database: safeUrl.pathname.replace('/', '')
        });
      }
    } catch (e) {
      console.warn('⚠️ Unable to parse DATABASE_URL for debug', e?.message || e);
    }

    // Supabase and many managed Postgres instances require SSL. Detect common indicators and set ssl config.
    // - If `DATABASE_URL` contains `sslmode=require` or user sets SUPABASE_SSL=true, enable ssl with relaxed verification.
    if (process.env.SUPABASE_SSL === 'true' || isSupabaseHost || isPoolerHost) {
      const sslHost = poolConfig.host || (parsedUrl ? parsedUrl.hostname : undefined);
      poolConfig.ssl = {
        rejectUnauthorized: false,
        ...(sslHost ? { servername: sslHost } : {})
      };
      console.log('ℹ️ Enabling SSL for Postgres connection (rejectUnauthorized: false)');
    }

    pgPool = new Pool(poolConfig);

    // Ensure tables exist
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);

    // If Postgres empty, try to migrate from sqlite or db.json
    const { rows } = await pgPool.query("SELECT COUNT(*) as c FROM entries");
    const count = parseInt(rows[0].c, 10);
    if (count === 0) {
      console.log('ℹ️ Postgres empty, attempting migration from sqlite or db.json');
      // Prefer sqlite if present
      if (sqliteDb) {
        try {
          const read = (table) => sqliteDb.prepare('SELECT id, data FROM store WHERE table_name = ?').all(table);
          const insert = (table, id, data) => pgPool.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [id, data]);
          const users = read('users');
          for (const u of users) await insert('users', u.id, JSON.parse(u.data));
          const entries = read('entries');
          for (const e of entries) await insert('entries', e.id, JSON.parse(e.data));
          const goals = read('goals');
          for (const g of goals) await insert('goals', g.id, JSON.parse(g.data));
          const invitations = read('invitations');
          for (const i of invitations) await insert('invitations', i.id, JSON.parse(i.data));
          const settings = read('settings');
          for (const s of settings) await insert('settings', s.id, JSON.parse(s.data));
          const sessions = read('sessions');
          for (const sess of sessions) await insert('sessions', sess.id, JSON.parse(sess.data));
          const invoices = read('invoices');
          for (const inv of invoices) await insert('invoices', inv.id, JSON.parse(inv.data));
          console.log('✅ Migrated data from SQLite to Postgres');
        } catch (mErr) { console.error('❌ Failed migrating from sqlite to postgres', mErr); }
      } else if (fs.existsSync(DB_FILE)) {
        try {
          const content = fs.readFileSync(DB_FILE, 'utf-8');
          if (content && content.trim()) {
            const parsed = JSON.parse(content);
            const insert = async (table, items, isObj = false) => {
              if (!items) return;
              if (isObj) {
                for (const k of Object.keys(items)) {
                  await pgPool.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [k, items[k]]);
                }
              } else {
                for (const it of items) await pgPool.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [it.id, it]);
              }
            };
            await insert('users', parsed.users);
            await insert('entries', parsed.entries);
            await insert('goals', parsed.goals);
            await insert('invitations', parsed.invitations);
            await insert('settings', parsed.settings, true);
            await insert('sessions', parsed.sessions);
            await insert('invoices', parsed.invoices);
            console.log('✅ Migrated db.json to Postgres');
          }
        } catch (mErr) { console.error('❌ Failed migrating db.json to postgres', mErr); }
      }
    }

    console.log('✅ Postgres persistence enabled (DATABASE_URL)', process.env.DATABASE_URL ? '<redacted>' : '');

    // Load current data into in-memory cache for fast sync with existing sync logic
    try {
      const q = async (table) => {
        const r = await pgPool.query(`SELECT id, data FROM ${table}`);
        return r.rows.map(row => ({ id: row.id, ...row.data }));
      };
      const users = await q('users');
      const entries = await q('entries');
      const goals = await q('goals');
      const invitations = await q('invitations');
      const settingsArr = await q('settings');
      const settings = Object.fromEntries(settingsArr.map(s => [s.id, s]));
      const sessions = await q('sessions');
      const invoices = await q('invoices');
      pgDbCache = { users, entries, goals, invitations, settings, sessions, invoices };
      console.log('ℹ️ Postgres data loaded into cache');
    } catch (err) {
      console.error('❌ Failed populating pg cache', err);
    }
  } catch (err) {
    console.error('❌ Unable to enable Postgres persistence', err);
    pgPool = null;
  }
}

if (!pgPool && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
    console.log('✅ Supabase REST persistence enabled (service role)');
    supabaseDbCache = await loadSupabaseCache();
    console.log('ℹ️ Supabase data loaded into cache');
    (async () => {
      try {
        await dedupeSupabaseUsers();
      } catch (err) {
        console.error('❌ Supabase dedupe failed', err);
      }
    })();
  } catch (err) {
    console.error('❌ Unable to enable Supabase REST persistence', err);
    supabaseAdmin = null;
    supabaseDbCache = null;
  }
}

let pgDbCache = null;

function normalizeSupabaseRow(row) {
  if (!row) return row;
  const base = { ...row };
  const data = base.data;
  delete base.data;
  if (data && typeof data === 'object') {
    return { ...base, ...data };
  }
  return base;
}

function buildSupabaseRowFromEntity(originalRow, entity) {
  const hasData = originalRow && Object.prototype.hasOwnProperty.call(originalRow, 'data');
  if (hasData) {
    return { id: originalRow.id || entity.id, data: entity };
  }
  return { ...entity, id: originalRow?.id || entity.id };
}

async function trySupabaseUpsert(table, payloads) {
  let lastError = null;
  for (const payload of payloads) {
    const { error } = await supabaseAdmin.from(table).upsert(payload, { onConflict: 'id' });
    if (!error) return;
    lastError = error;
  }
  if (lastError) throw lastError;
}

async function loadSupabaseCache() {
  if (!supabaseAdmin) return null;

  const readTable = async (table) => {
    try {
      const { data, error } = await supabaseAdmin.from(table).select('*');
      if (error) {
        console.warn(`⚠️ Could not load table '${table}':`, error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn(`⚠️ Error reading table '${table}':`, err.message);
      return [];
    }
  };

  const usersRows = await readTable('users');
  const entriesRows = await readTable('entries');
  const goalsRows = await readTable('goals');
  const invitationsRows = await readTable('invitations');
  const settingsRows = await readTable('settings');
  const sessionsRows = await readTable('sessions');
  const invoicesRows = await readTable('invoices');
  const profilesRows = await readTable('psychologist_profiles');

  const users = usersRows.map(normalizeSupabaseRow);
  const entries = entriesRows.map(normalizeSupabaseRow);
  const goals = goalsRows.map(normalizeSupabaseRow);
  const invitations = invitationsRows.map(normalizeSupabaseRow);
  const sessions = sessionsRows.map(normalizeSupabaseRow);
  const invoices = invoicesRows.map(normalizeSupabaseRow);
  const settings = Object.fromEntries(settingsRows.map(row => [row.id, (row.data && typeof row.data === 'object') ? row.data : normalizeSupabaseRow(row)]));
  const psychologistProfiles = Object.fromEntries(profilesRows.map(row => [row.id, (row.data && typeof row.data === 'object') ? row.data : normalizeSupabaseRow(row)]));

  return { users, entries, goals, invitations, settings, sessions, invoices, psychologistProfiles };
}

async function readSupabaseTable(table) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from(table).select('*');
  if (error) throw error;
  return (data || []).map(normalizeSupabaseRow);
}

async function readSupabaseRowById(table, id) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from(table).select('*').eq('id', id).limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return normalizeSupabaseRow(data[0]);
}

async function dedupeSupabaseUsers() {
  if (!supabaseAdmin) return;
  const { data, error } = await supabaseAdmin.from('users').select('*');
  if (error) throw error;
  const rows = data || [];
  if (rows.length < 2) return;

  const groups = new Map();
  for (const row of rows) {
    const user = normalizeSupabaseRow(row);
    const email = normalizeEmail(user.email);
    if (!email) continue;
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push({ row, user });
  }

  const duplicateIds = new Map();
  for (const [email, list] of groups.entries()) {
    if (list.length <= 1) continue;

    const scored = list.map((item) => {
      const hasSupabaseId = item.user?.supabaseId ? 2 : 0;
      const isPsych = String(item.user?.role || '').toUpperCase() === 'PSYCHOLOGIST' || item.user?.isPsychologist ? 1 : 0;
      const accessScore = Array.isArray(item.user?.accessList) ? Math.min(item.user.accessList.length, 3) : 0;
      return { ...item, score: hasSupabaseId * 10 + isPsych * 3 + accessScore };
    });

    scored.sort((a, b) => b.score - a.score);
    const canonical = scored[0];
    const others = scored.slice(1);

    const merged = { ...canonical.user };
    for (const o of others) {
      if (!merged.name && o.user?.name) merged.name = o.user.name;
      if (!merged.avatarUrl && o.user?.avatarUrl) merged.avatarUrl = o.user.avatarUrl;
      if (!merged.googleId && o.user?.googleId) merged.googleId = o.user.googleId;
      if (!merged.supabaseId && o.user?.supabaseId) merged.supabaseId = o.user.supabaseId;
      if (o.user?.role && String(o.user.role).toUpperCase() === 'PSYCHOLOGIST') {
        merged.role = 'PSYCHOLOGIST';
        merged.isPsychologist = true;
      }
      const acc = new Set([...(merged.accessList || []), ...((o.user?.accessList) || [])]);
      merged.accessList = Array.from(acc);
    }

    const updateRow = buildSupabaseRowFromEntity(canonical.row, merged);
    await supabaseAdmin.from('users').upsert(updateRow, { onConflict: 'id' });

    const otherIds = others.map(o => o.row.id).filter(Boolean);
    if (otherIds.length) {
      for (const id of otherIds) {
        duplicateIds.set(id, canonical.row.id);
      }
      await supabaseAdmin.from('users').delete().in('id', otherIds);
    }
  }

  if (duplicateIds.size > 0) {
    try {
      const { data: entriesRows, error: entriesError } = await supabaseAdmin.from('entries').select('*');
      if (entriesError) throw entriesError;
      const updates = [];
      for (const row of entriesRows || []) {
        const entry = normalizeSupabaseRow(row);
        const canonicalId = duplicateIds.get(String(entry.userId || ''));
        if (canonicalId) {
          const updated = { ...entry, userId: canonicalId };
          updates.push(buildSupabaseRowFromEntity(row, updated));
        }
      }
      if (updates.length) {
        const chunk = (arr, size = 200) => {
          const out = [];
          for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
          return out;
        };
        for (const c of chunk(updates, 200)) {
          await supabaseAdmin.from('entries').upsert(c, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('❌ Failed updating entries after user dedupe', e);
    }
  }
}

async function saveSupabaseDb(data, prevCache = null) {
  if (!supabaseAdmin) return;

  const chunk = (arr, size = 200) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const upsertTable = async (table, rows) => {
    if (!rows.length) return;
    const chunks = chunk(rows);
    for (const c of chunks) {
      const { error: upsertError } = await supabaseAdmin.from(table).upsert(c, { onConflict: 'id' });
      if (upsertError) throw upsertError;
    }
  };

  const deleteMissing = async (table, prevIds, nextIds) => {
    if (!prevIds || !prevIds.length) return;
    const nextSet = new Set(nextIds || []);
    const toDelete = prevIds.filter((id) => !nextSet.has(id));
    if (!toDelete.length) return;
    const chunks = chunk(toDelete, 200);
    for (const c of chunks) {
      const { error: delError } = await supabaseAdmin.from(table).delete().in('id', c);
      if (delError) throw delError;
    }
  };

  const usersRows = (data.users || []).map(u => ({ id: u.id, data: u }));
  const entriesRows = (data.entries || []).map(e => ({ id: e.id, data: e }));
  const goalsRows = (data.goals || []).map(g => ({ id: g.id, data: g }));
  const invitationsRows = (data.invitations || []).map(i => ({ id: i.id, data: i }));
  const settings = data.settings || {};
  const settingsRows = Object.keys(settings).map(k => ({ id: k, data: settings[k] }));
  const sessionsRows = (data.sessions || []).map(s => ({ id: s.id, data: s }));
  const invoicesRows = (data.invoices || []).map(inv => ({ id: inv.id, data: inv }));
  const profiles = data.psychologistProfiles || {};
  const profilesRows = Object.keys(profiles).map(k => ({ id: k, data: profiles[k] }));

  await upsertTable('users', usersRows);
  await upsertTable('entries', entriesRows);
  await upsertTable('goals', goalsRows);
  await upsertTable('invitations', invitationsRows);
  await upsertTable('settings', settingsRows);
  await upsertTable('sessions', sessionsRows);
  await upsertTable('invoices', invoicesRows);
  await upsertTable('psychologist_profiles', profilesRows);

  if (prevCache) {
    await deleteMissing('users', (prevCache.users || []).map(u => u.id), usersRows.map(r => r.id));
    await deleteMissing('entries', (prevCache.entries || []).map(e => e.id), entriesRows.map(r => r.id));
    await deleteMissing('goals', (prevCache.goals || []).map(g => g.id), goalsRows.map(r => r.id));
    await deleteMissing('invitations', (prevCache.invitations || []).map(i => i.id), invitationsRows.map(r => r.id));
    await deleteMissing('settings', Object.keys(prevCache.settings || {}), settingsRows.map(r => r.id));
    await deleteMissing('sessions', (prevCache.sessions || []).map(s => s.id), sessionsRows.map(r => r.id));
    await deleteMissing('invoices', (prevCache.invoices || []).map(inv => inv.id), invoicesRows.map(r => r.id));
    await deleteMissing('psychologist_profiles', Object.keys(prevCache.psychologistProfiles || {}), profilesRows.map(r => r.id));
  }
}

const getDb = () => {
  if (DISALLOW_LOCAL_PERSISTENCE && !pgPool && !supabaseAdmin && !sqliteDb) {
    return createInitialDb();
  }
  // Postgres: return in-memory cache (keeps handler sync)
  if (pgPool && pgDbCache) {
    return pgDbCache;
  }

  // Supabase REST fallback: return in-memory cache
  if (supabaseAdmin && supabaseDbCache) {
    return supabaseDbCache;
  }

  if (sqliteDb) {
    const read = (table) => sqliteDb.prepare('SELECT data FROM store WHERE table_name = ?').all(table).map(r => JSON.parse(r.data));
    const users = read('users');
    const entries = read('entries');
    const goals = read('goals');
    const invitations = read('invitations');
    const settingsArr = read('settings');
    const settings = Object.fromEntries(settingsArr.map((s) => [s.id, s]));
    const sessions = read('sessions');
    const invoices = read('invoices');
    return { users, entries, goals, invitations, settings, sessions, invoices };
  }

  // 1. Si no existe, crearla
  if (!fs.existsSync(DB_FILE)) {
    if (DISALLOW_LOCAL_PERSISTENCE) {
      return createInitialDb();
    }
    console.log('⚠️ db.json no encontrado. Creando nueva base de datos...');
    const initialDb = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }

  // 2. Intentar leerla. Si falla (json corrupto), reiniciarla.
  try {
    const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
    if (!fileContent.trim()) throw new Error('Archivo vacío');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('❌ Error leyendo db.json. El archivo parece estar corrupto.', error);

    // Backup del archivo dañado
    try {
      if (fs.existsSync(DB_FILE)) {
        const backupName = `db.corrupt.${Date.now()}.json`;
        fs.renameSync(DB_FILE, path.join(__dirname, backupName));
        console.log(`📦 Backup creado: ${backupName}`);
      }
    } catch (errBackup) {
      console.error('❌ Error creando backup del db.json corrupto:', errBackup);
    }

    // Crear nueva DB limpia
    const initialDb = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
    return initialDb;
  }
};

const saveDb = (data) => {
  // Keep in-memory cache in sync for Postgres, then persist in background
  if (pgPool) {
    pgDbCache = data;
    (async () => {
      let client;
      try {
        client = await pgPool.connect();
        await client.query('BEGIN');
        await client.query('DELETE FROM users');
        await client.query('DELETE FROM entries');
        await client.query('DELETE FROM goals');
        await client.query('DELETE FROM invitations');
        await client.query('DELETE FROM settings');
        await client.query('DELETE FROM sessions');
        await client.query('DELETE FROM invoices');

        const insert = async (table, id, obj) => client.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [id, obj]);

        for (const u of (data.users || [])) await insert('users', u.id, u);
        for (const e of (data.entries || [])) await insert('entries', e.id, e);
        for (const g of (data.goals || [])) await insert('goals', g.id, g);
        for (const i of (data.invitations || [])) await insert('invitations', i.id, i);
        const settings = data.settings || {};
        for (const k of Object.keys(settings)) await insert('settings', k, settings[k]);
        for (const s of (data.sessions || [])) await insert('sessions', s.id, s);
        for (const inv of (data.invoices || [])) await insert('invoices', inv.id, inv);

        await client.query('COMMIT');
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('❌ Error guardando en Postgres:', err);
      } finally {
        if (client) client.release();
      }
    })();

    return;
  }

  if (supabaseAdmin) {
    const prevCache = supabaseDbCache;
    supabaseDbCache = data;
    (async () => {
      try {
        await saveSupabaseDb(data, prevCache);
      } catch (err) {
        console.error('❌ Error guardando en Supabase REST:', err);
      }
    })();
    return;
  }

  if (sqliteDb) {
    const del = sqliteDb.prepare('DELETE FROM store WHERE table_name = ?');
    const insert = sqliteDb.prepare('INSERT OR REPLACE INTO store(table_name,id,data) VALUES(@table,@id,@data)');
    const tx = sqliteDb.transaction((dbObj) => {
      del.run('users');
      del.run('entries');
      del.run('goals');
      del.run('invitations');
      del.run('settings');

      (dbObj.users || []).forEach(u => insert.run({ table: 'users', id: u.id, data: JSON.stringify(u) }));
      (dbObj.entries || []).forEach(e => insert.run({ table: 'entries', id: e.id, data: JSON.stringify(e) }));
      (dbObj.goals || []).forEach(g => insert.run({ table: 'goals', id: g.id, data: JSON.stringify(g) }));
      (dbObj.invitations || []).forEach(i => insert.run({ table: 'invitations', id: i.id, data: JSON.stringify(i) }));
      const settings = dbObj.settings || {};
      Object.keys(settings).forEach(k => insert.run({ table: 'settings', id: k, data: JSON.stringify(settings[k]) }));
      (dbObj.sessions || []).forEach(s => insert.run({ table: 'sessions', id: s.id, data: JSON.stringify(s) }));
      (dbObj.invoices || []).forEach(inv => insert.run({ table: 'invoices', id: inv.id, data: JSON.stringify(inv) }));
    });
    try {
      tx(data);
    } catch (e) {
      console.error('❌ Error guardando en SQLite:', e);
    }
    return;
  }

  if (IS_SERVERLESS) {
    console.warn('⚠️ Skipping db.json write on serverless read-only filesystem. Enable Postgres or SQLite for persistence.');
    return;
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Error guardando en db.json:', error);
  }
};

// --- LOGGING SENCILLO ---
app.use((req, _res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// --- RUTAS DE AUTENTICACIÓN ---
// Registro
app.post('/api/auth/register', (req, res) => {
  console.log('👤 Registro solicitado para:', req.body?.email);

  try {
    const { name, email, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const db = getDb();
    const normalizedEmail = normalizeEmail(email);

    // Verificar si existe el email
    if (db.users.find((u) => normalizeEmail(u.email) === normalizedEmail)) {
      return res.status(400).json({ error: 'El email ya existe' });
    }

    const normalizedRole = String(role || 'PATIENT').toUpperCase() === 'PSYCHOLOGIST' ? 'PSYCHOLOGIST' : 'PATIENT';

    const newUser = {
      id: crypto.randomUUID(), // requiere Node 16.14+ / 18+
      name,
      email: normalizedEmail,
      password, // OJO: en producción deberías hashearla
      role: normalizedRole,
      isPsychologist: normalizedRole === 'PSYCHOLOGIST',
      accessList: []
    };

    db.users.push(newUser);
    saveDb(db);

    console.log('✅ Usuario creado:', newUser.id);
    res.json(newUser);
  } catch (error) {
    console.error('❌ Error en /api/auth/register:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Supabase OAuth token exchange + user validation
const handleSupabaseAuth = async (req, res) => {
  try {
    const { access_token } = req.body || {};
    if (!access_token) return res.status(400).json({ error: 'access_token is required' });
    if (!process.env.SUPABASE_URL) return res.status(500).json({ error: 'SUPABASE_URL not configured' });

    // Validate token against Supabase /auth/v1/user
    const userInfoRes = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': process.env.SUPABASE_ANON_KEY || ''
      }
    });

    if (!userInfoRes.ok) {
      console.warn('Invalid Supabase token response:', await userInfoRes.text());
      return res.status(400).json({ error: 'Invalid supabase token' });
    }

    const supUser = await userInfoRes.json();
    // supUser contains `email`, `id` (supabase user id), etc.

    const db = getDb();
    let user = db.users.find(u => u.supabaseId && String(u.supabaseId) === String(supUser.id));
    if (!user) {
      user = db.users.find(u => u.email && normalizeEmail(u.email) === normalizeEmail(supUser.email));
    }

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        name: supUser.user_metadata?.full_name || supUser.email || 'Sin nombre',
        email: normalizeEmail(supUser.email),
        password: '',
        role: 'PATIENT',
        isPsychologist: false,
        accessList: [],
        supabaseId: supUser.id
      };
      db.users.push(user);
      if (!db.settings) db.settings = {};
      if (!db.settings[user.id]) db.settings[user.id] = {};
      saveDb(db);
      console.log('✅ Created new user from Supabase sign-in:', user.email);
    } else {
      // Ensure supabaseId is set
      if (!user.supabaseId) {
        user.supabaseId = supUser.id;
      }
      if (user.role) {
        user.isPsychologist = String(user.role).toUpperCase() === 'PSYCHOLOGIST';
      }
      if (!db.settings) db.settings = {};
      if (!db.settings[user.id]) db.settings[user.id] = {};
      saveDb(db);
    }

    return res.json(user);
  } catch (err) {
    console.error('Error in supabase auth handler', err);
    return res.status(500).json({ error: 'Supabase auth failed' });
  }
};

// Primary endpoint (single-segment to avoid Vercel multi-segment routing issues)
app.post('/api/supabase-auth', handleSupabaseAuth);
// Legacy endpoint
app.post('/api/auth/supabase', handleSupabaseAuth);

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let user = null;
    if (supabaseAdmin) {
      const users = await readSupabaseTable('users');
      user = (users || []).find((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail && u.password === password);
    } else {
      const db = getDb();
      user = db.users.find((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail && u.password === password);
    }

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    console.log('✅ Login exitoso:', user.name);
    res.json(user);
  } catch (error) {
    console.error('❌ Error en /api/auth/login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- DEMO PASSWORD RESET (secure-ish) ---
// Allows resetting a user's password by email. For production you MUST set PASSWORD_RESET_SECRET in the env,
// otherwise this endpoint is only allowed when NODE_ENV !== 'production'.
const handleResetPasswordDemo = (req, res) => {
  try {
    const { email, newPassword, secret } = req.body || {};
    if (!email || !newPassword) return res.status(400).json({ error: 'email and newPassword are required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password too short' });

    // If in production, require secret env var to match
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.PASSWORD_RESET_SECRET) return res.status(500).json({ error: 'Reset disabled' });
      if (!secret || secret !== process.env.PASSWORD_RESET_SECRET) return res.status(403).json({ error: 'Invalid secret' });
    }

    const db = getDb();
    const user = db.users.find(u => u.email && String(u.email).toLowerCase() === String(email).toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword;
    saveDb(db);
    console.log(`🔒 Password reset (demo) for ${user.email}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in reset-password-demo', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

app.post('/api/auth/reset-password-demo', handleResetPasswordDemo);
app.post('/api/reset-password-demo', handleResetPasswordDemo);

// --- ADMIN: Reset any user's password (restricted to superadmin)
const handleAdminResetUserPassword = (req, res) => {
  try {
    const requesterId = req.headers['x-user-id'] || req.headers['x-userid'] || req.body?.requesterId;
    if (!requesterId) return res.status(401).json({ error: 'Missing requester id in header x-user-id' });

    const db = getDb();
    const requester = db.users.find(u => u.id === String(requesterId));
    if (!requester) return res.status(403).json({ error: 'Requester not found or unauthorized' });

    // Only allow the superadmin by email
    if (String(requester.email).toLowerCase() !== 'garryjavi@gmail.com') return res.status(403).json({ error: 'Forbidden' });

    const { targetEmail, newPassword } = req.body || {};
    if (!targetEmail || !newPassword) return res.status(400).json({ error: 'targetEmail and newPassword required' });
    if (String(newPassword).length < 6) return res.status(400).json({ error: 'Password too short' });

    const user = db.users.find(u => u.email && String(u.email).toLowerCase() === String(targetEmail).toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword;
    saveDb(db);
    console.log(`🔒 Admin ${requester.email} reset password for ${user.email}`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in admin-reset-user-password', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

app.post('/api/admin/reset-user-password', handleAdminResetUserPassword);
app.post('/api/admin-reset-user-password', handleAdminResetUserPassword);

// --- ADMIN: Delete a user and all associated data (restricted to superadmin)
const handleAdminDeleteUser = (req, res) => {
  try {
    const requesterId = req.headers['x-user-id'] || req.headers['x-userid'] || req.body?.requesterId;
    if (!requesterId) return res.status(401).json({ error: 'Missing requester id in header x-user-id' });

    const db = getDb();
    const requester = db.users.find(u => u.id === String(requesterId));
    if (!requester) return res.status(403).json({ error: 'Requester not found or unauthorized' });

    // Only allow the superadmin by email
    if (String(requester.email).toLowerCase() !== 'garryjavi@gmail.com') return res.status(403).json({ error: 'Forbidden' });

    const { targetEmail } = req.body || {};
    if (!targetEmail) return res.status(400).json({ error: 'targetEmail required' });

    const user = db.users.find(u => u.email && String(u.email).toLowerCase() === String(targetEmail).toLowerCase());
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent removing the superadmin account itself
    if (String(user.email).toLowerCase() === 'garryjavi@gmail.com') return res.status(403).json({ error: 'Cannot delete superadmin' });

    // 1) Remove user's entries
    db.entries = db.entries.filter((e) => String(e.userId) !== String(user.id));

    // 2) Remove user's goals
    db.goals = db.goals.filter((g) => String(g.userId) !== String(user.id));

    // 3) Remove invitations sent by or for this user
    db.invitations = db.invitations.filter((i) => {
      if (!i) return false;
      const fromMatch = i.fromPsychologistId && String(i.fromPsychologistId) === String(user.id);
      const toMatch = i.toUserEmail && String(i.toUserEmail).toLowerCase() === String(user.email).toLowerCase();
      return !(fromMatch || toMatch);
    });

    // 4) Remove this user's id from other users' accessList
    db.users.forEach((u) => {
      if (Array.isArray(u.accessList)) {
        u.accessList = u.accessList.filter((id) => String(id) !== String(user.id));
      }
    });

    // 5) Remove settings for this user
    if (db.settings && db.settings[user.id]) delete db.settings[user.id];

    // 6) Finally, remove the user record
    db.users = db.users.filter((u) => String(u.id) !== String(user.id));

    saveDb(db);
    console.log(`🗑️ Admin ${requester.email} deleted user ${user.email} and associated data`);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in admin-delete-user', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

app.delete('/api/admin/delete-user', handleAdminDeleteUser);
app.delete('/api/admin-delete-user', handleAdminDeleteUser);

// --- ADMIN: Migrate JSON/SQLite data to Postgres/Supabase (dry-run & execute)
const handleAdminMigrateToPostgres = async (req, res) => {
  try {
    const requesterId = req.headers['x-user-id'] || req.headers['x-userid'] || req.body?.requesterId;
    if (!requesterId) return res.status(401).json({ error: 'Missing requester id in header x-user-id' });

    const db = getDb();
    const requester = db.users.find(u => u.id === String(requesterId));
    if (!requester) return res.status(403).json({ error: 'Requester not found or unauthorized' });
    if (String(requester.email).toLowerCase() !== 'garryjavi@gmail.com') return res.status(403).json({ error: 'Forbidden' });

    if (!pgPool) return res.status(400).json({ error: 'Postgres is not configured on this server' });

    const { dryRun } = req.body || {};

    // Read source data (prefer sqlite if present)
    let source = null;
    if (sqliteDb) {
      const read = (table) => sqliteDb.prepare('SELECT id, data FROM store WHERE table_name = ?').all(table).map(r => ({ id: r.id, data: JSON.parse(r.data) }));
      const users = read('users');
      const entries = read('entries');
      const goals = read('goals');
      const invitations = read('invitations');
      const settings = read('settings');
      source = { users, entries, goals, invitations, settings };
    } else if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = content && content.trim() ? JSON.parse(content) : createInitialDb();
      const users = (parsed.users || []).map(u => ({ id: u.id, data: u }));
      const entries = (parsed.entries || []).map(e => ({ id: e.id, data: e }));
      const goals = (parsed.goals || []).map(g => ({ id: g.id, data: g }));
      const invitations = (parsed.invitations || []).map(i => ({ id: i.id, data: i }));
      const settings = Object.keys(parsed.settings || {}).map(k => ({ id: k, data: parsed.settings[k] }));
      source = { users, entries, goals, invitations, settings };
    } else {
      return res.status(400).json({ error: 'No source data found (no sqlite and db.json missing)' });
    }

    // Helper to get existing ids from Postgres
    const existingIds = {};
    const tables = ['users','entries','goals','invitations','settings'];
    for (const t of tables) {
      const r = await pgPool.query(`SELECT id FROM ${t}`);
      existingIds[t] = new Set(r.rows.map(row => String(row.id)));
    }

    // Build report
    const report = {};
    for (const t of tables) {
      const src = source[t] || [];
      const total = src.length;
      const already = src.filter(s => existingIds[t].has(String(s.id))).length;
      const toInsert = src.filter(s => !existingIds[t].has(String(s.id))).length;
      report[t] = { total, already, toInsert };
    }

    if (dryRun) return res.json({ dryRun: true, report });

    // Execute insertion within transaction
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      const insert = async (table, id, obj) => client.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, obj]);

      for (const u of (source.users || [])) await insert('users', u.id, u.data);
      for (const e of (source.entries || [])) await insert('entries', e.id, e.data);
      for (const g of (source.goals || [])) await insert('goals', g.id, g.data);
      for (const i of (source.invitations || [])) await insert('invitations', i.id, i.data);
      for (const s of (source.settings || [])) await insert('settings', s.id, s.data);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    // Return final counts from Postgres
    const finalCounts = {};
    for (const t of tables) {
      const r = await pgPool.query(`SELECT COUNT(*) as c FROM ${t}`);
      finalCounts[t] = parseInt(r.rows[0].c, 10);
    }

    return res.json({ migrated: true, report, finalCounts });
  } catch (err) {
    console.error('Error in admin-migrate-to-postgres', err);
    return res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
};

app.post('/api/admin/migrate-to-postgres', handleAdminMigrateToPostgres);
app.post('/api/admin-migrate-to-postgres', handleAdminMigrateToPostgres);

// --- STRIPE: create checkout session and portal session ---
const handleCreateCheckoutSession = async (req, res) => {
  try {
    const requesterId = req.headers['x-user-id'] || req.headers['x-userid'];
    if (!requesterId) return res.status(401).json({ error: 'Missing requester id' });

    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured on server' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
    const db = getDb();
    const user = db.users.find(u => u.id === String(requesterId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Create or reuse customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      saveDb(db);
    }

    // Prefer an explicit EUR price id (STRIPE_PRICE_ID_EUR) for the €9.99 monthly plan.
    // Fall back to generic STRIPE_PRICE_ID if present. Otherwise create a product+price in EUR on the fly.
    let priceId = process.env.STRIPE_PRICE_ID_EUR || process.env.STRIPE_PRICE_ID;
    if (!priceId) {
      const product = await stripe.products.create({ name: 'DYGO Premium Monthly (EUR)', description: 'Subscripción mensual a DYGO Premium (€9.99)' });
      const price = await stripe.prices.create({ product: product.id, currency: 'eur', recurring: { interval: 'month' }, unit_amount: 999 }); // €9.99
      priceId = price.id;
    }

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?session=success`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?session=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating checkout session', err);
    return res.status(500).json({ error: 'Error creating checkout session' });
  }
};

app.post('/api/stripe/create-checkout-session', handleCreateCheckoutSession);
app.post('/api/stripe-create-checkout-session', handleCreateCheckoutSession);

const handleCreatePortalSession = async (req, res) => {
  try {
    const requesterId = req.headers['x-user-id'] || req.headers['x-userid'];
    if (!requesterId) return res.status(401).json({ error: 'Missing requester id' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured on server' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
    const db = getDb();
    const user = db.users.find(u => u.id === String(requesterId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.stripeCustomerId) return res.status(400).json({ error: 'No stripe customer' });

    const returnUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: returnUrl });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating portal session', err);
    return res.status(500).json({ error: 'Error creating portal session' });
  }
};

app.post('/api/stripe/create-portal-session', handleCreatePortalSession);
app.post('/api/stripe-create-portal-session', handleCreatePortalSession);

// --- STRIPE: webhook to keep subscription status in sync ---
// Use raw body for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const payload = req.body;

  let event;
  // If webhook secret is configured, verify signature; otherwise accept unfingerprinted events (dev only)
  if (process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
      event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.warn('Webhook signature verification failed, event rejected');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // Development mode: accept raw JSON payloads for testing with the included helper scripts
    try { event = JSON.parse(payload.toString()); } catch (e) { return res.status(400).send('Invalid payload'); }
  }

  try {
    const db = getDb();

    // Safety: ensure event has type and data to avoid crashes from fake payloads
    if (!event || !event.type) {
      console.warn('Received webhook with missing type');
      return res.status(400).send('Missing event type');
    }

    switch (event.type) {
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const subs = db.users.filter(u => u.stripeSubscriptionId === subscriptionId);
        subs.forEach(u => { u.isPremium = false; u.premiumUntil = undefined; });
        saveDb(db);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        const subs = db.users.filter(u => u.stripeSubscriptionId === subscriptionId);
        subs.forEach(u => { u.isPremium = false; u.premiumUntil = undefined; u.stripeSubscriptionId = undefined; });
        saveDb(db);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = subscription.current_period_end * 1000;
        const subs = db.users.filter(u => u.stripeSubscriptionId === subscriptionId || u.stripeCustomerId === subscription.customer);
        subs.forEach(u => { u.isPremium = true; u.premiumUntil = periodEnd; u.stripeSubscriptionId = subscriptionId; });
        saveDb(db);
        break;
      }
      default:
        // ignore
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Error handling webhook', err);
    res.status(500).send('Webhook handler error');
  }
});



// --- RUTAS DE USUARIOS ---
app.get('/api/users/:id', async (req, res) => {
  try {
    let user = null;
    if (supabaseAdmin) {
      user = await readSupabaseRowById('users', req.params.id);
    } else {
      const db = getDb();
      user = db.users.find((u) => u.id === req.params.id);
    }

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Recompute premium status if needed (do not persist here)
    if (user.premiumUntil && Number(user.premiumUntil) < Date.now()) {
      user.isPremium = false;
      user.premiumUntil = undefined;
    }

    res.json(user);
  } catch (err) {
    console.error('Error in /api/users/:id', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const id = req.query.id || req.query.userId;
    const email = req.query.email;

    if (supabaseAdmin) {
      if (id) {
        const user = await readSupabaseRowById('users', String(id));
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (user.premiumUntil && Number(user.premiumUntil) < Date.now()) {
          user.isPremium = false;
          user.premiumUntil = undefined;
        }

        return res.json(user);
      }

      if (email) {
        const users = (await readSupabaseTable('users')) || [];
        const normalizedEmail = normalizeEmail(email);
        const user = users.find(u => normalizeEmail(u.email) === normalizedEmail);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        return res.json(user);
      }

      const users = (await readSupabaseTable('users')) || [];
      const normalized = users.map(u => {
        if (u.premiumUntil && Number(u.premiumUntil) < Date.now()) {
          return { ...u, isPremium: false, premiumUntil: undefined };
        }
        if (u.role) {
          return { ...u, isPsychologist: String(u.role).toUpperCase() === 'PSYCHOLOGIST' };
        }
        return u;
      });
      const unique = [];
      const seen = new Set();
      for (const u of normalized) {
        const key = normalizeEmail(u.email);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(u);
      }
      return res.json(unique);
    }

    const db = getDb();

    if (id) {
      const user = db.users.find((u) => u.id === id);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

      if (user.premiumUntil && Number(user.premiumUntil) < Date.now()) {
        user.isPremium = false;
        user.premiumUntil = undefined;
        saveDb(db);
      }

      return res.json(user);
    }

    if (email) {
      const normalizedEmail = normalizeEmail(email);
      const user = db.users.find(u => normalizeEmail(u.email) === normalizedEmail);
      if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json(user);
    }

    // Normalize premium flags
    let changed = false;
    db.users.forEach(u => {
      if (u.premiumUntil && Number(u.premiumUntil) < Date.now()) {
        u.isPremium = false;
        u.premiumUntil = undefined;
        changed = true;
      }
    });
    if (changed) saveDb(db);

    res.json(db.users);
  } catch (err) {
    console.error('Error in /api/users', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.put('/api/users/:id', (req, res) => {
  const db = getDb();
  const idx = db.users.findIndex((u) => u.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (req.body?.email) {
    const normalizedEmail = normalizeEmail(req.body.email);
    const duplicate = db.users.find((u, i) => i !== idx && normalizeEmail(u.email) === normalizedEmail);
    if (duplicate) return res.status(400).json({ error: 'Email ya en uso' });
  }

  const updated = { ...db.users[idx], ...req.body };
  if (updated.email) updated.email = normalizeEmail(updated.email);
  if (updated.role) updated.isPsychologist = String(updated.role).toUpperCase() === 'PSYCHOLOGIST';
  db.users[idx] = updated;
  saveDb(db);
  res.json(db.users[idx]);
});

app.put('/api/users', (req, res) => {
  const id = req.query.id || req.query.userId;
  if (!id) return res.status(400).json({ error: 'Missing user id' });

  const db = getDb();
  const idx = db.users.findIndex((u) => u.id === id);

  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  if (req.body?.email) {
    const normalizedEmail = normalizeEmail(req.body.email);
    const duplicate = db.users.find((u, i) => i !== idx && normalizeEmail(u.email) === normalizedEmail);
    if (duplicate) return res.status(400).json({ error: 'Email ya en uso' });
  }

  const updated = { ...db.users[idx], ...req.body };
  if (updated.email) updated.email = normalizeEmail(updated.email);
  if (updated.role) updated.isPsychologist = String(updated.role).toUpperCase() === 'PSYCHOLOGIST';
  db.users[idx] = updated;
  saveDb(db);
  res.json(db.users[idx]);
});

// --- RUTAS DE ENTRADAS (ENTRIES) ---
app.get('/api/entries', async (req, res) => {
  try {
    const { userId } = req.query;

    if (supabaseAdmin) {
      const entries = (await readSupabaseTable('entries')) || [];
      if (userId) {
        const ids = new Set([String(userId)]);
        try {
          const user = await readSupabaseRowById('users', String(userId));
          if (user?.supabaseId) ids.add(String(user.supabaseId));
          if (user?.email) ids.add(String(user.email).trim().toLowerCase());
        } catch (e) {
          // ignore lookup errors
        }
        const filtered = entries.filter((e) => {
          const uid = String(e.userId || '').trim();
          const uemail = String(e.userEmail || e.email || '').trim().toLowerCase();
          return ids.has(uid) || (uemail && ids.has(uemail));
        });
        return res.json(filtered);
      }
      return res.json(entries);
    }

    const db = getDb();

    const entries = userId
      ? db.entries.filter((e) => String(e.userId) === String(userId))
      : db.entries;

    res.json(entries);
  } catch (err) {
    console.error('Error in /api/entries', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/entries', (req, res) => {
  const entry = req.body;

  // Si no viene id, generamos uno
  if (!entry.id) {
    entry.id = crypto.randomUUID();
  }

  if (supabaseAdmin) {
    (async () => {
      try {
        let sampleRow = null;
        const { data: sample, error: sampleErr } = await supabaseAdmin.from('entries').select('*').limit(1);
        if (!sampleErr && Array.isArray(sample) && sample.length > 0) sampleRow = sample[0];

        const payloads = sampleRow
          ? [buildSupabaseRowFromEntity(sampleRow, entry), { ...entry, id: entry.id }]
          : [{ id: entry.id, data: entry }, { ...entry, id: entry.id }];

        await trySupabaseUpsert('entries', payloads);

        if (supabaseDbCache?.entries) {
          const idx = supabaseDbCache.entries.findIndex(e => e.id === entry.id);
          if (idx >= 0) supabaseDbCache.entries[idx] = entry;
          else supabaseDbCache.entries.unshift(entry);
        }
        return res.json(entry);
      } catch (err) {
        console.error('Error saving entry (supabase)', err);
        return res.status(500).json({ error: 'Error saving entry' });
      }
    })();
    return;
  }

  const db = getDb();
  db.entries.push(entry);
  saveDb(db);
  res.json(entry);
});

app.put('/api/entries/:id', (req, res) => {
  if (supabaseAdmin) {
    (async () => {
      try {
        const id = req.params.id;
        const { data: existingRows, error: selectErr } = await supabaseAdmin.from('entries').select('*').eq('id', id).limit(1);
        if (selectErr) throw selectErr;

        const existingRow = (existingRows && existingRows[0]) ? existingRows[0] : null;
        const existing = existingRow ? normalizeSupabaseRow(existingRow) : null;
        const updated = { ...(existing || {}), ...req.body, id };
        const payloads = existingRow
          ? [buildSupabaseRowFromEntity(existingRow, updated), { ...updated, id }]
          : [{ id, data: updated }, { ...updated, id }];

        await trySupabaseUpsert('entries', payloads);

        if (supabaseDbCache?.entries) {
          const idx = supabaseDbCache.entries.findIndex(e => e.id === id);
          if (idx >= 0) supabaseDbCache.entries[idx] = updated;
          else supabaseDbCache.entries.unshift(updated);
        }

        return res.json(updated);
      } catch (err) {
        console.error('Error updating entry (supabase)', err);
        return res.status(500).json({ error: 'Error updating entry' });
      }
    })();
    return;
  }

  const db = getDb();
  const idx = db.entries.findIndex((e) => e.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Entrada no encontrada' });
  }

  db.entries[idx] = { ...db.entries[idx], ...req.body };
  saveDb(db);
  res.json(db.entries[idx]);
});

app.put('/api/entries', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing entry id' });

  if (supabaseAdmin) {
    (async () => {
      try {
        const { data: existingRows, error: selectErr } = await supabaseAdmin.from('entries').select('*').eq('id', id).limit(1);
        if (selectErr) throw selectErr;

        const existingRow = (existingRows && existingRows[0]) ? existingRows[0] : null;
        const existing = existingRow ? normalizeSupabaseRow(existingRow) : null;
        const updated = { ...(existing || {}), ...req.body, id };
        const payloads = existingRow
          ? [buildSupabaseRowFromEntity(existingRow, updated), { ...updated, id }]
          : [{ id, data: updated }, { ...updated, id }];

        await trySupabaseUpsert('entries', payloads);

        if (supabaseDbCache?.entries) {
          const idx = supabaseDbCache.entries.findIndex(e => e.id === id);
          if (idx >= 0) supabaseDbCache.entries[idx] = updated;
          else supabaseDbCache.entries.unshift(updated);
        }

        return res.json(updated);
      } catch (err) {
        console.error('Error updating entry (supabase)', err);
        return res.status(500).json({ error: 'Error updating entry' });
      }
    })();
    return;
  }

  const db = getDb();
  const idx = db.entries.findIndex((e) => e.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Entrada no encontrada' });
  }

  db.entries[idx] = { ...db.entries[idx], ...req.body };
  saveDb(db);
  res.json(db.entries[idx]);
});

app.delete('/api/entries/:id', (req, res) => {
  if (supabaseAdmin) {
    (async () => {
      try {
        const { error } = await supabaseAdmin.from('entries').delete().eq('id', req.params.id);
        if (error) throw error;
        if (supabaseDbCache?.entries) {
          supabaseDbCache.entries = supabaseDbCache.entries.filter(e => e.id !== req.params.id);
        }
        return res.json({ success: true });
      } catch (err) {
        console.error('Error deleting entry (supabase)', err);
        return res.status(500).json({ error: 'Error deleting entry' });
      }
    })();
    return;
  }

  const db = getDb();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => e.id !== req.params.id);

  if (db.entries.length === before) {
    return res.status(404).json({ error: 'Entrada no encontrada' });
  }

  saveDb(db);
  res.json({ success: true });
});

app.delete('/api/entries', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing entry id' });

  if (supabaseAdmin) {
    (async () => {
      try {
        const { error } = await supabaseAdmin.from('entries').delete().eq('id', id);
        if (error) throw error;
        if (supabaseDbCache?.entries) {
          supabaseDbCache.entries = supabaseDbCache.entries.filter(e => e.id !== id);
        }
        return res.json({ success: true });
      } catch (err) {
        console.error('Error deleting entry (supabase)', err);
        return res.status(500).json({ error: 'Error deleting entry' });
      }
    })();
    return;
  }

  const db = getDb();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => e.id !== id);

  if (db.entries.length === before) {
    return res.status(404).json({ error: 'Entrada no encontrada' });
  }

  saveDb(db);
  res.json({ success: true });
});

// --- RUTAS DE METAS (GOALS) ---
app.get('/api/goals', (req, res) => {
  const { userId } = req.query;
  const db = getDb();

  const safeGoals = Array.isArray(db.goals) ? db.goals : [];

  const goals = userId
    ? safeGoals.filter((g) => String(g.userId) === String(userId))
    : safeGoals;

  res.json(goals);
});


// Sincronizar metas completas de un usuario
const handleGoalsSync = (req, res) => {
  const { userId, goals } = req.body || {};
  if (!userId || !Array.isArray(goals)) {
    return res.status(400).json({ error: 'userId y goals son obligatorios' });
  }

  const db = getDb();
  db.goals = db.goals.filter((g) => g.userId !== userId);
  db.goals.push(...goals);
  saveDb(db);

  res.json({ success: true });
};

app.post('/api/goals/sync', handleGoalsSync);
app.post('/api/goals-sync', handleGoalsSync);

// --- RUTAS DE INVITACIONES ---
app.get('/api/invitations', (_req, res) => {
  const db = getDb();
  res.json(db.invitations);
});

app.post('/api/invitations', (req, res) => {
  const db = getDb();
  const invitation = req.body;

  if (!invitation.id) {
    invitation.id = crypto.randomUUID();
  }

  // Auto-create patient user if email doesn't exist
  const normalizedEmail = normalizeEmail(invitation.toUserEmail);
  let existingUser = db.users.find(u => normalizeEmail(u.email) === normalizedEmail);
  let userWasCreated = false;
  
  if (!existingUser) {
    // Create new patient user automatically
    const patientName = invitation.toUserEmail.split('@')[0]; // Use email prefix as default name
    const newPatient = {
      id: crypto.randomUUID(),
      name: patientName.charAt(0).toUpperCase() + patientName.slice(1), // Capitalize first letter
      email: normalizedEmail,
      password: crypto.randomBytes(16).toString('hex'), // Random temporary password
      role: 'PATIENT',
      accessList: [invitation.fromPsychologistId], // Associate with psychologist immediately
      isPsychologist: false
    };
    
    db.users.push(newPatient);
    userWasCreated = true;
    console.log(`Auto-created patient user: ${newPatient.name} (${newPatient.email})`);
  } else {
    // User exists, ensure psychologist is in accessList
    if (!existingUser.accessList) {
      existingUser.accessList = [];
    }
    if (!existingUser.accessList.includes(invitation.fromPsychologistId)) {
      existingUser.accessList.push(invitation.fromPsychologistId);
    }
  }

  // If user was auto-created, mark invitation as ACCEPTED (already linked)
  // If user already existed, keep as PENDING so they can accept/reject
  if (userWasCreated) {
    invitation.status = 'ACCEPTED';
  }

  db.invitations.push(invitation);
  saveDb(db);
  res.json(invitation);
});

app.put('/api/invitations/:id', (req, res) => {
  const db = getDb();
  const idx = db.invitations.findIndex((i) => i.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  db.invitations[idx] = { ...db.invitations[idx], ...req.body };
  saveDb(db);
  res.json(db.invitations[idx]);
});

app.put('/api/invitations', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing invitation id' });

  const db = getDb();
  const idx = db.invitations.findIndex((i) => i.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  db.invitations[idx] = { ...db.invitations[idx], ...req.body };
  saveDb(db);
  res.json(db.invitations[idx]);
});

app.delete('/api/invitations/:id', (req, res) => {
  const db = getDb();
  const before = db.invitations.length;
  db.invitations = db.invitations.filter((i) => i.id !== req.params.id);

  if (db.invitations.length === before) {
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  saveDb(db);
  res.json({ success: true });
});

app.delete('/api/invitations', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing invitation id' });

  const db = getDb();
  const before = db.invitations.length;
  db.invitations = db.invitations.filter((i) => i.id !== id);

  if (db.invitations.length === before) {
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  saveDb(db);
  res.json({ success: true });
});

// --- RUTAS DE CONFIGURACIÓN (SETTINGS) ---
app.get('/api/settings/:userId', (req, res) => {
  const db = getDb();
  res.json(db.settings[req.params.userId] || {});
});

app.get('/api/settings', (req, res) => {
  const userId = req.query.userId || req.query.id;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const db = getDb();
  res.json(db.settings[userId] || {});
});

app.post('/api/settings/:userId', (req, res) => {
  const db = getDb();
  db.settings[req.params.userId] = req.body || {};
  saveDb(db);
  res.json({ success: true });
});

app.post('/api/settings', (req, res) => {
  const userId = req.query.userId || req.query.id;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const db = getDb();
  db.settings[userId] = req.body || {};
  saveDb(db);
  res.json({ success: true });
});

app.get('/api/health', (_req, res) => {
  try {
    let dbInfo = { host: null, port: null, user: null, database: null };
    try {
      if (process.env.DATABASE_URL) {
        const safeUrl = new URL(process.env.DATABASE_URL);
        dbInfo = {
          host: safeUrl.hostname || null,
          port: safeUrl.port || null,
          user: safeUrl.username || null,
          database: safeUrl.pathname.replace('/', '') || null
        };
      }
    } catch (e) {
      // ignore parsing errors in health output
    }

    const envStatus = {
      databaseUrlSet: !!process.env.DATABASE_URL,
      supabaseSsl: String(process.env.SUPABASE_SSL || '').toLowerCase() === 'true',
      useSqlite: USE_SQLITE,
      pgPoolActive: !!pgPool,
      supabaseRestActive: !!supabaseAdmin,
      supabaseRestOnly: SUPABASE_REST_ONLY,
      dbInfo
    };

    if (sqliteDb) {
      // attempt a tiny write and delete to ensure store writable
      const id = `hc-${Date.now()}`;
      const insert = sqliteDb.prepare('INSERT OR REPLACE INTO store(table_name,id,data) VALUES(?,?,?)');
      const del = sqliteDb.prepare('DELETE FROM store WHERE table_name = ? AND id = ?');
      insert.run('healthcheck', id, JSON.stringify({ ts: Date.now() }));
      del.run('healthcheck', id);
      return res.json({ ok: true, persistence: 'sqlite', sqliteFile: SQLITE_DB_FILE, env: envStatus });
    }

    if (pgPool) {
      // try a simple query in Postgres
      (async () => {
        let client;
        try {
          client = await pgPool.connect();
          await client.query('SELECT 1');
        } catch (e) {
          console.error('Healthcheck pg failed', e);
        } finally {
          if (client) client.release();
        }
      })();
      return res.json({ ok: true, persistence: 'postgres', env: envStatus });
    }

    if (supabaseAdmin && supabaseDbCache) {
      return res.json({ ok: true, persistence: 'supabase-rest', env: envStatus });
    }

    // If Postgres is configured but not connected, avoid filesystem writes on serverless
    if (USE_POSTGRES || process.env.VERCEL || process.env.VERCEL_ENV) {
      return res.status(500).json({ ok: false, error: 'Postgres not connected', env: envStatus });
    }

    // json fallback: try writing and rolling back by creating a temp file
    try {
      const tmp = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, 'ok');
      fs.unlinkSync(tmp);
      return res.json({ ok: true, persistence: 'json', dbFile: DB_FILE, env: envStatus });
    } catch (e) {
      console.error('Healthcheck filesystem failed', e);
      return res.status(500).json({ ok: false, error: 'Filesystem not writable', env: envStatus });
    }
  } catch (err) {
    console.error('Healthcheck error', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get('/api/dbinfo', async (_req, res) => {
  try {
    if (sqliteDb) {
      const users = sqliteDb.prepare("SELECT COUNT(*) as c FROM store WHERE table_name = 'users'").get().c;
      const entries = sqliteDb.prepare("SELECT COUNT(*) as c FROM store WHERE table_name = 'entries'").get().c;
      const goals = sqliteDb.prepare("SELECT COUNT(*) as c FROM store WHERE table_name = 'goals'").get().c;
      const invitations = sqliteDb.prepare("SELECT COUNT(*) as c FROM store WHERE table_name = 'invitations'").get().c;
      const settings = sqliteDb.prepare("SELECT COUNT(*) as c FROM store WHERE table_name = 'settings'").get().c;
      return res.json({ persistence: 'sqlite', sqliteFile: SQLITE_DB_FILE, counts: { users, entries, goals, invitations, settings } });
    }

    if (pgPool) {
      const usersRes = await pgPool.query('SELECT COUNT(*) as c FROM users');
      const entriesRes = await pgPool.query('SELECT COUNT(*) as c FROM entries');
      const goalsRes = await pgPool.query('SELECT COUNT(*) as c FROM goals');
      const invitationsRes = await pgPool.query('SELECT COUNT(*) as c FROM invitations');
      const settingsRes = await pgPool.query('SELECT COUNT(*) as c FROM settings');
      const users = parseInt(usersRes.rows[0].c, 10);
      const entries = parseInt(entriesRes.rows[0].c, 10);
      const goals = parseInt(goalsRes.rows[0].c, 10);
      const invitations = parseInt(invitationsRes.rows[0].c, 10);
      const settings = parseInt(settingsRes.rows[0].c, 10);
      return res.json({ persistence: 'postgres', counts: { users, entries, goals, invitations, settings } });
    }

    if (supabaseAdmin && supabaseDbCache) {
      const db = supabaseDbCache;
      return res.json({
        persistence: 'supabase-rest',
        counts: {
          users: (db.users || []).length,
          entries: (db.entries || []).length,
          goals: (db.goals || []).length,
          invitations: (db.invitations || []).length,
          settings: Object.keys(db.settings || {}).length,
          sessions: (db.sessions || []).length,
          invoices: (db.invoices || []).length
        }
      });
    }

    // json fallback
    const db = getDb();
    return res.json({ persistence: 'json', dbFile: DB_FILE, counts: { users: (db.users||[]).length, entries: (db.entries||[]).length, goals: (db.goals||[]).length, invitations: (db.invitations||[]).length, settings: Object.keys(db.settings||{}).length } });
  } catch (err) {
    console.error('Error getting db info', err);
    return res.status(500).json({ error: 'Error getting db info' });
  }
});

// ==========================================
// PSYCHOLOGIST PROFESSIONAL FEATURES
// ==========================================

// --- INVOICES ---
app.get('/api/invoices', (req, res) => {
  const psychologistId = req.query.psychologistId;
  const patientId = req.query.patientId;
  
  if (!psychologistId && !patientId) {
    return res.status(400).json({ error: 'Missing psychologistId or patientId' });
  }

  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  let invoices = db.invoices;
  if (psychologistId) {
    invoices = invoices.filter(inv => inv.psychologistId === psychologistId);
  }
  if (patientId) {
    invoices = invoices.filter(inv => inv.patientId === patientId);
  }
  
  res.json(invoices);
});

app.post('/api/invoices', (req, res) => {
  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  const invoice = { ...req.body, id: req.body.id || Date.now().toString() };
  db.invoices.push(invoice);
  saveDb(db);
  res.json(invoice);
});

app.post('/api/invoices/payment-link', (req, res) => {
  const { invoiceId } = req.body;
  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  const invoice = db.invoices.find(inv => inv.id === invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  
  // Generate a simple payment link (in production, integrate with Stripe)
  const paymentLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pay/${invoiceId}`;
  invoice.stripePaymentLink = paymentLink;
  saveDb(db);
  
  res.json({ paymentLink });
});

// Update invoice status
app.patch('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  const idx = db.invoices.findIndex(inv => inv.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
  
  db.invoices[idx] = { ...db.invoices[idx], ...req.body };
  saveDb(db);
  res.json(db.invoices[idx]);
});

// Cancel invoice
app.post('/api/invoices/:id/cancel', (req, res) => {
  const { id } = req.params;
  
  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  const idx = db.invoices.findIndex(inv => inv.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
  
  db.invoices[idx].status = 'cancelled';
  db.invoices[idx].cancelledAt = new Date().toISOString();
  saveDb(db);
  res.json(db.invoices[idx]);
});

// Generate PDF invoice
app.get('/api/invoices/:id/pdf', (req, res) => {
  const { id } = req.params;
  
  const db = getDb();
  if (!db.invoices) db.invoices = [];
  
  const invoice = db.invoices.find(inv => inv.id === id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // Obtener perfil del psicólogo para datos de la empresa
  const psychProfile = (db.psychologistProfiles && db.psychologistProfiles[invoice.psychologistId]) || {
    name: 'Psicólogo',
    businessName: 'Servicios Profesionales de Psicología',
    taxId: 'B-12345678',
    address: 'Calle Principal, 123',
    city: 'Madrid',
    postalCode: '28001',
    country: 'España',
    phone: '+34 600 000 000',
    email: 'contacto@psicologo.es'
  };

  // Calcular subtotal e IVA (21% en España)
  const subtotal = invoice.amount / 1.21;
  const iva = invoice.amount - subtotal;
  
  // Generate professional PDF HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      color: #333;
      line-height: 1.6;
      padding: 40px;
      background: #fff;
    }
    .container { max-width: 800px; margin: 0 auto; }
    
    /* Header con logo y datos empresa */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #2563eb;
    }
    .company-info { flex: 1; }
    .company-name { 
      font-size: 24px; 
      font-weight: bold; 
      color: #2563eb;
      margin-bottom: 10px;
    }
    .company-details { font-size: 13px; color: #666; line-height: 1.8; }
    .invoice-title {
      text-align: right;
      flex: 1;
    }
    .invoice-title h1 { 
      font-size: 32px; 
      color: #1e40af;
      margin-bottom: 5px;
    }
    .invoice-number { 
      font-size: 16px; 
      color: #666;
      font-weight: normal;
    }
    
    /* Información de factura y cliente */
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      gap: 30px;
    }
    .info-box {
      flex: 1;
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .info-box h3 {
      font-size: 14px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .info-row {
      display: flex;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .info-label {
      font-weight: 600;
      min-width: 100px;
      color: #475569;
    }
    .info-value { color: #1e293b; }
    
    /* Tabla de items */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .items-table thead {
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
    }
    .items-table th {
      padding: 15px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .items-table th:last-child,
    .items-table td:last-child {
      text-align: right;
    }
    .items-table tbody tr {
      border-bottom: 1px solid #e2e8f0;
    }
    .items-table tbody tr:last-child {
      border-bottom: none;
    }
    .items-table tbody tr:hover {
      background: #f8fafc;
    }
    .items-table td {
      padding: 15px;
      font-size: 14px;
    }
    
    /* Totales */
    .totals-section {
      margin-top: 30px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-box {
      min-width: 350px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .total-row:last-child {
      border-bottom: none;
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
      color: white;
      font-size: 18px;
      font-weight: bold;
      padding: 18px 20px;
    }
    .total-label { font-weight: 600; }
    .total-value { font-weight: bold; }
    
    /* Badge de estado */
    .status-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-overdue { background: #fee2e2; color: #991b1b; }
    .status-cancelled { background: #fecaca; color: #7f1d1d; }
    
    /* Footer */
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 2px solid #e2e8f0;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer-title {
      font-weight: 600;
      color: #475569;
      margin-bottom: 8px;
    }
    .payment-info {
      background: #f1f5f9;
      padding: 15px;
      border-radius: 8px;
      margin-top: 20px;
      text-align: left;
    }
    .payment-info h4 {
      color: #1e40af;
      margin-bottom: 10px;
      font-size: 14px;
    }
    
    /* Estilos para facturas canceladas */
    .cancelled .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 120px;
      color: rgba(220, 38, 38, 0.08);
      z-index: -1;
      font-weight: bold;
      letter-spacing: 20px;
    }
    .cancelled-notice {
      background: #fee2e2;
      border: 2px solid #dc2626;
      border-radius: 8px;
      padding: 15px;
      margin-top: 30px;
      color: #991b1b;
      font-weight: 600;
      text-align: center;
    }
    .line-through { text-decoration: line-through; opacity: 0.6; }
  </style>
</head>
<body>
  <div class="container ${invoice.status === 'cancelled' ? 'cancelled' : ''}">
    ${invoice.status === 'cancelled' ? '<div class="watermark">CANCELADA</div>' : ''}
    
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">${psychProfile.businessName || psychProfile.name}</div>
        <div class="company-details">
          ${psychProfile.taxId ? `<div>NIF/CIF: ${psychProfile.taxId}</div>` : ''}
          ${psychProfile.address ? `<div>${psychProfile.address}</div>` : ''}
          ${psychProfile.postalCode || psychProfile.city ? `<div>${psychProfile.postalCode} ${psychProfile.city}</div>` : ''}
          ${psychProfile.country ? `<div>${psychProfile.country}</div>` : ''}
          ${psychProfile.phone ? `<div>Tel: ${psychProfile.phone}</div>` : ''}
          ${psychProfile.email ? `<div>Email: ${psychProfile.email}</div>` : ''}
        </div>
      </div>
      <div class="invoice-title">
        <h1>FACTURA</h1>
        <div class="invoice-number">${invoice.invoiceNumber}</div>
      </div>
    </div>
    
    <!-- Información de factura y cliente -->
    <div class="info-section">
      <div class="info-box">
        <h3>Datos de Facturación</h3>
        <div class="info-row">
          <span class="info-label">Fecha:</span>
          <span class="info-value">${new Date(invoice.date).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Vencimiento:</span>
          <span class="info-value">${new Date(invoice.dueDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Estado:</span>
          <span class="status-badge status-${invoice.status}">${
            invoice.status === 'paid' ? 'Pagada' : 
            invoice.status === 'pending' ? 'Pendiente' : 
            invoice.status === 'overdue' ? 'Vencida' : 
            'Cancelada'
          }</span>
        </div>
      </div>
      
      <div class="info-box">
        <h3>Cliente</h3>
        <div class="info-row">
          <span class="info-label">Nombre:</span>
          <span class="info-value">${invoice.patientName}</span>
        </div>
        ${invoice.description ? `
        <div class="info-row">
          <span class="info-label">Concepto:</span>
          <span class="info-value">${invoice.description}</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Tabla de items -->
    <table class="items-table">
      <thead>
        <tr>
          <th>Descripción</th>
          <th style="width: 100px; text-align: center;">Cantidad</th>
          <th style="width: 120px;">Precio Unit.</th>
          <th style="width: 120px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.items || [{description: 'Servicio de psicología', quantity: 1, unitPrice: invoice.amount / 1.21}]).map(item => `
          <tr ${invoice.status === 'cancelled' ? 'class="line-through"' : ''}>
            <td>${item.description}</td>
            <td style="text-align: center;">${item.quantity}</td>
            <td>${(item.unitPrice).toFixed(2)} €</td>
            <td>${(item.quantity * item.unitPrice).toFixed(2)} €</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <!-- Totales -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="total-label">Subtotal (Base imponible):</span>
          <span class="total-value">${subtotal.toFixed(2)} €</span>
        </div>
        <div class="total-row">
          <span class="total-label">IVA (21%):</span>
          <span class="total-value">${iva.toFixed(2)} €</span>
        </div>
        <div class="total-row">
          <span class="total-label">TOTAL:</span>
          <span class="total-value">${invoice.amount.toFixed(2)} €</span>
        </div>
      </div>
    </div>
    
    <!-- Aviso de cancelación -->
    ${invoice.status === 'cancelled' ? `
      <div class="cancelled-notice">
        ⚠️ Esta factura fue cancelada el ${new Date(invoice.cancelledAt || invoice.date).toLocaleDateString('es-ES')}
      </div>
    ` : ''}
    
    <!-- Footer -->
    <div class="footer">
      ${invoice.status !== 'cancelled' && invoice.status !== 'paid' ? `
        <div class="payment-info">
          <h4>Información de Pago</h4>
          <div style="color: #475569;">
            ${psychProfile.iban ? `<div>IBAN: ${psychProfile.iban}</div>` : ''}
            <div style="margin-top: 8px;">Por favor, incluya el número de factura ${invoice.invoiceNumber} como referencia en su pago.</div>
          </div>
        </div>
      ` : ''}
      
      <div style="margin-top: 30px;">
        <div class="footer-title">Términos y Condiciones</div>
        <div>Los servicios profesionales de psicología están exentos de retención de IRPF según la normativa vigente.</div>
        <div>Esta factura es válida sin necesidad de firma según el Real Decreto 1496/2003.</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="factura-${invoice.invoiceNumber}.html"`);
  res.send(html);
});

// --- PSYCHOLOGIST PROFILE ---
app.get('/api/psychologist/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const db = getDb();
  if (!db.psychologistProfiles) db.psychologistProfiles = {};
  
  const profile = db.psychologistProfiles[userId] || {
    name: '',
    professionalId: '',
    specialty: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'España',
    businessName: '',
    taxId: '',
    iban: '',
    sessionPrice: 0,
    currency: 'EUR'
  };
  
  res.json(profile);
});

app.put('/api/psychologist/:userId/profile', (req, res) => {
  const { userId } = req.params;
  const db = getDb();
  if (!db.psychologistProfiles) db.psychologistProfiles = {};
  
  db.psychologistProfiles[userId] = req.body;
  saveDb(db);
  res.json(req.body);
});

// --- SESSIONS / CALENDAR ---
app.get('/api/sessions', (req, res) => {
  const { psychologistId, patientId, year, month } = req.query;
  if (!psychologistId && !patientId) {
    return res.status(400).json({ error: 'Missing psychologistId or patientId' });
  }
  
  const db = getDb();
  if (!db.sessions) db.sessions = [];
  
  let sessions = db.sessions;
  
  // Filter by psychologistId or patientId
  if (psychologistId) {
    sessions = sessions.filter(s => s.psychologistId === psychologistId);
  }
  if (patientId) {
    sessions = sessions.filter(s => s.patientId === patientId);
  }
  
  // Filter by year and month if provided
  if (year && month) {
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    sessions = sessions.filter(s => {
      const date = new Date(s.date);
      return date.getFullYear() === yearNum && date.getMonth() + 1 === monthNum;
    });
  }
  
  res.json(sessions);
});

app.post('/api/sessions', (req, res) => {
  const db = getDb();
  if (!db.sessions) db.sessions = [];
  
  const session = { ...req.body, id: req.body.id || Date.now().toString() };
  db.sessions.push(session);
  saveDb(db);
  res.json(session);
});

app.post('/api/sessions/availability', async (req, res) => {
  try {
    const { slots, psychologistId } = req.body;
    console.log('📅 Creating availability slots:', { slotsCount: slots?.length, psychologistId });
    
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      console.error('❌ Invalid slots data:', slots);
      return res.status(400).json({ error: 'Se requiere un array de slots válido' });
    }
    
    if (!psychologistId) {
      console.error('❌ Missing psychologistId');
      return res.status(400).json({ error: 'Se requiere el ID del psicólogo' });
    }
    
    const db = getDb();
    if (!db.sessions) db.sessions = [];
    
    const newSlots = [];
    slots.forEach(slot => {
      const newSlot = { ...slot, psychologistId };
      db.sessions.push(newSlot);
      newSlots.push(newSlot);
    });
    
    await saveDb(db);
    console.log('✅ Availability slots created successfully:', newSlots.length);
    res.json({ success: true, count: slots.length, slots: newSlots });
  } catch (error) {
    console.error('❌ Error creating availability slots:', error);
    res.status(500).json({ error: 'Error al crear espacios disponibles: ' + error.message });
  }
});

app.patch('/api/sessions/:id', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  if (!db.sessions) db.sessions = [];
  
  const idx = db.sessions.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  
  db.sessions[idx] = { ...db.sessions[idx], ...req.body };
  saveDb(db);
  res.json(db.sessions[idx]);
});

// --- PATIENTS LIST ---
app.get('/api/psychologist/:psychologistId/patients', (req, res) => {
  const { psychologistId } = req.params;
  const db = getDb();
  
  const patients = db.users
    ? db.users.filter(user => 
        user.role === 'PATIENT' && 
        user.accessList && 
        user.accessList.includes(psychologistId)
      ).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email
      }))
    : [];
  
  res.json(patients);
});

app.get('/', (_req, res) => {
  res.send('DYGO API OK ✅ Usa /api/users, /api/entries, etc.');
});

// --- INICIO DEL SERVIDOR ---
// Warn in production if persistence is likely ephemeral
if (process.env.NODE_ENV === 'production' && !USE_SQLITE && !pgPool && !supabaseAdmin) {
  console.warn('⚠️ Running in production without SQLite. Data written to local db.json may be lost on platforms with ephemeral filesystems. Consider enabling SQLite or using a managed DB.');
}
if (USE_SQLITE) {
  console.log(`📦 Using SQLite DB: ${SQLITE_DB_FILE}`);
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ Ensure that the SQLite file path is on a persistent disk in your hosting environment (e.g., Render persistent disk).');
  }
}

if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 SERVIDOR DYGO (ES MODULES) LISTO');
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`📂 DB: ${DB_FILE}\n`);
  });
}

// (Opcional) export para tests
export default app;
