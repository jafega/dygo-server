const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Increased limit for Base64 images/audio

// --- Simple File-Based Database Logic ---
const getDb = () => {
    if (!fs.existsSync(DB_FILE)) {
        const initialDb = { users: [], entries: [], goals: [], invitations: [], settings: {} };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialDb));
        return initialDb;
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
};

const saveDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req, res) => {
    const { name, email, password, role } = req.body;
    const db = getDb();
    
    if (db.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'El email ya existe' });
    }

    const newUser = {
        id: crypto.randomUUID(),
        name,
        email,
        password, // In a real prod app, hash this!
        role,
        accessList: []
    };

    db.users.push(newUser);
    saveDb(db);
    res.json(newUser);
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const db = getDb();
    const user = db.users.find(u => u.email === email && u.password === password);
    
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    res.json(user);
});

app.get('/api/users/:id', (req, res) => {
    const db = getDb();
    const user = db.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
});

app.get('/api/users', (req, res) => {
    const db = getDb();
    // Return all users (filtered by query if needed, or strict directory)
    // For security in real app, filter sensitive data
    res.json(db.users); 
});

app.put('/api/users/:id', (req, res) => {
    const db = getDb();
    const idx = db.users.findIndex(u => u.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
    
    db.users[idx] = { ...db.users[idx], ...req.body };
    saveDb(db);
    res.json(db.users[idx]);
});

// --- ENTRIES ROUTES ---
app.get('/api/entries', (req, res) => {
    const { userId } = req.query;
    const db = getDb();
    const entries = db.entries.filter(e => e.userId === userId);
    res.json(entries);
});

app.post('/api/entries', (req, res) => {
    const db = getDb();
    db.entries.push(req.body);
    saveDb(db);
    res.json(req.body);
});

app.put('/api/entries/:id', (req, res) => {
    const db = getDb();
    const idx = db.entries.findIndex(e => e.id === req.params.id);
    if (idx !== -1) {
        db.entries[idx] = req.body;
        saveDb(db);
    }
    res.json(req.body);
});

app.delete('/api/entries/:id', (req, res) => {
    const db = getDb();
    db.entries = db.entries.filter(e => e.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
});

// --- GOALS ROUTES ---
app.get('/api/goals', (req, res) => {
    const { userId } = req.query;
    const db = getDb();
    res.json(db.goals.filter(g => g.userId === userId));
});

app.post('/api/goals/sync', (req, res) => {
    // Sync logic: Receive full list of goals for user or single updates
    // For simplicity, we accept a list of goals to replace/merge for a user
    const { userId, goals } = req.body;
    const db = getDb();
    
    // Remove old goals for this user
    db.goals = db.goals.filter(g => g.userId !== userId);
    // Add new ones
    db.goals.push(...goals);
    
    saveDb(db);
    res.json({ success: true });
});

// --- INVITATIONS ROUTES ---
app.get('/api/invitations', (req, res) => {
    const db = getDb();
    res.json(db.invitations);
});

app.post('/api/invitations', (req, res) => {
    const db = getDb();
    db.invitations.push(req.body);
    saveDb(db);
    res.json(req.body);
});

app.put('/api/invitations/:id', (req, res) => {
    const db = getDb();
    const idx = db.invitations.findIndex(i => i.id === req.params.id);
    if (idx !== -1) {
        db.invitations[idx] = req.body;
        saveDb(db);
    }
    res.json(db.invitations[idx]);
});

app.delete('/api/invitations/:id', (req, res) => {
    const db = getDb();
    db.invitations = db.invitations.filter(i => i.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
});

// --- SETTINGS ROUTES ---
app.get('/api/settings/:userId', (req, res) => {
    const db = getDb();
    res.json(db.settings[req.params.userId] || {});
});

app.post('/api/settings/:userId', (req, res) => {
    const db = getDb();
    db.settings[req.params.userId] = req.body;
    saveDb(db);
    res.json({ success: true });
});

// Start Server
app.listen(PORT, () => {
    console.log(`dygo Server running on http://localhost:${PORT}`);
    console.log(`Database file located at: ${DB_FILE}`);
});