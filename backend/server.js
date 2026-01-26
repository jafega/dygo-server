// server.js (ES Modules)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import Busboy from 'busboy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import FormData from 'form-data';

dotenv.config();

// Inicializar Google Generative AI (Gemini)
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;


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
// Permitir persistencia local por defecto en desarrollo; usa DISALLOW_LOCAL_PERSISTENCE=true para forzar remoto
const DISALLOW_LOCAL_PERSISTENCE = String(process.env.DISALLOW_LOCAL_PERSISTENCE || 'false').toLowerCase() === 'true';
const SUPABASE_SQL_ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/exec_sql` : '';
const SUPABASE_TABLES_TO_ENSURE = [
  'users',
  'entries',
  'goals',
  'invitations',
  'settings',
  'sessions',
  'session_entry',
  'dispo',
  'care_relationships',
  'invoices',
  'psychologist_profiles'
];
let supabaseTablesEnsured = false;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

// Función para enviar email de bienvenida al paciente
async function sendWelcomeEmail(toEmail, firstName, lastName, psychologistName) {
  console.log(`📧 [sendWelcomeEmail] Preparando email para ${firstName} ${lastName} (${toEmail})`);
  
  // En desarrollo, solo loguear el contenido del email
  const emailContent = {
    to: toEmail,
    subject: `Invitación a dygo de ${psychologistName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenido/a a dygo!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${firstName} ${lastName}</strong>,</p>
            
            <p><strong>${psychologistName}</strong> te ha invitado a unirte a dygo, una plataforma diseñada para facilitar tu proceso terapéutico y mantener una comunicación fluida con tu psicólogo/a.</p>
            
            <h3>¿Qué es dygo?</h3>
            <p>dygo es tu espacio personal de bienestar emocional donde podrás:</p>
            <ul>
              <li>📝 Registrar tus pensamientos y emociones diarias</li>
              <li>💬 Comunicarte de forma segura con tu psicólogo/a</li>
              <li>📊 Ver tu progreso a lo largo del tiempo</li>
              <li>🎯 Trabajar en objetivos terapéuticos personalizados</li>
            </ul>
            
            <h3>Próximos pasos:</h3>
            <ol>
              <li>Regístrate en dygo usando este correo electrónico: <strong>${toEmail}</strong></li>
              <li>Completa y firma el consentimiento informado dentro de la aplicación</li>
              <li>Comienza a utilizar la plataforma para tu proceso terapéutico</li>
            </ol>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'https://dygo.vercel.app'}" class="button">Comenzar ahora</a>
            </div>
            
            <p><strong>Importante:</strong> El consentimiento informado es un requisito necesario para utilizar la plataforma. Lo encontrarás durante el proceso de registro.</p>
            
            <p>Si tienes alguna pregunta, no dudes en contactar con ${psychologistName}.</p>
            
            <p>¡Nos alegra que formes parte de dygo!</p>
            
            <p>Saludos cordiales,<br>El equipo de dygo</p>
          </div>
          <div class="footer">
            <p>Este correo fue enviado porque ${psychologistName} te invitó a unirte a dygo.</p>
            <p>dygo - Tu espacio de bienestar emocional</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  // En desarrollo, solo loguear
  console.log('📧 [DEV MODE] Email que se enviaría:');
  console.log('   Para:', emailContent.to);
  console.log('   Asunto:', emailContent.subject);
  console.log('   Link de registro:', process.env.FRONTEND_URL || 'https://dygo.vercel.app');
  
  // TODO: En producción, integrar con servicio de email (SendGrid, AWS SES, etc.)
  // Ejemplo con nodemailer:
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail(emailContent);
  
  return emailContent;
}



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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-UserId', 'Cache-Control', 'Pragma', 'Expires']
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
  careRelationships: [],
  invoices: [],
  psychologistProfiles: {}
});

// migrateLegacyAccessLists eliminada - ya no es necesaria con la nueva estructura

const ensureDbShape = (db) => {
  if (!db || typeof db !== 'object') {
    db = createInitialDb();
  }

  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.entries)) db.entries = [];
  if (!Array.isArray(db.goals)) db.goals = [];
  if (!Array.isArray(db.invitations)) db.invitations = [];
  if (!db.settings || typeof db.settings !== 'object') db.settings = {};
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.sessionEntries)) db.sessionEntries = [];
  if (!Array.isArray(db.careRelationships)) db.careRelationships = [];
  if (!Array.isArray(db.invoices)) db.invoices = [];
  if (!db.psychologistProfiles || typeof db.psychologistProfiles !== 'object') db.psychologistProfiles = {};

  return db;
};

const relationshipKey = (psychUserId, patientUserId) => `${psychUserId}:${patientUserId}`;

const ensureCareRelationship = (db, psychUserId, patientUserId) => {
  if (!psychUserId || !patientUserId) {
    console.error('[ensureCareRelationship] ❌ Missing IDs', { psychUserId, patientUserId });
    return null;
  }
  if (!Array.isArray(db.careRelationships)) db.careRelationships = [];
  
  const existing = db.careRelationships.find(rel => 
    rel.psychologist_user_id === psychUserId && rel.patient_user_id === patientUserId
  );
  
  if (existing) {
    console.log('[ensureCareRelationship] ✓ Relación ya existe', { id: existing.id });
    return existing;
  }
  
  const rel = {
    id: crypto.randomUUID(),
    psychologist_user_id: psychUserId,
    patient_user_id: patientUserId,
    createdAt: Date.now(),
    default_session_price: 0,
    default_psych_percent: 100
  };
  console.log('[ensureCareRelationship] ✓ Nueva relación creada', rel);
  db.careRelationships.push(rel);
  return rel;
};

const removeCareRelationshipByPair = (db, psychUserId, patientUserId) => {
  if (!Array.isArray(db.careRelationships)) return false;
  const before = db.careRelationships.length;
  db.careRelationships = db.careRelationships.filter(rel => 
    !(rel.psychologist_user_id === psychUserId && rel.patient_user_id === patientUserId)
  );
  return db.careRelationships.length !== before;
};

const removeCareRelationshipsForUser = (db, userId) => {
  if (!Array.isArray(db.careRelationships) || !userId) return 0;
  const before = db.careRelationships.length;
  db.careRelationships = db.careRelationships.filter(rel => 
    rel.psychologist_user_id !== userId && rel.patient_user_id !== userId
  );
  return before - db.careRelationships.length;
};

const buildSupabaseTableSql = (table) => `
CREATE TABLE IF NOT EXISTS public.${table} (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);
`;

const isMissingRelationError = (error) => {
  if (!error) return false;
  if (error.code && String(error.code).toUpperCase() === '42P01') return true;
  const message = error.message || error.details || error.hint;
  return typeof message === 'string' && /does not exist/i.test(message);
};

const executeSupabaseSql = async (sql) => {
  if (!SUPABASE_SQL_ENDPOINT || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase SQL endpoint no está configurado');
  }

  const response = await fetch(SUPABASE_SQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(text || `Supabase SQL error (${response.status})`);
  }
};

const ensureSessionEntryTable = async () => {
  if (!supabaseAdmin || !SUPABASE_SQL_ENDPOINT || !SUPABASE_SERVICE_ROLE_KEY) return;
  
  try {
    const { error } = await supabaseAdmin.from('session_entry').select('id').limit(1);
    if (error && isMissingRelationError(error)) {
      const sql = `
        CREATE TABLE IF NOT EXISTS public.session_entry (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          creator_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          target_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_session_entry_creator ON public.session_entry(creator_user_id);
        CREATE INDEX IF NOT EXISTS idx_session_entry_target ON public.session_entry(target_user_id);
        CREATE INDEX IF NOT EXISTS idx_session_entry_status ON public.session_entry(status);
        
        ALTER TABLE public.session_entry ENABLE ROW LEVEL SECURITY;
      `;
      await executeSupabaseSql(sql);
      console.log('✅ Tabla session_entry creada en Supabase');
    }
  } catch (err) {
    console.error('❌ Error asegurando tabla session_entry:', err?.message || err);
  }
};

const ensureSupabaseTablesExist = async (force = false) => {
  if (!supabaseAdmin || !SUPABASE_SQL_ENDPOINT || !SUPABASE_SERVICE_ROLE_KEY) return;
  if (supabaseTablesEnsured && !force) return;

  for (const table of SUPABASE_TABLES_TO_ENSURE) {
    try {
      const { error } = await supabaseAdmin.from(table).select('id').limit(1);
      if (error && isMissingRelationError(error)) {
        await executeSupabaseSql(buildSupabaseTableSql(table));
        console.log(`ℹ️ Tabla '${table}' creada automáticamente en Supabase`);
      }
    } catch (err) {
      console.error(`❌ No se pudo asegurar la tabla '${table}' en Supabase`, err?.message || err);
    }
  }

  supabaseTablesEnsured = true;
};

// If you want durable persistence across restarts on platforms like Render, set USE_SQLITE=true
// and optionally SQLITE_DB_FILE to a persistent volume path. Otherwise the default db.json is used.
const USE_SQLITE = String(process.env.USE_SQLITE || '').toLowerCase() === 'true';
const SQLITE_DB_FILE = process.env.SQLITE_DB_FILE || path.join(__dirname, 'database.sqlite');
let sqliteDb = null;
let pgPool = null;
let supabaseAdmin = null;
let supabaseDbCache = null;
let pgDbCache = null;
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
    await pgPool.query(`CREATE TABLE IF NOT EXISTS care_relationships (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
    await pgPool.query(`CREATE TABLE IF NOT EXISTS psychologist_profiles (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);

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
          const relationships = read('care_relationships');
          for (const rel of relationships) await insert('care_relationships', rel.id, JSON.parse(rel.data));
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
            await insert('care_relationships', parsed.careRelationships);
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
      const profilesArr = await q('psychologist_profiles');
      const psychologistProfiles = Object.fromEntries(profilesArr.map(p => [p.id, p]));
      const careRelationships = (await q('care_relationships')) || [];
      pgDbCache = ensureDbShape({ users, entries, goals, invitations, settings, sessions, invoices, careRelationships, psychologistProfiles });
      console.log('ℹ️ Postgres data loaded into cache');
    } catch (err) {
      console.error('❌ Failed populating pg cache', err);
    }
  } catch (err) {
    console.error('❌ Unable to enable Postgres persistence', err);
    pgPool = null;
  }
}

async function initializeSupabase() {
  if (!pgPool && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      console.log('🔄 Importing Supabase client...');
      const { createClient } = await import('@supabase/supabase-js');
      console.log('🔄 Creating Supabase client...');
      supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      });
      console.log('✅ Supabase REST persistence enabled (service role)');
      
      try {
        console.log('🔄 Ensuring Supabase tables exist...');
        await Promise.race([
          ensureSupabaseTablesExist(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ensureSupabaseTablesExist timeout')), 30000))
        ]);
        console.log('✅ Supabase tables verified');
      } catch (schemaErr) {
        console.error('❌ Error ensuring Supabase schema', schemaErr?.message || schemaErr);
      }
      
      try {
        console.log('🔄 Loading Supabase cache...');
        const cacheData = await Promise.race([
          loadSupabaseCache(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('loadSupabaseCache timeout')), 30000))
        ]);
        supabaseDbCache = ensureDbShape(cacheData);
        console.log('ℹ️ Supabase data loaded into cache');
        console.log('📊 Cache contents: users:', supabaseDbCache.users?.length || 0, 
                    'entries:', supabaseDbCache.entries?.length || 0,
                    'careRelationships:', supabaseDbCache.careRelationships?.length || 0);
        
        // Limpiar relaciones con IDs antiguos o usuarios inexistentes
        if (supabaseDbCache.careRelationships && supabaseDbCache.careRelationships.length > 0) {
          console.log('📋 Care relationships loaded:');
          supabaseDbCache.careRelationships.forEach(rel => {
            console.log(`   - ${rel.psychologist_user_id} → ${rel.patient_user_id} (${rel.endedAt ? 'FINALIZADA' : 'ACTIVA'})`);
          });
        } else {
          console.log('⚠️ No care_relationships found in cache');
        }
      } catch (cacheErr) {
        console.error('❌ Error loading Supabase cache', cacheErr?.message || cacheErr);
        supabaseDbCache = ensureDbShape({});
      }
      
      try {
        console.log('🔄 Deduplicating Supabase users...');
        await Promise.race([
          dedupeSupabaseUsers(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('dedupeSupabaseUsers timeout')), 30000))
        ]);
        console.log('✅ Supabase users deduplicated');
      } catch (err) {
        console.error('❌ Supabase dedupe failed', err?.message || err);
      }
    } catch (err) {
      console.error('❌ Unable to enable Supabase REST persistence', err?.message || err, err?.stack);
      supabaseAdmin = null;
      supabaseDbCache = null;
    }
  }
}

function normalizeSupabaseRow(row) {
  if (!row) return row;
  const base = { ...row };
  const data = base.data;
  delete base.data;
  
  if (data && typeof data === 'object') {
    // Expandir data pero eliminar campos que vienen de columnas de la tabla
    const cleanData = { ...data };
    delete cleanData.is_psychologist;      // Usar columna de tabla
    delete cleanData.isPsychologist;       // Usar columna de tabla
    delete cleanData.role;                 // DEPRECATED - no usar
    delete cleanData.user_email;           // Usar columna de tabla
    delete cleanData.psychologist_profile_id; // Usar columna de tabla
    delete cleanData.creator_user_id;      // Usar columna de tabla (entries)
    delete cleanData.target_user_id;       // Usar columna de tabla (entries)
    delete cleanData.entry_type;           // Usar columna de tabla (entries)
    delete cleanData.entryType;            // Usar columna de tabla (entries)
    delete cleanData.patient_user_id;      // Usar columna de tabla (goals/invoices/sessions)
    delete cleanData.psychologist_user_id; // Usar columna de tabla (invoices/sessions)
    delete cleanData.status;               // Usar columna de tabla (sessions/invoices)
    delete cleanData.invoiceNumber;        // Usar columna de tabla (invoices)
    delete cleanData.invoice_date;         // Usar columna de tabla (invoices)
    delete cleanData.date;                 // Usar starts_on/ends_on (sessions)
    delete cleanData.startTime;            // Usar starts_on (sessions)
    delete cleanData.endTime;              // Usar ends_on (sessions)
    delete cleanData.price;                // Usar columna de tabla (sessions)
    delete cleanData.percent_psych;        // Usar columna de tabla (sessions)
    delete cleanData.paid;                 // Usar columna de tabla (sessions)
    delete cleanData.default_session_price; // Usar columna de tabla (care_relationships)
    delete cleanData.default_psych_percent; // Usar columna de tabla (care_relationships)
    // NOTA: uses_bonos NO se elimina porque está en data JSONB, no en columna de tabla
    
    // Combinar: primero data limpia, luego columnas de tabla
    const merged = { ...cleanData, ...base };
    
    // Asegurar que is_psychologist y isPsychologist vengan de la columna
    if (base.is_psychologist !== undefined) {
      merged.is_psychologist = base.is_psychologist;
      merged.isPsychologist = base.is_psychologist;
    }
    
    // Asegurar que user_email venga de la columna
    if (base.user_email !== undefined) {
      merged.user_email = base.user_email;
      if (!merged.email) merged.email = base.user_email;
    }
    
    // Asegurar que psychologist_profile_id venga de la columna
    if (base.psychologist_profile_id !== undefined) {
      merged.psychologist_profile_id = base.psychologist_profile_id;
    }
    
    // Para entries: mapear creator_user_id y target_user_id
    if (base.creator_user_id !== undefined) {
      merged.creator_user_id = base.creator_user_id;
      // Mantener compatibilidad: si createdBy es PSYCHOLOGIST, creator_user_id es el psicólogo
      if (merged.createdBy === 'PSYCHOLOGIST') {
        merged.createdByPsychologistId = base.creator_user_id;
      }
    }
    
    if (base.target_user_id !== undefined) {
      merged.target_user_id = base.target_user_id;
      // Mantener compatibilidad: target_user_id es siempre el paciente
      merged.userId = base.target_user_id;
    }
    
    // Para entries: mapear entry_type desde columna
    if (base.entry_type !== undefined) {
      merged.entry_type = base.entry_type;
      merged.entryType = base.entry_type; // Compatibilidad frontend
    }
    
    // Para goals: mapear patient_user_id
    if (base.patient_user_id !== undefined) {
      merged.patient_user_id = base.patient_user_id;
      merged.userId = base.patient_user_id; // Compatibilidad
    }

    // Para invoices: mapear psychologist_user_id/patient_user_id
    if (base.psychologist_user_id !== undefined) {
      merged.psychologist_user_id = base.psychologist_user_id;
      merged.psychologistId = base.psychologist_user_id; // Compatibilidad frontend
    }
    if (base.patient_user_id !== undefined) {
      merged.patient_user_id = base.patient_user_id;
      merged.patientId = base.patient_user_id; // Compatibilidad frontend
    }
    
    // Para invoices: mapear amount, tax, total, status, taxRate
    // Priorizar columnas directas, luego valores del JSONB
    if (base.amount !== undefined && base.amount !== null) {
      merged.amount = parseFloat(base.amount);
    } else if (cleanData.amount !== undefined && cleanData.amount !== null) {
      merged.amount = parseFloat(cleanData.amount);
    }
    
    if (base.tax !== undefined && base.tax !== null) {
      merged.tax = parseFloat(base.tax);
    } else if (cleanData.tax !== undefined && cleanData.tax !== null) {
      merged.tax = parseFloat(cleanData.tax);
    }
    
    if (base.total !== undefined && base.total !== null) {
      merged.total = parseFloat(base.total);
    } else if (cleanData.total !== undefined && cleanData.total !== null) {
      merged.total = parseFloat(cleanData.total);
    }
    
    if (base.status !== undefined && base.status !== null) {
      merged.status = base.status;
    } else if (cleanData.status !== undefined && cleanData.status !== null) {
      merged.status = cleanData.status;
    }
    
    if (base.taxRate !== undefined && base.taxRate !== null) {
      merged.taxRate = parseFloat(base.taxRate);
    } else if (cleanData.taxRate !== undefined && cleanData.taxRate !== null) {
      merged.taxRate = parseFloat(cleanData.taxRate);
    }
    
    // Para sessions: mapear price, percent_psych, paid desde columnas de tabla
    if (base.price !== undefined && base.price !== null) {
      merged.price = parseFloat(base.price);
    }
    
    if (base.percent_psych !== undefined && base.percent_psych !== null) {
      merged.percent_psych = parseFloat(base.percent_psych);
    }
    
    if (base.paid !== undefined && base.paid !== null) {
      merged.paid = base.paid;
    }
    
    // Para care_relationships: mapear default_session_price y default_psych_percent
    // También añadir compatibilidad camelCase para el frontend
    if (base.default_session_price !== undefined && base.default_session_price !== null) {
      merged.default_session_price = parseFloat(base.default_session_price);
      merged.defaultPrice = parseFloat(base.default_session_price); // Compatibilidad frontend
    }
    
    if (base.default_psych_percent !== undefined && base.default_psych_percent !== null) {
      merged.default_psych_percent = parseFloat(base.default_psych_percent);
      merged.defaultPercent = parseFloat(base.default_psych_percent); // Compatibilidad frontend
    }
    
    // Para care_relationships: uses_bonos viene del JSONB data
    if (cleanData.uses_bonos !== undefined && cleanData.uses_bonos !== null) {
      merged.uses_bonos = cleanData.uses_bonos;
      merged.usesBonos = cleanData.uses_bonos; // Compatibilidad frontend camelCase
    }
    
    // Tags vienen del JSONB data
    if (cleanData.tags !== undefined) {
      merged.tags = cleanData.tags;
    }
    
    return merged;
  }
  
  return base;
}

function buildSupabaseRowFromEntity(originalRow, entity) {
  const hasData = originalRow && Object.prototype.hasOwnProperty.call(originalRow, 'data');
  if (hasData) {
    // Crear una copia de entity sin campos que van en columnas de tabla
    const { is_psychologist, isPsychologist, role, user_email, psychologist_profile_id, ...dataFields } = entity;
    
    // Construir el row con columnas de tabla + data limpio
    return { 
      id: originalRow.id || entity.id,
      is_psychologist: is_psychologist !== undefined ? is_psychologist : (isPsychologist || false),
      user_email: user_email || entity.email,
      psychologist_profile_id: psychologist_profile_id || null,
      data: dataFields 
    };
  }
  return { ...entity, id: originalRow?.id || entity.id };
}

// Función específica para entries que maneja creator_user_id y target_user_id correctamente
function buildSupabaseEntryRow(entry) {
  const { id, creator_user_id, target_user_id, userId, createdByPsychologistId, entryType, psychologistEntryType, type, ...restData } = entry;
  
  // Determinar creator_user_id y target_user_id
  // Si la entrada es del psicólogo (createdBy === 'PSYCHOLOGIST'):
  //   creator_user_id = createdByPsychologistId (quien la creó)
  //   target_user_id = userId (paciente al que va dirigida)
  // Si es del paciente:
  //   creator_user_id = userId (paciente que la creó)
  //   target_user_id = userId (misma persona)
  
  let finalCreatorId = creator_user_id;
  let finalTargetId = target_user_id;
  
  if (!finalCreatorId || !finalTargetId) {
    // Compatibilidad hacia atrás
    if (entry.createdBy === 'PSYCHOLOGIST') {
      finalCreatorId = finalCreatorId || createdByPsychologistId;
      finalTargetId = finalTargetId || userId;
    } else {
      // Entrada del usuario paciente
      finalCreatorId = finalCreatorId || userId;
      finalTargetId = finalTargetId || userId;
    }
  }
  
  if (!finalCreatorId || !finalTargetId) {
    console.error('[buildSupabaseEntryRow] ⚠️ Missing creator_user_id or target_user_id:', { 
      creator_user_id: finalCreatorId, 
      target_user_id: finalTargetId,
      userId,
      createdBy: entry.createdBy,
      createdByPsychologistId
    });
  }
  
  // Extraer entry_type como columna directa (no en data)
  // Excluir entryType de restData y también entry_type
  const { entryType: dataEntryType, entry_type: dataEntryType2, ...cleanData } = restData;
  const finalEntryType = entryType || dataEntryType || dataEntryType2 || psychologistEntryType || type || null;
  
  console.log('[buildSupabaseEntryRow] 🔍 Entry type resolution:', {
    entryType,
    dataEntryType,
    dataEntryType2,
    psychologistEntryType,
    type,
    finalEntryType
  });
  
  return {
    id,
    creator_user_id: finalCreatorId,
    target_user_id: finalTargetId,
    entry_type: finalEntryType,
    data: cleanData
  };
}

// Función específica para invoices que maneja columnas directas + JSONB
function buildSupabaseInvoiceRow(invoice) {
  const { id, psychologist_user_id, patient_user_id, amount, status, tax, total, created_at, date, invoice_date, invoiceNumber, ...restData } = invoice;
  
  console.log('[buildSupabaseInvoiceRow] 🔍 Valores recibidos:', { id, amount, tax, total, status, date, invoice_date, invoiceNumber });
  
  // Si vienen tax y total del frontend, usarlos; si no, calcular con 21% por defecto
  const finalAmount = parseFloat(amount) || 0;
  const finalTax = tax !== undefined && tax !== null ? parseFloat(tax) : (finalAmount * 0.21);
  const finalTotal = total !== undefined && total !== null ? parseFloat(total) : (finalAmount + finalTax);
  
  // Usar invoice_date si está disponible, si no usar date
  const finalInvoiceDate = invoice_date || (date ? date.split('T')[0] : null);
  
  console.log('[buildSupabaseInvoiceRow] ✅ Valores finales:', { finalAmount, finalTax, finalTotal, status: status || 'pending', invoice_date: finalInvoiceDate, invoiceNumber });
  
  return {
    id,
    psychologist_user_id,
    patient_user_id: patient_user_id || null,
    amount: finalAmount,
    status: status || 'pending',
    tax: finalTax,
    total: finalTotal,
    invoice_date: finalInvoiceDate,
    invoiceNumber: invoiceNumber || '',
    created_at: created_at || new Date().toISOString(),
    data: { ...invoice } // Todo el objeto completo en data para compatibilidad
  };
}

async function trySupabaseUpsert(table, payloads) {
  let lastError = null;
  for (const payload of payloads) {
    console.log(`[trySupabaseUpsert] 🔄 Intentando upsert en ${table}:`, JSON.stringify(payload, null, 2).substring(0, 1000));
    
    // Para invoices, si falla con columnas que no existen, intentar solo con las columnas básicas
    if (table === 'invoices') {
      const { error } = await supabaseAdmin.from(table).upsert(payload, { onConflict: 'id' });
      if (!error) {
        console.log(`[trySupabaseUpsert] ✅ Upsert exitoso en ${table}`);
        return;
      }
      
      // Si el error es sobre columnas que no existen, intentar solo con id, data, psychologist_user_id, patient_user_id, created_at
      if (error.message && (error.message.includes('column') || error.code === '42703')) {
        console.warn(`[trySupabaseUpsert] ⚠️ Columnas directas no existen, usando solo JSONB:`, error.message);
        const fallbackPayload = {
          id: payload.id,
          psychologist_user_id: payload.psychologist_user_id,
          patient_user_id: payload.patient_user_id,
          created_at: payload.created_at,
          data: payload.data
        };
        const { error: fallbackError } = await supabaseAdmin.from(table).upsert(fallbackPayload, { onConflict: 'id' });
        if (!fallbackError) {
          console.log(`[trySupabaseUpsert] ✅ Upsert exitoso en ${table} (fallback a JSONB)`);
          return;
        }
        console.error(`[trySupabaseUpsert] ❌ Error en fallback:`, fallbackError);
        lastError = fallbackError;
      } else {
        console.error(`[trySupabaseUpsert] ❌ Error en upsert de ${table}:`, {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        lastError = error;
      }
    } else {
      const { error } = await supabaseAdmin.from(table).upsert(payload, { onConflict: 'id' });
      if (!error) {
        console.log(`[trySupabaseUpsert] ✅ Upsert exitoso en ${table}`);
        return;
      }
      console.error(`[trySupabaseUpsert] ❌ Error en upsert de ${table}:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      lastError = error;
    }
  }
  if (lastError) throw lastError;
}

// Función global para leer tablas de Supabase
async function readTable(table) {
  if (!supabaseAdmin) return [];
  
  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout reading table ${table}`)), 10000)
    );
    
    // Para tablas grandes como entries, usar paginación
    const isLargeTable = ['entries', 'sessions'].includes(table);
    
    if (isLargeTable) {
      console.log(`📄 Loading ${table} with pagination...`);
      let allData = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await Promise.race([
          supabaseAdmin.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1),
          timeoutPromise
        ]);
        
        if (error) {
          console.warn(`⚠️ Could not load table '${table}' page ${page}:`, error.message);
          break;
        }
        
        if (data && data.length > 0) {
          allData = allData.concat(data);
          console.log(`   Loaded ${data.length} rows from ${table} (page ${page + 1})`);
        }
        
        hasMore = data && data.length === pageSize;
        page++;
        
        // Límite de seguridad: máximo 10 páginas (10,000 registros)
        if (page >= 10) {
          console.warn(`⚠️ Reached pagination limit for ${table}`);
          break;
        }
      }
      
      return allData;
    }
    
    const readPromise = supabaseAdmin.from(table).select('*');
    
    const { data, error } = await Promise.race([readPromise, timeoutPromise]);
    
    if (error) {
      console.warn(`⚠️ Could not load table '${table}':`, error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn(`⚠️ Error reading table '${table}':`, err.message);
    return [];
  }
}

