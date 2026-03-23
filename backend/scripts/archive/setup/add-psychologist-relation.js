// Script para agregar relación: garryjavi@gmail.com es psicólogo de garridojavierfernandez@gmail.com
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log('🔍 Buscando usuarios...\n');

  // Buscar todos los usuarios primero
  const { data: allUsers, error: usersError } = await supabase
    .from('users')
    .select('*');

  if (usersError) {
    console.error('❌ Error buscando usuarios:', usersError);
    process.exit(1);
  }

  console.log('👥 Todos los usuarios en la base de datos:');
  allUsers.forEach(u => {
    const data = typeof u.data === 'object' ? u.data : JSON.parse(u.data || '{}');
    console.log(`  - ID: ${u.id}`);
    console.log(`    Email: ${u.user_email || data.email}`);
    console.log(`    Nombre: ${data.name}`);
    console.log(`    Es psicólogo: ${u.is_psychologist || data.is_psychologist || false}`);
    console.log('');
  });

  // Buscar específicamente por los IDs que vimos en los logs
  const garryjavi = allUsers.find(u => u.id === 'bcccd2a2-b203-4f76-9321-9c4a6ac58046');
  const garridojavier = allUsers.find(u => u.id === 'be26ba5d-aa25-4861-a15a-585a3ce331e6');

  if (!garryjavi || !garridojavier) {
    console.error('❌ No se encontraron los usuarios con esos IDs');
    process.exit(1);
  }

  const garryjaviData = typeof garryjavi.data === 'object' ? garryjavi.data : JSON.parse(garryjavi.data || '{}');
  const garridojavierData = typeof garridojavier.data === 'object' ? garridojavier.data : JSON.parse(garridojavier.data || '{}');

  console.log('📋 Relación a crear:');
  console.log(`   Psicólogo: ${garryjavi.id} (${garryjavi.user_email || garryjaviData.email})`);
  console.log(`   Paciente: ${garridojavier.id} (${garridojavier.user_email || garridojavierData.email})\n`);

  // Verificar si ya existe la relación
  const { data: existingRels, error: relsError } = await supabase
    .from('care_relationships')
    .select('*')
    .eq('psychologist_user_id', garryjavi.id)
    .eq('patient_user_id', garridojavier.id);

  if (relsError) {
    console.error('❌ Error verificando relaciones:', relsError);
    process.exit(1);
  }

  if (existingRels && existingRels.length > 0) {
    console.log('✅ La relación ya existe:', existingRels[0].id);
    return;
  }

  // Crear nueva relación
  const newRelation = {
    id: crypto.randomUUID(),
    psychologist_user_id: garryjavi.id,
    patient_user_id: garridojavier.id,
    default_session_price: 0,
    default_psych_percent: 100,
    data: {
      createdAt: Date.now(),
      tags: []
    }
  };

  console.log('💾 Creando relación en Supabase...');
  const { data: created, error: createError } = await supabase
    .from('care_relationships')
    .insert([newRelation])
    .select();

  if (createError) {
    console.error('❌ Error creando relación:', createError);
    process.exit(1);
  }

  console.log('✅ Relación creada exitosamente:', created[0].id);
  
  // Mostrar todas las relaciones
  console.log('\n📊 Todas las relaciones actuales:');
  const { data: allRels } = await supabase
    .from('care_relationships')
    .select('*');

  allRels.forEach(rel => {
    const data = typeof rel.data === 'object' ? rel.data : JSON.parse(rel.data || '{}');
    console.log(`  - ${rel.psychologist_user_id} → ${rel.patient_user_id} ${rel.endedAt || data.endedAt ? '(FINALIZADA)' : '(ACTIVA)'}`);
  });
}

main().catch(console.error);
