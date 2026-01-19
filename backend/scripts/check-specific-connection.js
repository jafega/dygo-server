import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkConnection() {
  console.log('🔍 Buscando todos los usuarios...\n');
  
  const { data: allUsers, error: usersError } = await supabase
    .from('users')
    .select('*');
  
  if (usersError) {
    console.error('❌ Error buscando usuarios:', usersError);
    return;
  }
  
  const daniel = allUsers.find(u => u.data?.email?.toLowerCase().includes('daniel.m.mendezv@gmail.com'));
  const garry = allUsers.find(u => u.data?.email?.toLowerCase().includes('garryjavi@gmail.com'));
  
  if (!daniel) {
    console.log('❌ Psicólogo Daniel no encontrado');
    return;
  }
  
  console.log('✅ Psicólogo Daniel encontrado:', {
    id: daniel.id,
    name: daniel.data?.name,
    email: daniel.data?.email,
    role: daniel.data?.role
  });
  
  if (!garry) {
    console.log('❌ Paciente Garry no encontrado');
    return;
  }
  
  console.log('✅ Paciente Garry encontrado:', {
    id: garry.id,
    name: garry.data?.name,
    email: garry.data?.email,
    role: garry.data?.role
  });
  
  console.log('\n🔍 Buscando invitaciones Daniel → Garry...');
  
  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('*');
  
  if (invError) {
    console.error('❌ Error buscando invitaciones:', invError);
  } else {
    console.log(`📧 Invitaciones totales en Supabase: ${invitations.length}`);
    
    const danielToGarry = invitations.filter(inv => {
      const invData = inv.data || inv;
      return invData.psychologistId === daniel.id && 
             (invData.patientId === garry.id || invData.patientEmail?.toLowerCase().includes('garryjavi@gmail.com'));
    });
    
    if (danielToGarry.length > 0) {
      console.log(`\n📨 INVITACIONES Daniel → Garry: ${danielToGarry.length}`);
      danielToGarry.forEach(inv => {
        const invData = inv.data || inv;
        console.log('  - ID:', inv.id);
        console.log('    Status:', invData.status);
        console.log('    PatientId:', invData.patientId || 'NO ASIGNADO');
        console.log('    Created:', invData.createdAt);
      });
    } else {
      console.log('\n✅ NO hay invitaciones Daniel → Garry');
    }
  }
  
  console.log('\n🔍 Buscando care_relationships Daniel → Garry...');
  
  const { data: relationships, error: relError } = await supabase
    .from('care_relationships')
    .select('*');
  
  if (relError) {
    console.error('❌ Error buscando relaciones:', relError);
  } else {
    console.log(`👥 Care relationships totales en Supabase: ${relationships.length}`);
    
    const danielGarryRel = relationships.filter(rel => {
      const relData = rel.data || rel;
      return relData.psychologistId === daniel.id && relData.patientId === garry.id;
    });
    
    if (danielGarryRel.length > 0) {
      console.log(`\n✅ RELACIÓN ENCONTRADA Daniel → Garry: ${danielGarryRel.length}`);
      danielGarryRel.forEach(rel => {
        const relData = rel.data || rel;
        console.log('  - ID:', rel.id);
        console.log('    PsychologistId:', relData.psychologistId);
        console.log('    PatientId:', relData.patientId);
        console.log('    Created:', relData.createdAt);
      });
    } else {
      console.log('\n❌ NO SE ENCONTRÓ RELACIÓN Daniel → Garry');
      console.log('\nTodas las relaciones:');
      relationships.forEach(rel => {
        const relData = rel.data || rel;
        const psych = allUsers.find(u => u.id === relData.psychologistId);
        const patient = allUsers.find(u => u.id === relData.patientId);
        console.log(`  - ${psych?.data?.email || relData.psychologistId} → ${patient?.data?.email || relData.patientId}`);
      });
    }
  }
}

checkConnection().catch(console.error);