async function loadSupabaseCache() {
  if (!supabaseAdmin) return null;

  const readTableLocal = async (table) => {
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout reading table ${table}`)), 10000)
      );
      
      // Para tablas grandes como entries, usar paginación
      const isLargeTable = ['entries', 'sessions'].includes(table);
      
      if (isLargeTable) {
        console.log(`📄 Loading ${table} with pagination...`);
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await Promise.race([
            supabaseAdmin.from(table).select('*').range(page * pageSize, (page + 1) * pageSize - 1),
            timeoutPromise
          ]);
          
          if (error) {
            console.warn(`⚠️ Could not load table '${table}' page ${page}:`, error.message);
            break;
          }
          
          if (data && data.length > 0) {
            allData = allData.concat(data);
            console.log(`   Loaded ${data.length} rows from ${table} (page ${page + 1})`);
          }
          
          hasMore = data && data.length === pageSize;
          page++;
          
          // Límite de seguridad: máximo 10 páginas (10,000 registros)
          if (page >= 10) {
            console.warn(`⚠️ Reached pagination limit for ${table}`);
            break;
          }
        }
        
        return allData;
      }
      
      const readPromise = supabaseAdmin.from(table).select('*');
      
      const { data, error } = await Promise.race([readPromise, timeoutPromise]);
      
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

  const usersRows = await readTableLocal('users');
  // No cargar entries durante la inicialización - se cargan bajo demanda
  const goalsRows = await readTableLocal('goals');
  const invitationsRows = await readTableLocal('invitations');
  const settingsRows = await readTableLocal('settings');
  const sessionsRows = await readTableLocal('sessions');
  const sessionEntriesRows = await readTableLocal('session_entry');
  const invoicesRows = await readTableLocal('invoices');
  const relationshipsRows = await readTableLocal('care_relationships');
  const profilesRows = await readTableLocal('psychologist_profiles');

  const users = usersRows.map(normalizeSupabaseRow);
  const entries = []; // No cargar entries aquí - lazy loading
  const goals = goalsRows.map(row => {
    const normalized = normalizeSupabaseRow(row);
    // Asegurar que userId esté disponible desde patient_user_id
    if (row.patient_user_id && !normalized.userId) {
      normalized.userId = row.patient_user_id;
    }
    return normalized;
  });
  const invitations = invitationsRows.map(normalizeSupabaseRow);
  const sessions = sessionsRows.map(row => {
    const normalized = normalizeSupabaseRow(row);
    // Priorizar status de la columna sobre data.status
    if (row.status) {
      normalized.status = row.status;
    }
    // Convertir starts_on/ends_on a date/startTime/endTime para compatibilidad con frontend
    if (row.starts_on) {
      const startsDate = new Date(row.starts_on);
      normalized.date = startsDate.toISOString().split('T')[0];
      normalized.startTime = startsDate.toTimeString().substring(0, 5);
      normalized.starts_on = row.starts_on;
    }
    if (row.ends_on) {
      const endsDate = new Date(row.ends_on);
      normalized.endTime = endsDate.toTimeString().substring(0, 5);
      normalized.ends_on = row.ends_on;
    }
    return normalized;
  });
  const invoices = invoicesRows.map(normalizeSupabaseRow);
  const sessionEntries = sessionEntriesRows.map(row => {
    // session_entry tiene status como columna separada, resto en data
    const normalized = normalizeSupabaseRow(row);
    // Asegurar que status esté disponible tanto en el nivel superior como en data
    if (row.status) {
      normalized.status = row.status;
      if (normalized.data) {
        normalized.data.status = row.status;
      }
    }
    return normalized;
  });
  const careRelationships = relationshipsRows.map(row => {
    const normalized = normalizeSupabaseRow(row);
    // Asegurar que default_session_price y default_psych_percent tengan valores
    if (normalized.default_session_price === null || normalized.default_session_price === undefined) {
      normalized.default_session_price = 0;
    }
    if (normalized.default_psych_percent === null || normalized.default_psych_percent === undefined) {
      normalized.default_psych_percent = 100;
    }
    return normalized;
  });
  const settings = Object.fromEntries(settingsRows.map(row => [row.id, (row.data && typeof row.data === 'object') ? row.data : normalizeSupabaseRow(row)]));
  const psychologistProfiles = Object.fromEntries(profilesRows.map(row => [row.id, (row.data && typeof row.data === 'object') ? row.data : normalizeSupabaseRow(row)]));

  return { users, entries, goals, invitations, settings, sessions, sessionEntries, invoices, careRelationships, psychologistProfiles };
}

async function readSupabaseTable(table) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from(table).select('*');
  if (error) throw error;
  return (data || []).map(normalizeSupabaseRow);
}

async function loadEntriesForUser(userId) {
  if (!supabaseAdmin) return [];
  try {
    console.log(`🔄 Cargando entries para usuario: ${userId}`);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Timeout loading entries for user ${userId}`)), 10000)
    );
    
    // Buscar por target_user_id (la persona sobre quien es la entrada)
    const readPromise = supabaseAdmin.from('entries').select('*').eq('target_user_id', userId);
    const { data, error } = await Promise.race([readPromise, timeoutPromise]);
    
    if (error) {
      console.warn(`⚠️ Could not load entries for user '${userId}':`, error.message);
      return [];
    }
    console.log(`✅ Cargadas ${data?.length || 0} entries para usuario ${userId}`);
    return (data || []).map(normalizeSupabaseRow);
  } catch (err) {
    console.warn(`⚠️ Error loading entries for user '${userId}':`, err.message);
    return [];
  }
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
      // accessList removed - using care_relationships table only
      return { ...item, score: hasSupabaseId * 10 + isPsych * 3 };
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
      // accessList removed - using care_relationships table only
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

// Helper para combinar date + time en timestamp ISO
function dateTimeToISO(date, time) {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
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
    console.log(`🔄 [saveSupabaseDb] Haciendo upsert en tabla '${table}' con ${rows.length} filas`);
    
    // Validación extra para psychologist_profiles
    if (table === 'psychologist_profiles') {
      const invalidRows = rows.filter(r => !r.user_id);
      if (invalidRows.length > 0) {
        console.warn(`⚠️ [saveSupabaseDb] Saltando ${invalidRows.length} perfiles con user_id null:`, invalidRows.map(r => r.id));
        rows = rows.filter(r => r.user_id); // Filtrar los que no tienen user_id
        if (rows.length === 0) {
          console.log(`⏭️ [saveSupabaseDb] No hay perfiles válidos para guardar`);
          return;
        }
      }
    }
    
    const chunks = chunk(rows);
    for (const c of chunks) {
      const { error: upsertError } = await supabaseAdmin.from(table).upsert(c, { onConflict: 'id' });
      if (upsertError) {
        console.error(`❌ [saveSupabaseDb] Error en upsert de tabla '${table}':`, upsertError);
        throw upsertError;
      }
    }
    console.log(`✅ [saveSupabaseDb] Upsert completado en tabla '${table}'`);
  };

  const deleteMissing = async (table, prevIds, nextIds) => {
    if (table === 'psychologist_profiles') {
      console.log('⏭️ [deleteMissing] Omitiendo eliminaciones en psychologist_profiles (FK con users)');
      return;
    }
    console.log(`🔍 [deleteMissing] Tabla: ${table}, prevIds: ${prevIds?.length || 0}, nextIds: ${nextIds?.length || 0}`);
    if (!prevIds || !prevIds.length) {
      console.log(`⏭️ [deleteMissing] No hay IDs previos para ${table}, saltando eliminación`);
      return;
    }
    const nextSet = new Set(nextIds || []);
    const toDelete = prevIds.filter((id) => !nextSet.has(id));
    console.log(`📝 [deleteMissing] ${table} - IDs a eliminar:`, toDelete);
    if (!toDelete.length) {
      console.log(`✅ [deleteMissing] No hay registros que eliminar en ${table}`);
      return;
    }
    console.log(`🗑️ [deleteMissing] Eliminando ${toDelete.length} registros de ${table} en Supabase...`);
    const chunks = chunk(toDelete, 200);
    for (const c of chunks) {
      console.log(`   Eliminando chunk de ${c.length} registros:`, c);
      const { error: delError } = await supabaseAdmin.from(table).delete().in('id', c);
      if (delError) {
        // Ignorar errores de foreign key constraint - el registro todavía se está usando
        if (delError.code === '23503') {
          console.warn(`⚠️ [deleteMissing] No se puede eliminar chunk de ${table} - referenciado por otra tabla:`, delError.message);
          continue;
        }
        console.error(`❌ [deleteMissing] Error eliminando chunk de ${table}:`, delError);
        throw delError;
      }
      console.log(`   ✅ Chunk eliminado correctamente`);
    }
    console.log(`✅ [deleteMissing] Completada eliminación de ${toDelete.length} registros de ${table}`);
  };

  // Users: extraer campos específicos para columnas de Supabase según el nuevo schema
  const usersRows = (data.users || []).map(u => ({
    id: u.id,
    data: u,
    user_email: u.user_email || u.email || null,
    is_psychologist: u.is_psychologist ?? (u.isPsychologist ?? (u.role === 'PSYCHOLOGIST' ? true : false)),
    psychologist_profile_id: u.psychologist_profile_id || null,
    auth_user_id: u.auth_user_id || u.supabaseId || null  // UUID de auth.users
  }));
  
  // Entries: extraer campos para foreign keys creator_user_id y target_user_id
  const entriesRows = (data.entries || []).map(e => ({
    id: e.id,
    data: e,
    creator_user_id: e.creator_user_id || e.userId || null,
    target_user_id: e.target_user_id || e.targetUserId || e.userId || null
  }));
  // Goals: extraer campo patient_user_id
  const goalsRows = (data.goals || []).map(g => ({
    id: g.id,
    data: g,
    patient_user_id: g.patient_user_id || null
  }));
  
  // Invitations: extraer campos según el nuevo schema (psychologist_user_id, patient_user_id, invited_patient_email, psychologist_email)
  const invitationsRows = (data.invitations || []).map(i => ({
    id: i.id,
    data: i,
    psychologist_user_id: i.psychologist_user_id || i.psych_user_id || i.psychologistId || null,
    patient_user_id: i.patient_user_id || null,
    invited_patient_email: i.patient_user_email || i.patientEmail || i.toUserEmail || null,
    psychologist_email: i.psych_user_email || i.psychologistEmail || null
  }));
  
  // Settings: extraer campo user_id
  const settings = data.settings || {};
  const settingsRows = Object.keys(settings).map(k => ({
    id: k,
    data: settings[k],
    user_id: settings[k]?.user_id || settings[k]?.userId || null
  }));
  
  // Sessions: extraer campos psychologist_user_id, patient_user_id, status, starts_on, ends_on, price, percent_psych, paid
  // Solo persistir sesiones reales con paciente (no disponibilidad)
  const sessionsRows = (data.sessions || [])
    .filter(s => s.patient_user_id || s.patientId) // Filtrar sesiones sin paciente
    .map(s => {
      // Remover campos que van en columnas separadas (no en JSONB data)
      const { status, date, startTime, endTime, starts_on, ends_on, price, percent_psych, paid, ...cleanData } = s;
      
      // Extraer price, percent_psych, paid (pueden estar en el objeto o en data JSONB)
      const finalPrice = price ?? s.data?.price ?? null;
      const finalPercentPsych = percent_psych ?? s.data?.percent_psych ?? null;
      const finalPaid = paid ?? s.data?.paid ?? false;
      
      // Validar que price y percent_psych no sean null
      if (finalPrice === null || finalPercentPsych === null) {
        console.warn(`⚠️ [saveSupabaseDb] Sesión ${s.id} sin price o percent_psych - saltando`);
        return null;
      }
      
      return {
        id: s.id,
        data: cleanData,
        psychologist_user_id: s.psychologist_user_id || null,
        patient_user_id: s.patient_user_id || s.patientId || null,
        status: s.status || 'scheduled',
        starts_on: s.starts_on || dateTimeToISO(s.date, s.startTime) || null,
        ends_on: s.ends_on || dateTimeToISO(s.date, s.endTime) || null,
        price: finalPrice,
        percent_psych: finalPercentPsych,
        paid: finalPaid
      };
    })
    .filter(s => s !== null); // Remover sesiones inválidas
  
  // Invoices: usar buildSupabaseInvoiceRow para incluir amount, tax, total, status
  const invoicesRows = (data.invoices || [])
    .filter(inv => inv.psychologist_user_id || inv.psychologistId) // Filtrar facturas sin psicólogo
    .map(inv => buildSupabaseInvoiceRow(inv));

  // Session entry: guardar status como columna separada, resto (incluyendo session_id) en data
  const sessionEntriesRows = (data.sessionEntries || []).map(se => {
    const seData = se.data || se;
    return {
      id: se.id,
      creator_user_id: se.creator_user_id || null,
      target_user_id: se.target_user_id || null,
      status: seData.status || 'pending',
      data: {
        session_id: se.session_id || seData.session_id || null,
        transcript: seData.transcript || '',
        summary: seData.summary || '',
        file: seData.file || null,
        file_name: seData.file_name || null,
        file_type: seData.file_type || null,
        entry_type: seData.entry_type || 'session_note',
        created_at: seData.created_at || new Date().toISOString()
      }
    };
  });

  // Care relationships: extraer campos según el nuevo schema (psychologist_user_id, patient_user_id, default_session_price, default_psych_percent)
  const relationshipsRows = (data.careRelationships || [])
    .filter(rel => {
      // Solo incluir relaciones que tienen los campos requeridos
      const hasPrice = rel.default_session_price !== undefined && rel.default_session_price !== null;
      const hasPercent = rel.default_psych_percent !== undefined && rel.default_psych_percent !== null;
      if (!hasPrice || !hasPercent) {
        console.warn(`⚠️ [saveSupabaseDb] Saltando care_relationship ${rel.id} sin default_session_price o default_psych_percent`);
        return false;
      }
      return true;
    })
    .map(rel => ({
      id: rel.id,
      data: rel.data || rel,
      psychologist_user_id: rel.psychologist_user_id || null,
      patient_user_id: rel.patient_user_id || null,
      default_session_price: rel.default_session_price,
      default_psych_percent: Math.min(rel.default_psych_percent, 100)
    }));
  
  // Psychologist profiles: extraer campo user_id
  const profiles = data.psychologistProfiles || {};
  const profilesRows = Object.keys(profiles)
    .map(k => ({
      id: k,
      data: profiles[k],
      user_id: profiles[k]?.user_id || profiles[k]?.userId || null
    }))
    .filter(p => p.user_id !== null); // Filtrar perfiles sin user_id válido

  await upsertTable('users', usersRows);
  await upsertTable('entries', entriesRows);
  await upsertTable('goals', goalsRows);
  await upsertTable('invitations', invitationsRows);
  await upsertTable('settings', settingsRows);
  await upsertTable('sessions', sessionsRows);
  await upsertTable('session_entry', sessionEntriesRows);
  await upsertTable('care_relationships', relationshipsRows);
  
  if (invoicesRows.length === 0) {
    console.log('⏭️ [saveSupabaseDb] No hay invoices válidas para guardar');
  } else {
    await upsertTable('invoices', invoicesRows);
  }
  
  // Solo hacer upsert de profiles si hay alguno válido
  if (profilesRows.length > 0) {
    await upsertTable('psychologist_profiles', profilesRows);
  } else {
    console.log('⏭️ [saveSupabaseDb] No hay psychologist_profiles válidos para guardar');
  }

  if (prevCache) {
    await deleteMissing('users', (prevCache.users || []).map(u => u.id), usersRows.map(r => r.id));
    await deleteMissing('entries', (prevCache.entries || []).map(e => e.id), entriesRows.map(r => r.id));
    await deleteMissing('goals', (prevCache.goals || []).map(g => g.id), goalsRows.map(r => r.id));
    await deleteMissing('invitations', (prevCache.invitations || []).map(i => i.id), invitationsRows.map(r => r.id));
    await deleteMissing('settings', Object.keys(prevCache.settings || {}), settingsRows.map(r => r.id));
    await deleteMissing('sessions', (prevCache.sessions || []).map(s => s.id), sessionsRows.map(r => r.id));
    await deleteMissing('session_entry', (prevCache.sessionEntries || []).map(se => se.id), sessionEntriesRows.map(r => r.id));
    await deleteMissing('care_relationships', (prevCache.careRelationships || []).map(rel => rel.id), relationshipsRows.map(r => r.id));
    await deleteMissing('invoices', (prevCache.invoices || []).map(inv => inv.id), invoicesRows.map(r => r.id));
    await deleteMissing('psychologist_profiles', Object.keys(prevCache.psychologistProfiles || {}), profilesRows.map(r => r.id));
  }
}

const persistSupabaseData = async (data, prevCache, allowRetry = true) => {
  if (!supabaseAdmin) return;
  try {
    await saveSupabaseDb(data, prevCache);
  } catch (err) {
    if (allowRetry && isMissingRelationError(err)) {
      console.warn('⚠️ Tabla faltante detectada en Supabase. Intentando crearla automáticamente…');
      await ensureSupabaseTablesExist(true);
      return persistSupabaseData(data, prevCache, false);
    }
    throw err;
  }
};

const getDb = () => {
  if (DISALLOW_LOCAL_PERSISTENCE && !pgPool && !supabaseAdmin && !sqliteDb) {
    return ensureDbShape(createInitialDb());
  }
  // Postgres: return in-memory cache (keeps handler sync)
  if (pgPool && pgDbCache) {
    return ensureDbShape(pgDbCache);
  }

  // Supabase REST fallback: return in-memory cache
  if (supabaseAdmin && supabaseDbCache) {
    return ensureDbShape(supabaseDbCache);
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
    const sessionEntries = read('session_entry');
    const invoices = read('invoices');
    const profilesArr = read('psychologist_profiles');
    const psychologistProfiles = Object.fromEntries(profilesArr.map((p) => [p.id, p]));
    return ensureDbShape({ users, entries, goals, invitations, settings, sessions, sessionEntries, invoices, careRelationships: read('care_relationships'), psychologistProfiles });
  }

  // 1. Si no existe, crearla
  if (!fs.existsSync(DB_FILE)) {
    if (DISALLOW_LOCAL_PERSISTENCE) {
      return ensureDbShape(createInitialDb());
    }
    console.log('⚠️ db.json no encontrado. Creando nueva base de datos...');
    const initialDb = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
    return ensureDbShape(initialDb);
  }

  // 2. Intentar leerla. Si falla (json corrupto), reiniciarla.
  try {
    const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
    if (!fileContent.trim()) throw new Error('Archivo vacío');
    return ensureDbShape(JSON.parse(fileContent));
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
    return ensureDbShape(initialDb);
  }
};

const saveDb = (data, options = {}) => {
  const { awaitPersistence = false } = options;
  // Keep in-memory cache in sync for Postgres, then persist in background
  if (pgPool) {
    pgDbCache = data;
    const persistPromise = (async () => {
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
        await client.query('DELETE FROM session_entry');
        await client.query('DELETE FROM care_relationships');
        await client.query('DELETE FROM invoices');
        await client.query('DELETE FROM psychologist_profiles');

        const insert = async (table, id, obj) => client.query(`INSERT INTO ${table} (id, data) VALUES ($1,$2)`, [id, obj]);

        for (const u of (data.users || [])) await insert('users', u.id, u);
        for (const e of (data.entries || [])) await insert('entries', e.id, e);
        for (const g of (data.goals || [])) await insert('goals', g.id, g);
        for (const i of (data.invitations || [])) await insert('invitations', i.id, i);
        const settings = data.settings || {};
        for (const k of Object.keys(settings)) await insert('settings', k, settings[k]);
        // Solo insertar sesiones reales con paciente (no disponibilidad)
        for (const s of (data.sessions || [])) {
          if (s.patient_user_id || s.patientId) {
            await insert('sessions', s.id, s);
          }
        }
        for (const se of (data.sessionEntries || [])) await insert('session_entry', se.id, se);
        for (const rel of (data.careRelationships || [])) await insert('care_relationships', rel.id, rel);
        for (const inv of (data.invoices || [])) await insert('invoices', inv.id, inv);
        const profiles = data.psychologistProfiles || {};
        for (const k of Object.keys(profiles)) await insert('psychologist_profiles', k, profiles[k]);

        await client.query('COMMIT');
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('❌ Error guardando en Postgres:', err);
      } finally {
        if (client) client.release();
      }
    })();

    return awaitPersistence ? persistPromise : undefined;
  }

  if (supabaseAdmin) {
    const prevCache = supabaseDbCache;
    supabaseDbCache = data;
    const persistPromise = persistSupabaseData(data, prevCache);
    if (awaitPersistence) {
      return persistPromise;
    }
    persistPromise.catch((err) => {
      console.error('❌ Error guardando en Supabase REST:', err?.message || err);
    });
    return undefined;
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
      del.run('sessions');
      del.run('session_entry');
      del.run('care_relationships');
      del.run('invoices');
      del.run('psychologist_profiles');

      (dbObj.users || []).forEach(u => insert.run({ table: 'users', id: u.id, data: JSON.stringify(u) }));
      (dbObj.entries || []).forEach(e => insert.run({ table: 'entries', id: e.id, data: JSON.stringify(e) }));
      (dbObj.goals || []).forEach(g => insert.run({ table: 'goals', id: g.id, data: JSON.stringify(g) }));
      (dbObj.invitations || []).forEach(i => insert.run({ table: 'invitations', id: i.id, data: JSON.stringify(i) }));
      const settings = dbObj.settings || {};
      Object.keys(settings).forEach(k => insert.run({ table: 'settings', id: k, data: JSON.stringify(settings[k]) }));
      // Solo insertar sesiones reales con paciente (no disponibilidad)
      (dbObj.sessions || []).forEach(s => {
        if (s.patient_user_id || s.patientId) {
          insert.run({ table: 'sessions', id: s.id, data: JSON.stringify(s) });
        }
      });
      (dbObj.sessionEntries || []).forEach(se => insert.run({ table: 'session_entry', id: se.id, data: JSON.stringify(se) }));
      (dbObj.careRelationships || []).forEach(rel => insert.run({ table: 'care_relationships', id: rel.id, data: JSON.stringify(rel) }));
      (dbObj.invoices || []).forEach(inv => insert.run({ table: 'invoices', id: inv.id, data: JSON.stringify(inv) }));
      const profiles = dbObj.psychologistProfiles || {};
      Object.keys(profiles).forEach(k => insert.run({ table: 'psychologist_profiles', id: k, data: JSON.stringify(profiles[k]) }));
    });
    try {
      tx(data);
    } catch (e) {
      console.error('❌ Error guardando en SQLite:', e);
    }
    return awaitPersistence ? Promise.resolve() : undefined;
  }

  if (IS_SERVERLESS) {
    console.warn('⚠️ Skipping db.json write on serverless read-only filesystem. Enable Postgres or SQLite for persistence.');
    return awaitPersistence ? Promise.resolve() : undefined;
  }

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('❌ Error guardando en db.json:', error);
  }
  return awaitPersistence ? Promise.resolve() : undefined;
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
    const isPsych = normalizedRole === 'PSYCHOLOGIST';

    const newUser = {
      id: crypto.randomUUID(), // requiere Node 16.14+ / 18+
      name,
      email: normalizedEmail,
      user_email: normalizedEmail,  // Columna de tabla según el schema
      password, // OJO: en producción deberías hashearla
      role: normalizedRole,
      isPsychologist: isPsych,
      is_psychologist: isPsych  // Columna de tabla según el schema
    };

    db.users.push(newUser);

    // ✨ Procesar invitaciones pendientes para este email
    const pendingInvitations = db.invitations.filter(
      inv => inv.toUserEmail === normalizedEmail && inv.status === 'PENDING'
    );

    if (pendingInvitations.length > 0) {
      console.log(`📧 Encontradas ${pendingInvitations.length} invitaciones pendientes para ${normalizedEmail}`);
      
      // Las invitaciones ya están asociadas por email, solo las marcamos como visibles para el usuario
      pendingInvitations.forEach(inv => {
        console.log(`   - Invitación de ${inv.fromPsychologistName} (${inv.fromPsychologistId})`);
        // No cambiamos el estado aquí - el usuario debe aceptar/rechazar manualmente
        // La invitación ya está accesible vía getPendingInvitationsForEmail(email)
      });

      console.log('✅ El usuario podrá ver y gestionar estas invitaciones en el panel de Conexiones');
    }

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
    if (!access_token) {
      console.error('❌ Supabase auth: missing access_token');
      return res.status(400).json({ error: 'Se requiere un token de acceso' });
    }
    if (!process.env.SUPABASE_URL) {
      console.error('❌ Supabase auth: SUPABASE_URL not configured in server');
      return res.status(500).json({ error: 'Supabase no está configurado en el servidor' });
    }

    console.log('🔐 Validando token de Supabase...');
    
    // Validate token against Supabase /auth/v1/user
    const userInfoRes = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': process.env.SUPABASE_ANON_KEY || ''
      }
    });

    if (!userInfoRes.ok) {
      const errorText = await userInfoRes.text();
      console.error('❌ Token inválido o expirado:', errorText);
      return res.status(400).json({ 
        error: 'Token de autenticación inválido o expirado',
        details: 'Por favor, intenta iniciar sesión nuevamente'
      });
    }

    const supUser = await userInfoRes.json();
    console.log('✅ Token validado para usuario:', supUser.email);
    console.log('📊 Supabase user ID (auth_user_id):', supUser.id);
    // supUser contains `email`, `id` (supabase user id), etc.

    let user = null;
    
    // Buscar usuario en Supabase primero si está disponible
    if (supabaseAdmin) {
      console.log('🔍 Buscando usuario en Supabase...');
      const users = await readSupabaseTable('users');
      console.log('📊 Total usuarios en Supabase:', users?.length || 0);
      
      // Buscar por auth_user_id (UUID) que es la columna correcta según el schema
      user = (users || []).find(u => u.auth_user_id && String(u.auth_user_id) === String(supUser.id));
      if (!user) {
        console.log('⚠️ No encontrado por auth_user_id, buscando por email...');
        user = (users || []).find(u => u.user_email && normalizeEmail(u.user_email) === normalizeEmail(supUser.email));
      }
      
      if (user) {
        console.log('✅ Usuario encontrado en Supabase:', user.id);
      } else {
        console.log('⚠️ Usuario no encontrado en Supabase');
      }
    } else {
      console.log('⚠️ supabaseAdmin no está inicializado, buscando en db.json...');
    }
    
    // Fallback a db.json si no se encuentra en Supabase
    if (!user) {
      const db = getDb();
      user = db.users.find(u => u.auth_user_id && String(u.auth_user_id) === String(supUser.id));
      if (!user) {
        user = db.users.find(u => u.email && normalizeEmail(u.email) === normalizeEmail(supUser.email));
      }
    }

    if (!user) {
      console.log('🆕 Creando nuevo usuario desde OAuth...');
      console.log('📊 supabaseAdmin disponible:', !!supabaseAdmin);
      
      const normalizedEmail = normalizeEmail(supUser.email);
      
      // ⚠️ VALIDACIÓN CRÍTICA: Verificar una última vez que NO existe el usuario
      // para evitar duplicados en caso de condiciones de carrera
      let existingUser = null;
      
      if (supabaseAdmin) {
        console.log('🔍 Verificación final: buscando usuario existente por email...');
        const allUsers = await readSupabaseTable('users');
        existingUser = (allUsers || []).find(u => 
          normalizeEmail(u.user_email || '') === normalizedEmail
        );
        
        if (existingUser) {
          console.log('⚠️ Usuario ya existe en Supabase (detectado en verificación final):', existingUser.id);
          user = existingUser;
          
          // Asegurar que tenga auth_user_id
          if (!existingUser.auth_user_id) {
            console.log('📝 Actualizando auth_user_id del usuario existente...');
            const { error } = await supabaseAdmin
              .from('users')
              .update({ auth_user_id: supUser.id })
              .eq('id', existingUser.id);
            if (!error) {
              console.log('✅ auth_user_id actualizado');
              if (user.data) user.data.auth_user_id = supUser.id;
              user.auth_user_id = supUser.id;
            }
          }
        }
      } else {
        // Verificar en db.json
        const db = getDb();
        existingUser = db.users.find(u => 
          normalizeEmail(u.user_email || u.email || '') === normalizedEmail
        );
        
        if (existingUser) {
          console.log('⚠️ Usuario ya existe en db.json (detectado en verificación final):', existingUser.id);
          user = existingUser;
          
          // Actualizar auth_user_id si no lo tiene
          if (!existingUser.auth_user_id) {
            existingUser.auth_user_id = supUser.id;
            await saveDb(db, { awaitPersistence: true });
          }
        }
      }
      
      // Solo crear si realmente no existe después de todas las verificaciones
      if (!existingUser) {
        console.log('✅ Email único confirmado, creando usuario...');
        
        const newUser = {
          id: crypto.randomUUID(),
          name: supUser.user_metadata?.full_name || supUser.email || 'Sin nombre',
          email: normalizedEmail,
          user_email: normalizedEmail,
          password: '',
          role: 'PATIENT',
          isPsychologist: false,
          is_psychologist: false,
          auth_user_id: supUser.id  // UUID de auth.users
        };
        
        // Guardar en Supabase si está disponible
        if (supabaseAdmin) {
          console.log('💾 Guardando usuario en Supabase...');
          
          // Preparar data sin campos que van en columnas
          const { is_psychologist, isPsychologist, role, user_email, auth_user_id, psychologist_profile_id, ...cleanData } = newUser;
          
          // Crear la fila con las columnas correctas según el schema
          const userRow = {
            id: newUser.id,
            data: cleanData,  // Solo campos que no son columnas de tabla
            user_email: newUser.user_email,
            is_psychologist: newUser.is_psychologist,
            psychologist_profile_id: null,
            auth_user_id: supUser.id  // UUID
          };
          const { data: insertedData, error } = await supabaseAdmin.from('users').insert([userRow]).select();
          if (error) {
            console.error('❌ Error creating user in Supabase:', error);
            
            // Si el error es por duplicado, intentar buscar el usuario existente
            if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
              console.log('⚠️ Error de duplicado, buscando usuario existente...');
              const users = await readSupabaseTable('users');
              const duplicate = users.find(u => normalizeEmail(u.user_email || '') === normalizedEmail);
              if (duplicate) {
                console.log('✅ Usuario duplicado encontrado, usando existente:', duplicate.id);
                user = duplicate;
                return;
              }
            }
            
            throw error;
          }
          console.log('✅ Created new user in Supabase from OAuth:', newUser.email);
          console.log('📊 Inserted data:', insertedData);
        } else {
          console.log('⚠️ supabaseAdmin no disponible, guardando en db.json...');
          // Fallback a db.json
          const db = getDb();
          db.users.push(newUser);
          if (!db.settings) db.settings = {};
          if (!db.settings[newUser.id]) db.settings[newUser.id] = {};
          // Esperar a que se persista antes de continuar
          await saveDb(db, { awaitPersistence: true });
          console.log('✅ Created new user from Supabase sign-in:', newUser.email);
        }
        
        user = newUser;
      }
    } else {
      // Usuario encontrado - asegurar que auth_user_id esté actualizado
      if (!user.auth_user_id && supabaseAdmin && user.id) {
        const { error } = await supabaseAdmin
          .from('users')
          .update({ auth_user_id: supUser.id })
          .eq('id', user.id);
        if (error) {
          console.error('❌ Error updating auth_user_id:', error);
        } else {
          console.log('✅ Updated user auth_user_id in Supabase:', user.id);
          user.auth_user_id = supUser.id;
          if (user.data) user.data.auth_user_id = supUser.id;
        }
      } else if (!user.auth_user_id && !supabaseAdmin) {
        // Actualizar en db.json
        const db = getDb();
        const dbUser = db.users.find(u => u.id === user.id);
        if (dbUser) {
          dbUser.auth_user_id = supUser.id;
          saveDb(db);
        }
      }
    }

    // Normalizar el formato del usuario para la respuesta
    // IMPORTANTE: is_psychologist de las columnas de Supabase tiene prioridad sobre data.is_psychologist
    const userResponse = user.data ? { 
      ...user.data, 
      id: user.id, 
      user_email: user.user_email,
      // Usar el valor de la columna is_psychologist de Supabase, no el de data
      is_psychologist: user.is_psychologist !== undefined ? user.is_psychologist : user.data.is_psychologist,
      isPsychologist: user.is_psychologist !== undefined ? user.is_psychologist : user.data.isPsychologist
    } : user;
    
    console.log('✅ Autenticación Supabase exitosa para:', userResponse.email || userResponse.id, {
      is_psychologist: userResponse.is_psychologist,
      isPsychologist: userResponse.isPsychologist
    });
    return res.json(userResponse);
  } catch (err) {
    console.error('❌ Error crítico en autenticación Supabase:', err);
    
    // Proporcionar mensajes de error más descriptivos
    let errorMessage = 'Error durante la autenticación';
    let errorDetails = err.message || 'Error desconocido';
    
    if (err.message && err.message.includes('fetch')) {
      errorMessage = 'Error de conexión con Supabase';
      errorDetails = 'No se pudo conectar con el servicio de autenticación';
    } else if (err.code) {
      errorDetails = `Código de error: ${err.code} - ${err.message}`;
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      supabase_configured: !!process.env.SUPABASE_URL,
      timestamp: new Date().toISOString()
    });
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
    const db = getDb();
    
    if (supabaseAdmin) {
      const users = await readSupabaseTable('users');
      // Buscar por user_email (columna de tabla)
      user = (users || []).find((u) => {
        const emailMatch = normalizeEmail(u.user_email || '') === normalizedEmail;
        const passwordMatch = (u.data?.password || u.password) === password;
        return emailMatch && passwordMatch;
      });
    } else {
      user = db.users.find((u) => String(u.email || '').trim().toLowerCase() === normalizedEmail && u.password === password);
    }

    if (!user) {
      // Crear nuevo usuario automáticamente si no existe
      console.log('👤 Usuario no encontrado, creando nuevo usuario para:', normalizedEmail);
      
      const newUser = {
        id: crypto.randomUUID(),
        name: normalizedEmail.split('@')[0], // Usar parte del email como nombre
        email: normalizedEmail,
        user_email: normalizedEmail,  // Columna de tabla
        password,
        role: 'PATIENT',
        isPsychologist: false,
        is_psychologist: false  // Columna de tabla
      };

      db.users.push(newUser);
      await saveDb(db, { awaitPersistence: true });
      
      console.log('✅ Nuevo usuario creado:', newUser.id);
      return res.json(newUser);
    }

    console.log('✅ Login exitoso:', user.name || user.data?.name);
    
    // Normalizar la respuesta del usuario
    // IMPORTANTE: is_psychologist de las columnas de Supabase tiene prioridad sobre data
    const userResponse = user.data ? { 
      ...user.data, 
      id: user.id,
      user_email: user.user_email,
      // Usar el valor de la columna is_psychologist de Supabase, no el de data
      is_psychologist: user.is_psychologist !== undefined ? user.is_psychologist : user.data.is_psychologist,
      isPsychologist: user.is_psychologist !== undefined ? user.is_psychologist : user.data.isPsychologist,
      auth_user_id: user.auth_user_id
    } : user;
    
    console.log('📊 Login response:', {
      email: userResponse.email,
      is_psychologist: userResponse.is_psychologist,
      isPsychologist: userResponse.isPsychologist
    });
    
    res.json(userResponse);
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

