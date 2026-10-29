// Utilidades E2E de mainds business (Playwright del entorno, sin dependencia
// en package.json — R13).
//
// Arranca el backend real (backend/test/helpers/server.js) en el puerto 3001,
// que es al que apunta el proxy de Vite, y un Vite de desarrollo. Las sesiones
// se inyectan en el navegador con las mismas claves que usa authService.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../backend/test/helpers/server.js';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const VITE_PORT = 5179;
export const APP_URL = `http://localhost:${VITE_PORT}`;
export const SHOTS = process.env.E2E_SHOTS_DIR || path.join(ROOT, 'e2e', '.shots');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function startStack(extraEnv = {}) {
  const backend = await startServer({
    env: {
      PORT: '3001',
      BUSINESS_ENABLED: 'true',
      BUSINESS_STORE: 'file',
      FRONTEND_URL: APP_URL,
      CLINICAL_ENCRYPTION_KEY: 'a'.repeat(64),
      ...extraEnv
    }
  });
  const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }
  });
  let out = '';
  vite.stdout.on('data', d => { out += d; });
  vite.stderr.on('data', d => { out += d; });
  const deadline = Date.now() + 60_000;
  for (;;) {
    try { if ((await fetch(APP_URL)).ok) break; } catch { /* */ }
    if (Date.now() > deadline) throw new Error(`Vite no arrancó:\n${out.slice(-2000)}`);
    await sleep(300);
  }
  fs.mkdirSync(SHOTS, { recursive: true });
  return {
    backend,
    async stop() {
      vite.kill('SIGTERM');
      await backend.stop();
    }
  };
}

/** Contexto de navegador con la sesión de `user` ya iniciada. */
export async function loggedInContext(browser, user) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'es-ES' });
  await ctx.addInitScript(({ id, token }) => {
    try {
      localStorage.setItem('ai_diary_current_user_id', id);
      sessionStorage.setItem('ai_diary_session_token', token);
      // Evita modales de primera vez que no son objeto de la prueba.
      localStorage.setItem('mainds_terms_accepted_v3', 'true');
    } catch { /* */ }
  }, { id: user.id, token: user.token });
  return ctx;
}

export async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(`E2E: ${msg}`);
}

/**
 * Abre el alta de clínica: está dentro de Ajustes (el modal del perfil, al
 * pulsar en el usuario de la barra lateral), no a la vista en Pro.
 */
export async function openCreateClinic(page, user) {
  await page.getByRole('button', { name: new RegExp(user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click({ timeout: 30_000 });
  await page.getByTestId('business-offer').getByRole('button', { name: 'Crear una clínica' }).click();
}
