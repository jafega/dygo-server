// Script para migrar sesiones con status='available' y sin patient_user_id a la tabla dispo
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar db.json
const dbPath = path.join(__dirname, '..', 'db.json');

console.log('📦 Cargando base de datos...');
const dbContent = fs.readFileSync(dbPath, 'utf8');
const db = JSON.parse(dbContent);

if (!db.sessions) {
  console.log('❌ No hay sesiones en la base de datos');
  process.exit(1);
}

if (!db.dispo) {
  db.dispo = [];
}

console.log(`📊 Total de sesiones: ${db.sessions.length}`);
console.log(`📊 Sesiones en dispo antes de migración: ${db.dispo.length}`);

// Filtrar sesiones disponibles sin paciente
const availableSessions = db.sessions.filter(s => 
  s.status === 'available' && 
  (!s.patient_user_id || s.patient_user_id === '') &&
  (!s.patientId || s.patientId === '')
);

console.log(`🔍 Sesiones disponibles para migrar: ${availableSessions.length}`);

if (availableSessions.length === 0) {
  console.log('✅ No hay sesiones disponibles para migrar');
  process.exit(0);
}

// Migrar a dispo
let migratedCount = 0;
const migratedIds = new Set();

availableSessions.forEach(session => {
  // Verificar que tenga los campos necesarios
  if (!session.psychologistId && !session.psychologist_user_id) {
    console.warn(`⚠️  Sesión ${session.id} no tiene psychologistId ni psychologist_user_id, omitiendo...`);
    return;
  }

  const psychologist_user_id = session.psychologist_user_id || session.psychologistId;

  // Crear entrada en dispo
  const dispoEntry = {
    id: session.id, // Mantener el mismo ID para trazabilidad
    psychologist_user_id: psychologist_user_id,
    data: {
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      type: session.type || 'online'
    },
    created_at: session.created_at || new Date().toISOString()
  };

  db.dispo.push(dispoEntry);
  migratedIds.add(session.id);
  migratedCount++;

  console.log(`✅ Migrada sesión ${session.id}: ${session.date} ${session.startTime}-${session.endTime}`);
});

// Eliminar sesiones migradas de sessions
db.sessions = db.sessions.filter(s => !migratedIds.has(s.id));

console.log(`\n📊 Resumen de migración:`);
console.log(`   - Sesiones migradas a dispo: ${migratedCount}`);
console.log(`   - Sesiones restantes en sessions: ${db.sessions.length}`);
console.log(`   - Total en dispo después de migración: ${db.dispo.length}`);

// Crear backup
const backupPath = path.join(__dirname, '..', `db.backup.${Date.now()}.json`);
fs.writeFileSync(backupPath, dbContent);
console.log(`\n💾 Backup creado en: ${backupPath}`);

// Guardar db.json actualizado
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`✅ Base de datos actualizada: ${dbPath}`);

console.log('\n🎉 Migración completada exitosamente!');