// --- ADMIN: Create a patient and connect to psychologist
const handleAdminCreatePatient = async (req, res) => {
  try {
    const psychologistId = req.headers['x-user-id'] || req.headers['x-userid'];
    if (!psychologistId) return res.status(401).json({ error: 'Missing psychologist id in header x-user-id' });

    const { name, email, phone } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    const db = getDb();
    const psychologist = db.users.find(u => u.id === String(psychologistId));
    if (!psychologist || !psychologist.is_psychologist) {
      return res.status(403).json({ error: 'Only psychologists can create patients' });
    }

    // Verificar si el email ya existe en Supabase
    const normalizedEmail = normalizeEmail(email);
    
    if (supabaseAdmin) {
      const { data: existingInSupabase } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('user_email', normalizedEmail)
        .maybeSingle();
      
      if (existingInSupabase) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
      }
    } else {
      const existingUser = db.users.find(u => normalizeEmail(u.email) === normalizedEmail);
      if (existingUser) {
        return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
      }
    }

    // Crear el nuevo paciente
    const newPatient = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      name: name.trim(),
      phone: phone ? phone.trim() : '',
      is_psychologist: false,
      auth_user_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Crear la relación de cuidado
    const relationship = {
      id: crypto.randomUUID(),
      psychologist_user_id: psychologistId,
      patient_user_id: newPatient.id,
      status: 'active',
      default_session_price: 0,
      default_psych_percent: 80,
      data: {
        psychologistId: psychologistId,
        patientId: newPatient.id,
        status: 'active',
        tags: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // PRIMERO: Insertar en Supabase si está disponible
    if (supabaseAdmin) {
      console.log('[handleAdminCreatePatient] 🔄 Insertando en Supabase...');
      
      try {
        // 1. Insertar paciente
        console.log('[handleAdminCreatePatient] Insertando usuario:', newPatient.id);
        const { error: userError } = await supabaseAdmin
          .from('users')
          .insert({
            id: newPatient.id,
            data: newPatient,
            user_email: newPatient.email,
            is_psychologist: false
          });

        if (userError) {
          console.error('[handleAdminCreatePatient] ❌ Error insertando usuario:', userError);
          throw new Error(`Error al crear usuario: ${userError.message}`);
        }
        console.log('[handleAdminCreatePatient] ✅ Usuario insertado en Supabase');

        // 2. Insertar relación
        console.log('[handleAdminCreatePatient] Insertando relación:', relationship.id);
        const { error: relError } = await supabaseAdmin
          .from('care_relationships')
          .insert({
            id: relationship.id,
            data: relationship.data,
            psychologist_user_id: psychologistId,
            patient_user_id: newPatient.id,
            default_session_price: 0,
            default_psych_percent: 80
          });

        if (relError) {
          console.error('[handleAdminCreatePatient] ❌ Error insertando relación:', relError);
          // Intentar eliminar el usuario si la relación falló
          await supabaseAdmin.from('users').delete().eq('id', newPatient.id);
          throw new Error(`Error al crear relación: ${relError.message}`);
        }
        console.log('[handleAdminCreatePatient] ✅ Relación insertada en Supabase');
      } catch (supaErr) {
        console.error('[handleAdminCreatePatient] ❌ Error en Supabase:', supaErr);
        return res.status(500).json({ error: supaErr.message || 'Error al crear paciente en Supabase' });
      }
    }

    // SEGUNDO: Guardar también en DB local
    db.users.push(newPatient);
    if (!Array.isArray(db.careRelationships)) {
      db.careRelationships = [];
    }
    db.careRelationships.push(relationship);
    await saveDb(db, { awaitPersistence: false }); // No esperar persistencia para no duplicar en Supabase

    console.log(`✅ Paciente creado: ${newPatient.name} (${newPatient.email}) por psicólogo ${psychologist.name}`);

    return res.json({
      success: true,
      patient: newPatient,
      relationship: relationship
    });

  } catch (err) {
    console.error('Error in admin-create-patient', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

app.post('/api/admin/create-patient', handleAdminCreatePatient);

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

    // 1) Remove user's entries (filter by userId, target_user_id, creator_user_id)
    db.entries = db.entries.filter((e) => {
      return String(e.userId) !== String(user.id) && 
             String(e.target_user_id) !== String(user.id) && 
             String(e.creator_user_id) !== String(user.id);
    });

    // 2) Remove user's goals (filter by userId and patient_user_id)
    db.goals = db.goals.filter((g) => {
      return String(g.userId) !== String(user.id) && 
             String(g.patient_user_id) !== String(user.id);
    });

    // 3) Remove invitations sent by or for this user
    db.invitations = db.invitations.filter((i) => {
      if (!i) return false;
      const fromMatch = i.psychologist_user_id && String(i.psychologist_user_id) === String(user.id);
      const toMatch = i.patient_user_id && String(i.patient_user_id) === String(user.id);
      return !(fromMatch || toMatch);
    });

    // 4) Remove relationships referencing this user
    const removedRelationships = removeCareRelationshipsForUser(db, user.id);

    // 5) Remove settings for this user
    if (db.settings && db.settings[user.id]) delete db.settings[user.id];

    // 6) Finally, remove the user record
    db.users = db.users.filter((u) => String(u.id) !== String(user.id));

    saveDb(db);
    console.log(`🗑️ Admin ${requester.email} deleted user ${user.email} and associated data (removed ${removedRelationships} relationships)`);
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
        if (!user) {
          console.log(`⚠️ Usuario con ID ${id} no encontrado en Supabase`);
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }

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
        // Respetar is_psychologist de la BD, solo usar role como fallback
        const isPsych = u.is_psychologist !== undefined ? u.is_psychologist : (String(u.role).toUpperCase() === 'PSYCHOLOGIST');
        return { ...u, isPsychologist: isPsych, is_psychologist: isPsych };
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
      let user = db.users.find((u) => u.id === id);
      
      if (!user) {
        console.log(`⚠️ Usuario con ID ${id} no encontrado, verificando si fue eliminado...`);
        // Si el usuario no existe, buscar si hay datos asociados (entradas, goals, etc)
        const userEntries = db.entries?.filter(e => e.userId === id || e.target_user_id === id || e.creator_user_id === id) || [];
        const userGoals = db.goals?.filter(g => g.userId === id || g.patient_user_id === id) || [];
        
        // Si hay datos del usuario antiguo, crear un nuevo usuario y migrar los datos
        if (userEntries.length > 0 || userGoals.length > 0) {
          console.log(`📦 Encontrados datos del usuario eliminado: ${userEntries.length} entradas, ${userGoals.length} objetivos`);
          console.log(`✨ Creando nuevo usuario y migrando datos...`);
          
          // Crear nuevo usuario
          const newUser = {
            id: crypto.randomUUID(),
            name: 'Usuario Recuperado',
            email: `recuperado_${Date.now()}@dygo.app`,
            user_email: `recuperado_${Date.now()}@dygo.app`,
            password: crypto.randomUUID().substring(0, 12),
            role: 'PATIENT',
            isPsychologist: false,
            is_psychologist: false
          };
          
          db.users.push(newUser);
          
          // Migrar entradas
          userEntries.forEach(entry => {
            if (entry.userId === id) entry.userId = newUser.id;
            if (entry.target_user_id === id) entry.target_user_id = newUser.id;
            if (entry.creator_user_id === id) entry.creator_user_id = newUser.id;
          });
          
          // Migrar objetivos
          userGoals.forEach(goal => {
            if (goal.userId === id) goal.userId = newUser.id;
            if (goal.patient_user_id === id) goal.patient_user_id = newUser.id;
          });
          
          // Migrar settings si existen
          if (db.settings && db.settings[id]) {
            db.settings[newUser.id] = db.settings[id];
            delete db.settings[id];
          }
          
          // Migrar relaciones de cuidado
          if (db.careRelationships) {
            db.careRelationships.forEach(rel => {
              if (rel.patient_user_id === id) {
                rel.patient_user_id = newUser.id;
              }
              if (rel.psychologist_user_id === id) {
                rel.psychologist_user_id = newUser.id;
              }
            });
          }
          
          // Migrar invitaciones
          if (db.invitations) {
            db.invitations.forEach(inv => {
              if (inv.patient_user_id === id) {
                inv.patient_user_id = newUser.id;
              }
              if (inv.psychologist_user_id === id) {
                inv.psychologist_user_id = newUser.id;
              }
            });
          }
          
          await saveDb(db, { awaitPersistence: true });
          
          console.log(`✅ Datos migrados exitosamente al nuevo usuario ${newUser.id}`);
          console.log(`⚠️ IMPORTANTE: El usuario debe actualizar su email y contraseña en configuración`);
          
          return res.json(newUser);
        }
        
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

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

app.put('/api/users/:id', async (req, res) => {
  try {
    const db = getDb();
    const idx = db.users.findIndex((u) => u.id === req.params.id);

    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });

    // IMPORTANTE: El email NUNCA se puede cambiar
    if (req.body?.email && req.body.email !== db.users[idx].email) {
      return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
    }

    // Eliminar email del body para asegurar que no se modifique
    const { email, user_email, ...bodyWithoutEmail } = req.body;

    const updated = { ...db.users[idx], ...bodyWithoutEmail };
    if (updated.role) {
      updated.isPsychologist = String(updated.role).toUpperCase() === 'PSYCHOLOGIST';
      updated.is_psychologist = String(updated.role).toUpperCase() === 'PSYCHOLOGIST';
    }
    db.users[idx] = updated;
    await saveDb(db, { awaitPersistence: true });
    return res.json(db.users[idx]);
  } catch (err) {
    console.error('Error in PUT /api/users/:id', err);
    return res.status(500).json({ error: err?.message || 'Error actualizando el usuario' });
  }
});

// PATCH endpoint for updating users (Supabase)
app.patch('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!supabaseAdmin) {
      // Fallback a db.json si no hay Supabase
      const db = getDb();
      const idx = db.users.findIndex((u) => u.id === userId);
      if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
      
      // IMPORTANTE: El email NUNCA se puede cambiar
      if (req.body?.email && req.body.email !== db.users[idx].email) {
        return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
      }
      
      // Eliminar email del body para asegurar que no se modifique
      const { email, user_email, ...bodyWithoutEmail } = req.body;
      
      // Merge data fields
      const currentData = db.users[idx].data || {};
      const newData = bodyWithoutEmail.data || {};
      
      const updated = { 
        ...db.users[idx], 
        ...bodyWithoutEmail,
        data: { ...currentData, ...newData }
      };
      
      db.users[idx] = updated;
      await saveDb(db, { awaitPersistence: true });
      return res.json(db.users[idx]);
    }

    // Con Supabase
    const existingUser = await readSupabaseRowById('users', userId);
    if (!existingUser) {
      console.log(`⚠️ Usuario con ID ${userId} no encontrado en Supabase`);
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // IMPORTANTE: El email NUNCA se puede cambiar
    const currentEmail = existingUser.user_email || existingUser.email;
    if (req.body?.email && normalizeEmail(req.body.email) !== normalizeEmail(currentEmail)) {
      return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
    }
    if (req.body?.user_email && normalizeEmail(req.body.user_email) !== normalizeEmail(currentEmail)) {
      return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
    }

    // Preparar datos para actualizar (sin email)
    const updateFields = {};
    
    // Merge data field (JSONB column) - name, phone y otros campos van aquí
    const currentData = existingUser.data || {};
    const newData = req.body.data || {};
    
    // Agregar name, firstName, lastName, phone al data si vienen en el body
    const mergedData = { ...currentData, ...newData };
    if (req.body.name !== undefined) mergedData.name = req.body.name;
    if (req.body.firstName !== undefined) mergedData.firstName = req.body.firstName;
    if (req.body.lastName !== undefined) mergedData.lastName = req.body.lastName;
    if (req.body.phone !== undefined) mergedData.phone = req.body.phone;
    
    updateFields.data = mergedData;

    // Actualizar en Supabase
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateFields)
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Error actualizando usuario en Supabase:', updateError);
      throw new Error(`Error actualizando usuario: ${updateError.message}`);
    }

    // Obtener usuario actualizado
    const updatedUser = await readSupabaseRowById('users', userId);
    console.log('✅ Usuario actualizado en Supabase:', userId);
    return res.json(updatedUser);
  } catch (err) {
    console.error('Error in PATCH /api/users/:id', err);
    return res.status(500).json({ error: err?.message || 'Error actualizando el usuario' });
  }
});

app.put('/api/users', async (req, res) => {
  try {
    const id = req.query.id || req.query.userId;
    if (!id) return res.status(400).json({ error: 'Missing user id' });

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase no está configurado' });
    }

    const existingUser = await readSupabaseRowById('users', String(id));
    if (!existingUser) {
      console.log(`⚠️ Usuario con ID ${id} no encontrado en Supabase`);
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // IMPORTANTE: El email NUNCA se puede cambiar
    const currentEmail = existingUser.user_email || existingUser.email;
    if (req.body?.email && normalizeEmail(req.body.email) !== normalizeEmail(currentEmail)) {
      return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
    }
    if (req.body?.user_email && normalizeEmail(req.body.user_email) !== normalizeEmail(currentEmail)) {
      return res.status(400).json({ error: 'No se puede cambiar el email del usuario' });
    }

    // Eliminar email del body para asegurar que no se modifique
    const { email, user_email, ...bodyWithoutEmail } = req.body;

    const updated = { ...existingUser, ...bodyWithoutEmail };
    
    // Si el usuario se está convirtiendo en psicólogo
    const isBecomingPsychologist = updated.is_psychologist === true || updated.isPsychologist === true;
    
    // Sincronizar ambos campos
    updated.isPsychologist = isBecomingPsychologist;
    updated.is_psychologist = isBecomingPsychologist;
    
    // Crear psychologist_profile si se convierte en psicólogo y no tiene uno ya
    if (isBecomingPsychologist && !updated.psychologist_profile_id) {
      const profileId = crypto.randomUUID();
      
      const newProfile = {
        id: profileId,
        user_id: id,
        license: '',
        specialties: [],
        bio: '',
        hourly_rate: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { user_id, ...profileData } = newProfile;
      
      const { error: profileError } = await supabaseAdmin
        .from('psychologist_profiles')
        .insert([{ 
          id: profileId,
          user_id: user_id,
          data: profileData 
        }]);
      
      if (profileError) {
        console.error('❌ Error creando perfil de psicólogo en Supabase:', profileError);
        throw new Error(`Error creando perfil: ${profileError.message}`);
      }
      
      console.log(`✓ Nuevo perfil de psicólogo creado en Supabase: ${profileId}`);
      updated.psychologist_profile_id = profileId;
    }
    
    // Actualizar en Supabase (sin cambiar el email)
    const { is_psychologist, isPsychologist, role, email: emailField, user_email: userEmailField, psychologist_profile_id, auth_user_id, ...dataFields } = updated;
    
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        is_psychologist: is_psychologist || false,
        psychologist_profile_id: psychologist_profile_id || null,
        data: dataFields
      })
      .eq('id', id);
    
    if (updateError) {
      console.error('❌ Error actualizando usuario en Supabase:', updateError);
      throw new Error(`Error actualizando usuario: ${updateError.message}`);
    }
    
    console.log('✅ Usuario actualizado en Supabase:', id);
    return res.json(updated);
  } catch (err) {
    console.error('Error in PUT /api/users', err);
    return res.status(500).json({ error: err?.message || 'Error actualizando el usuario' });
  }
});

