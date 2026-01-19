import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkConnection() {
  console.log('🔍 Buscando usuario psicólogo garryjavi@gmail.com...');
  
  const { data: psychologist, error: psychError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'garryjavi@gmail.com')
    .single();
  
  if (psychError) {
    console.error('❌ Error buscando psicólogo:', psychError);
    return;
  }
  
  console.log('✅ Psicólogo encontrado:', {
    id: psychologist.id,
    name: psychologist.name,
    email: psychologist.email,
    role: psychologist.role
  });
  
  console.log('\n🔍 Buscando usuario paciente javier@ciudadela.eu...');
  
  const { data: patient, error: patientError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'javier@ciudadela.eu')
    .single();
  
  if (patientError) {
    console.log('ℹ️ Usuario javier@ciudadela.eu no existe aún');
  } else {
    console.log('✅ Paciente encontrado:', {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      role: patient.role
    });
  }
  
  console.log('\n🔍 Buscando invitaciones del psicólogo...');
  
  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('psychologist_id', psychologist.id);
  
  if (invError) {
    console.error('❌ Error buscando invitaciones:', invError);
  } else {
    console.log(`📧 Invitaciones totales: ${invitations.length}`);
    
    const javierInvitation = invitations.find(inv => 
      inv.patient_email === 'javier@ciudadela.eu' || 
      (patient && inv.patient_id === patient.id)
    );
    
    if (javierInvitation) {
      console.log('\n⚠️ INVITACIÓN ENCONTRADA para javier@ciudadela.eu:');
      console.log(JSON.stringify(javierInvitation, null, 2));
    } else {
      console.log('\n✅ NO hay invitación pendiente para javier@ciudadela.eu');
    }
    
    console.log('\n📋 Todas las invitaciones:');
    invitations.forEach((inv, i) => {
      console.log(`${i + 1}. Email: ${inv.patient_email}, Status: ${inv.status}, ID: ${inv.id}`);
    });
  }
  
  console.log('\n🔍 Buscando relaciones de cuidado...');
  
  const { data: relationships, error: relError } = await supabase
    .from('care_relationships')
    .select('*')
    .eq('psychologist_id', psychologist.id);
  
  if (relError) {
    console.error('❌ Error buscando relaciones:', relError);
  } else {
    console.log(`👥 Relaciones totales: ${relationships.length}`);
    
    if (patient) {
      const javierRelationship = relationships.find(rel => rel.patient_id === patient.id);
      
      if (javierRelationship) {
        console.log('\n⚠️ RELACIÓN ENCONTRADA con javier@ciudadela.eu:');
        console.log(JSON.stringify(javierRelationship, null, 2));
      } else {
        console.log('\n✅ NO hay relación activa con javier@ciudadela.eu');
      }
    }
    
    console.log('\n📋 Todas las relaciones:');
    relationships.forEach((rel, i) => {
      console.log(`${i + 1}. Patient ID: ${rel.patient_id}, Status: ${rel.status}, ID: ${rel.id}`);
    });
  }
}

checkConnection().catch(console.error);
