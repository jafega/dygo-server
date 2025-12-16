// server.js (ES Modules)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';


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

// --- ACCESO A "BASE DE DATOS" (db.json) ---
const createInitialDb = () => ({
  users: [],
  entries: [],
  goals: [],
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

// --- GOOGLE OAUTH / SIGN-IN ---
// Client sends an ID token (JWT) obtained from Google Identity Services.
// We validate it using Google's tokeninfo endpoint and create/find a local user.
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    // Validate token with Google's tokeninfo endpoint
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!tokenInfoRes.ok) {
      console.warn('Invalid Google id token response:', await tokenInfoRes.text());
      return res.status(400).json({ error: 'Invalid id token' });
    }

    const tokenInfo = await tokenInfoRes.json();
    const { email, name, sub: googleId, aud } = tokenInfo;

    // Optional: If GOOGLE_CLIENT_ID is set, verify audience
    if (process.env.GOOGLE_CLIENT_ID && aud !== process.env.GOOGLE_CLIENT_ID) {
      console.warn('Google id_token aud mismatch', aud, process.env.GOOGLE_CLIENT_ID);
      return res.status(400).json({ error: 'Token audience mismatch' });
    }

    const db = getDb();
    let user = db.users.find(u => u.email && String(u.email).toLowerCase() === String(email).toLowerCase());

    if (!user) {
      // Create a new user (default to PATIENT role). Mark as google-linked account
      user = {
        id: crypto.randomUUID(),
        name: name || 'Sin nombre',
        email,
        password: '',
        role: 'PATIENT',
        accessList: [],
        googleId
      };
      db.users.push(user);
      saveDb(db);
      console.log('✅ Created new user from Google sign-in:', user.email);
    }

    // Return the user
    return res.json(user);
  } catch (err) {
    console.error('Error in /api/auth/google', err);
    return res.status(500).json({ error: 'Internal server error' });
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
