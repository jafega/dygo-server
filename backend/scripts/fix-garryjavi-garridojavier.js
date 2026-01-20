import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function fixRelationship() {
  console.log('\n🔍 Verificando conexión garryjavi → garridojavierfernandez\n');
  
  // IDs correctos basados en los datos de Supabase
  // psych-001 es un ID antiguo, necesitamos el ID real de Supabase
  // Según el listado anterior, garryjavi tiene el ID psych-001 en el campo data.id
  // pero necesitamos buscar su ID real en Supabase
  
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*');
  
  if (usersError) {
    console.error('❌ Error listando usuarios:', usersError);
    return;
  }
  
  const psychologist = users.find(u => u.data?.id === 'psych-001');
  const patient = users.find(u => u.data?.id === 'patient-001-1768614314314');
  
  if (!psychologist) {
    console.error('❌ No se encontró el psicólogo con data.id = psych-001');
    return;
  }
  
  if (!patient) {
    console.error('❌ No se encontró el paciente con data.id = patient-001-1768614314314');
    return;
  }
  
  console.log(`✅ Psicólogo encontrado:`);
  console.log(`   Supabase ID: ${psychologist.id}`);
  console.log(`   Email: ${psychologist.data.email}`);
  console.log(`   Nombre: ${psychologist.data.name}\n`);
  
  console.log(`✅ Paciente encontrado:`);
  console.log(`   Supabase ID: ${patient.id}`);
  console.log(`   Email: ${patient.data.email}`);
  console.log(`   Nombre: ${patient.data.name}\n`);
  
  console.log(`   Nombre: ${patient.data.name}\n`);
  
  // Corregir el rol del paciente si es necesario
  if (patient.data.role !== 'PATIENT') {
    console.log('📝 Actualizando rol del paciente a PATIENT...\n');
    
    const updatedData = { ...patient.data, role: 'PATIENT', isPsychologist: false };
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ data: updatedData })
      .eq('id', patient.id);
    
    if (updateError) {
      console.error('❌ Error actualizando rol:', updateError.message);
    } else {
      console.log('✅ Rol del paciente actualizado a PATIENT\n');
    }
  }
  
  // Ver estructura de care_relationships
  console.log('📋 Listando relaciones existentes...\n');
  const { data: allRels, error: listRelError } = await supabase
    .from('care_relationships')
    .select('*');
  
  if (listRelError) {
    console.error('❌ Error listando relaciones:', listRelError);
  } else {
    console.log(`Total relaciones: ${allRels.length}\n`);
    allRels.forEach(rel => {
      console.log(`ID: ${rel.id}`);
      console.log(`Data:`, JSON.stringify(rel, null, 2));
      console.log('---');
    });
  }
  
  // Verificar si ya existe la relación
  const { data: existing, error: checkError } = await supabase
    .from('care_relationships')
    .select('*')
    .eq('psychologist_id', psychId)
    .eq('patient_id', patientId)
    .is('ended_at', null);
  
  if (checkError) {
    console.error('❌ Error verificando relación:', checkError.message);
    return;
  }
  
  if (existing && existing.length > 0) {
    console.log('✅ La relación de cuidado YA EXISTE:');
    existing.forEach(rel => {
      console.log(`   ID: ${rel.id}`);
      console.log(`   Creada: ${new Date(rel.created_at).toLocaleString()}`);
    });
    console.log('\n✨ No es necesario crear nada.\n');
    return;
  }
  
  console.log('⚠️  No existe relación de cuidado activa.');
  console.log('📝 Creando relación...\n');
  
  // Crear la relación
  const { data: newRel, error: createError } = await supabase
    .from('care_relationships')
    .insert({
      psychologist_id: psychId,
      patient_id: patientId,
      created_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (createError) {
    console.error('❌ Error creando relación:', createError.message);
    console.error('Detalles:', createError);
    return;
  }
  
  console.log('✅ Relación de cuidado creada exitosamente:');
  console.log(`   ID: ${newRel.id}`);
  console.log(`   Psicólogo: garryjavi@gmail.com`);
  console.log(`   Paciente: garridojavierfernandez@gmail.com`);
  console.log(`   Creada: ${new Date(newRel.created_at).toLocaleString()}\n`);
  
  console.log('🎉 ¡Listo! Ahora garryjavi debería poder ver a garridojavierfernandez en su lista de pacientes.\n');
}

fixRelationship()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
