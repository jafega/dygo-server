// Script para limpiar y corregir las relaciones en care_relationships
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function fixRelationships() {
  console.log('🔧 Analizando relaciones existentes...\n');

  // 1. Obtener todos los usuarios y sus roles
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, data');

  if (usersError) {
    console.error('❌ Error cargando usuarios:', usersError);
    process.exit(1);
  }

  const userMap = new Map();
  users.forEach(u => {
    const data = u.data || {};
    userMap.set(u.id, {
      id: u.id,
      name: data.name || 'Unknown',
      email: data.email || 'unknown@email.com',
      role: (data.role || 'PATIENT').toUpperCase()
    });
  });

  console.log(`📊 Total usuarios: ${userMap.size}\n`);
  console.log('Usuarios y roles:');
  userMap.forEach((user, id) => {
    console.log(`  - ${user.name} (${user.email}): ${user.role}`);
  });

  // 2. Obtener todas las relaciones
  const { data: relationships, error: relsError } = await supabase
    .from('care_relationships')
    .select('*');

  if (relsError) {
    console.error('❌ Error cargando relaciones:', relsError);
    process.exit(1);
  }

  console.log(`\n📊 Total relaciones: ${relationships.length}\n`);
  
  if (relationships.length === 0) {
    console.log('✅ No hay relaciones que corregir.');
    return;
  }

  console.log('Relaciones actuales:');
  relationships.forEach(rel => {
    const data = rel.data || rel;
    const psychId = data.psychologistId || rel.psychologistId;
    const patientId = data.patientId || rel.patientId;
    
    const psychUser = userMap.get(psychId);
    const patientUser = userMap.get(patientId);
    
    console.log(`\n  [${rel.id}]`);
    console.log(`    psychologistId: ${psychId}`);
    console.log(`      → ${psychUser ? `${psychUser.name} (${psychUser.role})` : 'NO ENCONTRADO'}`);
    console.log(`    patientId: ${patientId}`);
    console.log(`      → ${patientUser ? `${patientUser.name} (${patientUser.role})` : 'NO ENCONTRADO'}`);
    
    // Detectar problemas reales
    let hasError = false;
    if (!psychUser) {
      console.log(`    ⚠️ ERROR: psychologistId no existe en la base de datos`);
      hasError = true;
    }
    if (!patientUser) {
      console.log(`    ⚠️ ERROR: patientId no existe en la base de datos`);
      hasError = true;
    }
    if (psychId === patientId) {
      console.log(`    ⚠️ ERROR: psychologistId y patientId son la misma persona`);
      hasError = true;
    }
    if (!hasError) {
      console.log(`    ✓ Relación válida`);
      if (psychUser && psychUser.role === 'PSYCHOLOGIST' && patientUser && patientUser.role === 'PSYCHOLOGIST') {
        console.log(`    💬 Nota: ${patientUser.name} es psicólogo pero en esta relación actúa como paciente`);
      }
    }
  });

  // 3. Preguntar si limpiar todo
  console.log('\n\n🗑️  ¿Deseas BORRAR TODAS las relaciones y empezar de cero?');
  console.log('   Esto te permitirá recrearlas correctamente desde la UI.\n');
  console.log('   Para continuar, ejecuta este script con: node fix-care-relationships.js --delete-all\n');

  if (process.argv.includes('--delete-all')) {
    console.log('🗑️  Borrando todas las relaciones...\n');
    
    const { error: deleteError } = await supabase
      .from('care_relationships')
      .delete()
      .neq('id', '');

    if (deleteError) {
      console.error('❌ Error borrando relaciones:', deleteError);
      process.exit(1);
    }

    console.log('✅ Todas las relaciones han sido eliminadas.');
    console.log('\n📋 Próximos pasos:');
    console.log('   1. Reinicia el servidor: cd backend && node server.js');
    console.log('   2. Ve a la UI y crea nuevas conexiones desde el panel Conexiones');
    console.log('   3. Las relaciones se guardarán correctamente en care_relationships\n');
  }
}

fixRelationships().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
