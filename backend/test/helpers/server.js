// Arranca backend/server.js en un proceso hijo para los tests de integración.
//
// - Puerto aleatorio libre.
// - Base de datos en un fichero temporal (MAINDS_DB_FILE): el db.json del repo
//   nunca se toca.
// - Sin Supabase, sin Postgres, sin Stripe, sin Resend, sin Gemini: las
//   variables se fijan a cadena vacía para que dotenv (que no pisa variables
//   ya definidas) no las cargue desde un .env.local del desarrollador.
// - Los usuarios de prueba se crean con /api/auth/register y /api/auth/login.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(__dirname, '..', '..');

// Variables que, si llegaran del entorno o de un .env.local, harían que el
// servidor hablase con servicios reales.
const BLANKED_ENV = [
  'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_REST_ONLY', 'SUPABASE_SSL', 'SUPABASE_PGBOUNCER', 'VITE_SUPABASE_URL',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'STRIPE_PRICE_ID_STARTER',
  'STRIPE_PRICE_ID_MAINDER', 'STRIPE_PRICE_ID_SUPERMAINDER', 'STRIPE_PRICE_ID_PATIENT_PREMIUM',
  'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'GEMINI_API_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM', 'TWILIO_TEMPLATE_SID',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AGENT_API_TOKEN',
  'USE_SQLITE', 'SQLITE_DB_FILE', 'DISALLOW_LOCAL_PERSISTENCE', 'VERCEL', 'VERCEL_ENV',
  'RUN_SCHEMA_CHECK_ON_START', 'DEDUPE_USERS_ON_START',
  'BUSINESS_ENABLED', 'BUSINESS_STORE', 'BUSINESS_STORE_FILE', 'BUSINESS_BETA_EMAILS',
  'CLINICAL_ENCRYPTION_KEY'
];

export const SUPERADMIN_EMAIL = 'superadmin@test.local';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Arranca un servidor aislado.
 * @param {object} [opts]
 * @param {object} [opts.env]   Variables extra (p. ej. BUSINESS_ENABLED).
 * @param {object} [opts.db]    Contenido inicial del fichero de base de datos.
 * @param {boolean} [opts.verbose] Reenvía la salida del servidor a la consola.
 */
export async function startServer(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mainds-test-'));
  const dbFile = path.join(tmpDir, 'db.json');
  if (opts.db) fs.writeFileSync(dbFile, JSON.stringify(opts.db, null, 2), 'utf-8');
  // opts.env.PORT fija el puerto (los E2E usan 3001, al que apunta el proxy de Vite).
  const port = opts.env?.PORT ? Number(opts.env.PORT) : await freePort();

  const env = { ...process.env };
  for (const k of BLANKED_ENV) env[k] = '';
  Object.assign(env, {
    PORT: String(port),
    NODE_ENV: 'test',
    MAINDS_DB_FILE: dbFile,
    BUSINESS_STORE_FILE: path.join(tmpDir, 'business-store.json'),
    SUPERADMIN_EMAILS: SUPERADMIN_EMAIL,
    AUDIT_DISABLED: 'true',
    MAINDS_TEST_NO_RATE_LIMIT: '1'
  }, opts.env || {});

  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const onData = (d) => {
    output += d.toString();
    if (output.length > 200_000) output = output.slice(-100_000);
    if (opts.verbose) process.stderr.write(d);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  const baseUrl = `http://127.0.0.1:${port}`;
  let exited = null;
  child.on('exit', (code) => { exited = code; });

  const deadline = Date.now() + 30_000;
  for (;;) {
    if (exited !== null) {
      throw new Error(`El servidor terminó al arrancar (code ${exited}).\n${output.slice(-4000)}`);
    }
    try {
      const r = await fetch(`${baseUrl}/api/plans`);
      if (r.status === 200) break;
    } catch { /* aún no escucha */ }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`El servidor no arrancó en 30 s.\n${output.slice(-4000)}`);
    }
    await sleep(150);
  }

  async function request(method, urlPath, { token, body, headers } = {}) {
    const h = { ...(headers || {}) };
    if (token) h.Authorization = `Bearer ${token}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(baseUrl + urlPath, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
    return { status: r.status, body: json, text };
  }

  /** Registra (si hace falta) e inicia sesión. Devuelve { id, email, token, user }. */
  async function createUser({ name, email, password = 'Password123!', role = 'PATIENT' }) {
    const reg = await request('POST', '/api/auth/register', { body: { name, email, password, role } });
    if (reg.status !== 200 && !(reg.status === 400 && /existe/.test(reg.body?.error || ''))) {
      throw new Error(`register ${email} → ${reg.status} ${reg.text}`);
    }
    const login = await request('POST', '/api/auth/login', { body: { email, password } });
    if (login.status !== 200 || !login.body?.sessionToken) {
      throw new Error(`login ${email} → ${login.status} ${login.text}`);
    }
    return { id: login.body.id, email, token: login.body.sessionToken, user: login.body };
  }

  function readDb() {
    return JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
  }

  function writeDb(data) {
    fs.writeFileSync(dbFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  async function stop() {
    if (exited === null) {
      child.kill('SIGTERM');
      const t = Date.now();
      while (exited === null && Date.now() - t < 5000) await sleep(50);
      if (exited === null) child.kill('SIGKILL');
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return {
    baseUrl, port, dbFile, tmpDir,
    request, createUser, readDb, writeDb, stop,
    output: () => output
  };
}
