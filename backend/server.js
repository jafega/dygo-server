// server.js (ES Modules)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

// --- CONFIGURACIÓN PARA ES MODULES ---
// En ES Modules no existe __dirname, así que lo recreamos:
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURACIÓN BÁSICA ---
const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'db.json');

// --- OPTIONAL SMTP CONFIGURATION ---
// Set SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS and SMTP_FROM in your env
let transporter = null;
let useEthereal = false; // When true, we're using Nodemailer's Ethereal test account (dev-only)

if (process.env.SMTP_HOST) {
  const transportOpts = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true'
  };

  // Only add auth when credentials are provided (MailHog does not require auth)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transportOpts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
  }

  transporter = nodemailer.createTransport(transportOpts);
  console.log('✉️ SMTP configured for sending emails:', process.env.SMTP_HOST, 'from:', process.env.SMTP_FROM || 'noreply');
}

// If no SMTP provided and not in production, create an Ethereal test account so emails work without configuration
(async () => {
  if (!transporter && process.env.NODE_ENV !== 'production') {
    try {
      console.log('⚙️ No SMTP configured - creating Ethereal test account for dev email sending');
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      useEthereal = true;
      console.log('✉️ Ethereal account created (dev only). Preview sent messages with the URL returned in send responses or check nodemailer getTestMessageUrl.');
    } catch (err) {
      console.warn('⚠️ Failed to create Ethereal test account:', err);
    }
  }
})();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Reemplaza a body-parser

// --- ACCESO A "BASE DE DATOS" (db.json) ---
const createInitialDb = () => ({
  users: [],
  entries: [],
  goals: [],
  // Stores one-time reset tokens: { token, userId, expires }
  resetTokens: [],
  invitations: [],
  settings: {}
});

const getDb = () => {
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

// --- PASSWORD RESET (DEV) ---
// Request password reset (generates a token and logs a link)
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const db = getDb();
    const user = db.users.find(u => u.email && u.email.toLowerCase() === String(email).toLowerCase());

    // Always respond success to avoid user enumeration
    if (!user) {
      console.log(`Password reset requested for non-existing email: ${email}`);
      return res.json({ success: true });
    }

    const token = crypto.randomUUID();
    const expires = Date.now() + 1000 * 60 * 60; // 1 hour

    db.resetTokens = db.resetTokens || [];
    db.resetTokens.push({ token, userId: user.id, expires });
    saveDb(db);

    const origin = req.headers.origin || `http://localhost:${PORT}`;
    const resetLink = `${origin}/?resetToken=${token}`;

    // If SMTP is configured (or Ethereal test account exists), attempt to send an email; otherwise log and return the link for dev convenience
    if (transporter) {
      const mailOptions = {
        from: process.env.SMTP_FROM || `no-reply@${req.hostname || 'dygo.local'}`,
        to: user.email,
        subject: 'Dygo - Restablecer contraseña',
        text: `Para restablecer tu contraseña visita: ${resetLink}`,
        html: `<p>Para restablecer tu contraseña, haz clic <a href="${resetLink}">aquí</a>.</p>`
      };

      try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✉️ Password reset email sent to ${user.email}: ${info.messageId}`);

        // If we're using Ethereal, nodemailer provides a preview URL
        if (useEthereal) {
          const previewUrl = nodemailer.getTestMessageUrl(info);
          if (previewUrl) {
            console.log(`🔍 Ethereal preview URL: ${previewUrl}`);
            // For development convenience return the preview URL so frontends can display it
            return res.json({ success: true, previewUrl });
          }
        }

        // For real SMTP providers, return success only (do not include preview links)
        return res.json({ success: true });
      } catch (err) {
        console.error('❌ Error sending reset email:', err);
        // Fallback to logging the link and returning it
        console.log(`🔐 Password reset link for ${user.email}: ${resetLink}`);
        return res.json({ success: true, resetLink });
      }
    }

    // No SMTP configured: log and return link (useful for local development)
    console.log(`🔐 Password reset link for ${user.email}: ${resetLink}`);
    return res.json({ success: true, resetLink });
  } catch (error) {
    console.error('Error in /api/auth/forgot-password', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Reset password with token
app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and newPassword are required' });

    const db = getDb();
    const t = (db.resetTokens || []).find(rt => rt.token === token);
    if (!t || t.expires < Date.now()) return res.status(400).json({ error: 'Token invalid or expired' });

    const user = db.users.find(u => u.id === t.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.password = newPassword;

    // Remove token
    db.resetTokens = (db.resetTokens || []).filter(rt => rt.token !== token);
    saveDb(db);

    console.log(`✅ Password reset for user ${user.email}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/auth/reset-password', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// --- RUTAS DE USUARIOS ---
app.get('/api/users/:id', (req, res) => {
  const db = getDb();
  const user = db.users.find((u) => u.id === req.params.id);

  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(user);
});

app.get('/api/users', (_req, res) => {
  const db = getDb();
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

app.get('/', (_req, res) => {
  res.send('DYGO API OK ✅ Usa /api/users, /api/entries, etc.');
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 SERVIDOR DYGO (ES MODULES) LISTO');
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📂 DB: ${DB_FILE}\n`);
});

// (Opcional) export para tests
export default app;
