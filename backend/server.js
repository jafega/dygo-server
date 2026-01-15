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



// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Reemplaza a body-parser

// --- ACCESO A "BASE DE DATOS" (db.json o SQLite opcional) ---
const createInitialDb = () => ({
  users: [],
  entries: [],
  goals: [],
  invitations: [],
  settings: {}
});

// If you want durable persistence across restarts on platforms like Render, set USE_SQLITE=true
// and optionally SQLITE_DB_FILE to a persistent volume path. Otherwise the default db.json is used.
const USE_SQLITE = String(process.env.USE_SQLITE || '').toLowerCase() === 'true';
const SQLITE_DB_FILE = process.env.SQLITE_DB_FILE || path.join(__dirname, 'database.sqlite');
let sqliteDb = null;
let pgPool = null;
const USE_POSTGRES = !!process.env.DATABASE_URL;

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
    const poolConfig = { connectionString: process.env.DATABASE_URL, max: 10 };

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
    if ((process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require')) || process.env.SUPABASE_SSL === 'true') {
      poolConfig.ssl = { rejectUnauthorized: false };
      console.log('ℹ️ Enabling SSL for Postgres connection (rejectUnauthorized: false)');
    }

    pgPool = new Pool(poolConfig);

    // Ensure tables exist
    await pgPool.query(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);

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
      pgDbCache = { users, entries, goals, invitations, settings };
      console.log('ℹ️ Postgres data loaded into cache');
    } catch (err) {
      console.error('❌ Failed populating pg cache', err);
    }
  } catch (err) {
    console.error('❌ Unable to enable Postgres persistence', err);
    pgPool = null;
  }
}

let pgDbCache = null;

