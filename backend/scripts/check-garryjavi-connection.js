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
  console.log('Please ensure backend/.env has these variables configured.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkConnections() {
  console.log('\n🔍 Verificando conexiones entre garryjavi@gmail.com y javier@ciudadela.eu\n');
  
  // Buscar usuarios
  const { data: garryjavi, error: psychError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'garryjavi@gmail.com')
    .single();
  
  if (psychError || !garryjavi) {
    console.log('❌ Usuario garryjavi@gmail.com no encontrado');
    return;
  }
  
  console.log('✅ Psicólogo encontrado:');
  console.log(`   ID: ${garryjavi.id}`);
  console.log(`   Nombre: ${garryjavi.name}`);
  console.log(`   Email: ${garryjavi.email}`);
  console.log(`   Rol: ${garryjavi.role}\n`);
  
  const { data: javier, error: patientError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'javier@ciudadela.eu')
    .single();
  
  if (patientError || !javier) {
    console.log('ℹ️  Usuario javier@ciudadela.eu no existe todavía\n');
  } else {
    console.log('✅ Paciente encontrado:');
    console.log(`   ID: ${javier.id}`);
    console.log(`   Nombre: ${javier.name}`);
    console.log(`   Email: ${javier.email}`);
    console.log(`   Rol: ${javier.role}\n`);
  }
  
  // Buscar invitaciones
  console.log('📧 Invitaciones:\n');
  
  const { data: invitationsFromPsych, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('psychologist_id', garryjavi.id);
  
  if (invError) {
    console.error('❌ Error buscando invitaciones:', invError.message);
  } else {
    const javierInvites = invitationsFromPsych.filter(inv => 
      inv.patient_email === 'javier@ciudadela.eu' || 
      (javier && inv.patient_id === javier.id)
    );
    
    if (javierInvites.length > 0) {
      console.log(`⚠️  PROBLEMA DETECTADO: Hay ${javierInvites.length} invitación(es) para javier@ciudadela.eu:`);
      javierInvites.forEach((inv, i) => {
        console.log(`\n   ${i + 1}. ID: ${inv.id}`);
        console.log(`      Email destino: ${inv.patient_email}`);
        console.log(`      Patient ID: ${inv.patient_id || 'null'}`);
        console.log(`      Estado: ${inv.status || 'PENDING'}`);
        console.log(`      Creada: ${new Date(inv.created_at).toLocaleString()}`);
      });
      console.log('');
    } else {
      console.log('   ✅ No hay invitaciones pendientes para javier@ciudadela.eu\n');
    }
    
    console.log(`   Total invitaciones del psicólogo: ${invitationsFromPsych.length}`);
    if (invitationsFromPsych.length > 0) {
      console.log('   Otros emails invitados:');
      invitationsFromPsych
        .filter(inv => inv.patient_email !== 'javier@ciudadela.eu')
        .forEach(inv => console.log(`   - ${inv.patient_email} (${inv.status || 'PENDING'})`));
    }
  }
  
  // Buscar relaciones de cuidado
  console.log('\n\n👥 Relaciones de cuidado:\n');
  
  const { data: relationships, error: relError } = await supabase
    .from('care_relationships')
    .select('*')
    .eq('psychologist_id', garryjavi.id);
  
  if (relError) {
    console.error('❌ Error buscando relaciones:', relError.message);
  } else {
    if (javier) {
      const javierRel = relationships.find(rel => rel.patient_id === javier.id);
      
      if (javierRel) {
        console.log(`⚠️  PROBLEMA DETECTADO: Existe relación activa con javier@ciudadela.eu:`);
        console.log(`   ID: ${javierRel.id}`);
        console.log(`   Psychologist ID: ${javierRel.psychologist_id}`);
        console.log(`   Patient ID: ${javierRel.patient_id}`);
        console.log(`   Estado: ${javierRel.status || 'ACTIVE'}`);
        console.log(`   Creada: ${javierRel.created_at ? new Date(javierRel.created_at).toLocaleString() : 'desconocida'}\n`);
        
        console.log('   ❗ Esta relación debería eliminarse si revocaste la invitación.\n');
      } else {
        console.log('   ✅ No hay relación activa con javier@ciudadela.eu\n');
      }
    }
    
    console.log(`   Total relaciones del psicólogo: ${relationships.length}`);
    if (relationships.length > 0) {
      console.log('   Pacientes conectados:');
      for (const rel of relationships) {
        const { data: patient } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', rel.patient_id)
          .single();
        if (patient) {
          console.log(`   - ${patient.name} (${patient.email})`);
        } else {
          console.log(`   - ID: ${rel.patient_id} (usuario no encontrado)`);
        }
      }
    }
  }
  
  console.log('\n\n📋 RESUMEN:\n');
  
  const hasInvitation = invitationsFromPsych?.some(inv => 
    inv.patient_email === 'javier@ciudadela.eu' || 
    (javier && inv.patient_id === javier.id)
  );
  
  const hasRelationship = javier && relationships?.some(rel => rel.patient_id === javier.id);
  
  if (!hasInvitation && !hasRelationship) {
    console.log('✅ Estado CORRECTO: No hay invitaciones ni relaciones con javier@ciudadela.eu\n');
  } else if (hasInvitation && !hasRelationship) {
    console.log('⚠️  Estado: Hay invitación pendiente pero sin relación (normal si no la ha aceptado)\n');
  } else if (!hasInvitation && hasRelationship) {
    console.log('❌ Estado INCORRECTO: Hay relación activa SIN invitación pendiente');
    console.log('   → Esto puede causar que el paciente aparezca como "conectado"\n');
    console.log('   🔧 Solución: Eliminar la care_relationship con ID mencionado arriba\n');
  } else {
    console.log('⚠️  Estado: Hay TANTO invitación COMO relación (caso extraño)\n');
  }
}

checkConnections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