// --- SUBIDA DE AVATAR ---
app.post('/api/upload-avatar', async (req, res) => {
  try {
    const { userId, base64Image } = req.body;
    
    if (!userId || !base64Image) {
      return res.status(400).json({ error: 'userId y base64Image son requeridos' });
    }

    // Si no hay Supabase configurado, guardar base64 directamente
    if (!supabaseAdmin) {
      console.log('⚠️ Supabase no configurado, guardando base64 directamente');
      const db = getDb();
      const userIdx = db.users.findIndex(u => u.id === userId);
      if (userIdx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
      
      db.users[userIdx].avatarUrl = base64Image;
      await saveDb(db, { awaitPersistence: true });
      return res.json({ url: base64Image });
    }

    try {
      // Obtener el usuario actual para verificar si ya tiene avatar
      const db = getDb();
      const userIdx = db.users.findIndex(u => u.id === userId);
      if (userIdx === -1) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const currentUser = db.users[userIdx];
      
      // Si el usuario ya tiene un avatar en Supabase Storage, eliminarlo
      if (currentUser.avatarUrl && currentUser.avatarUrl.includes('supabase.co/storage')) {
        try {
          // Extraer el path del archivo de la URL
          const urlParts = currentUser.avatarUrl.split('/storage/v1/object/public/avatars/');
          if (urlParts.length > 1) {
            const oldFilePath = `avatars/${urlParts[1]}`;
            const { error: deleteError } = await supabaseAdmin.storage
              .from('avatars')
              .remove([oldFilePath]);
            
            if (deleteError) {
              console.warn('⚠️ Error eliminando avatar anterior:', deleteError);
            } else {
              console.log('🗑️ Avatar anterior eliminado:', oldFilePath);
            }
          }
        } catch (deleteErr) {
          console.warn('⚠️ No se pudo eliminar avatar anterior:', deleteErr);
        }
      }

      // Extraer el tipo MIME y los datos del base64
      const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Formato de imagen base64 inválido');
      }

      const contentType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // Usar nombre de archivo basado solo en userId para sobrescribir automáticamente
      const fileExt = contentType.split('/')[1] || 'jpg';
      const fileName = `${userId}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Subir a Supabase Storage (upsert sobrescribe si existe)
      const { data, error } = await supabaseAdmin.storage
        .from('avatars')
        .upload(filePath, buffer, {
          contentType,
          upsert: true,
          cacheControl: '3600'
        });

      if (error) {
        console.error('Error subiendo a Supabase Storage:', error);
        throw error;
      }

      // Obtener URL pública con timestamp para evitar caché
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('avatars')
        .getPublicUrl(filePath);
      
      // Añadir timestamp para forzar actualización en el navegador
      const updatedUrl = `${publicUrl}?t=${Date.now()}`;

      // Actualizar usuario con la nueva URL
      db.users[userIdx].avatarUrl = updatedUrl;
      await saveDb(db, { awaitPersistence: true });

      console.log('✅ Avatar actualizado para usuario:', userId);
      return res.json({ url: updatedUrl });
    } catch (storageError) {
      console.error('Error con Supabase Storage, usando base64:', storageError);
      // Fallback a base64 si falla Supabase Storage
      const db = getDb();
      const userIdx = db.users.findIndex(u => u.id === userId);
      if (userIdx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
      
      db.users[userIdx].avatarUrl = base64Image;
      await saveDb(db, { awaitPersistence: true });
      return res.json({ url: base64Image });
    }
  } catch (err) {
    console.error('Error in POST /api/upload-avatar', err);
    return res.status(500).json({ error: err?.message || 'Error subiendo avatar' });
  }
});

// --- RUTA PARA SUBIR ARCHIVOS DE SESIÓN ---
app.post('/api/upload-session-file', async (req, res) => {
  try {
    const { userId, base64File, fileName, fileType } = req.body;
    
    if (!userId || !base64File || !fileName) {
      return res.status(400).json({ error: 'userId, base64File y fileName son requeridos' });
    }

    // Check if Supabase is configured
    if (!supabaseAdmin) {
      console.warn('⚠️ Supabase no configurado, usando base64 directamente');
      return res.json({ url: base64File });
    }

    try {
      // Verificar que el bucket 'session-files' existe, si no crearlo
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const sessionBucketExists = buckets?.some(b => b.name === 'session-files');
      
      if (!sessionBucketExists) {
        console.log('📦 Creando bucket session-files...');
        const { error: createError } = await supabaseAdmin.storage.createBucket('session-files', {
          public: false, // Archivos privados por defecto
          fileSizeLimit: 100 * 1024 * 1024 // 100MB limit
        });
        
        if (createError && !createError.message.includes('already exists')) {
          console.error('Error creando bucket:', createError);
          throw createError;
        }
      }

      // Extraer el tipo MIME y los datos del base64
      const matches = base64File.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new Error('Formato de archivo base64 inválido');
      }

      const contentType = matches[1] || fileType || 'application/octet-stream';
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // Generar nombre único para el archivo
      const timestamp = Date.now();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `${userId}/${timestamp}_${safeFileName}`;

      // Subir a Supabase Storage
      const { data, error } = await supabaseAdmin.storage
        .from('session-files')
        .upload(filePath, buffer, {
          contentType,
          upsert: false,
          cacheControl: '3600'
        });

      if (error) {
        console.error('Error subiendo a Supabase Storage:', error);
        throw error;
      }

      // Obtener URL pública (o signed URL si es privado)
      const { data: urlData } = await supabaseAdmin.storage
        .from('session-files')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiration

      const fileUrl = urlData?.signedUrl || base64File;

      console.log('✅ Archivo de sesión subido:', filePath);
      return res.json({ url: fileUrl, path: filePath });
    } catch (storageError) {
      console.error('Error con Supabase Storage, usando base64:', storageError);
      // Fallback a base64 si falla Supabase Storage
      return res.json({ url: base64File });
    }
  } catch (err) {
    console.error('Error in POST /api/upload-session-file', err);
    return res.status(500).json({ error: err?.message || 'Error subiendo archivo de sesión' });
  }
});

// Upload endpoint for entry attachments (base64)
app.post('/api/upload', async (req, res) => {
  try {
    console.log('📥 POST /api/upload recibido');
    console.log('📦 Body keys:', Object.keys(req.body || {}));
    console.log('📦 Body:', JSON.stringify(req.body || {}).substring(0, 200));
    
    const { fileName, fileType, fileData, userId, folder = 'patient-attachments', fileSize } = req.body;

    console.log('📝 Datos extraídos:', { 
      hasFileName: !!fileName, 
      hasFileData: !!fileData, 
      fileDataLength: fileData?.length || 0,
      userId,
      folder 
    });

    if (!fileData || !fileName) {
      console.error('❌ Falta fileData o fileName');
      return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase no está configurado' });
    }

    // Convertir base64 a Buffer
    const fileBuffer = Buffer.from(fileData, 'base64');

    // Verificar que el bucket existe
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === folder);
    
    if (!bucketExists) {
      console.log(`📦 Creando bucket ${folder}...`);
      const { error: createError } = await supabaseAdmin.storage.createBucket(folder, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024 // 50MB limit
      });
      
      if (createError && !createError.message.includes('already exists')) {
        console.error('Error creando bucket:', createError);
        return res.status(500).json({ error: 'Error creando bucket' });
      }
    }

    // Generar nombre único
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId || 'unknown'}/${timestamp}_${safeFileName}`;

    // Subir a Supabase Storage
    const { data, error } = await supabaseAdmin.storage
      .from(folder)
      .upload(filePath, fileBuffer, {
        contentType: fileType || 'application/octet-stream',
        upsert: false,
        cacheControl: '3600'
      });

    if (error) {
      console.error('Error subiendo a Supabase Storage:', error);
      return res.status(500).json({ error: 'Error subiendo archivo' });
    }

    // Obtener URL pública
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(folder)
      .getPublicUrl(filePath);

    console.log('✅ Archivo adjunto subido:', filePath);
    return res.json({ url: publicUrl, path: filePath });
  } catch (err) {
    console.error('Error in POST /api/upload', err);
    return res.status(500).json({ error: err?.message || 'Error procesando el archivo' });
  }
});

// --- RUTAS DE ENTRADAS (ENTRIES) ---
app.get('/api/entries', async (req, res) => {
  try {
    const { userId, viewerId, startDate, endDate, limit } = req.query;

    if (supabaseAdmin) {
      // Si se solicita un userId específico, cargar solo sus entries
      let entries = [];
      if (userId) {
        entries = await loadEntriesForUser(String(userId));
      } else {
        // Sin userId, no cargar nada (evitar cargar toda la tabla)
        console.warn('⚠️ GET /api/entries sin userId - no se cargan entries');
        return res.json([]);
      }
      
      // Aplicar filtros de fecha si están presentes
      if (startDate || endDate) {
        entries = entries.filter(e => {
          if (!e.timestamp && !e.date) return true;
          const entryDate = e.date || new Date(e.timestamp).toISOString().split('T')[0];
          if (startDate && entryDate < startDate) return false;
          if (endDate && entryDate > endDate) return false;
          return true;
        });
      }
      
      if (userId) {
        const ids = new Set([String(userId)]);
        try {
          const user = await readSupabaseRowById('users', String(userId));
          if (user?.supabaseId) ids.add(String(user.supabaseId));
          if (user?.email) ids.add(String(user.email).trim().toLowerCase());
        } catch (e) {
          // ignore lookup errors
        }
        
        // Filtrar por target_user_id (nuevo esquema) o userId (compatibilidad)
        let filtered = entries.filter((e) => {
          // Priorizar target_user_id si existe
          if (e.target_user_id) {
            return ids.has(String(e.target_user_id).trim());
          }
          // Fallback a userId para compatibilidad
          const uid = String(e.userId || '').trim();
          const uemail = String(e.userEmail || e.email || '').trim().toLowerCase();
          return ids.has(uid) || (uemail && ids.has(uemail));
        });
        
        // Si viewerId está presente, aplicar filtrado según estado de relación
        if (viewerId && String(viewerId) !== String(userId)) {
          const relationshipsSource = (supabaseDbCache?.careRelationships && supabaseDbCache.careRelationships.length > 0)
            ? supabaseDbCache.careRelationships
            : (getDb().careRelationships || []);
          const relationship = relationshipsSource.find(rel => 
            (rel.psychologist_user_id === String(viewerId) && rel.patient_user_id === String(userId)) ||
            (rel.psychologist_user_id === String(userId) && rel.patient_user_id === String(viewerId))
          );
          
          // Si la relación está finalizada, solo mostrar entradas creadas por el psicólogo (viewer)
          if (relationship?.endedAt) {
            console.log('[GET /api/entries] Relación finalizada - mostrando solo entradas del psicólogo:', viewerId);
            filtered = filtered.filter(e => {
              // Usar creator_user_id si existe, sino createdByPsychologistId
              const creatorId = e.creator_user_id || e.createdByPsychologistId;
              return creatorId === String(viewerId);
            });
          } else {
            // Relación activa: mostrar entradas del paciente + entradas del psicólogo
            console.log('[GET /api/entries] Relación activa - mostrando entradas del paciente y del psicólogo:', viewerId);
            filtered = filtered.filter(e => {
              // Usar creator_user_id si existe, sino createdByPsychologistId
              const creatorId = e.creator_user_id || e.createdByPsychologistId;
              
              // Incluir:
              // 1. Entradas creadas por el psicólogo (viewer)
              if (creatorId === String(viewerId)) return true;
              // 2. Entradas del paciente que no tienen createdByPsychologistId (son propias del paciente)
              if (!creatorId && e.createdBy !== 'PSYCHOLOGIST') return true;
              // 3. Excluir entradas creadas por OTROS psicólogos
              return false;
            });
          }
        }
        
        // Aplicar límite si está especificado
        if (limit) {
          const limitNum = parseInt(limit);
          if (!isNaN(limitNum) && limitNum > 0) {
            filtered = filtered.slice(0, limitNum);
          }
        }
        
        return res.json(filtered);
      }
      
      // Aplicar límite si está especificado
      if (limit) {
        const limitNum = parseInt(limit);
        if (!isNaN(limitNum) && limitNum > 0) {
          entries = entries.slice(0, limitNum);
        }
      }
      
      return res.json(entries);
    }

    const db = getDb();

    let entries = userId
      ? db.entries.filter((e) => {
          // Filtrar por target_user_id (nuevo esquema) o userId (compatibilidad)
          return String(e.target_user_id) === String(userId) || String(e.userId) === String(userId);
        })
      : db.entries;
    
    // Aplicar filtros de fecha para db.json
    if (startDate || endDate) {
      entries = entries.filter(e => {
        if (!e.timestamp && !e.date) return true;
        const entryDate = e.date || new Date(e.timestamp).toISOString().split('T')[0];
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }
    
    // Si viewerId está presente, verificar si la relación está finalizada
    if (userId && viewerId && String(viewerId) !== String(userId)) {
      const relationship = (db.careRelationships || []).find(rel => 
        (rel.psychologist_user_id === String(viewerId) && rel.patient_user_id === String(userId)) ||
        (rel.psychologist_user_id === String(userId) && rel.patient_user_id === String(viewerId))
      );
      
      // Si la relación está finalizada, solo mostrar entradas creadas por el viewer
      if (relationship?.endedAt) {
        console.log('[GET /api/entries] Relación finalizada - filtrando entradas creadas por viewer:', viewerId);
        entries = entries.filter(e => {
          if (e.createdByPsychologistId) {
            return e.createdByPsychologistId === String(viewerId);
          }
          return false;
        });
      }
    }
    
    // Aplicar límite si está especificado
    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        entries = entries.slice(0, limitNum);
      }
    }

    res.json(entries);
  } catch (err) {
    console.error('Error in /api/entries', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/entries', (req, res) => {
  const entry = req.body;

  // Si la entrada la crea un psicólogo para un paciente, validar que la relación esté activa
  try {
    // Determinar quién crea y a quién va dirigida la entrada
    const creatorId = entry?.creator_user_id || (entry.createdBy === 'PSYCHOLOGIST' ? entry.createdByPsychologistId : entry.userId);
    const targetId = entry?.target_user_id || entry.userId;
    
    // Si el creador y el objetivo son diferentes (psicólogo creando para paciente)
    if (creatorId && targetId && String(creatorId) !== String(targetId)) {
      const findRelationship = () => {
        if (supabaseDbCache?.careRelationships) {
          return supabaseDbCache.careRelationships.find(rel => 
            rel.psychologist_user_id === String(creatorId) && rel.patient_user_id === String(targetId)
          );
        }
        const db = getDb();
        if (!Array.isArray(db.careRelationships)) return null;
        return db.careRelationships.find(rel => 
          rel.psychologist_user_id === String(creatorId) && rel.patient_user_id === String(targetId)
        );
      };

      const relationship = findRelationship();
      if (!relationship) {
        console.warn('[POST /api/entries] ❌ Relación no encontrada para crear entrada clínica', { creatorId, targetId });
        return res.status(403).json({ error: 'No existe una relación activa con este paciente' });
      }
      if (relationship.endedAt) {
        console.warn('[POST /api/entries] ❌ Relación finalizada, bloqueo de creación de entrada', { creatorId, targetId, endedAt: relationship.endedAt });
        return res.status(403).json({ error: 'La relación está finalizada. No se pueden crear nuevas entradas.' });
      }
    }
  } catch (validationErr) {
    console.error('[POST /api/entries] Error validando relación', validationErr);
    return res.status(500).json({ error: 'No se pudo validar la relación' });
  }

  // Si no viene id, generamos uno
  if (!entry.id) {
    entry.id = crypto.randomUUID();
  }
  
  // Asegurar que creator_user_id y target_user_id estén definidos
  if (!entry.creator_user_id) {
    entry.creator_user_id = entry.createdBy === 'PSYCHOLOGIST' ? entry.createdByPsychologistId : entry.userId;
  }
  if (!entry.target_user_id) {
    entry.target_user_id = entry.userId;
  }

  if (supabaseAdmin) {
    (async () => {
      try {
        console.log('[POST /api/entries] 💾 Guardando entrada en Supabase:', {
          id: entry.id,
          userId: entry.userId,
          creator_user_id: entry.creator_user_id,
          target_user_id: entry.target_user_id,
          hasTranscript: !!entry.transcript,
          transcriptLength: entry.transcript?.length || 0,
          summary: entry.summary?.substring(0, 50) + '...',
          entryType: entry.psychologistEntryType || entry.createdBy
        });
        
        const payload = buildSupabaseEntryRow(entry);
        console.log('[POST /api/entries] 📝 Payload a enviar:', JSON.stringify(payload, null, 2).substring(0, 500));
        
        await trySupabaseUpsert('entries', [payload]);

        if (supabaseDbCache?.entries) {
          const idx = supabaseDbCache.entries.findIndex(e => e.id === entry.id);
          if (idx >= 0) supabaseDbCache.entries[idx] = entry;
          else supabaseDbCache.entries.unshift(entry);
        }
        
        console.log('[POST /api/entries] ✅ Entrada guardada exitosamente en Supabase');
        return res.json(entry);
      } catch (err) {
        console.error('[POST /api/entries] ❌ Error saving entry (supabase)', err);
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
        const payload = buildSupabaseEntryRow(updated);

        await trySupabaseUpsert('entries', [payload]);

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
        const payload = buildSupabaseEntryRow(updated);

        await trySupabaseUpsert('entries', [payload]);

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
app.get('/api/goals', async (req, res) => {
  const { userId } = req.query;

  // Leer desde Supabase si está disponible
  if (supabaseAdmin) {
    try {
      console.log('[GET /api/goals] 📖 Obteniendo goals desde Supabase:', { userId });
      
      let query = supabaseAdmin.from('goals').select('*');
      
      if (userId) {
        query = query.eq('patient_user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[GET /api/goals] ❌ Error obteniendo goals:', error);
        throw error;
      }

      // Normalizar los datos: extraer el campo data de cada row
      const goals = (data || []).map(row => ({
        ...row.data,
        id: row.id,
        userId: row.patient_user_id
      }));

      console.log('[GET /api/goals] ✅ Goals obtenidos exitosamente:', goals.length);
      return res.json(goals);
    } catch (err) {
      console.error('[GET /api/goals] ❌ Error:', err);
      return res.status(500).json({ error: 'Error obteniendo goals desde Supabase' });
    }
  }

  // Fallback a db.json si Supabase no está disponible
  const db = getDb();
  const safeGoals = Array.isArray(db.goals) ? db.goals : [];

  const goals = userId
    ? safeGoals.filter((g) => String(g.userId) === String(userId))
    : safeGoals;

  res.json(goals);
});


// Sincronizar metas completas de un usuario
const handleGoalsSync = async (req, res) => {
  const { userId, goals } = req.body || {};
  if (!userId || !Array.isArray(goals)) {
    return res.status(400).json({ error: 'userId y goals son obligatorios' });
  }

  // Guardar en Supabase si está disponible
  if (supabaseAdmin) {
    try {
      console.log('[handleGoalsSync] 💾 Sincronizando goals en Supabase:', {
        userId,
        goalsCount: goals.length
      });

      // 1. Eliminar todos los goals existentes del usuario
      const { error: deleteError } = await supabaseAdmin
        .from('goals')
        .delete()
        .eq('patient_user_id', userId);

      if (deleteError) {
        console.error('[handleGoalsSync] ❌ Error eliminando goals existentes:', deleteError);
        throw deleteError;
      }

      // 2. Insertar los nuevos goals si hay alguno
      if (goals.length > 0) {
        const goalsToInsert = goals.map(goal => ({
          id: goal.id,
          patient_user_id: userId,
          data: goal
        }));

        const { error: insertError } = await supabaseAdmin
          .from('goals')
          .insert(goalsToInsert);

        if (insertError) {
          console.error('[handleGoalsSync] ❌ Error insertando nuevos goals:', insertError);
          throw insertError;
        }
      }

      // Actualizar caché si existe
      if (supabaseDbCache?.goals) {
        supabaseDbCache.goals = supabaseDbCache.goals.filter(g => g.userId !== userId);
        supabaseDbCache.goals.push(...goals);
      }

      console.log('[handleGoalsSync] ✅ Goals sincronizados exitosamente en Supabase');
      return res.json({ success: true });
    } catch (err) {
      console.error('[handleGoalsSync] ❌ Error guardando goals en Supabase:', err);
      return res.status(500).json({ error: 'Error sincronizando goals en Supabase' });
    }
  }

  // Fallback a db.json si Supabase no está disponible
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
  
  // Prevenir caché del navegador
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.json(db.invitations);
});

app.post('/api/invitations', async (req, res) => {
  console.log('📥 POST /api/invitations - Body:', req.body);
  const db = getDb();
  const invitation = req.body;

  if (!invitation.id) {
    invitation.id = crypto.randomUUID();
  }

  // Soportar tanto campos nuevos como legacy
  const psychUserId = invitation.psych_user_id || invitation.psychologistId;
  const psychUserEmail = invitation.psych_user_email || invitation.psychologistEmail;
  const patientUserEmail = invitation.patient_user_email || invitation.patientEmail;

  // Asegurar que tenemos los campos necesarios
  if (!psychUserId || !psychUserEmail || !patientUserEmail) {
    return res.status(400).json({ error: 'Se requieren psych_user_id, psych_user_email y patient_user_email' });
  }

  // Normalizar emails
  const normalizedPsychEmail = normalizeEmail(psychUserEmail);
  const normalizedPatientEmail = normalizeEmail(patientUserEmail);

  // Verificar auto-invitación
  if (normalizedPsychEmail === normalizedPatientEmail) {
    console.log('❌ Intento de auto-invitación bloqueado:', normalizedPsychEmail);
    return res.status(400).json({ error: 'No puedes enviarte una invitación a ti mismo' });
  }

  // Verificar si ya existe una invitación pendiente
  const existingInv = db.invitations.find(i => {
    const iPsychEmail = normalizeEmail(i.psych_user_email || i.psychologistEmail);
    const iPatientEmail = normalizeEmail(i.patient_user_email || i.patientEmail || i.toUserEmail);
    return iPsychEmail === normalizedPsychEmail && 
           iPatientEmail === normalizedPatientEmail && 
           i.status === 'PENDING';
  });
  
  if (existingInv) {
    console.log('❌ Ya existe invitación pendiente:', existingInv.id);
    return res.status(400).json({ error: 'Ya existe una invitación pendiente entre este psicólogo y paciente' });
  }

  // Asegurar que status sea PENDING siempre
  invitation.status = 'PENDING';
  invitation.timestamp = invitation.timestamp || Date.now();
  invitation.createdAt = invitation.createdAt || new Date().toISOString();
  
  // Normalizar a nuevos campos
  invitation.psych_user_id = psychUserId;
  invitation.psych_user_email = psychUserEmail;
  invitation.patient_user_email = patientUserEmail;
  invitation.psych_user_name = invitation.psych_user_name || invitation.psychologistName;
  invitation.patient_user_name = invitation.patient_user_name || invitation.patientName;
  invitation.patient_first_name = invitation.patient_first_name || invitation.patientFirstName;
  invitation.patient_last_name = invitation.patient_last_name || invitation.patientLastName;

  // Verificar si el paciente ya existe
  const existingPatient = db.users.find(u => normalizeEmail(u.email) === normalizedPatientEmail);
  if (existingPatient) {
    console.log(`✅ Paciente ${normalizedPatientEmail} ya existe: ${existingPatient.id}`);
    invitation.patient_user_id = existingPatient.id;
    invitation.patient_user_name = invitation.patient_user_name || existingPatient.name;
    // Mantener compatibilidad legacy
    invitation.patientId = existingPatient.id;
  } else {
    console.log(`📧 Paciente ${normalizedPatientEmail} no existe - invitación queda PENDING`);
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

  // Si la actualización incluye status='ACCEPTED', eliminar la invitación
  // en lugar de actualizarla (solo deberían existir invitaciones PENDING)
  if (req.body.status === 'ACCEPTED') {
    const acceptedInvitation = db.invitations[idx];
    db.invitations = db.invitations.filter((i) => i.id !== req.params.id);
    console.log(`🗑️ Invitación ${req.params.id} eliminada al ser aceptada`);
    saveDb(db);
    return res.json({ ...acceptedInvitation, ...req.body, deleted: true });
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

  // Si la actualización incluye status='ACCEPTED', eliminar la invitación
  // en lugar de actualizarla (solo deberían existir invitaciones PENDING)
  if (req.body.status === 'ACCEPTED') {
    const acceptedInvitation = db.invitations[idx];
    db.invitations = db.invitations.filter((i) => i.id !== id);
    console.log(`🗑️ Invitación ${id} eliminada al ser aceptada`);
    saveDb(db);
    return res.json({ ...acceptedInvitation, ...req.body, deleted: true });
  }

  db.invitations[idx] = { ...db.invitations[idx], ...req.body };
  saveDb(db);
  res.json(db.invitations[idx]);
});

app.delete('/api/invitations/:id', (req, res) => {
  console.log('🗑️ [DELETE /api/invitations/:id] Iniciando revocación de invitación:', req.params.id);
  const prevDb = getDb();
  console.log('📊 [DELETE /api/invitations/:id] Invitaciones antes:', prevDb.invitations.length);
  const db = { ...prevDb };
  const before = db.invitations.length;
  const deletedInvitation = db.invitations.find((i) => i.id === req.params.id);
  db.invitations = db.invitations.filter((i) => i.id !== req.params.id);

  if (db.invitations.length === before) {
    console.log('❌ [DELETE /api/invitations/:id] Invitación no encontrada:', req.params.id);
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  console.log('✅ [DELETE /api/invitations/:id] Invitación eliminada del cache:', deletedInvitation);
  
  // Eliminar también la care_relationship si existe
  if (deletedInvitation && deletedInvitation.toUserId) {
    const removedRel = removeCareRelationshipByPair(db, deletedInvitation.fromPsychologistId, deletedInvitation.toUserId);
    if (removedRel) {
      console.log('🔗 [DELETE /api/invitations/:id] Relación de cuidado eliminada también');
    }
  }
  
  console.log('📊 [DELETE /api/invitations/:id] Invitaciones después:', db.invitations.length);

  // Pasar prevDb como segundo argumento para que deleteMissing funcione en Supabase
  if (supabaseAdmin) {
    const prevCache = supabaseDbCache;
    console.log('🔄 [DELETE /api/invitations/:id] Iniciando persistencia en Supabase...');
    console.log('📊 [DELETE /api/invitations/:id] prevCache.invitations:', prevCache.invitations?.length || 0);
    console.log('📊 [DELETE /api/invitations/:id] db.invitations:', db.invitations.length);
    saveDb(db);
    supabaseDbCache = db;
    persistSupabaseData(db, prevCache).then(() => {
      console.log('✅ [DELETE /api/invitations/:id] Persistencia en Supabase completada exitosamente');
    }).catch(err => {
      console.error('❌ [DELETE /api/invitations/:id] Error persistiendo eliminación de invitación en Supabase:', err);
    });
  } else {
    console.log('💾 [DELETE /api/invitations/:id] Guardando solo en archivo local (sin Supabase)');
    saveDb(db);
  }
  
  // Prevenir caché y devolver lista actualizada
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.json({ success: true, remainingInvitations: db.invitations });
});

app.delete('/api/invitations', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing invitation id' });

  console.log('🗑️ [DELETE /api/invitations] Iniciando revocación de invitación (query):', id);
  const prevDb = getDb();
  console.log('📊 [DELETE /api/invitations] Invitaciones antes:', prevDb.invitations.length);
  const db = { ...prevDb };
  const before = db.invitations.length;
  const deletedInvitation = db.invitations.find((i) => i.id === id);
  db.invitations = db.invitations.filter((i) => i.id !== id);

  if (db.invitations.length === before) {
    console.log('❌ [DELETE /api/invitations] Invitación no encontrada:', id);
    return res.status(404).json({ error: 'Invitación no encontrada' });
  }

  console.log('✅ [DELETE /api/invitations] Invitación eliminada del cache:', deletedInvitation);
  
  // Eliminar también la care_relationship si existe
  if (deletedInvitation && deletedInvitation.toUserId) {
    const removedRel = removeCareRelationshipByPair(db, deletedInvitation.fromPsychologistId, deletedInvitation.toUserId);
    if (removedRel) {
      console.log('🔗 [DELETE /api/invitations] Relación de cuidado eliminada también');
    }
  }
  
  console.log('📊 [DELETE /api/invitations] Invitaciones después:', db.invitations.length);

  // Pasar prevDb como segundo argumento para que deleteMissing funcione en Supabase
  if (supabaseAdmin) {
    const prevCache = supabaseDbCache;
    console.log('🔄 [DELETE /api/invitations] Iniciando persistencia en Supabase...');
    console.log('📊 [DELETE /api/invitations] prevCache.invitations:', prevCache.invitations?.length || 0);
    console.log('📊 [DELETE /api/invitations] db.invitations:', db.invitations.length);
    saveDb(db);
    supabaseDbCache = db;
    persistSupabaseData(db, prevCache).then(() => {
      console.log('✅ [DELETE /api/invitations] Persistencia en Supabase completada exitosamente');
    }).catch(err => {
      console.error('❌ [DELETE /api/invitations] Error persistiendo eliminación de invitación en Supabase:', err);
    });
  } else {
    console.log('💾 [DELETE /api/invitations] Guardando solo en archivo local (sin Supabase)');
    saveDb(db);
  }
  
  // Prevenir caché y devolver lista actualizada
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.json({ success: true, remainingInvitations: db.invitations });
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

// Health check específico para Supabase
app.get('/api/health/supabase', async (_req, res) => {
  try {
    // Verificar si Supabase está configurado
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ 
        connected: false, 
        error: 'Supabase no está configurado',
        configured: false
      });
    }

    // Verificar si el cliente de Supabase está inicializado
    if (!supabaseAdmin) {
      return res.status(503).json({ 
        connected: false, 
        error: 'Cliente de Supabase no inicializado',
        configured: true
      });
    }

    // Intentar una consulta simple para verificar conectividad
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);

      if (error) {
        console.error('❌ Supabase health check failed:', error);
        return res.status(503).json({ 
          connected: false, 
          error: error.message,
          code: error.code,
          configured: true
        });
      }

      return res.json({ 
        connected: true, 
        configured: true,
        timestamp: new Date().toISOString()
      });
    } catch (queryError) {
      console.error('❌ Supabase query error:', queryError);
      return res.status(503).json({ 
        connected: false, 
        error: queryError.message || 'Error al consultar Supabase',
        configured: true
      });
    }
  } catch (err) {
    console.error('❌ Supabase health check error:', err);
    return res.status(500).json({ 
      connected: false, 
      error: String(err),
      configured: !!SUPABASE_URL && !!SUPABASE_SERVICE_ROLE_KEY
    });
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
app.get('/api/invoices', async (req, res) => {
  try {
    const psychologistId = req.query.psychologist_user_id || req.query.psych_user_id || req.query.psychologistId;
    const patientId = req.query.patient_user_id || req.query.patientId;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    console.log('📋 [GET /api/invoices] Parámetros:', { psychologistId, patientId, startDate, endDate });
    
    if (!psychologistId && !patientId) {
      return res.status(400).json({ error: 'Missing psychologistId or patientId' });
    }

    let invoices = [];

    // Consultar Supabase si está disponible
    if (supabaseAdmin) {
      try {
        const invoicesRows = await readTable('invoices');
        console.log(`📋 [GET /api/invoices] Filas leídas de Supabase: ${invoicesRows.length}`);
        if (invoicesRows.length > 0) {
          console.log('📋 [GET /api/invoices] Primera fila raw:', JSON.stringify(invoicesRows[0], null, 2).substring(0, 500));
        }
        invoices = invoicesRows.map(normalizeSupabaseRow);
        console.log(`📊 [GET /api/invoices] Encontradas ${invoices.length} facturas en Supabase después de normalizar`);
        if (invoices.length > 0) {
          console.log('📊 [GET /api/invoices] Primera factura normalizada:', {
            id: invoices[0].id,
            psychologist_user_id: invoices[0].psychologist_user_id,
            psychologistId: invoices[0].psychologistId,
            patient_user_id: invoices[0].patient_user_id,
            invoiceNumber: invoices[0].invoiceNumber
          });
        }
      } catch (err) {
        console.error('Error reading invoices from Supabase:', err);
        // Fallback a DB local si falla Supabase
        const db = getDb();
        if (!db.invoices) db.invoices = [];
        invoices = db.invoices;
      }
    } else {
      // Usar DB local
      const db = getDb();
      if (!db.invoices) db.invoices = [];
      invoices = db.invoices;
    }
    
    console.log(`📋 [GET /api/invoices] Facturas antes de filtrar: ${invoices.length}`);
    
    // Filtrar por psychologist_user_id (nuevo esquema) o psychologistId (compatibilidad)
    if (psychologistId) {
      invoices = invoices.filter(inv => {
        const match = inv.psychologist_user_id === psychologistId || inv.psychologistId === psychologistId;
        if (!match && invoices.length < 5) {
          console.log('📋 [GET /api/invoices] Factura no coincide:', {
            id: inv.id,
            psychologist_user_id: inv.psychologist_user_id,
            psychologistId: inv.psychologistId,
            buscando: psychologistId
          });
        }
        return match;
      });
      console.log(`📋 [GET /api/invoices] Facturas después de filtrar por psychologist: ${invoices.length}`);
    }
    
    // Filtrar por patient_user_id (nuevo esquema) o patientId (compatibilidad)
    if (patientId) {
      invoices = invoices.filter(inv => 
        inv.patient_user_id === patientId || inv.patientId === patientId
      );
      console.log(`📋 [GET /api/invoices] Facturas después de filtrar por patient: ${invoices.length}`);
    }
    
    // Filter by date range
    if (startDate || endDate) {
      invoices = invoices.filter(inv => {
        // Usar invoice_date primero, luego date, luego created_at como fallback
        const invDate = inv.invoice_date || inv.date || inv.created_at?.split('T')[0];
        if (!invDate) return true;
        if (startDate && invDate < startDate) return false;
        if (endDate && invDate > endDate) return false;
        return true;
      });
    }
    
    console.log(`✅ [GET /api/invoices] Devolviendo ${invoices.length} facturas`);
    res.json(invoices);
  } catch (error) {
    console.error('Error in GET /api/invoices:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
    const invoice = { ...req.body, id: req.body.id || Date.now().toString() };

    const headerUserId = req.headers['x-user-id'] || req.headers['x-userid'];
    const psychologistUserId = invoice.psychologist_user_id || invoice.psych_user_id || invoice.psychologistId || headerUserId;
    if (!psychologistUserId) {
      return res.status(400).json({ error: 'psychologist_user_id es obligatorio para crear la factura' });
    }

    // Canonical ID for schema; mantener campo legacy para compatibilidad
    invoice.psychologist_user_id = psychologistUserId;
    invoice.psychologistId = invoice.psychologistId || psychologistUserId;

    // Asegurar patient_user_id
    if (!invoice.patient_user_id && invoice.patientId) {
      invoice.patient_user_id = invoice.patientId;
    }
    
    // Manejar tipo de factura (patient o center)
    if (!invoice.invoice_type) {
      invoice.invoice_type = 'patient';
    }
    
    // Manejar status: draft o issued
    if (!invoice.status || !['draft', 'pending', 'paid', 'overdue', 'cancelled'].includes(invoice.status)) {
      invoice.status = 'draft';
    }

    // Guardar en Supabase si está disponible (PRIMERO)
    if (supabaseAdmin) {
      try {
        console.log('📤 [POST /api/invoices] Invoice recibido:', JSON.stringify(invoice, null, 2).substring(0, 800));
        
        // Validar que ninguna sesión tenga bonus_id asignado
        if (invoice.sessionIds && invoice.sessionIds.length > 0) {
          const { data: sessionsWithBonus, error: bonusCheckError } = await supabaseAdmin
            .from('sessions')
            .select('id, bonus_id, invoice_id')
            .in('id', invoice.sessionIds)
            .not('bonus_id', 'is', null);
          
          if (bonusCheckError) {
            console.error('❌ Error verificando bonus_id en sesiones:', bonusCheckError);
            throw bonusCheckError;
          }
          
          if (sessionsWithBonus && sessionsWithBonus.length > 0) {
            const sessionIdsWithBonus = sessionsWithBonus.map(s => s.id).join(', ');
            console.error('[POST /api/invoices] Sesiones con bonus_id detectadas:', sessionIdsWithBonus);
            return res.status(400).json({ 
              error: 'No se puede crear una factura con sesiones que ya tienen un bono asignado',
              sessionIds: sessionsWithBonus.map(s => s.id)
            });
          }
          
          // Validar que ninguna sesión ya esté facturada (a menos que sea un borrador)
          const sessionsAlreadyInvoiced = sessionsWithBonus.filter(s => s.invoice_id && s.invoice_id !== invoice.id);
          if (sessionsAlreadyInvoiced.length > 0) {
            return res.status(400).json({ 
              error: 'Algunas sesiones ya están facturadas',
              sessionIds: sessionsAlreadyInvoiced.map(s => s.id)
            });
          }
        }
        
        // Validar bonos
        if (invoice.bonoIds && invoice.bonoIds.length > 0) {
          const { data: bonosAlreadyInvoiced, error: bonoCheckError } = await supabaseAdmin
            .from('bono')
            .select('id, invoice_id')
            .in('id', invoice.bonoIds)
            .not('invoice_id', 'is', null);
          
          if (bonoCheckError) {
            console.error('❌ Error verificando invoice_id en bonos:', bonoCheckError);
            throw bonoCheckError;
          }
          
          const bonosWithInvoice = (bonosAlreadyInvoiced || []).filter(b => b.invoice_id && b.invoice_id !== invoice.id);
          if (bonosWithInvoice.length > 0) {
            return res.status(400).json({ 
              error: 'Algunos bonos ya están facturados',
              bonoIds: bonosWithInvoice.map(b => b.id)
            });
          }
        }
        
        const supabasePayload = buildSupabaseInvoiceRow(invoice);
        console.log('📦 [POST /api/invoices] Payload para Supabase:', JSON.stringify(supabasePayload, null, 2));
        await trySupabaseUpsert('invoices', [supabasePayload]);
        console.log('✅ Factura guardada en Supabase con ID:', invoice.id);
        
        // Si no es borrador, asignar invoice_id a sesiones y bonos
        if (invoice.status !== 'draft') {
          if (invoice.sessionIds && invoice.sessionIds.length > 0) {
            const { error: sessionUpdateError } = await supabaseAdmin
              .from('sessions')
              .update({ invoice_id: invoice.id })
              .in('id', invoice.sessionIds);
            
            if (sessionUpdateError) {
              console.error('⚠️ Error asignando invoice_id a sesiones:', sessionUpdateError);
            } else {
              console.log(`✅ invoice_id asignado a ${invoice.sessionIds.length} sesiones`);
            }
          }
          
          if (invoice.bonoIds && invoice.bonoIds.length > 0) {
            const { error: bonoUpdateError } = await supabaseAdmin
              .from('bono')
              .update({ invoice_id: invoice.id })
              .in('id', invoice.bonoIds);
            
            if (bonoUpdateError) {
              console.error('⚠️ Error asignando invoice_id a bonos:', bonoUpdateError);
            } else {
              console.log(`✅ invoice_id asignado a ${invoice.bonoIds.length} bonos`);
            }
          }
        }
        
        // Verificar que se guardó correctamente leyendo desde Supabase
        const { data: verifyData, error: verifyError } = await supabaseAdmin
          .from('invoices')
          .select('id, data')
          .eq('id', invoice.id)
          .single();
        
        if (verifyError) {
          console.error('⚠️ No se pudo verificar la factura guardada:', verifyError);
        } else {
          console.log('✅ Verificación exitosa - Factura existe en Supabase:', verifyData?.id);
        }
        
        // Devolver el invoice con los campos normalizados de Supabase
        return res.json({
          ...invoice,
          amount: supabasePayload.amount,
          tax: supabasePayload.tax,
          total: supabasePayload.total,
          status: supabasePayload.status
        });
      } catch (err) {
        console.error('❌ Error guardando factura en Supabase:', err);
        console.error('❌ Stack trace:', err.stack);
        return res.status(500).json({ error: 'Error guardando factura en Supabase', details: err.message });
      }
    }
    
    // Fallback: Guardar en DB local solo si NO hay Supabase
    const db = getDb();
    if (!db.invoices) db.invoices = [];
    
    // Adjuntar información del usuario que genera la factura (sin contraseña)
    const dbUser = (db.users || []).find(u => String(u.id) === String(psychologistUserId));
    if (dbUser) {
      const { password, ...safeUser } = dbUser;
      const normalizedUser = {
        ...safeUser,
        is_psychologist: safeUser.is_psychologist ?? (safeUser.isPsychologist ?? (safeUser.role === 'PSYCHOLOGIST')),
        isPsychologist: safeUser.is_psychologist ?? (safeUser.isPsychologist ?? (safeUser.role === 'PSYCHOLOGIST'))
      };
      invoice.psychologist_user = normalizedUser;
    }
    
    db.invoices.push(invoice);
    saveDb(db);

    res.json(invoice);
  } catch (error) {
    console.error('Error in POST /api/invoices:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
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

// Update invoice (solo si es draft)
app.patch('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    console.log(`📝 [PATCH /api/invoices/${id}] Actualizando factura con:`, updates);
    
    // SIEMPRE consultar desde Supabase primero si está disponible
    if (supabaseAdmin) {
      try {
        // Leer la factura actual desde Supabase
        const { data: currentInvoices, error: readError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', id)
          .limit(1);
        
        if (readError) {
          console.error('❌ Error leyendo factura desde Supabase:', readError);
          throw readError;
        }
        
        if (!currentInvoices || currentInvoices.length === 0) {
          console.error('❌ Factura no encontrada en Supabase:', id);
          return res.status(404).json({ error: 'Invoice not found in Supabase' });
        }
        
        const currentInvoice = normalizeSupabaseRow(currentInvoices[0]);
        
        // Si solo se está actualizando el estado (paid/pending), permitirlo
        const isStatusOnlyUpdate = Object.keys(updates).length === 1 && 
                                    updates.status && 
                                    (updates.status === 'paid' || updates.status === 'pending');
        
        // Solo permitir editar completamente si es draft, pero permitir cambio de estado siempre
        if (currentInvoice.status !== 'draft' && !isStatusOnlyUpdate) {
          return res.status(403).json({ error: 'Solo se pueden editar facturas en estado borrador' });
        }
        
        const updatedInvoice = { ...currentInvoice, ...updates };
        
        // Si se está convirtiendo de draft a issued/pending, asignar invoice_id a sesiones y bonos
        if (currentInvoice.status === 'draft' && updates.status && updates.status !== 'draft') {
          if (updatedInvoice.sessionIds && updatedInvoice.sessionIds.length > 0) {
            const { error: sessionUpdateError } = await supabaseAdmin
              .from('sessions')
              .update({ invoice_id: id })
              .in('id', updatedInvoice.sessionIds);
            
            if (sessionUpdateError) {
              console.error('⚠️ Error asignando invoice_id a sesiones:', sessionUpdateError);
            } else {
              console.log(`✅ invoice_id asignado a ${updatedInvoice.sessionIds.length} sesiones`);
            }
          }
          
          if (updatedInvoice.bonoIds && updatedInvoice.bonoIds.length > 0) {
            const { error: bonoUpdateError } = await supabaseAdmin
              .from('bono')
              .update({ invoice_id: id })
              .in('id', updatedInvoice.bonoIds);
            
            if (bonoUpdateError) {
              console.error('⚠️ Error asignando invoice_id a bonos:', bonoUpdateError);
            } else {
              console.log(`✅ invoice_id asignado a ${updatedInvoice.bonoIds.length} bonos`);
            }
          }
        }
        
        console.log('📤 [PATCH /api/invoices/:id] Actualizando en Supabase:', updatedInvoice);
        
        // Construir payload correcto para Supabase con columnas directas + JSONB
        const supabasePayload = buildSupabaseInvoiceRow(updatedInvoice);
        console.log('📦 [PATCH /api/invoices/:id] Payload para Supabase:', supabasePayload);
        
        // Actualizar en Supabase
        await trySupabaseUpsert('invoices', [supabasePayload]);
        
        // Actualizar el caché local
        const db = getDb();
        if (!db.invoices) db.invoices = [];
        const idx = db.invoices.findIndex(inv => inv.id === id);
        if (idx >= 0) {
          db.invoices[idx] = updatedInvoice;
        } else {
          db.invoices.push(updatedInvoice);
        }
        saveDb(db);
        
        console.log('✅ Factura actualizada correctamente en Supabase y caché local:', id);
        return res.json(updatedInvoice);
        
      } catch (err) {
        console.error('❌ Error actualizando factura en Supabase:', err);
        return res.status(500).json({ error: 'Error actualizando factura en Supabase' });
      }
    }
    
    // Fallback a DB local si no hay Supabase
    const db = getDb();
    if (!db.invoices) db.invoices = [];
    
    const idx = db.invoices.findIndex(inv => inv.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    
    // Si solo se está actualizando el estado (paid/pending), permitirlo
    const isStatusOnlyUpdate = Object.keys(updates).length === 1 && 
                                updates.status && 
                                (updates.status === 'paid' || updates.status === 'pending');
    
    // Solo permitir editar completamente si es draft, pero permitir cambio de estado siempre
    if (db.invoices[idx].status !== 'draft' && !isStatusOnlyUpdate) {
      return res.status(403).json({ error: 'Solo se pueden editar facturas en estado borrador' });
    }
    
    db.invoices[idx] = { ...db.invoices[idx], ...updates };
    saveDb(db);

    res.json(db.invoices[idx]);
  } catch (error) {
    console.error('Error in PATCH /api/invoices/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Cancel invoice
app.post('/api/invoices/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    
    const db = getDb();
    if (!db.invoices) db.invoices = [];
    
    const idx = db.invoices.findIndex(inv => inv.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    
    db.invoices[idx].status = 'cancelled';
    db.invoices[idx].cancelledAt = new Date().toISOString();
    saveDb(db);

    // Actualizar en Supabase si está disponible
    if (supabaseAdmin) {
      try {
        await upsertTable('invoices', [db.invoices[idx]]);
        console.log('✅ Factura cancelada en Supabase:', id);
      } catch (err) {
        console.error('❌ Error cancelando factura en Supabase:', err);
      }
    }

    res.json(db.invoices[idx]);
  } catch (error) {
    console.error('Error in POST /api/invoices/:id/cancel:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Rectify invoice (cancel and create corrective invoice)
app.post('/api/invoices/:id/rectify', async (req, res) => {
  try {
    const { id } = req.params;
    const psychologistId = req.headers['x-user-id'];
    
    console.log(`🔄 [POST /api/invoices/${id}/rectify] Creando factura rectificativa`);
    
    if (supabaseAdmin) {
      try {
        // Leer la factura original
        const { data: invoiceRows, error: readError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', id)
          .limit(1);
        
        if (readError) {
          console.error('❌ Error leyendo factura desde Supabase:', readError);
          throw readError;
        }
        
        if (!invoiceRows || invoiceRows.length === 0) {
          return res.status(404).json({ error: 'Factura no encontrada' });
        }
        
        const originalInvoice = normalizeSupabaseRow(invoiceRows[0]);
        
        // No se pueden rectificar borradores o facturas ya canceladas
        if (originalInvoice.status === 'draft') {
          return res.status(403).json({ error: 'No se pueden rectificar borradores' });
        }
        if (originalInvoice.status === 'cancelled') {
          return res.status(403).json({ error: 'Esta factura ya está cancelada' });
        }
        
        // Generar número de factura rectificativa
        const { data: allInvoices } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('psychologist_user_id', psychologistId || originalInvoice.psychologist_user_id)
          .ilike('data->>invoiceNumber', 'R%');
        
        const year = new Date().getFullYear();
        const rectPrefix = `R${year}`;
        
        let maxRectNumber = 0;
        if (allInvoices && allInvoices.length > 0) {
          allInvoices.forEach(inv => {
            const normalized = normalizeSupabaseRow(inv);
            if (normalized.invoiceNumber && normalized.invoiceNumber.startsWith(rectPrefix)) {
              const numPart = normalized.invoiceNumber.replace(rectPrefix, '');
              const num = parseInt(numPart, 10);
              if (!isNaN(num) && num > maxRectNumber) {
                maxRectNumber = num;
              }
            }
          });
        }
        
        const rectificativaNumber = `${rectPrefix}${String(maxRectNumber + 1).padStart(5, '0')}`;
        
        // Crear factura rectificativa (con valores en negativo)
        const rectificativa = {
          id: Date.now().toString(),
          invoiceNumber: rectificativaNumber,
          patientId: originalInvoice.patientId,
          patient_user_id: originalInvoice.patient_user_id,
          patientName: originalInvoice.patientName,
          amount: -originalInvoice.amount, // Negativo
          tax: originalInvoice.tax ? -originalInvoice.tax : undefined,
          total: originalInvoice.total ? -originalInvoice.total : undefined,
          taxRate: originalInvoice.taxRate,
          date: new Date().toISOString().split('T')[0],
          dueDate: new Date().toISOString().split('T')[0],
          status: 'paid', // Las rectificativas se marcan como pagadas automáticamente
          description: `Factura rectificativa de ${originalInvoice.invoiceNumber}`,
          items: (originalInvoice.items || []).map(item => ({
            ...item,
            quantity: -item.quantity // Cantidades negativas
          })),
          psychologist_user_id: originalInvoice.psychologist_user_id,
          psychologistId: originalInvoice.psychologistId,
          invoice_type: originalInvoice.invoice_type,
          sessionIds: [], // No asignar sesiones a rectificativa
          bonoIds: [], // No asignar bonos a rectificativa
          billing_client_name: originalInvoice.billing_client_name,
          billing_client_address: originalInvoice.billing_client_address,
          billing_client_tax_id: originalInvoice.billing_client_tax_id,
          billing_psychologist_name: originalInvoice.billing_psychologist_name,
          billing_psychologist_address: originalInvoice.billing_psychologist_address,
          billing_psychologist_tax_id: originalInvoice.billing_psychologist_tax_id,
          is_rectificativa: true,
          rectifies_invoice_id: originalInvoice.id
        };
        
        // Cancelar la factura original
        const cancelledOriginal = {
          ...originalInvoice,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          rectified_by_invoice_id: rectificativa.id
        };
        
        // Desasignar invoice_id de sesiones y bonos de la factura original
        if (originalInvoice.sessionIds && originalInvoice.sessionIds.length > 0) {
          const { error: sessionUpdateError } = await supabaseAdmin
            .from('sessions')
            .update({ invoice_id: null })
            .in('id', originalInvoice.sessionIds);
          
          if (sessionUpdateError) {
            console.error('⚠️ Error desasignando sesiones:', sessionUpdateError);
          } else {
            console.log(`✅ Desasignadas ${originalInvoice.sessionIds.length} sesiones`);
          }
        }
        
        if (originalInvoice.bonoIds && originalInvoice.bonoIds.length > 0) {
          const { error: bonoUpdateError } = await supabaseAdmin
            .from('bono')
            .update({ invoice_id: null })
            .in('id', originalInvoice.bonoIds);
          
          if (bonoUpdateError) {
            console.error('⚠️ Error desasignando bonos:', bonoUpdateError);
          } else {
            console.log(`✅ Desasignados ${originalInvoice.bonoIds.length} bonos`);
          }
        }
        
        // Guardar ambas facturas en Supabase
        const originalPayload = buildSupabaseInvoiceRow(cancelledOriginal);
        const rectificativaPayload = buildSupabaseInvoiceRow(rectificativa);
        
        await trySupabaseUpsert('invoices', [originalPayload]);
        await trySupabaseUpsert('invoices', [rectificativaPayload]);
        
        // Actualizar caché local
        const db = getDb();
        if (!db.invoices) db.invoices = [];
        
        const idx = db.invoices.findIndex(inv => inv.id === id);
        if (idx >= 0) {
          db.invoices[idx] = cancelledOriginal;
        }
        db.invoices.push(rectificativa);
        saveDb(db);
        
        console.log('✅ Factura rectificativa creada:', rectificativaNumber);
        return res.json({ 
          original: cancelledOriginal, 
          rectificativa: rectificativa 
        });
        
      } catch (err) {
        console.error('❌ Error creando factura rectificativa:', err);
        return res.status(500).json({ error: 'Error creando factura rectificativa' });
      }
    }
    
    // Fallback a DB local
    const db = getDb();
    if (!db.invoices) db.invoices = [];
    
    const idx = db.invoices.findIndex(inv => inv.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Factura no encontrada' });
    
    const originalInvoice = db.invoices[idx];
    
    if (originalInvoice.status === 'draft') {
      return res.status(403).json({ error: 'No se pueden rectificar borradores' });
    }
    
    // Generar número rectificativo
    const year = new Date().getFullYear();
    const rectPrefix = `R${year}`;
    const rectInvoices = db.invoices.filter(inv => 
      inv.invoiceNumber && inv.invoiceNumber.startsWith(rectPrefix)
    );
    const maxNumber = rectInvoices.length > 0 
      ? Math.max(...rectInvoices.map(inv => parseInt(inv.invoiceNumber.replace(rectPrefix, ''), 10))) 
      : 0;
    const rectificativaNumber = `${rectPrefix}${String(maxNumber + 1).padStart(5, '0')}`;
    
    // Crear rectificativa
    const rectificativa = {
      ...originalInvoice,
      id: Date.now().toString(),
      invoiceNumber: rectificativaNumber,
      amount: -originalInvoice.amount,
      tax: originalInvoice.tax ? -originalInvoice.tax : undefined,
      total: originalInvoice.total ? -originalInvoice.total : undefined,
      date: new Date().toISOString().split('T')[0],
      status: 'paid',
      description: `Factura rectificativa de ${originalInvoice.invoiceNumber}`,
      sessionIds: [],
      bonoIds: [],
      is_rectificativa: true,
      rectifies_invoice_id: originalInvoice.id
    };
    
    // Cancelar original
    db.invoices[idx].status = 'cancelled';
    db.invoices[idx].cancelledAt = new Date().toISOString();
    db.invoices[idx].rectified_by_invoice_id = rectificativa.id;
    
    db.invoices.push(rectificativa);
    saveDb(db);
    
    res.json({ original: db.invoices[idx], rectificativa });
    
  } catch (error) {
    console.error('Error in POST /api/invoices/:id/rectify:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Delete draft invoice and unassign from sessions/bonos
app.delete('/api/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🗑️ [DELETE /api/invoices/${id}] Eliminando factura`);
    
    if (supabaseAdmin) {
      try {
        // Verificar que sea un borrador
        const { data: invoiceRows, error: readError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', id)
          .limit(1);
        
        if (readError) {
          console.error('❌ Error leyendo factura desde Supabase:', readError);
          throw readError;
        }
        
        if (!invoiceRows || invoiceRows.length === 0) {
          return res.status(404).json({ error: 'Factura no encontrada' });
        }
        
        const invoice = normalizeSupabaseRow(invoiceRows[0]);
        
        // Solo permitir eliminar borradores
        if (invoice.status !== 'draft') {
          return res.status(403).json({ error: 'Solo se pueden eliminar facturas en estado borrador' });
        }
        
        // Desasignar invoice_id de sesiones
        if (invoice.sessionIds && invoice.sessionIds.length > 0) {
          const { error: sessionUpdateError } = await supabaseAdmin
            .from('sessions')
            .update({ invoice_id: null })
            .eq('invoice_id', id);
          
          if (sessionUpdateError) {
            console.error('⚠️ Error desasignando invoice_id de sesiones:', sessionUpdateError);
          } else {
            console.log(`✅ invoice_id desasignado de sesiones`);
          }
        }
        
        // Desasignar invoice_id de bonos
        if (invoice.bonoIds && invoice.bonoIds.length > 0) {
          const { error: bonoUpdateError } = await supabaseAdmin
            .from('bono')
            .update({ invoice_id: null })
            .eq('invoice_id', id);
          
          if (bonoUpdateError) {
            console.error('⚠️ Error desasignando invoice_id de bonos:', bonoUpdateError);
          } else {
            console.log(`✅ invoice_id desasignado de bonos`);
          }
        }
        
        // Eliminar la factura
        const { error: deleteError } = await supabaseAdmin
          .from('invoices')
          .delete()
          .eq('id', id);
        
        if (deleteError) {
          console.error('❌ Error eliminando factura de Supabase:', deleteError);
          throw deleteError;
        }
        
        console.log('✅ Factura eliminada correctamente de Supabase:', id);
        
        // Actualizar caché local
        const db = getDb();
        if (db.invoices) {
          db.invoices = db.invoices.filter(inv => inv.id !== id);
          saveDb(db);
        }
        
        return res.json({ message: 'Factura eliminada correctamente' });
        
      } catch (err) {
        console.error('❌ Error eliminando factura en Supabase:', err);
        return res.status(500).json({ error: 'Error eliminando factura en Supabase' });
      }
    }
    
    // Fallback a DB local
    const db = getDb();
    if (!db.invoices) db.invoices = [];
    
    const idx = db.invoices.findIndex(inv => inv.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Factura no encontrada' });
    
    // Solo permitir eliminar borradores
    if (db.invoices[idx].status !== 'draft') {
      return res.status(403).json({ error: 'Solo se pueden eliminar facturas en estado borrador' });
    }
    
    db.invoices.splice(idx, 1);
    saveDb(db);

    res.json({ message: 'Factura eliminada correctamente' });
  } catch (error) {
    console.error('Error in DELETE /api/invoices/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Get unbilled sessions and bonos for a patient
app.get('/api/patient/:patientId/unbilled', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { psychologistId } = req.query;
    
    console.log(`📋 [GET /api/patient/${patientId}/unbilled] Obteniendo sesiones y bonos sin facturar`);
    
    if (supabaseAdmin) {
      try {
        // Obtener sesiones sin facturar y sin bono asignado
        let sessionQuery = supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('patient_user_id', patientId)
          .is('invoice_id', null)
          .is('bonus_id', null)
          .eq('status', 'completed');
        
        if (psychologistId) {
          sessionQuery = sessionQuery.eq('psychologist_user_id', psychologistId);
        }
        
        const { data: sessions, error: sessionsError } = await sessionQuery
          .order('starts_on', { ascending: false });
        
        if (sessionsError) {
          console.error('❌ Error obteniendo sesiones sin facturar:', sessionsError);
          throw sessionsError;
        }
        
        // Obtener bonos sin facturar
        let bonoQuery = supabaseAdmin
          .from('bono')
          .select('*')
          .eq('pacient_user_id', patientId)
          .is('invoice_id', null);
        
        if (psychologistId) {
          bonoQuery = bonoQuery.eq('psychologist_user_id', psychologistId);
        }
        
        const { data: bonos, error: bonosError } = await bonoQuery
          .order('created_at', { ascending: false });
        
        if (bonosError) {
          console.error('❌ Error obteniendo bonos sin facturar:', bonosError);
          throw bonosError;
        }
        
        console.log(`✅ Encontradas ${sessions?.length || 0} sesiones y ${bonos?.length || 0} bonos sin facturar`);
        
        return res.json({
          sessions: sessions || [],
          bonos: bonos || []
        });
        
      } catch (err) {
        console.error('❌ Error obteniendo datos sin facturar:', err);
        return res.status(500).json({ error: 'Error obteniendo datos sin facturar' });
      }
    }
    
    // Fallback a DB local
    return res.json({ sessions: [], bonos: [] });
  } catch (error) {
    console.error('Error in GET /api/patient/:patientId/unbilled:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Función auxiliar para calcular duración de sesión en horas
function getSessionDurationHours(session) {
  // Priorizar usar starts_on y ends_on de Supabase si existen
  if (session.starts_on && session.ends_on) {
    const startDate = new Date(session.starts_on);
    const endDate = new Date(session.ends_on);
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    
    // Solo retornar si la duración es positiva y razonable (máx 24 horas)
    if (durationHours > 0 && durationHours <= 24) {
      return durationHours;
    }
  }
  
  // Si no hay información de tiempo, asumir 1 hora por defecto
  return 1;
}

// Función auxiliar para calcular valor total de sesión (precio × duración)
function getSessionTotalPrice(session) {
  const pricePerHour = session.price || 0;
  const hours = getSessionDurationHours(session);
  return pricePerHour * hours;
}

// Función auxiliar para calcular ganancia del psicólogo
function getPsychologistEarnings(session) {
  const totalPrice = getSessionTotalPrice(session);
  const percent = session.percent_psych || 0;
  return (totalPrice * percent) / 100;
}

// GET /api/patient-stats/:patientId - Obtener estadísticas del paciente
app.get('/api/patient-stats/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    const { psychologistId } = req.query;
    
    console.log(`📊 [GET /api/patient-stats/${patientId}] Obteniendo estadísticas para psychologistId: ${psychologistId}`);
    
    if (!psychologistId) {
      return res.status(400).json({ error: 'psychologistId es requerido' });
    }
    
    if (supabaseAdmin) {
      try {
        // Obtener todas las sesiones completadas del paciente con este psicólogo
        const { data: allSessions, error: sessionsError } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .eq('patient_user_id', patientId)
          .eq('psychologist_user_id', psychologistId)
          .order('starts_on', { ascending: false });
        
        if (sessionsError) {
          console.error('❌ Error obteniendo sesiones:', sessionsError);
          throw sessionsError;
        }
        
        console.log(`📊 Total sesiones obtenidas: ${allSessions?.length || 0}`);
        console.log(`📊 Sesiones completadas: ${allSessions?.filter(s => s.status === 'completed').length || 0}`);
        console.log(`📊 Sesiones programadas: ${allSessions?.filter(s => s.status === 'scheduled').length || 0}`);
        
        // Obtener facturas del paciente
        const { data: invoices, error: invoicesError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('patient_user_id', patientId)
          .eq('psychologist_user_id', psychologistId);
        
        if (invoicesError) {
          console.error('❌ Error obteniendo facturas:', invoicesError);
          throw invoicesError;
        }
        
        console.log(`📊 Total facturas obtenidas: ${invoices?.length || 0}`);
        console.log(`📊 Facturas por estado:`, invoices?.reduce((acc, inv) => {
          acc[inv.status] = (acc[inv.status] || 0) + 1;
          return acc;
        }, {}));
        
        // Calcular estadísticas
        const completedSessions = allSessions.filter(s => s.status === 'completed');
        const scheduledSessions = allSessions.filter(s => s.status === 'scheduled' || s.status === 'confirmed');
        
        // Valor total de sesiones completadas (precio × duración)
        const totalSessionValue = completedSessions.reduce((sum, s) => sum + getSessionTotalPrice(s), 0);
        
        // Calcular ganancia del psicólogo (usando percent_psych de la tabla sessions)
        const psychologistEarnings = completedSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);
        
        const avgPercent = completedSessions.length > 0
          ? completedSessions.reduce((sum, s) => sum + (s.percent_psych || 70), 0) / completedSessions.length
          : 70;
        
        // Sesiones pagadas - directamente desde el campo 'paid' de la tabla sessions
        const paidSessions = completedSessions.filter(s => s.paid === true).length;
        const unpaidSessions = completedSessions.length - paidSessions;
        
        console.log(`💰 Sesiones pagadas (paid=true): ${paidSessions}`);
        console.log(`💰 Sesiones sin pagar (paid=false): ${unpaidSessions}`);
        
        // Sesiones facturadas (con invoice_id)
        const sessionsWithInvoice = completedSessions.filter(s => s.invoice_id);
        
        // Sesiones pendientes de facturar (sin invoice_id y sin bonus_id)
        const sessionsWithoutInvoice = completedSessions.filter(s => !s.invoice_id && !s.bonus_id);
        const pendingToInvoice = sessionsWithoutInvoice.reduce((sum, s) => sum + getSessionTotalPrice(s), 0);
        
        // Sesiones con bono pero sin facturar
        const sessionsWithBonusNotInvoiced = completedSessions.filter(s => s.bonus_id && !s.invoice_id);
        const bonosNotInvoiced = sessionsWithBonusNotInvoiced.length;
        
        // FACTURAS: usar los campos directos de la tabla invoices (no data)
        // Total facturado (excluir cancelled y draft)
        const totalInvoiced = invoices.reduce((sum, inv) => {
          if (inv.status !== 'cancelled' && inv.status !== 'draft') {
            return sum + (inv.total || 0);
          }
          return sum;
        }, 0);
        
        // Facturas pagadas
        const paidInvoices = invoices.filter(inv => inv.status === 'paid');
        
        // Total cobrado (suma de facturas pagadas)
        const totalCollected = paidInvoices.reduce((sum, inv) => {
          return sum + (inv.total || 0);
        }, 0);
        
        // Facturas pendientes de cobro
        const pendingInvoices = invoices.filter(inv => 
          inv.status === 'sent' || inv.status === 'pending'
        );
        
        // Total por cobrar (suma de facturas pendientes)
        const totalPending = pendingInvoices.reduce((sum, inv) => {
          return sum + (inv.total || 0);
        }, 0);
        
        // Datos mensuales (últimos 12 meses)
        const now = new Date();
        const monthlyData = [];
        
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
          const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
          
          const monthName = date.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
          
          // Incluir todas las sesiones excepto canceladas
          const monthSessions = allSessions.filter(s => {
            if (s.status === 'cancelled') return false;
            const sessionDate = new Date(s.starts_on);
            return sessionDate >= monthStart && sessionDate <= monthEnd;
          });
          
          // Solo sesiones completadas para cálculos de dinero
          const monthCompletedSessions = monthSessions.filter(s => s.status === 'completed');
          
          const monthRevenue = monthCompletedSessions.reduce((sum, s) => sum + getSessionTotalPrice(s), 0);
          
          // Calcular ganancia del psicólogo para este mes
          const monthPsychEarnings = monthCompletedSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);
          
          monthlyData.push({
            month: monthName,
            sessions: monthSessions.length,
            revenue: monthRevenue,
            psychEarnings: monthPsychEarnings
          });
        }
        
        const stats = {
          totalSessionValue,
          psychologistEarnings,
          avgPercent,
          totalInvoiced,
          totalCollected,
          totalPending,
          pendingToInvoice,
          bonosNotInvoiced,
          completedSessions: completedSessions.length,
          scheduledSessions: scheduledSessions.length,
          paidSessions,
          unpaidSessions,
          totalInvoices: invoices.length,
          paidInvoices: paidInvoices.length,
          pendingInvoicesCount: pendingInvoices.length,
          monthlyData
        };
        
        console.log(`✅ Estadísticas calculadas:`, {
          completedSessions: stats.completedSessions,
          totalSessionValue: stats.totalSessionValue,
          psychologistEarnings: stats.psychologistEarnings,
          paidSessions: stats.paidSessions,
          unpaidSessions: stats.unpaidSessions,
          totalInvoiced: stats.totalInvoiced,
          totalCollected: stats.totalCollected,
          totalPending: stats.totalPending,
          pendingToInvoice: stats.pendingToInvoice
        });
        
        return res.json(stats);
        
      } catch (err) {
        console.error('❌ Error obteniendo estadísticas:', err);
        return res.status(500).json({ error: 'Error obteniendo estadísticas del paciente' });
      }
    }
    
    // Fallback
    return res.json({
      totalSessionValue: 0,
      psychologistEarnings: 0,
      avgPercent: 70,
      totalInvoiced: 0,
      totalCollected: 0,
      totalPending: 0,
      pendingToInvoice: 0,
      completedSessions: 0,
      scheduledSessions: 0,
      paidSessions: 0,
      unpaidSessions: 0,
      totalInvoices: 0,
      paidInvoices: 0,
      pendingInvoicesCount: 0,
      monthlyData: []
    });
  } catch (error) {
    console.error('Error in GET /api/patient-stats/:patientId:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Generate PDF invoice
app.get('/api/invoices/:id/pdf', async (req, res) => {
  const { id } = req.params;
  
  console.log('🔍 [PDF] Solicitud de PDF para factura ID:', id);
  
  let invoice = null;

  // SIEMPRE obtener desde Supabase
  if (!supabaseAdmin) {
    console.error('❌ [PDF] Supabase no está configurado');
    return res.status(500).json({ error: 'Supabase no está configurado' });
  }

  try {
    console.log('🔍 [PDF] Consultando Supabase para factura ID:', id);
    const { data: invoiceRows, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .limit(1);
    
    console.log('📋 [PDF] Resultado de consulta - rows:', invoiceRows?.length || 0);
    
    if (error) {
      console.error('❌ [PDF] Error consultando Supabase:', error);
      return res.status(500).json({ error: 'Error consultando base de datos', details: error.message });
    }
    
    if (!invoiceRows || invoiceRows.length === 0) {
      console.error('❌ [PDF] Factura no encontrada en Supabase para ID:', id);
      // Intentar listar algunas facturas para debug
      const { data: allInvoices } = await supabaseAdmin
        .from('invoices')
        .select('id, data->invoiceNumber')
        .limit(10);
      console.log('📋 [PDF] Facturas disponibles:', allInvoices?.map(i => ({ id: i.id, invoiceNumber: i.data?.invoiceNumber })));
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    invoice = normalizeSupabaseRow(invoiceRows[0]);
    console.log('✅ [PDF] Factura obtenida desde Supabase:', id);
    console.log('📊 [PDF] Datos de factura:', { 
      amount: invoice.amount, 
      tax: invoice.tax, 
      total: invoice.total, 
      taxRate: invoice.taxRate,
      status: invoice.status,
      invoiceNumber: invoice.invoiceNumber,
      billing_client_tax_id: invoice.billing_client_tax_id,
      billing_psychologist_tax_id: invoice.billing_psychologist_tax_id
    });
  } catch (err) {
    console.error('❌ [PDF] Error obteniendo factura desde Supabase:', err);
    return res.status(500).json({ error: 'Error interno del servidor', details: err.message });
  }
  
  if (!invoice) {
    console.error('❌ [PDF] Factura no encontrada:', id);
    return res.status(404).json({ error: 'Invoice not found' });
  }

  // Usar los datos de facturación guardados en la factura (billing_psychologist_* y billing_client_*)
  // Estos campos ya contienen la información que el usuario completó al crear la factura
  console.log('📋 [PDF] Datos de facturación en invoice:', {
    billing_psychologist_name: invoice.billing_psychologist_name,
    billing_psychologist_tax_id: invoice.billing_psychologist_tax_id,
    billing_psychologist_address: invoice.billing_psychologist_address,
    billing_client_name: invoice.billing_client_name,
    billing_client_tax_id: invoice.billing_client_tax_id,
    billing_client_address: invoice.billing_client_address
  });
  
  const psychProfile = {
    name: invoice.billing_psychologist_name || 'Psicólogo',
    businessName: invoice.billing_psychologist_name || 'Servicios Profesionales de Psicología',
    taxId: invoice.billing_psychologist_tax_id || '',
    address: invoice.billing_psychologist_address || '',
    city: '',
    postalCode: '',
    country: 'España',
    phone: '',
    email: ''
  };

  const patientData = {
    name: invoice.billing_client_name || invoice.patientName || 'Paciente',
    taxId: invoice.billing_client_tax_id || '',
    dni: invoice.billing_client_tax_id || '',
    address: invoice.billing_client_address || '',
    email: '',
    phone: '',
    postalCode: '',
    city: ''
  };
  
  console.log('👤 [PDF] patientData construido:', patientData);

  // Usar los campos directos del nuevo schema, con fallback al cálculo antiguo
  console.log('📊 [PDF] Invoice raw data:', { 
    amount: invoice.amount, 
    tax: invoice.tax, 
    total: invoice.total, 
    taxRate: invoice.taxRate,
    irpf: invoice.irpf,
    invoice_type: invoice.invoice_type,
    items: invoice.items 
  });
  
  // amount debe ser el subtotal (sin IVA)
  const subtotal = parseFloat(invoice.amount) || 0;
  
  // tax debe ser el IVA ya calculado
  let iva = 0;
  if (invoice.tax !== undefined && invoice.tax !== null) {
    iva = parseFloat(invoice.tax);
  } else {
    // Fallback: calcular IVA con taxRate o 21% por defecto
    const taxRate = parseFloat(invoice.taxRate) || 21;
    iva = subtotal * (taxRate / 100);
  }
  
  // IRPF (solo para facturas a centros)
  let irpfAmount = 0;
  if (invoice.invoice_type === 'center' && invoice.irpf) {
    irpfAmount = subtotal * (parseFloat(invoice.irpf) / 100);
  }
  
  // total debe ser subtotal + IVA - IRPF
  let totalAmount = 0;
  if (invoice.total !== undefined && invoice.total !== null) {
    totalAmount = parseFloat(invoice.total);
  } else {
    // Fallback: calcular total
    totalAmount = subtotal + iva - irpfAmount;
  }
  
  console.log('📊 [PDF] Calculated values:', { 
    subtotal: subtotal.toFixed(2), 
    iva: iva.toFixed(2), 
    irpfAmount: irpfAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    taxRate: invoice.taxRate || 21,
    irpfRate: invoice.irpf || 0
  });
  
  // Obtener detalles de sesiones y bonos para mostrar en el PDF
  let detailedItems = [];
  
  if (invoice.sessionIds && invoice.sessionIds.length > 0) {
    // Obtener sesiones desde Supabase
    try {
      const { data: sessions, error: sessionsError } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .in('id', invoice.sessionIds);
      
      if (!sessionsError && sessions) {
        sessions.forEach(session => {
          const sessionData = session.data || {};
          const sessionPrice = session.price || sessionData.price || 0;
          const startDate = session.starts_on ? new Date(session.starts_on).toLocaleDateString('es-ES') : 'Fecha no disponible';
          detailedItems.push({
            description: `Sesión de psicología - ${startDate}${sessionData.notes ? ` (${sessionData.notes})` : ''}`,
            quantity: 1,
            unitPrice: sessionPrice
          });
        });
      }
    } catch (err) {
      console.error('Error obteniendo sesiones para PDF:', err);
    }
  }
  
  if (invoice.bonoIds && invoice.bonoIds.length > 0) {
    // Obtener bonos desde Supabase
    try {
      const { data: bonos, error: bonosError } = await supabaseAdmin
        .from('bonos')
        .select('*')
        .in('id', invoice.bonoIds);
      
      if (!bonosError && bonos) {
        bonos.forEach(bono => {
          const bonoData = bono.data || {};
          const bonoPrice = bonoData.total_price_bono_amount || 0;
          const totalSessions = bonoData.total_sessions_amount || 0;
          detailedItems.push({
            description: `Bono de ${totalSessions} sesiones`,
            quantity: 1,
            unitPrice: bonoPrice
          });
        });
      }
    } catch (err) {
      console.error('Error obteniendo bonos para PDF:', err);
    }
  }
  
  // Si no hay items detallados, usar un item genérico
  if (detailedItems.length === 0) {
    detailedItems = [{
      description: invoice.description || 'Servicio de psicología',
      quantity: 1,
      unitPrice: subtotal
    }];
  }
  
  console.log('📋 [PDF] Items detallados:', detailedItems);
  
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
          ${psychProfile.name && psychProfile.businessName ? `<div><strong>Profesional:</strong> ${psychProfile.name}</div>` : ''}
          ${psychProfile.professionalId ? `<div><strong>Nº Colegiado:</strong> ${psychProfile.professionalId}</div>` : ''}
          ${psychProfile.specialty ? `<div><strong>Especialidad:</strong> ${psychProfile.specialty}</div>` : ''}
          ${psychProfile.taxId ? `<div><strong>NIF/CIF:</strong> ${psychProfile.taxId}</div>` : ''}
          ${psychProfile.address ? `<div>${psychProfile.address}</div>` : ''}
          ${psychProfile.postalCode || psychProfile.city ? `<div>${psychProfile.postalCode || ''} ${psychProfile.city || ''}</div>` : ''}
          ${psychProfile.country ? `<div>${psychProfile.country}</div>` : ''}
          ${psychProfile.phone ? `<div><strong>Tel:</strong> ${psychProfile.phone}</div>` : ''}
          ${psychProfile.email ? `<div><strong>Email:</strong> ${psychProfile.email}</div>` : ''}
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
        ${invoice.dueDate && !isNaN(new Date(invoice.dueDate).getTime()) ? `
        <div class="info-row">
          <span class="info-label">Vencimiento:</span>
          <span class="info-value">${new Date(invoice.dueDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        ` : ''}
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
          <span class="info-value">${patientData.name}</span>
        </div>
        ${patientData.taxId || patientData.dni ? `
        <div class="info-row">
          <span class="info-label">DNI/NIF:</span>
          <span class="info-value">${patientData.taxId || patientData.dni}</span>
        </div>
        ` : ''}
        ${patientData.address ? `
        <div class="info-row">
          <span class="info-label">Dirección:</span>
          <span class="info-value">${patientData.address}</span>
        </div>
        ` : ''}
        ${patientData.postalCode || patientData.city ? `
        <div class="info-row">
          <span class="info-label"></span>
          <span class="info-value">${patientData.postalCode || ''} ${patientData.city || ''}</span>
        </div>
        ` : ''}
        ${patientData.email ? `
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${patientData.email}</span>
        </div>
        ` : ''}
        ${patientData.phone ? `
        <div class="info-row">
          <span class="info-label">Teléfono:</span>
          <span class="info-value">${patientData.phone}</span>
        </div>
        ` : ''}
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
        ${detailedItems.map(item => `
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
          <span class="total-label">IVA (${invoice.taxRate || 21}%):</span>
          <span class="total-value">${iva.toFixed(2)} €</span>
        </div>
        ${invoice.invoice_type === 'center' && irpfAmount > 0 ? `
        <div class="total-row">
          <span class="total-label">IRPF (${invoice.irpf || 0}%):</span>
          <span class="total-value" style="color: #dc2626;">-${irpfAmount.toFixed(2)} €</span>
        </div>
        ` : ''}
        <div class="total-row">
          <span class="total-label">TOTAL:</span>
          <span class="total-value">${totalAmount.toFixed(2)} €</span>
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
            ${psychProfile.iban ? `<div><strong>IBAN:</strong> ${psychProfile.iban}</div>` : ''}
            ${psychProfile.businessName || psychProfile.name ? `<div><strong>Titular:</strong> ${psychProfile.businessName || psychProfile.name}</div>` : ''}
            <div style="margin-top: 8px;">Por favor, incluya el número de factura <strong>${invoice.invoiceNumber}</strong> como referencia en su pago.</div>
          </div>
        </div>
      ` : ''}
      
      <div style="margin-top: 30px;">
        <div class="footer-title">Datos Profesionales</div>
        ${psychProfile.professionalId ? `<div>Número de Colegiado: ${psychProfile.professionalId}</div>` : ''}
        ${psychProfile.specialty ? `<div>Especialidad: ${psychProfile.specialty}</div>` : ''}
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
          <div class="footer-title">Términos y Condiciones</div>
          <div>Los servicios profesionales de psicología están exentos de retención de IRPF según la normativa vigente.</div>
          <div>Esta factura es válida sin necesidad de firma según el Real Decreto 1496/2003.</div>
        </div>
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
app.get('/api/psychologist/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const defaultProfile = {
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

    // Si usamos Supabase, leer de Supabase
    if (supabaseAdmin) {
      // Obtener el perfil de psicólogo directamente por user_id
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('psychologist_profiles')
        .select('data')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.log('[API] Usuario sin perfil de psicólogo, devolviendo perfil vacío. Error:', profileError.message);
        return res.json(defaultProfile);
      }

      if (!profileData?.data) {
        console.log('[API] Perfil de psicólogo sin datos, devolviendo perfil vacío');
        return res.json(defaultProfile);
      }

      console.log('[API] Perfil de psicólogo cargado correctamente:', profileData.data);
      return res.json(profileData.data);
    }

    // Fallback a DB local
    const db = getDb();
    if (!db.psychologistProfiles) db.psychologistProfiles = {};
    const profile = db.psychologistProfiles[userId] || defaultProfile;
    res.json(profile);
  } catch (err) {
    console.error('❌ Error loading psychologist profile', err);
    res.json({
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
    });
  }
});

app.put('/api/psychologist/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('[API] Saving psychologist profile for:', userId);
    console.log('[API] Profile data:', req.body);

    // Si usamos Supabase, guardar en Supabase
    if (supabaseAdmin) {
      // Buscar si ya existe un perfil para este usuario
      const { data: existingProfile, error: searchError } = await supabaseAdmin
        .from('psychologist_profiles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (searchError && searchError.code !== 'PGRST116') {
        // PGRST116 es "no rows returned", que es válido
        console.error('❌ Error buscando perfil de psicólogo:', searchError);
        return res.status(500).json({ error: `Error buscando perfil: ${searchError.message}` });
      }

      if (existingProfile) {
        // Si ya existe, actualizar
        const { error: updateError } = await supabaseAdmin
          .from('psychologist_profiles')
          .update({ data: req.body, updated_at: new Date().toISOString() })
          .eq('id', existingProfile.id);

        if (updateError) {
          console.error('❌ Error actualizando perfil de psicólogo:', updateError);
          return res.status(500).json({ error: `Error actualizando perfil: ${updateError.message}` });
        }

        console.log('✓ Perfil de psicólogo actualizado en Supabase:', existingProfile.id);
      } else {
        // Si no existe, crear uno nuevo
        const profileId = crypto.randomUUID();
        
        const { error: createError } = await supabaseAdmin
          .from('psychologist_profiles')
          .insert([{
            id: profileId,
            user_id: userId,
            data: req.body
          }]);

        if (createError) {
          console.error('❌ Error creando perfil de psicólogo:', createError);
          return res.status(500).json({ error: `Error creando perfil: ${createError.message}` });
        }

        console.log('✓ Perfil de psicólogo creado en Supabase:', profileId);
      }

      return res.json(req.body);
    }

    // Fallback a DB local si no hay Supabase
    const db = getDb();
    if (!db.psychologistProfiles) db.psychologistProfiles = {};
    db.psychologistProfiles[userId] = req.body;
    await saveDb(db, { awaitPersistence: true });

    console.log('[API] Profile saved successfully (local DB)');
    return res.json(req.body);
  } catch (err) {
    console.error('❌ Error saving psychologist profile', err);
    return res.status(500).json({ error: err?.message || 'No se pudo guardar el perfil profesional' });
  }
});

// --- PATIENT PROFILE ---
app.get('/api/patient/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (supabaseAdmin) {
      // Cargar desde Supabase
      const user = await readSupabaseRowById('users', userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      
      const data = user.data || {};
      const profile = {
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        phone: data.phone || '',
        email: user.user_email || data.email || '',
        address: data.address || '',
        city: data.city || '',
        postalCode: data.postalCode || '',
        country: data.country || 'España'
      };
      
      return res.json(profile);
    } else {
      // Fallback a db.json
      const db = getDb();
      if (!db.patientProfiles) db.patientProfiles = {};
      
      const profile = db.patientProfiles[userId] || {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        postalCode: '',
        country: 'España'
      };
      
      return res.json(profile);
    }
  } catch (err) {
    console.error('Error loading patient profile:', err);
    return res.status(500).json({ error: err?.message || 'Error cargando el perfil' });
  }
});

app.put('/api/patient/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('[API] Saving patient profile for:', userId);
    console.log('[API] Profile data:', req.body);

    if (supabaseAdmin) {
      // Guardar en Supabase
      const user = await readSupabaseRowById('users', userId);
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const currentData = user.data || {};
      const updatedData = {
        ...currentData,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
        email: req.body.email,
        address: req.body.address,
        city: req.body.city,
        postalCode: req.body.postalCode,
        country: req.body.country
      };

      const updateFields = {
        data: updatedData
      };

      // Si el email cambió, actualizar también user_email
      if (req.body.email && normalizeEmail(req.body.email) !== normalizeEmail(user.user_email)) {
        updateFields.user_email = normalizeEmail(req.body.email);
      }

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateFields)
        .eq('id', userId);

      if (updateError) {
        console.error('❌ Error actualizando perfil en Supabase:', updateError);
        throw new Error(`Error actualizando perfil: ${updateError.message}`);
      }

      console.log('✅ Patient profile saved successfully in Supabase');
      return res.json(req.body);
    } else {
      // Fallback a db.json
      const db = getDb();
      if (!db.patientProfiles) db.patientProfiles = {};
      db.patientProfiles[userId] = req.body;
      await saveDb(db, { awaitPersistence: true });
      console.log('[API] Patient profile saved successfully in db.json');
      return res.json(req.body);
    }
  } catch (err) {
    console.error('❌ Error saving patient profile', err);
    return res.status(500).json({ error: err?.message || 'No se pudo guardar el perfil' });
  }
});

// --- RELACIONES PACIENTE / PSICÓLOGO ---
app.get('/api/relationships', async (req, res) => {
  try {
    const { psychologistId, patientId, psych_user_id, psychologist_user_id, patient_user_id, includeEnded } = req.query;
    
    // Soportar tanto campos nuevos como legacy y ambos nombres (psych_user_id y psychologist_user_id)
    const psychId = psychologist_user_id || psych_user_id || psychologistId;
    const patId = patient_user_id || patientId;
    
    if (!psychId && !patId) {
      return res.status(400).json({ error: 'psychologist_user_id o patient_user_id requerido' });
    }

    let relationships = [];

    // SIEMPRE consultar directamente desde Supabase (nunca usar caché)
    if (supabaseAdmin) {
      try {
        console.log('[GET /api/relationships] Consultando Supabase directamente - psychId:', psychId, 'patId:', patId, 'includeEnded:', includeEnded);
        
        let query = supabaseAdmin.from('care_relationships').select('*');
        
        // Aplicar filtros
        if (psychId) {
          query = query.eq('psychologist_user_id', psychId);
        }
        if (patId) {
          query = query.eq('patient_user_id', patId);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('[GET /api/relationships] Error consultando Supabase:', error);
        } else {
          console.log('[GET /api/relationships] Datos desde Supabase:', data?.length || 0, 'relaciones');
          relationships = (data || []).map(normalizeSupabaseRow);
          
          // Filtrar relaciones finalizadas si no se solicitan
          if (!includeEnded) {
            relationships = relationships.filter(rel => !rel.endedAt && !rel.ended_at);
          }
        }
      } catch (err) {
        console.error('[GET /api/relationships] Error en consulta Supabase:', err);
      }
    }
    
    // Fallback a db local solo si Supabase no está disponible
    if (relationships.length === 0 && !supabaseAdmin) {
      console.log('[GET /api/relationships] Fallback a DB local');
      const db = getDb();
      
      relationships = (db.careRelationships || []).filter(rel => {
        if (!rel) return false;
        
        // Soportar tanto campos nuevos como legacy Y los campos de Supabase
        const relPsychId = rel.psychologist_user_id || rel.psych_user_id || rel.psychologistId;
        const relPatId = rel.patient_user_id || rel.patientId;
        
        const matchesPsych = psychId ? relPsychId === psychId : true;
        const matchesPatient = patId ? relPatId === patId : true;
        const matches = matchesPsych && matchesPatient;
        
        // Por defecto, solo devolver relaciones activas (sin endedAt)
        // A menos que includeEnded=true
        if (matches && !includeEnded && (rel.endedAt || rel.ended_at)) {
          return false;
        }
        
        return matches;
      });
    }

    console.log('[GET /api/relationships] Devolviendo', relationships.length, 'relaciones');

    // Prevenir caché
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json(relationships);
  } catch (error) {
    console.error('[GET /api/relationships] ERROR:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

app.post('/api/relationships', async (req, res) => {
  try {
    // Soportar tanto campos nuevos como legacy y ambos nombres
    const psychId = req.body.psychologist_user_id || req.body.psych_user_id || req.body.psychologistId;
    const patId = req.body.patient_user_id || req.body.patientId;
    const defaultPrice = req.body.default_session_price ?? req.body.defaultSessionPrice ?? 0;
    const defaultPercent = req.body.default_psych_percent ?? req.body.defaultPsychPercent ?? 100;
    const tags = req.body.tags || [];
    
    console.log('[POST /api/relationships] Request:', { psychId, patId, defaultPrice, defaultPercent, tags });
    
    if (!psychId || !patId) {
      console.error('[POST /api/relationships] ❌ Missing required fields');
      return res.status(400).json({ error: 'psychologist_user_id y patient_user_id son obligatorios' });
    }
    
    if (psychId === patId) {
      console.error('[POST /api/relationships] ❌ IDs iguales');
      return res.status(400).json({ error: 'No puedes crear una relación contigo mismo' });
    }

    // PRIMERO: Intentar crear en Supabase si está disponible
    if (supabaseAdmin) {
      try {
        console.log('[POST /api/relationships] Creando en Supabase...');
        
        // Verificar si ya existe
        const { data: existing } = await supabaseAdmin
          .from('care_relationships')
          .select('*')
          .eq('psychologist_user_id', psychId)
          .eq('patient_user_id', patId)
          .maybeSingle();
        
        if (existing) {
          console.log('[POST /api/relationships] ⚠️ Relación ya existe:', existing.id);
          return res.json(normalizeSupabaseRow(existing));
        }
        
        // Crear nueva relación
        const newRel = {
          id: crypto.randomUUID(),
          psychologist_user_id: psychId,
          patient_user_id: patId,
          default_session_price: defaultPrice,
          default_psych_percent: defaultPercent,
          data: { tags }
        };
        
        const { data, error } = await supabaseAdmin
          .from('care_relationships')
          .insert([newRel])
          .select()
          .single();
        
        if (error) {
          console.error('[POST /api/relationships] ❌ Error en Supabase:', error);
          throw error;
        }
        
        console.log('[POST /api/relationships] ✓ Relación creada en Supabase:', data.id);
        return res.json(normalizeSupabaseRow(data));
      } catch (supaErr) {
        console.error('[POST /api/relationships] ❌ Error guardando en Supabase:', supaErr);
        // Fallback a DB local
      }
    }
    
    // FALLBACK: Crear en DB local
    const db = getDb();
    
    // Validar que ambos usuarios existan
    const psychUser = db.users.find(u => u.id === psychId);
    const patientUser = db.users.find(u => u.id === patId);
    
    if (!psychUser) {
      console.error('[POST /api/relationships] ❌ psych_user_id no existe');
      return res.status(404).json({ error: 'El usuario (psicólogo) no existe' });
    }
    if (!patientUser) {
      console.error('[POST /api/relationships] ❌ patient_user_id no existe');
      return res.status(404).json({ error: 'El usuario (paciente) no existe' });
    }
    
    console.log('[POST /api/relationships] Creando en DB local:', {
      psychologist: `${psychUser.name} (${psychUser.role})`,
      patient: `${patientUser.name} (${patientUser.role})`
    });
    
    const relationship = ensureCareRelationship(db, psychId, patId);
    if (!relationship) {
      return res.status(500).json({ error: 'No se pudo crear la relación' });
    }
    
    // Aplicar valores default
    relationship.default_session_price = defaultPrice;
    relationship.default_psych_percent = defaultPercent;
    if (!relationship.data) relationship.data = {};
    relationship.data.tags = tags;
    
    await saveDb(db, { awaitPersistence: true });
    console.log('[POST /api/relationships] ✓ Relación guardada en DB local');
    return res.json(relationship);
  } catch (err) {
    console.error('❌ Error creating relationship', err);
    return res.status(500).json({ error: err?.message || 'No se pudo crear la relación' });
  }
});

app.delete('/api/relationships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Relationship id requerido' });

    const db = getDb();
    const before = db.careRelationships?.length || 0;
    db.careRelationships = (db.careRelationships || []).filter(rel => rel.id !== id);
    if ((db.careRelationships?.length || 0) === before) {
      return res.status(404).json({ error: 'Relación no encontrada' });
    }
    await saveDb(db, { awaitPersistence: true });
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting relationship by id', err);
    return res.status(500).json({ error: err?.message || 'No se pudo eliminar la relación' });
  }
});

app.delete('/api/relationships', async (req, res) => {
  try {
    // Soportar tanto campos nuevos como legacy y ambos nombres
    const psychId = req.query.psychologist_user_id || req.query.psych_user_id || req.query.psychologistId;
    const patId = req.query.patient_user_id || req.query.patientId;
    
    console.log('[DELETE /api/relationships] Request:', { psychId, patId });
    
    if (!psychId || !patId) {
      console.error('[DELETE /api/relationships] ❌ Missing required fields');
      return res.status(400).json({ error: 'psychologist_user_id y patient_user_id son obligatorios' });
    }

    const db = getDb();
    const removed = removeCareRelationshipByPair(db, psychId, patId);
    console.log('[DELETE /api/relationships]', removed ? '✓ Eliminada' : '⚠️ No encontrada');
    if (!removed) {
      return res.status(404).json({ error: 'Relación no encontrada' });
    }
    await saveDb(db, { awaitPersistence: true });
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting relationship pair', err);
    return res.status(500).json({ error: err?.message || 'No se pudo eliminar la relación' });
  }
});

// Finalizar relación (marcar con endedAt en lugar de eliminar)
app.patch('/api/relationships/end', async (req, res) => {
  try {
    // Soportar tanto campos nuevos como legacy y ambos nombres
    const psychId = req.body.psychologist_user_id || req.body.psych_user_id || req.body.psychologistId;
    const patId = req.body.patient_user_id || req.body.patientId;
    
    console.log('[PATCH /api/relationships/end] Request:', { psychId, patId });
    
    if (!psychId || !patId) {
      console.error('[PATCH /api/relationships/end] ❌ Missing required fields');
      return res.status(400).json({ error: 'psychologist_user_id y patient_user_id son obligatorios' });
    }

    const db = getDb();
    if (!Array.isArray(db.careRelationships)) db.careRelationships = [];
    
    const relationship = db.careRelationships.find(rel => 
      rel.psychologist_user_id === psychId && rel.patient_user_id === patId
    );
    
    if (!relationship) {
      console.error('[PATCH /api/relationships/end] ❌ Relación no encontrada');
      return res.status(404).json({ error: 'Relación no encontrada' });
    }
    
    if (relationship.endedAt) {
      console.log('[PATCH /api/relationships/end] ⚠️ Relación ya finalizada');
      return res.status(400).json({ error: 'La relación ya está finalizada' });
    }
    
    relationship.endedAt = Date.now();
    console.log('[PATCH /api/relationships/end] ✓ Relación finalizada:', relationship);
    
    // Refrescar cache Supabase si existe
    if (supabaseDbCache?.careRelationships) {
      const idx = supabaseDbCache.careRelationships.findIndex(rel => rel.id === relationship.id);
      if (idx >= 0) supabaseDbCache.careRelationships[idx] = { ...relationship };
    }

    // Persistir en Supabase si está habilitado
    if (supabaseAdmin) {
      try {
        const payload = { id: relationship.id, data: relationship };
        await trySupabaseUpsert('care_relationships', [payload, relationship]);
        console.log('[PATCH /api/relationships/end] ✓ Supabase actualizado');
      } catch (supErr) {
        console.error('[PATCH /api/relationships/end] ⚠️ No se pudo actualizar Supabase', supErr);
      }
    }
    
    await saveDb(db, { awaitPersistence: true });
    return res.json(relationship);
  } catch (err) {
    console.error('❌ Error ending relationship', err);
    return res.status(500).json({ error: err?.message || 'No se pudo finalizar la relación' });
  }
});

app.put('/api/relationships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    
    console.log('[PUT /api/relationships/:id] Updating relationship:', id);
    
    if (!id) {
      return res.status(400).json({ error: 'ID de relación requerido' });
    }

    // Si usamos Supabase, actualizar allí
    if (supabaseAdmin) {
      try {
        const { data: existingRows, error: selectErr } = await supabaseAdmin
          .from('care_relationships')
          .select('*')
          .eq('id', id)
          .limit(1);

        if (selectErr) throw selectErr;
        
        const existing = existingRows && existingRows[0] ? normalizeSupabaseRow(existingRows[0]) : null;
        if (!existing) {
          return res.status(404).json({ error: 'Relación no encontrada' });
        }

        // Preparar datos actualizados: ahora default_session_price y default_psych_percent son columnas directas
        const updatePayload = {};
        
        // Si vienen los campos directos, actualizarlos
        if (updatedData.default_session_price !== undefined) {
          updatePayload.default_session_price = updatedData.default_session_price;
        }
        if (updatedData.default_psych_percent !== undefined) {
          updatePayload.default_psych_percent = Math.min(updatedData.default_psych_percent, 100);
        }
        if (updatedData.center_id !== undefined) {
          updatePayload.center_id = updatedData.center_id;
        }
        
        // Actualizar data JSONB con tags y otros campos
        const existingData = existing.data || {};
        const newData = { ...existingData };
        
        // Si se envían tags, guardarlas en data
        if (updatedData.tags !== undefined) {
          newData.tags = updatedData.tags;
        }
        
        // Si se envía uses_bonos, guardarlo en data
        if (updatedData.uses_bonos !== undefined) {
          newData.uses_bonos = updatedData.uses_bonos;
        }
        
        // Merge cualquier otro campo de data que venga
        if (updatedData.data) {
          Object.assign(newData, updatedData.data);
        }
        
        // Siempre actualizar el campo data
        updatePayload.data = newData;
        
        console.log('[PUT /api/relationships/:id] Update payload:', JSON.stringify(updatePayload, null, 2));

        const { error: updateErr } = await supabaseAdmin
          .from('care_relationships')
          .update(updatePayload)
          .eq('id', id);

        if (updateErr) {
          console.error('[PUT /api/relationships/:id] Supabase update error:', updateErr);
          throw updateErr;
        }

        // Obtener la relación actualizada
        const { data: updatedRows, error: fetchErr } = await supabaseAdmin
          .from('care_relationships')
          .select('*')
          .eq('id', id)
          .limit(1);

        if (fetchErr) throw fetchErr;
        
        console.log('[PUT /api/relationships/:id] Raw updated row from Supabase:', updatedRows[0]);
        const updated = updatedRows && updatedRows[0] ? normalizeSupabaseRow(updatedRows[0]) : null;
        console.log('[PUT /api/relationships/:id] Normalized updated row:', updated);

        // Actualizar cache
        if (supabaseDbCache?.careRelationships && updated) {
          const idx = supabaseDbCache.careRelationships.findIndex(rel => rel.id === id);
          if (idx >= 0) supabaseDbCache.careRelationships[idx] = updated;
        }

        console.log('[PUT /api/relationships/:id] ✓ Relación actualizada en Supabase');
        return res.json(updated || existing);
      } catch (err) {
        console.error('[PUT /api/relationships/:id] ❌ Error actualizando en Supabase:', err);
        return res.status(500).json({ error: 'Error actualizando la relación' });
      }
    }

    // Fallback a DB local
    const db = getDb();
    if (!Array.isArray(db.careRelationships)) db.careRelationships = [];
    
    const idx = db.careRelationships.findIndex(rel => rel.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Relación no encontrada' });
    }

    // Actualizar campos directos y mantener compatibilidad con data
    const existingData = db.careRelationships[idx].data || {};
    const newData = {
      ...existingData,
      ...(updatedData.data || {})
    };
    
    // Si se envían tags, guardarlas en data
    if (updatedData.tags !== undefined) {
      newData.tags = updatedData.tags;
    }
    
    db.careRelationships[idx] = {
      ...db.careRelationships[idx],
      ...updatedData,
      default_session_price: updatedData.default_session_price ?? db.careRelationships[idx].default_session_price ?? 0,
      default_psych_percent: updatedData.default_psych_percent !== undefined 
        ? Math.min(updatedData.default_psych_percent, 100) 
        : (db.careRelationships[idx].default_psych_percent ?? 100),
      uses_bonos: updatedData.uses_bonos !== undefined 
        ? updatedData.uses_bonos 
        : (db.careRelationships[idx].uses_bonos ?? false),
      data: newData
    };

    await saveDb(db, { awaitPersistence: true });
    console.log('[PUT /api/relationships/:id] ✓ Relación actualizada en DB local');
    return res.json(db.careRelationships[idx]);
  } catch (err) {
    console.error('❌ Error updating relationship', err);
    return res.status(500).json({ error: err?.message || 'No se pudo actualizar la relación' });
  }
});

// --- BONOS ---
app.get('/api/bonos', async (req, res) => {
  try {
    const { pacient_user_id, psychologist_user_id } = req.query;
    
    console.log('[GET /api/bonos] Consultando bonos:', { pacient_user_id, psychologist_user_id });
    
    if (!pacient_user_id && !psychologist_user_id) {
      return res.status(400).json({ error: 'Se requiere pacient_user_id o psychologist_user_id' });
    }

    if (supabaseAdmin) {
      // Primero obtener los bonos
      let bonoQuery = supabaseAdmin
        .from('bono')
        .select('*');
      
      if (pacient_user_id) {
        bonoQuery = bonoQuery.eq('pacient_user_id', pacient_user_id);
      }
      if (psychologist_user_id) {
        bonoQuery = bonoQuery.eq('psychologist_user_id', psychologist_user_id);
      }
      
      const { data: bonos, error: bonosError } = await bonoQuery.order('created_at', { ascending: false });
      
      if (bonosError) {
        console.error('[GET /api/bonos] Error en Supabase al obtener bonos:', bonosError);
        throw bonosError;
      }
      
      // Para cada bono, contar las sesiones asociadas
      const bonosWithCounts = await Promise.all((bonos || []).map(async (bono) => {
        const { data: sessions, error: sessionsError } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('bonus_id', bono.id);
        
        if (sessionsError) {
          console.error(`[GET /api/bonos] Error al contar sesiones del bono ${bono.id}:`, sessionsError);
        }
        
        const sessionsUsed = sessions?.length || 0;
        const sessionsRemaining = bono.total_sessions_amount - sessionsUsed;
        
        return {
          ...bono,
          used_sessions: sessionsUsed,
          remaining_sessions: sessionsRemaining
        };
      }));
      
      console.log(`[GET /api/bonos] ✓ Encontrados ${bonosWithCounts.length} bonos en Supabase con cálculo de sesiones`);
      return res.json(bonosWithCounts);
    }
    
    // Fallback a DB local (si se implementa)
    return res.json([]);
  } catch (error) {
    console.error('[GET /api/bonos] Error:', error);
    res.status(500).json({ error: 'Error al obtener bonos' });
  }
});

app.post('/api/bonos', async (req, res) => {
  try {
    const { psychologist_user_id, pacient_user_id, total_sessions_amount, total_price_bono_amount, paid = false } = req.body;
    
    console.log('[POST /api/bonos] Creando bono:', req.body);
    
    // Validaciones
    if (!psychologist_user_id || !pacient_user_id) {
      return res.status(400).json({ error: 'Se requiere psychologist_user_id y pacient_user_id' });
    }
    
    if (!total_sessions_amount || total_sessions_amount < 1) {
      return res.status(400).json({ error: 'total_sessions_amount debe ser al menos 1' });
    }
    
    if (!total_price_bono_amount || total_price_bono_amount <= 0) {
      return res.status(400).json({ error: 'total_price_bono_amount debe ser mayor a 0' });
    }

    if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin
        .from('bono')
        .insert({
          psychologist_user_id,
          pacient_user_id,
          total_sessions_amount: parseInt(total_sessions_amount),
          total_price_bono_amount: parseFloat(total_price_bono_amount),
          paid: Boolean(paid)
        })
        .select()
        .single();
      
      if (error) {
        console.error('[POST /api/bonos] Error en Supabase:', error);
        throw error;
      }
      
      console.log('[POST /api/bonos] ✓ Bono creado en Supabase:', data);
      return res.status(201).json(data);
    }
    
    // Fallback a DB local (si se implementa)
    return res.status(501).json({ error: 'Creación de bonos solo disponible con Supabase' });
  } catch (error) {
    console.error('[POST /api/bonos] Error:', error);
    res.status(500).json({ error: 'Error al crear el bono' });
  }
});

// PUT: Actualizar un bono
app.put('/api/bonos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { total_price_bono_amount, paid } = req.body;
    
    console.log('[PUT /api/bonos/:id] Actualizando bono:', { id, body: req.body });
    
    // Validaciones
    if (!total_price_bono_amount || total_price_bono_amount <= 0) {
      return res.status(400).json({ error: 'total_price_bono_amount debe ser mayor a 0' });
    }

    if (supabaseAdmin) {
      const updateData = {
        total_price_bono_amount: parseFloat(total_price_bono_amount),
        paid: Boolean(paid)
      };

      const { data, error } = await supabaseAdmin
        .from('bono')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('[PUT /api/bonos/:id] Error en Supabase:', error);
        throw error;
      }
      
      if (!data) {
        return res.status(404).json({ error: 'Bono no encontrado' });
      }
      
      console.log('[PUT /api/bonos/:id] ✓ Bono actualizado en Supabase:', data);
      return res.json(data);
    }
    
    return res.status(501).json({ error: 'Actualización de bonos solo disponible con Supabase' });
  } catch (error) {
    console.error('[PUT /api/bonos/:id] Error:', error);
    res.status(500).json({ error: 'Error al actualizar el bono' });
  }
});

// DELETE: Eliminar un bono
app.delete('/api/bonos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('[DELETE /api/bonos/:id] Eliminando bono:', { id });

    if (supabaseAdmin) {
      // Primero verificamos si el bono existe y obtenemos sus datos
      const { data: bono, error: fetchError } = await supabaseAdmin
        .from('bono')
        .select('*, sessions!sessions_invoice_id_fkey(id)')
        .eq('id', id)
        .single();
      
      if (fetchError) {
        console.error('[DELETE /api/bonos/:id] Error al buscar bono:', fetchError);
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Bono no encontrado' });
        }
        throw fetchError;
      }

      // Verificar si tiene sesiones asignadas (a través de invoice_id)
      if (bono.invoice_id) {
        // Verificar si hay sesiones asociadas a esta factura
        const { data: sessions, error: sessionsError } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('invoice_id', bono.invoice_id)
          .limit(1);
        
        if (sessionsError) {
          console.error('[DELETE /api/bonos/:id] Error al verificar sesiones:', sessionsError);
          throw sessionsError;
        }
        
        if (sessions && sessions.length > 0) {
          return res.status(400).json({ 
            error: 'No se puede eliminar un bono que tiene sesiones asignadas',
            message: 'Este bono tiene sesiones asociadas y no puede ser eliminado'
          });
        }
      }

      // Si no tiene sesiones, procedemos a eliminar
      const { error: deleteError } = await supabaseAdmin
        .from('bono')
        .delete()
        .eq('id', id);
      
      if (deleteError) {
        console.error('[DELETE /api/bonos/:id] Error al eliminar:', deleteError);
        throw deleteError;
      }
      
      console.log('[DELETE /api/bonos/:id] ✓ Bono eliminado en Supabase');
      return res.json({ success: true, message: 'Bono eliminado correctamente' });
    }
    
    return res.status(501).json({ error: 'Eliminación de bonos solo disponible con Supabase' });
  } catch (error) {
    console.error('[DELETE /api/bonos/:id] Error:', error);
    res.status(500).json({ error: 'Error al eliminar el bono' });
  }
});

// GET: Obtener bonos disponibles (con sesiones restantes) para un paciente
app.get('/api/bonos/available/:pacient_user_id', async (req, res) => {
  try {
    const { pacient_user_id } = req.params;
    const { psychologist_user_id } = req.query;
    
    console.log('[GET /api/bonos/available/:pacient_user_id] Consultando bonos disponibles:', { pacient_user_id, psychologist_user_id });
    
    if (!pacient_user_id) {
      return res.status(400).json({ error: 'Se requiere pacient_user_id' });
    }

    if (supabaseAdmin) {
      // Obtener bonos del paciente con el psicólogo especificado
      let bonoQuery = supabaseAdmin
        .from('bono')
        .select('*')
        .eq('pacient_user_id', pacient_user_id);
      
      if (psychologist_user_id) {
        bonoQuery = bonoQuery.eq('psychologist_user_id', psychologist_user_id);
      }
      
      const { data: bonos, error: bonosError } = await bonoQuery.order('created_at', { ascending: false });
      
      if (bonosError) {
        console.error('[GET /api/bonos/available] Error en Supabase:', bonosError);
        throw bonosError;
      }
      
      // Para cada bono, contar las sesiones asociadas y filtrar disponibles
      const availableBonos = [];
      for (const bono of (bonos || [])) {
        const { data: sessions, error: sessionsError } = await supabaseAdmin
          .from('sessions')
          .select('id')
          .eq('bonus_id', bono.id);
        
        if (sessionsError) {
          console.error(`[GET /api/bonos/available] Error al contar sesiones del bono ${bono.id}:`, sessionsError);
        }
        
        const sessionsUsed = sessions?.length || 0;
        const sessionsRemaining = bono.total_sessions_amount - sessionsUsed;
        
        if (sessionsRemaining > 0) {
          availableBonos.push({
            ...bono,
            sessions_used: sessionsUsed,
            sessions_remaining: sessionsRemaining
          });
        }
      }
      
      console.log(`[GET /api/bonos/available] ✓ Encontrados ${availableBonos.length} bonos disponibles`);
      return res.json(availableBonos);
    }
    
    return res.json([]);
  } catch (error) {
    console.error('[GET /api/bonos/available] Error:', error);
    res.status(500).json({ error: 'Error al obtener bonos disponibles' });
  }
});

// POST: Asignar sesión a un bono
app.post('/api/sessions/:sessionId/assign-bonus', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { bonus_id } = req.body;
    
    console.log('[POST /api/sessions/:sessionId/assign-bonus] Asignando sesión a bono:', { sessionId, bonus_id });
    
    if (!bonus_id) {
      return res.status(400).json({ error: 'Se requiere bonus_id' });
    }

    if (supabaseAdmin) {
      // Obtener la sesión actual
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('sessions')
        .select('*, patient_user_id, invoice_id')
        .eq('id', sessionId)
        .single();
      
      if (sessionError || !session) {
        console.error('[POST assign-bonus] Sesión no encontrada:', sessionError);
        return res.status(404).json({ error: 'Sesión no encontrada' });
      }
      
      // Validar que la sesión no tenga invoice_id
      if (session.invoice_id) {
        console.error('[POST assign-bonus] Sesión ya tiene invoice_id:', session.invoice_id);
        return res.status(400).json({ error: 'No se puede asignar un bono a una sesión que ya tiene una factura asociada' });
      }
      
      // Verificar que el bono existe y tiene sesiones disponibles
      const { data: bono, error: bonoError } = await supabaseAdmin
        .from('bono')
        .select('*, sessions!sessions_bonus_id_fkey(id)')
        .eq('id', bonus_id)
        .eq('pacient_user_id', session.patient_user_id)
        .single();
      
      if (bonoError || !bono) {
        console.error('[POST assign-bonus] Bono no encontrado:', bonoError);
        return res.status(404).json({ error: 'Bono no encontrado o no pertenece al paciente' });
      }
      
      const sessionsUsed = bono.sessions?.length || 0;
      const sessionsRemaining = bono.total_sessions_amount - sessionsUsed;
      
      if (sessionsRemaining <= 0) {
        return res.status(400).json({ error: 'El bono no tiene sesiones disponibles' });
      }
      
      // Asignar el bono a la sesión
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({ bonus_id })
        .eq('id', sessionId)
        .select()
        .single();
      
      if (updateError) {
        console.error('[POST assign-bonus] Error al actualizar sesión:', updateError);
        throw updateError;
      }
      
      console.log('[POST assign-bonus] ✓ Sesión asignada a bono correctamente');
      return res.json({ 
        success: true, 
        session: updatedSession,
        sessions_remaining: sessionsRemaining - 1
      });
    }
    
    return res.status(501).json({ error: 'Asignación de bonos solo disponible con Supabase' });
  } catch (error) {
    console.error('[POST assign-bonus] Error:', error);
    res.status(500).json({ error: 'Error al asignar sesión a bono' });
  }
});

// DELETE: Desasignar sesión de un bono
app.delete('/api/sessions/:sessionId/assign-bonus', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('[DELETE /api/sessions/:sessionId/assign-bonus] Desasignando sesión de bono:', { sessionId });

    if (supabaseAdmin) {
      // Desasignar el bono de la sesión (poner bonus_id a null)
      const { data: updatedSession, error: updateError } = await supabaseAdmin
        .from('sessions')
        .update({ bonus_id: null })
        .eq('id', sessionId)
        .select()
        .single();
      
      if (updateError) {
        console.error('[DELETE assign-bonus] Error al actualizar sesión:', updateError);
        if (updateError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        throw updateError;
      }
      
      console.log('[DELETE assign-bonus] ✓ Sesión desasignada de bono correctamente');
      return res.json({ 
        success: true, 
        session: updatedSession
      });
    }
    
    return res.status(501).json({ error: 'Desasignación de bonos solo disponible con Supabase' });
  } catch (error) {
    console.error('[DELETE assign-bonus] Error:', error);
    res.status(500).json({ error: 'Error al desasignar sesión de bono' });
  }
});

// --- SESSIONS / CALENDAR ---
app.get('/api/sessions', async (req, res) => {
  const { psychologistId, patientId, year, month, startDate, endDate, status, futureOnly } = req.query;
  if (!psychologistId && !patientId) {
    return res.status(400).json({ error: 'Missing psychologistId or patientId' });
  }
  
  try {
    // Si hay Supabase, consultar directamente desde allí
    if (supabaseAdmin) {
      console.log(`📖 [GET /api/sessions] Consultando Supabase directamente para psychologistId=${psychologistId}, patientId=${patientId}`);
      
      // Construir query de Supabase
      let query = supabaseAdmin.from('sessions').select('*');
      
      if (psychologistId) {
        query = query.eq('psychologist_user_id', psychologistId);
      }
      if (patientId) {
        query = query.eq('patient_user_id', patientId);
      }
      
      // Aplicar filtros de fecha
      if (startDate) {
        query = query.gte('starts_on', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('starts_on', `${endDate}T23:59:59`);
      }
      if (futureOnly === 'true') {
        const now = new Date().toISOString();
        query = query.gte('starts_on', now);
      }
      
      // Aplicar filtro de status
      if (status) {
        const statuses = status.split(',');
        query = query.in('status', statuses);
      }
      
      const { data: sessionsData, error: sessionsError } = await query;
      
      if (sessionsError) {
        console.error('❌ Error consultando sesiones de Supabase:', sessionsError);
        throw sessionsError;
      }
      
      // Normalizar sesiones (convierte starts_on/ends_on a date/startTime/endTime)
      let sessions = (sessionsData || []).map(row => {
        const normalized = normalizeSupabaseRow(row);
        if (row.status) normalized.status = row.status;
        if (row.starts_on) {
          // NO usar toTimeString() porque aplica zona horaria local
          // Extraer la hora directamente del string ISO
          const startsISO = row.starts_on;
          const match = startsISO.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
          if (match) {
            normalized.date = match[1];
            normalized.startTime = match[2];
          } else {
            // Fallback si el formato es diferente
            const startsDate = new Date(row.starts_on);
            normalized.date = startsDate.toISOString().split('T')[0];
            normalized.startTime = startsDate.toISOString().split('T')[1].substring(0, 5);
          }
          normalized.starts_on = row.starts_on;
        }
        if (row.ends_on) {
          // Extraer la hora directamente del string ISO sin conversiones de zona horaria
          const endsISO = row.ends_on;
          const match = endsISO.match(/T(\d{2}:\d{2})/);
          if (match) {
            normalized.endTime = match[1];
          } else {
            // Fallback
            const endsDate = new Date(row.ends_on);
            normalized.endTime = endsDate.toISOString().split('T')[1].substring(0, 5);
          }
          normalized.ends_on = row.ends_on;
        }
        // Agregar compatibilidad con campos legacy
        if (row.psychologist_user_id) normalized.psychologistId = row.psychologist_user_id;
        if (row.patient_user_id) normalized.patientId = row.patient_user_id;
        return normalized;
      });
      
      // Si es psicólogo, también incluir disponibilidad desde tabla dispo
      if (psychologistId && !patientId) {
        const { data: dispoData, error: dispoError } = await supabaseAdmin
          .from('dispo')
          .select('*')
          .eq('psychologist_user_id', psychologistId);
        
        if (!dispoError && dispoData) {
          const dispoSlots = dispoData.map(d => ({
            id: d.id,
            psychologistId: psychologistId,
            psychologist_user_id: d.psychologist_user_id,
            patientId: '',
            patient_user_id: '',
            patientName: 'Disponible',
            patientPhone: '',
            date: d.data?.date || '',
            startTime: d.data?.startTime || '',
            endTime: d.data?.endTime || '',
            type: d.data?.type || 'online',
            status: 'available',
            isFromDispo: true
          }));
          sessions = [...sessions, ...dispoSlots];
        }
      }
      
      // Cargar datos de usuarios para enriquecer
      const { data: usersData } = await supabaseAdmin.from('users').select('*');
      const userIndex = new Map(
        (usersData || [])
          .filter(u => u && u.id)
          .map(u => {
            const normalized = normalizeSupabaseRow(u);
            return [normalized.id, normalized];
          })
      );
      
      // Cargar relaciones para obtener tags
      const { data: relationshipsData } = await supabaseAdmin.from('care_relationships').select('*');
      const relationshipIndex = new Map();
      (relationshipsData || []).forEach(rel => {
        const key = `${rel.psychologist_user_id}-${rel.patient_user_id}`;
        relationshipIndex.set(key, normalizeSupabaseRow(rel));
      });
      
      // Enriquecer sesiones con datos de usuarios y tags
      const sessionsWithDetails = sessions.map(session => {
        const enriched = { ...session };
        if (session.patientId || session.patient_user_id) {
          const patientIdToUse = session.patient_user_id || session.patientId;
          const patient = userIndex.get(patientIdToUse);
          if (patient) {
            const resolvedPhone = (patient.phone || '').trim() || enriched.patientPhone;
            if (resolvedPhone && resolvedPhone !== enriched.patientPhone) {
              enriched.patientPhone = resolvedPhone;
            }
            if (enriched.status !== 'available') {
              enriched.patientName = enriched.patientName === 'Disponible' || !enriched.patientName ? patient.name : enriched.patientName;
            }
            enriched.patientEmail = patient.email;
          }
        }
        
        if (session.psychologistId || session.psychologist_user_id) {
          const psychologistIdToUse = session.psychologist_user_id || session.psychologistId;
          const psychologist = userIndex.get(psychologistIdToUse);
          if (psychologist) {
            enriched.psychologistName = enriched.psychologistName || psychologist.name;
            enriched.psychologistEmail = psychologist.email;
          }
          
          // Agregar tags de la relación si existe
          const patientIdToUse = session.patient_user_id || session.patientId;
          if (patientIdToUse) {
            const relationKey = `${psychologistIdToUse}-${patientIdToUse}`;
            const relationship = relationshipIndex.get(relationKey);
            if (relationship) {
              enriched.tags = relationship.tags || relationship.data?.tags || [];
            }
          }
        }
        
        return enriched;
      });
      
      console.log(`✅ [GET /api/sessions] Devolviendo ${sessionsWithDetails.length} sesiones desde Supabase`);
      return res.json(sessionsWithDetails);
    }
    
    // Si no hay Supabase configurado, devolver error
    console.error('❌ [GET /api/sessions] Supabase no configurado');
    return res.status(503).json({ 
      error: 'Supabase no está configurado. Las sesiones solo se cargan desde Supabase.' 
    });
  } catch (error) {
    console.error('❌ Error consultando Supabase:', error);
    return res.status(500).json({ 
      error: 'Error al cargar sesiones desde Supabase',
      details: error?.message 
    });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const db = getDb();
    if (!db.sessions) db.sessions = [];
    if (!db.dispo) db.dispo = [];

    // Obtener el user_id del psicólogo autenticado
    const psychologistUserId = req.headers['x-user-id'] || req.headers['x-userid'];
    
    if (!psychologistUserId) {
      console.error('❌ Missing psychologist userId from session');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    // Si se proporciona deleteDispoId, borrar de la tabla dispo
    const { deleteDispoId, ...sessionData } = req.body;
    
    // NO PERMITIR crear disponibilidad desde este endpoint
    if (sessionData.status === 'available' || !sessionData.patientId) {
      console.error('❌ Cannot create availability through /api/sessions. Use /api/sessions/availability instead');
      return res.status(400).json({ 
        error: 'No se puede crear disponibilidad desde este endpoint. Usa /api/sessions/availability' 
      });
    }
    
    if (deleteDispoId) {
      console.log('🗑️ Deleting dispo slot:', deleteDispoId);
      const dispoIdx = db.dispo.findIndex(d => d.id === deleteDispoId);
      if (dispoIdx !== -1) {
        db.dispo.splice(dispoIdx, 1);
        console.log('✅ Dispo slot deleted');
      } else {
        console.warn('⚠️ Dispo slot not found:', deleteDispoId);
      }
    }

    // Obtener el patient_user_id desde el patientId
    let patientUserId = null;
    if (sessionData.patientId) {
      const patient = db.users?.find(u => u.id === sessionData.patientId);
      if (patient) {
        patientUserId = patient.id;
      }
    }

    // Validar percent_psych
    if (sessionData.percent_psych && sessionData.percent_psych > 100) {
      console.error('❌ percent_psych cannot exceed 100');
      return res.status(400).json({ error: 'El porcentaje del psicólogo no puede exceder 100%' });
    }
    
    // Calcular starts_on y ends_on a partir de date, startTime, endTime
    const starts_on = dateTimeToISO(sessionData.date, sessionData.startTime);
    const ends_on = dateTimeToISO(sessionData.date, sessionData.endTime);
    
    const session = { 
      ...sessionData, 
      id: sessionData.id || Date.now().toString(),
      psychologist_user_id: psychologistUserId,
      patient_user_id: patientUserId,
      starts_on,
      ends_on,
      percent_psych: Math.min(sessionData.percent_psych ?? 70, 100)
    };
    
    console.log('📝 Creating session:', { 
      sessionId: session.id, 
      psychologistUserId, 
      patientUserId,
      patientId: sessionData.patientId 
    });
    
    db.sessions.push(session);
    
    // Limpiar sesiones de disponibilidad (sin paciente) antes de guardar
    db.sessions = db.sessions.filter(s => s.patient_user_id || s.patientId);
    
    await saveDb(db, { awaitPersistence: true });
    return res.json(session);
  } catch (err) {
    console.error('❌ Error creating session', err);
    return res.status(500).json({ error: err?.message || 'No se pudo crear la sesión' });
  }
});

app.post('/api/sessions/availability', async (req, res) => {
  try {
    const { slots, psychologistId } = req.body;
    // Obtener el user_id de la sesión del usuario autenticado
    const userId = req.headers['x-user-id'] || req.headers['x-userid'];
    
    console.log('📅 Creating availability slots in dispo table:', { slotsCount: slots?.length, psychologistId, userId });
    
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      console.error('❌ Invalid slots data:', slots);
      return res.status(400).json({ error: 'Se requiere un array de slots válido' });
    }
    
    if (!userId) {
      console.error('❌ Missing userId from session');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    const db = getDb();
    if (!db.dispo) db.dispo = [];
    
    const newSlots = [];
    slots.forEach(slot => {
      // Guardar en tabla dispo con estructura: id, data, psychologist_user_id, created_at
      const dispoSlot = {
        id: slot.id || Date.now().toString() + Math.random().toString(36).substring(7),
        psychologist_user_id: userId,
        data: {
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          type: slot.type || 'online'
        },
        created_at: new Date().toISOString()
      };
      db.dispo.push(dispoSlot);
      newSlots.push(dispoSlot);
    });
    
    // Limpiar sesiones de disponibilidad (sin paciente) antes de guardar
    db.sessions = (db.sessions || []).filter(s => s.patient_user_id || s.patientId);
    
    await saveDb(db, { awaitPersistence: true });
    console.log('✅ Availability slots created successfully in dispo table:', newSlots.length);
    res.json({ success: true, count: newSlots.length, slots: newSlots });
  } catch (error) {
    console.error('❌ Error creating availability slots:', error);
    res.status(500).json({ error: 'Error al crear espacios disponibles: ' + error.message });
  }
});

app.patch('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 [PATCH /api/sessions/${id}] Actualizando sesión con datos:`, req.body);
    
    const db = getDb();
    if (!db.sessions) db.sessions = [];

    const idx = db.sessions.findIndex(s => s.id === id);
    if (idx === -1) {
      console.log(`❌ [PATCH /api/sessions/${id}] Sesión no encontrada`);
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`✅ [PATCH /api/sessions/${id}] Sesión encontrada en índice ${idx}:`, db.sessions[idx]);

    // Validar percent_psych si se proporciona
    if (req.body.percent_psych && req.body.percent_psych > 100) {
      console.error(`❌ [PATCH /api/sessions/${id}] percent_psych cannot exceed 100`);
      return res.status(400).json({ error: 'El porcentaje del psicólogo no puede exceder 100%' });
    }

    const updatedSession = { 
      ...db.sessions[idx], 
      ...req.body,
      percent_psych: req.body.percent_psych !== undefined 
        ? Math.min(req.body.percent_psych, 100) 
        : db.sessions[idx].percent_psych
    };
    
    // SOLO recalcular starts_on/ends_on si se modificaron explícitamente date, startTime o endTime
    // Esto evita problemas de zona horaria cuando solo se actualiza status, paid, etc.
    if (req.body.date !== undefined || req.body.startTime !== undefined || req.body.endTime !== undefined) {
      const date = updatedSession.date;
      const startTime = updatedSession.startTime;
      const endTime = updatedSession.endTime;
      
      if (date && startTime) {
        updatedSession.starts_on = dateTimeToISO(date, startTime);
      }
      if (date && endTime) {
        updatedSession.ends_on = dateTimeToISO(date, endTime);
      }
    }

    if (updatedSession.status === 'available') {
      updatedSession.patientId = '';
      updatedSession.patient_user_id = '';
      updatedSession.patientName = 'Disponible';
      updatedSession.patientPhone = '';
      delete updatedSession.meetLink;
    }

    // Cuando se asigna un paciente, actualizar también el campo patient_user_id
    if (updatedSession.patientId) {
      updatedSession.patient_user_id = updatedSession.patientId;
    }

    if (updatedSession.status === 'scheduled' &&
        updatedSession.type === 'online' &&
        !updatedSession.meetLink) {
      const meetId = crypto.randomBytes(12).toString('base64url');
      updatedSession.meetLink = `https://meet.google.com/${meetId}`;
      console.log(`🎥 Auto-generated Google Meet link for session ${id}: ${updatedSession.meetLink}`);
    }

    db.sessions[idx] = updatedSession;
    console.log(`💾 [PATCH /api/sessions/${id}] Sesión actualizada en memoria:`, updatedSession);
    
    // Actualizar directamente en Supabase sin tocar otras tablas
    if (supabaseAdmin) {
      try {
        console.log(`🔄 [PATCH /api/sessions/${id}] Actualizando en Supabase directamente...`);
        
        // Preparar el row para Supabase - solo incluir campos que pueden cambiar
        // NO incluir patient_user_id ni psychologist_user_id a menos que se proporcionen explícitamente
        // Esto evita triggers de care_relationships
        const supabaseRow = {
          data: updatedSession,
          status: updatedSession.status || 'scheduled',
          starts_on: updatedSession.starts_on,
          ends_on: updatedSession.ends_on,
          price: updatedSession.price ?? 0,
          percent_psych: updatedSession.percent_psych ?? 100,
          paid: updatedSession.paid ?? false
        };
        
        // Incluir session_entry_id si se proporcionó
        if (req.body.session_entry_id !== undefined) {
          supabaseRow.session_entry_id = req.body.session_entry_id;
        }
        
        // Solo incluir patient_user_id si se proporcionó explícitamente en el body
        if (req.body.patient_user_id !== undefined || req.body.patientId !== undefined) {
          supabaseRow.patient_user_id = updatedSession.patient_user_id || updatedSession.patientId;
        }
        
        // Solo incluir psychologist_user_id si se proporcionó explícitamente en el body
        if (req.body.psychologist_user_id !== undefined || req.body.psychologistId !== undefined) {
          supabaseRow.psychologist_user_id = updatedSession.psychologist_user_id || updatedSession.psychologistId;
        }
        
        const { error: updateErr } = await supabaseAdmin
          .from('sessions')
          .update(supabaseRow)
          .eq('id', id);
        
        if (updateErr) {
          console.error(`❌ [PATCH /api/sessions/${id}] Error en Supabase:`, updateErr);
          throw updateErr;
        }
        
        console.log(`✅ [PATCH /api/sessions/${id}] Sesión actualizada en Supabase`);
      } catch (supaErr) {
        console.error(`❌ [PATCH /api/sessions/${id}] Error actualizando en Supabase:`, supaErr);
        // NO hacer fallback a saveDb para evitar upserts masivos con datos incompletos
        // Solo loguear el error y continuar
        console.warn(`⚠️ [PATCH /api/sessions/${id}] Sesión actualizada en memoria pero no se sincronizó con Supabase`);
      }
    } else {
      // Si no hay Supabase, usar saveDb tradicional
      await saveDb(db, { awaitPersistence: true });
    }
    
    console.log(`📤 [PATCH /api/sessions/${id}] Enviando respuesta al cliente:`, db.sessions[idx]);
    
    return res.json(db.sessions[idx]);
  } catch (err) {
    console.error('❌ Error updating session', err);
    return res.status(500).json({ error: err?.message || 'No se pudo actualizar la sesión' });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📝 [PUT /api/sessions/${id}] Actualizando sesión completa con datos:`, req.body);
    
    const db = getDb();
    if (!db.sessions) db.sessions = [];

    const idx = db.sessions.findIndex(s => s.id === id);
    if (idx === -1) {
      console.log(`❌ [PUT /api/sessions/${id}] Sesión no encontrada`);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Validar percent_psych
    if (req.body.percent_psych && req.body.percent_psych > 100) {
      console.error(`❌ [PUT /api/sessions/${id}] percent_psych cannot exceed 100`);
      return res.status(400).json({ error: 'El porcentaje del psicólogo no puede exceder 100%' });
    }
    
    // PUT reemplaza completamente la sesión
    const updatedSession = { 
      ...req.body, 
      id,
      percent_psych: Math.min(req.body.percent_psych ?? 100, 100)
    };
    
    // Calcular starts_on/ends_on si se proporcionan date/startTime/endTime
    if (updatedSession.date && updatedSession.startTime) {
      updatedSession.starts_on = dateTimeToISO(updatedSession.date, updatedSession.startTime);
    }
    if (updatedSession.date && updatedSession.endTime) {
      updatedSession.ends_on = dateTimeToISO(updatedSession.date, updatedSession.endTime);
    }

    db.sessions[idx] = updatedSession;
    console.log(`💾 [PUT /api/sessions/${id}] Sesión reemplazada completamente en memoria`);
    
    // Actualizar directamente en Supabase sin tocar otras tablas
    if (supabaseAdmin) {
      try {
        console.log(`🔄 [PUT /api/sessions/${id}] Actualizando en Supabase directamente...`);
        
        // Preparar el row para Supabase
        // Solo incluir patient_user_id y psychologist_user_id si se proporcionan explícitamente
        // Esto evita triggers de care_relationships cuando no es necesario
        const supabaseRow = {
          data: updatedSession,
          status: updatedSession.status || 'scheduled',
          starts_on: updatedSession.starts_on,
          ends_on: updatedSession.ends_on,
          price: updatedSession.price ?? 0,
          percent_psych: updatedSession.percent_psych ?? 100,
          paid: updatedSession.paid ?? false
        };
        
        // Solo incluir patient_user_id si está presente en el request
        if (req.body.patient_user_id !== undefined || req.body.patientId !== undefined) {
          supabaseRow.patient_user_id = updatedSession.patient_user_id || updatedSession.patientId;
        }
        
        // Solo incluir psychologist_user_id si está presente en el request
        if (req.body.psychologist_user_id !== undefined || req.body.psychologistId !== undefined) {
          supabaseRow.psychologist_user_id = updatedSession.psychologist_user_id || updatedSession.psychologistId;
        }
        
        const { error: updateErr } = await supabaseAdmin
          .from('sessions')
          .update(supabaseRow)
          .eq('id', id);
        
        if (updateErr) {
          console.error(`❌ [PUT /api/sessions/${id}] Error en Supabase:`, updateErr);
          throw updateErr;
        }
        
        console.log(`✅ [PUT /api/sessions/${id}] Sesión actualizada en Supabase`);
      } catch (supaErr) {
        console.error(`❌ [PUT /api/sessions/${id}] Error actualizando en Supabase:`, supaErr);
        // NO hacer fallback a saveDb para evitar upserts masivos con datos incompletos
        // Solo loguear el error y continuar
        console.warn(`⚠️ [PUT /api/sessions/${id}] Sesión actualizada en memoria pero no se sincronizó con Supabase`);
      }
    } else {
      // Si no hay Supabase, usar saveDb tradicional
      await saveDb(db, { awaitPersistence: true });
    }
    
    console.log(`📤 [PUT /api/sessions/${id}] Enviando respuesta al cliente`);
    
    return res.json(db.sessions[idx]);
  } catch (err) {
    console.error('❌ Error updating session (PUT)', err);
    return res.status(500).json({ error: err?.message || 'No se pudo actualizar la sesión' });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🗑️ Intentando eliminar sesión: ${id}`);
    
    const db = getDb();
    if (!db.sessions) db.sessions = [];
    if (!db.dispo) db.dispo = [];
    if (!db.sessionEntries) db.sessionEntries = [];

    let session = null;
    let sessionEntryId = null;
    
    // Verificar que supabaseAdmin esté definido
    console.log(`🔍 supabaseAdmin está definido: ${!!supabaseAdmin}`);
    
    // Si hay Supabase, buscar primero ahí
    if (supabaseAdmin) {
      // Buscar en tabla sessions
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single();
      
      if (!sessionError && sessionData) {
        session = normalizeSupabaseRow(sessionData);
        sessionEntryId = session.session_entry_id;
        console.log(`📍 Sesión encontrada en Supabase (sessions): ${id}, status: ${session.status}`);
        
        // Eliminar session_entry si existe
        if (sessionEntryId) {
          const { error: entryDeleteError } = await supabaseAdmin
            .from('session_entry')
            .delete()
            .eq('id', sessionEntryId);
          
          if (entryDeleteError) {
            console.error(`⚠️ Error eliminando session_entry ${sessionEntryId}:`, entryDeleteError);
          } else {
            console.log(`✅ Session entry ${sessionEntryId} eliminada de Supabase`);
          }
        }
        
        // Eliminar sesión de Supabase
        const { error: deleteError } = await supabaseAdmin
          .from('sessions')
          .delete()
          .eq('id', id);
        
        if (deleteError) {
          console.error(`⚠️ Error eliminando sesión de Supabase:`, deleteError);
          return res.status(500).json({ error: 'Error eliminando sesión de Supabase' });
        }
        
        console.log(`✅ Sesión ${id} eliminada de Supabase`);
      } else {
        // Buscar en tabla dispo
        const { data: dispoData, error: dispoError } = await supabaseAdmin
          .from('dispo')
          .select('*')
          .eq('id', id)
          .single();
        
        if (!dispoError && dispoData) {
          console.log(`📍 Sesión encontrada en Supabase (dispo): ${id}`);
          
          // Eliminar de dispo
          const { error: deleteError } = await supabaseAdmin
            .from('dispo')
            .delete()
            .eq('id', id);
          
          if (deleteError) {
            console.error(`⚠️ Error eliminando dispo de Supabase:`, deleteError);
            return res.status(500).json({ error: 'Error eliminando disponibilidad de Supabase' });
          }
          
          console.log(`✅ Disponibilidad ${id} eliminada de Supabase`);
          
          // Eliminar de caché local
          const dispoIdx = db.dispo.findIndex(d => d.id === id);
          if (dispoIdx !== -1) {
            db.dispo.splice(dispoIdx, 1);
          }
          
          await saveDb(db, { awaitPersistence: true });
          return res.json({ success: true, deletedFrom: 'dispo' });
        }
      }
    }
    
    // Eliminar de caché local
    const idx = db.sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
      const localSession = db.sessions[idx];
      if (localSession.session_entry_id) {
        const entryIdx = db.sessionEntries.findIndex(e => e.id === localSession.session_entry_id);
        if (entryIdx !== -1) {
          db.sessionEntries.splice(entryIdx, 1);
        }
      }
      db.sessions.splice(idx, 1);
    }
    
    const dispoIdx = db.dispo.findIndex(d => d.id === id);
    if (dispoIdx !== -1) {
      db.dispo.splice(dispoIdx, 1);
    }
    
    // Limpiar sesiones de disponibilidad
    db.sessions = db.sessions.filter(s => s.patient_user_id || s.patientId);
    await saveDb(db, { awaitPersistence: true });
    
    if (!session && idx === -1 && dispoIdx === -1) {
      console.log(`⚠️ Sesión ${id} no encontrada en ninguna parte`);
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`🗑️ Sesión ${id} eliminada correctamente`);
    return res.json({ 
      success: true, 
      deletedFrom: session ? 'sessions' : (dispoIdx !== -1 ? 'dispo' : 'cache'),
      sessionEntryDeleted: !!sessionEntryId 
    });
  } catch (err) {
    console.error('❌ Error deleting session', err);
    return res.status(500).json({ error: err?.message || 'No se pudo eliminar la sesión' });
  }
});

// --- TRANSCRIPTION ENDPOINT ---
app.post('/api/transcribe', async (req, res) => {
  try {
    console.log('📝 Procesando solicitud de transcripción...');

    if (!genAI) {
      console.error('❌ GEMINI_API_KEY no configurada');
      return res.status(500).json({ 
        error: 'API de transcripción no configurada. Por favor, configura GEMINI_API_KEY en las variables de entorno.' 
      });
    }

    const busboy = Busboy({ headers: req.headers });
    let fileBuffer = null;
    let fileName = '';
    let mimeType = '';

    busboy.on('file', (fieldname, file, info) => {
      const { filename, encoding, mimeType: mime } = info;
      fileName = filename;
      mimeType = mime;
      const chunks = [];
      
      file.on('data', (data) => {
        chunks.push(data);
      });

      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
        console.log(`✅ Archivo recibido: ${fileName} (${fileBuffer.length} bytes)`);
      });
    });

    busboy.on('finish', async () => {
      if (!fileBuffer) {
        return res.status(400).json({ error: 'No se recibió ningún archivo' });
      }

      try {
        // Si es un archivo de texto, extraer texto directamente
        if (mimeType.startsWith('text/')) {
          const text = fileBuffer.toString('utf-8');
          console.log('✅ Texto extraído del archivo de texto');
          return res.json({ transcript: text });
        }

        // Si es PDF, usar Gemini para extraer texto
        if (mimeType === 'application/pdf') {
          console.log('📄 Extrayendo texto de PDF con Gemini...');
          
          try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            
            const result = await model.generateContent([
              {
                inlineData: {
                  data: fileBuffer.toString('base64'),
                  mimeType: 'application/pdf'
                }
              },
              'Extrae todo el texto de este documento PDF. Devuelve únicamente el texto extraído sin comentarios adicionales.'
            ]);

            const text = result.response.text();
            console.log('✅ Texto extraído del PDF');
            return res.json({ transcript: text });
          } catch (pdfError) {
            console.error('❌ Error extrayendo PDF:', pdfError);
            throw pdfError;
          }
        }

        // Si es audio/video, transcribir con Gemini
        if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
          console.log('🎤 Transcribiendo audio con Gemini...');

          try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            
            const result = await model.generateContent([
              {
                inlineData: {
                  data: fileBuffer.toString('base64'),
                  mimeType: mimeType
                }
              },
              'Transcribe el contenido de este audio/video. Devuelve únicamente la transcripción en español sin comentarios adicionales. Si detectas diferentes personas hablando, indica quién habla en cada momento.'
            ]);

            const transcript = result.response.text();
            console.log('✅ Transcripción completada');
            return res.json({ transcript: transcript });
          } catch (transcribeError) {
            console.error('❌ Error transcribiendo:', transcribeError);
            throw transcribeError;
          }
        }

        return res.status(400).json({ 
          error: 'Tipo de archivo no soportado. Usa archivos de texto, PDF, audio o video.' 
        });
      } catch (error) {
        console.error('❌ Error en transcripción:', error);
        return res.status(500).json({ 
          error: 'Error al procesar el archivo: ' + (error.message || 'Error desconocido') 
        });
      }
    });

    req.pipe(busboy);
  } catch (error) {
    console.error('❌ Error en endpoint de transcripción:', error);
    return res.status(500).json({ 
      error: 'Error al procesar la solicitud: ' + (error.message || 'Error desconocido') 
    });
  }
});

// --- SESSION ENTRIES ---
app.post('/api/session-entries', async (req, res) => {
  try {
    const db = getDb();
    if (!db.sessionEntries) db.sessionEntries = [];

    const userId = req.headers['x-user-id'] || req.headers['x-userid'];
    
    if (!userId) {
      console.error('❌ Missing userId from session');
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const {
      session_id,
      creator_user_id,
      target_user_id,
      transcript,
      summary,
      status,
      file,
      file_name,
      file_type,
      entry_type
    } = req.body;

    if (!session_id) {
      return res.status(400).json({ 
        error: 'session_id es requerido' 
      });
    }

    // transcript y summary pueden ser vacíos al crear una entrada inicial
    if (transcript === undefined || summary === undefined) {
      return res.status(400).json({ 
        error: 'transcript y summary deben estar presentes (pueden ser cadenas vacías)' 
      });
    }

    const sessionEntryId = crypto.randomUUID();
    const sessionEntryData = {
      session_id,
      transcript,
      summary,
      file,
      file_name,
      file_type,
      entry_type: entry_type || 'session_note',
      created_at: new Date().toISOString()
    };

    // Crear directamente en Supabase primero
    if (supabaseAdmin) {
      try {
        // Asegurar que la tabla existe
        await ensureSessionEntryTable();

        // Insertar en Supabase (session_id va dentro de data)
        const { error: insertError } = await supabaseAdmin
          .from('session_entry')
          .insert({
            id: sessionEntryId,
            creator_user_id: creator_user_id || userId,
            target_user_id,
            status: status || 'pending',
            data: sessionEntryData
          });

        if (insertError) {
          console.error('❌ Error insertando session_entry en Supabase:', insertError);
          throw insertError;
        }

        console.log('✅ Session_entry creada en Supabase:', sessionEntryId);

        // Actualizar la sesión con el session_entry_id
        const { error: updateError } = await supabaseAdmin
          .from('sessions')
          .update({ session_entry_id: sessionEntryId })
          .eq('id', session_id);
        
        if (updateError) {
          console.error('❌ Error actualizando session_entry_id en Supabase:', updateError);
        } else {
          console.log('✅ session_entry_id actualizado en Supabase para session:', session_id);
        }
      } catch (supabaseErr) {
        console.error('❌ Error en operaciones de Supabase:', supabaseErr);
        throw supabaseErr;
      }
    }

    // Actualizar caché en memoria
    const sessionEntry = {
      id: sessionEntryId,
      session_id,
      creator_user_id: creator_user_id || userId,
      target_user_id,
      data: {
        ...sessionEntryData,
        status: status || 'pending'
      },
      created_at: new Date().toISOString()
    };

    db.sessionEntries.push(sessionEntry);

    // Ligar session_entry con session en memoria
    if (!db.sessions) db.sessions = [];
    const sessionIdx = db.sessions.findIndex(s => s.id === session_id);
    if (sessionIdx !== -1) {
      db.sessions[sessionIdx].session_entry_id = sessionEntryId;
      console.log('✅ Linked session_entry to session in memory:', session_id);
    }

    console.log('✅ Session entry created:', sessionEntryId);
    return res.json(sessionEntry);
  } catch (err) {
    console.error('❌ Error creating session entry', err);
    return res.status(500).json({ error: err?.message || 'No se pudo crear la entrada de sesión' });
  }
});

app.get('/api/session-entries', async (req, res) => {
  try {
    const { session_id, target_user_id, creator_user_id } = req.query;
    const db = getDb();

    let entries = db.sessionEntries || [];

    if (session_id) {
      entries = entries.filter(e => e.session_id === session_id);
    }

    if (target_user_id) {
      entries = entries.filter(e => e.target_user_id === target_user_id);
    }

    if (creator_user_id) {
      entries = entries.filter(e => e.creator_user_id === creator_user_id);
    }

    return res.json(entries);
  } catch (err) {
    console.error('❌ Error fetching session entries', err);
    return res.status(500).json({ error: err?.message || 'No se pudieron obtener las entradas' });
  }
});

app.get('/api/session-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    if (!db.sessionEntries) db.sessionEntries = [];

    const entry = db.sessionEntries.find(e => e.id === id);
    if (!entry) {
      return res.status(404).json({ error: 'Session entry not found' });
    }

    return res.json(entry);
  } catch (err) {
    console.error('❌ Error fetching session entry by ID', err);
    return res.status(500).json({ error: err?.message || 'No se pudo obtener la entrada' });
  }
});

app.patch('/api/session-entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    if (!db.sessionEntries) db.sessionEntries = [];

    const idx = db.sessionEntries.findIndex(e => e.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Session entry not found' });
    }

    const { summary, status, transcript, file, file_name, file_type } = req.body;
    const entry = db.sessionEntries[idx];
    const updates = {};
    const dataUpdates = { ...entry.data };

    if (summary !== undefined) {
      dataUpdates.summary = summary;
    }

    if (status !== undefined) {
      updates.status = status;
      dataUpdates.status = status;
      console.log('✅ Session entry status updated to:', status);
    }

    if (transcript !== undefined) {
      dataUpdates.transcript = transcript;
    }

    if (file !== undefined) {
      dataUpdates.file = file;
    }

    if (file_name !== undefined) {
      dataUpdates.file_name = file_name;
    }

    if (file_type !== undefined) {
      dataUpdates.file_type = file_type;
    }

    dataUpdates.updated_at = new Date().toISOString();
    updates.data = dataUpdates;

    // Actualizar directamente en Supabase
    if (supabaseAdmin) {
      try {
        console.log('📝 Actualizando session_entry en Supabase:', { id, updates });
        const { data: updatedData, error: updateError } = await supabaseAdmin
          .from('session_entry')
          .update(updates)
          .eq('id', id)
          .select();

        if (updateError) {
          console.error('❌ Error actualizando session_entry en Supabase:', updateError);
          throw updateError;
        }

        console.log('✅ Session_entry actualizada en Supabase:', updatedData);
      } catch (supabaseErr) {
        console.error('❌ Error en operación de Supabase:', supabaseErr);
        throw supabaseErr;
      }
    }

    // Actualizar caché en memoria
    db.sessionEntries[idx] = { ...entry, ...updates };
    db.sessionEntries[idx].data = dataUpdates;

    console.log('✅ Session entry updated:', id);
    return res.json(db.sessionEntries[idx]);
  } catch (err) {
    console.error('❌ Error updating session entry', err);
    return res.status(500).json({ error: err?.message || 'No se pudo actualizar la entrada' });
  }
});

// --- PATIENTS LIST ---
app.get('/api/psychologist/:psychologistId/patients', (req, res) => {
  const { psychologistId } = req.params;
  const db = getDb();
  
  console.log(`[GET /api/psychologist/${psychologistId}/patients] Total relationships:`, db.careRelationships?.length);
  
  // Filtrar solo relaciones activas (sin endedAt) del psicólogo
  const linkedPatientIds = new Set(
    (db.careRelationships || [])
      .filter(rel => {
        const psychId = rel.psychologist_user_id || rel.psych_user_id || rel.psychologistId;
        const patId = rel.patient_user_id || rel.patientId;
        const isMatch = psychId === psychologistId;
        const isActive = !rel.endedAt; // Solo relaciones activas
        
        console.log(`  Evaluating relationship:`, {
          psychId,
          patId,
          endedAt: rel.endedAt,
          isMatch,
          isActive,
          result: isMatch && isActive
        });
        
        return isMatch && isActive;
      })
      .map(rel => rel.patient_user_id || rel.patientId)
  );

  console.log(`[GET /api/psychologist/${psychologistId}/patients] Linked patient IDs:`, Array.from(linkedPatientIds));
  
  const patients = db.users
    ? db.users.filter(user => {
        const isLinked = linkedPatientIds.has(user.id);
        console.log(`  Evaluating user ${user.id} (${user.name}):`, { isLinked });
        return isLinked;
      }).map(u => ({
        id: u.id,
        name: u.name,
        email: u.user_email,
        phone: u.phone || '',
        billing_name: u.billing_name || u.name,
        billing_address: u.billing_address || u.address || '',
        billing_tax_id: u.billing_tax_id || u.tax_id || ''
      }))
    : [];
  
  console.log(`[GET /api/psychologist/${psychologistId}/patients] Found ${patients.length} active patients:`, patients);
  res.json(patients);
});

// ===== CENTROS ENDPOINTS =====

// GET /api/centers - Obtener todos los centros de un psicólogo
app.get('/api/centers', async (req, res) => {
  try {
    const { psychologistId } = req.query;
    
    if (!psychologistId) {
      return res.status(400).json({ error: 'psychologistId es requerido' });
    }

    console.log(`[GET /api/centers] Obteniendo centros para psychologistId: ${psychologistId}`);

    // Intentar desde Supabase
    if (supabaseAdmin) {
      try {
        const { data: centers, error } = await supabaseAdmin
          .from('center')
          .select('*')
          .eq('psychologist_user_id', psychologistId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('❌ Error consultando centros en Supabase:', error);
          return res.status(500).json({ error: 'Error obteniendo centros' });
        }

        console.log(`✅ [GET /api/centers] ${centers?.length || 0} centros encontrados`);
        return res.json(centers || []);
      } catch (err) {
        console.error('❌ Error obteniendo centros:', err);
        return res.status(500).json({ error: 'Error obteniendo centros' });
      }
    }

    // Fallback a DB local (aunque no es ideal para esta tabla)
    res.json([]);
  } catch (error) {
    console.error('Error in GET /api/centers:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/centers - Crear un nuevo centro
app.post('/api/centers', async (req, res) => {
  try {
    const { psychologistId, center_name, cif, address } = req.body;

    if (!psychologistId || !center_name || !cif || !address) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: psychologistId, center_name, cif, address' 
      });
    }

    console.log(`[POST /api/centers] Creando centro para psychologistId: ${psychologistId}`);

    const centerId = crypto.randomUUID();
    const newCenter = {
      id: centerId,
      psychologist_user_id: psychologistId,
      center_name,
      cif,
      address,
      created_at: new Date().toISOString()
    };

    // Guardar en Supabase
    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('center')
          .insert([newCenter])
          .select()
          .single();

        if (error) {
          console.error('❌ Error creando centro en Supabase:', error);
          return res.status(500).json({ error: 'Error creando centro', details: error.message });
        }

        console.log('✅ [POST /api/centers] Centro creado exitosamente:', data.id);
        return res.status(201).json(data);
      } catch (err) {
        console.error('❌ Error creando centro:', err);
        return res.status(500).json({ error: 'Error creando centro' });
      }
    }

    res.status(500).json({ error: 'Base de datos no disponible' });
  } catch (error) {
    console.error('Error in POST /api/centers:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/centers/:id - Actualizar un centro
app.patch('/api/centers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { center_name, cif, address, psychologistId } = req.body;

    if (!psychologistId) {
      return res.status(400).json({ error: 'psychologistId es requerido' });
    }

    console.log(`[PATCH /api/centers/${id}] Actualizando centro`);

    // Actualizar en Supabase
    if (supabaseAdmin) {
      try {
        // Verificar que el centro pertenece al psicólogo
        const { data: existing, error: fetchError } = await supabaseAdmin
          .from('center')
          .select('*')
          .eq('id', id)
          .eq('psychologist_user_id', psychologistId)
          .single();

        if (fetchError || !existing) {
          return res.status(404).json({ error: 'Centro no encontrado' });
        }

        // Actualizar solo los campos proporcionados
        const updates = {};
        if (center_name !== undefined) updates.center_name = center_name;
        if (cif !== undefined) updates.cif = cif;
        if (address !== undefined) updates.address = address;

        const { data, error } = await supabaseAdmin
          .from('center')
          .update(updates)
          .eq('id', id)
          .eq('psychologist_user_id', psychologistId)
          .select()
          .single();

        if (error) {
          console.error('❌ Error actualizando centro en Supabase:', error);
          return res.status(500).json({ error: 'Error actualizando centro' });
        }

        console.log('✅ [PATCH /api/centers] Centro actualizado exitosamente');
        return res.json(data);
      } catch (err) {
        console.error('❌ Error actualizando centro:', err);
        return res.status(500).json({ error: 'Error actualizando centro' });
      }
    }

    res.status(500).json({ error: 'Base de datos no disponible' });
  } catch (error) {
    console.error('Error in PATCH /api/centers/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/centers/:id - Eliminar un centro
app.delete('/api/centers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { psychologistId } = req.query;

    if (!psychologistId) {
      return res.status(400).json({ error: 'psychologistId es requerido' });
    }

    console.log(`[DELETE /api/centers/${id}] Eliminando centro`);

    // Eliminar de Supabase
    if (supabaseAdmin) {
      try {
        const { error } = await supabaseAdmin
          .from('center')
          .delete()
          .eq('id', id)
          .eq('psychologist_user_id', psychologistId);

        if (error) {
          console.error('❌ Error eliminando centro en Supabase:', error);
          return res.status(500).json({ error: 'Error eliminando centro' });
        }

        console.log('✅ [DELETE /api/centers] Centro eliminado exitosamente');
        return res.json({ success: true });
      } catch (err) {
        console.error('❌ Error eliminando centro:', err);
        return res.status(500).json({ error: 'Error eliminando centro' });
      }
    }

    res.status(500).json({ error: 'Base de datos no disponible' });
  } catch (error) {
    console.error('Error in DELETE /api/centers/:id:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/center/:centerId/unbilled - Obtener sesiones sin facturar de un centro
app.get('/api/center/:centerId/unbilled', async (req, res) => {
  try {
    const { centerId } = req.params;
    const { psychologistId } = req.query;
    
    console.log(`📋 [GET /api/center/${centerId}/unbilled] Obteniendo sesiones sin facturar del centro`);
    
    if (!psychologistId) {
      return res.status(400).json({ error: 'psychologistId es requerido' });
    }
    
    if (supabaseAdmin) {
      try {
        // Primero, obtener todos los pacientes que pertenecen a este centro
        const { data: relationships, error: relError } = await supabaseAdmin
          .from('care_relationships')
          .select('patient_user_id')
          .eq('center_id', centerId)
          .eq('psychologist_user_id', psychologistId);
        
        if (relError) {
          console.error('❌ Error obteniendo relaciones del centro:', relError);
          throw relError;
        }
        
        if (!relationships || relationships.length === 0) {
          console.log('ℹ️ No hay pacientes asociados a este centro');
          return res.json({ sessions: [] });
        }
        
        const patientIds = relationships.map(r => r.patient_user_id);
        console.log(`📋 Pacientes del centro: ${patientIds.length}`);
        
        // Obtener sesiones completadas sin facturar de estos pacientes
        const { data: sessions, error: sessionsError } = await supabaseAdmin
          .from('sessions')
          .select('*')
          .in('patient_user_id', patientIds)
          .eq('psychologist_user_id', psychologistId)
          .is('invoice_id', null)
          .is('bonus_id', null)
          .eq('status', 'completed')
          .order('starts_on', { ascending: false });
        
        if (sessionsError) {
          console.error('❌ Error obteniendo sesiones sin facturar:', sessionsError);
          throw sessionsError;
        }
        
        console.log(`✅ Encontradas ${sessions?.length || 0} sesiones sin facturar para el centro`);
        
        // Obtener bonos sin facturar de estos pacientes
        const { data: bonos, error: bonosError } = await supabaseAdmin
          .from('bono')
          .select('*')
          .in('pacient_user_id', patientIds)
          .eq('psychologist_user_id', psychologistId)
          .is('invoice_id', null)
          .order('created_at', { ascending: false });
        
        if (bonosError) {
          console.error('❌ Error obteniendo bonos sin facturar:', bonosError);
          throw bonosError;
        }
        
        console.log(`✅ Encontrados ${bonos?.length || 0} bonos sin facturar para el centro`);
        
        return res.json({
          sessions: sessions || [],
          bonos: bonos || []
        });
        
      } catch (err) {
        console.error('❌ Error obteniendo sesiones del centro:', err);
        return res.status(500).json({ error: 'Error obteniendo sesiones del centro' });
      }
    }
    
    // Fallback a DB local
    return res.json({ sessions: [] });
  } catch (error) {
    console.error('Error in GET /api/center/:centerId/unbilled:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/', (_req, res) => {
  res.send('DYGO API OK ✅ Usa /api/users, /api/entries, etc.');
});

// --- ERROR HANDLER MIDDLEWARE ---
app.use((err, req, res, next) => {
  console.error('❌❌❌ Global error handler caught:', err);
  console.error('Stack:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
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

// Capturar errores no manejados
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('🔧 Attempting to start server...');
console.log('   VERCEL:', process.env.VERCEL);
console.log('   VERCEL_ENV:', process.env.VERCEL_ENV);
console.log('📊 Configuración Supabase:');
console.log('   SUPABASE_URL:', SUPABASE_URL ? '✅ Configurado' : '❌ No configurado');
console.log('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅ Configurado' : '❌ No configurado');
console.log('   SUPABASE_REST_ONLY:', SUPABASE_REST_ONLY);

// Initialize database connections before starting server
(async () => {
  try {
    await initializeSupabase();
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }

  if (!process.env.VERCEL && !process.env.VERCEL_ENV) {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 SERVIDOR DYGO (ES MODULES) LISTO');
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`📂 DB: ${DB_FILE}\n`);
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      process.exit(1);
    });
  } else {
    console.log('⏭️  Skipping app.listen() because VERCEL env detected');
  }
})();

// (Opcional) export para tests
export default app;