const getDb = () => {
  // Postgres: return in-memory cache (keeps handler sync)
  if (pgPool && pgDbCache) {
    return pgDbCache;
  }

  if (sqliteDb) {
    const read = (table) => sqliteDb.prepare('SELECT data FROM store WHERE table_name = ?').all(table).map(r => JSON.parse(r.data));
    const users = read('users');
    const entries = read('entries');
    const goals = read('goals');
    const invitations = read('invitations');
    const settingsArr = read('settings');
    const settings = Object.fromEntries(settingsArr.map((s) => [s.id, s]));
    return { users, entries, goals, invitations, settings };
  }

  // 1. Si no existe, crearla
  if (!fs.existsSync(DB_FILE)) {
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

        const insert = async (table, id, obj) => client.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [id, obj]);

        for (const u of (data.users || [])) await insert('users', u.id, u);
        for (const e of (data.entries || [])) await insert('entries', e.id, e);
        for (const g of (data.goals || [])) await insert('goals', g.id, g);
        for (const i of (data.invitations || [])) await insert('invitations', i.id, i);
        const settings = data.settings || {};
        for (const k of Object.keys(settings)) await insert('settings', k, settings[k]);

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
    });
    try {
      tx(data);
    } catch (e) {
      console.error('❌ Error guardando en SQLite:', e);
    }
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

    // Verificar si existe el email
    if (db.users.find((u) => u.email === email)) {
      return res.status(400).json({ error: 'El email ya existe' });
    }

    const newUser = {
      id: crypto.randomUUID(), // requiere Node 16.14+ / 18+
      name,
      email,
      password, // OJO: en producción deberías hashearla
      role: role || 'user',
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
app.post('/api/auth/supabase', async (req, res) => {
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
      user = db.users.find(u => u.email && String(u.email).toLowerCase() === String(supUser.email).toLowerCase());
    }

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        name: supUser.user_metadata?.full_name || supUser.email || 'Sin nombre',
        email: supUser.email,
        password: '',
        role: 'PATIENT',
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
      if (!db.settings) db.settings = {};
      if (!db.settings[user.id]) db.settings[user.id] = {};
      saveDb(db);
    }

    return res.json(user);
  } catch (err) {
    console.error('Error in /api/auth/supabase', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    const db = getDb();
    const user = db.users.find((u) => u.email === email && u.password === password);

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
app.post('/api/auth/reset-password-demo', (req, res) => {
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
    console.error('Error in /api/auth/reset-password-demo', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ADMIN: Reset any user's password (restricted to superadmin)
app.post('/api/admin/reset-user-password', (req, res) => {
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
    console.error('Error in /api/admin/reset-user-password', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ADMIN: Delete a user and all associated data (restricted to superadmin)
app.delete('/api/admin/delete-user', (req, res) => {
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
    console.error('Error in /api/admin/delete-user', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ADMIN: Migrate JSON/SQLite data to Postgres/Supabase (dry-run & execute)
app.post('/api/admin/migrate-to-postgres', async (req, res) => {
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
    console.error('Error in /api/admin/migrate-to-postgres', err);
    return res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
});

// --- STRIPE: create checkout session and portal session ---
app.post('/api/stripe/create-checkout-session', async (req, res) => {
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
});

app.post('/api/stripe/create-portal-session', async (req, res) => {
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
});

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
app.get('/api/users/:id', (req, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  // Recompute premium status if needed
  if (user.premiumUntil && Number(user.premiumUntil) < Date.now()) {
    user.isPremium = false;
    user.premiumUntil = undefined;
    saveDb(db);
  }

  res.json(user);
});

app.get('/api/users', (_req, res) => {
  const db = getDb();

  // Normalize premium flags
  db.users.forEach(u => {
    if (u.premiumUntil && Number(u.premiumUntil) < Date.now()) {
      u.isPremium = false;
      u.premiumUntil = undefined;
    }
  });
  saveDb(db);

  res.json(db.users);
});

app.put('/api/users/:id', (req, res) => {
  const db = getDb();
  const idx = db.users.findIndex((u) => u.id === req.params.id);

  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.users[idx] = { ...db.users[idx], ...req.body };
  saveDb(db);
  res.json(db.users[idx]);
});

// --- RUTAS DE ENTRADAS (ENTRIES) ---
app.get('/api/entries', (req, res) => {
  const { userId } = req.query;
  const db = getDb();

  const entries = userId
    ? db.entries.filter((e) => e.userId === userId)
    : db.entries;

  res.json(entries);
});

app.post('/api/entries', (req, res) => {
  const db = getDb();
  const entry = req.body;

  // Si no viene id, generamos uno
  if (!entry.id) {
    entry.id = crypto.randomUUID();
  }

  db.entries.push(entry);
  saveDb(db);
  res.json(entry);
});

app.put('/api/entries/:id', (req, res) => {
  const db = getDb();
  const idx = db.entries.findIndex((e) => e.id === req.params.id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Entrada no encontrada' });
  }

  db.entries[idx] = { ...db.entries[idx], ...req.body };
  saveDb(db);
  res.json(db.entries[idx]);
});

app.delete('/api/entries/:id', (req, res) => {
  const db = getDb();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => e.id !== req.params.id);

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
app.post('/api/goals/sync', (req, res) => {
  const { userId, goals } = req.body || {};
  if (!userId || !Array.isArray(goals)) {
    return res.status(400).json({ error: 'userId y goals son obligatorios' });
  }

  const db = getDb();
  db.goals = db.goals.filter((g) => g.userId !== userId);
  db.goals.push(...goals);
  saveDb(db);

  res.json({ success: true });
});

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

// --- RUTAS DE CONFIGURACIÓN (SETTINGS) ---
app.get('/api/settings/:userId', (req, res) => {
  const db = getDb();
  res.json(db.settings[req.params.userId] || {});
});

app.post('/api/settings/:userId', (req, res) => {
  const db = getDb();
  db.settings[req.params.userId] = req.body || {};
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

    // json fallback
    const db = getDb();
    return res.json({ persistence: 'json', dbFile: DB_FILE, counts: { users: (db.users||[]).length, entries: (db.entries||[]).length, goals: (db.goals||[]).length, invitations: (db.invitations||[]).length, settings: Object.keys(db.settings||{}).length } });
  } catch (err) {
    console.error('Error getting db info', err);
    return res.status(500).json({ error: 'Error getting db info' });
  }
});

app.get('/', (_req, res) => {
  res.send('DYGO API OK ✅ Usa /api/users, /api/entries, etc.');
});

// --- INICIO DEL SERVIDOR ---
// Warn in production if persistence is likely ephemeral
if (process.env.NODE_ENV === 'production' && !USE_SQLITE) {
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
