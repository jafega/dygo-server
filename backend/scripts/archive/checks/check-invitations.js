// Script para verificar el estado actual de las invitaciones en Supabase
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function checkInvitations() {
  console.log('🔍 Consultando tabla invitations en Supabase...\n');

  const { data, error } = await supabase.from('invitations').select('*');

  if (error) {
    console.error('❌ Error consultando invitations:', error);
    return;
  }

  console.log(`📊 Total de invitaciones en Supabase: ${data?.length || 0}\n`);

  if (!data || data.length === 0) {
    console.log('✅ No hay invitaciones en Supabase');
    return;
  }

  console.log('Invitaciones encontradas:');
  console.log('═'.repeat(100));
  
  data.forEach((row, index) => {
    console.log(`\n${index + 1}. ID: ${row.id}`);
    console.log(`   Estructura completa:`, JSON.stringify(row, null, 2));
    
    if (row.data) {
      // Formato nuevo (con columna data)
      console.log(`   De (Psicólogo): ${row.data.fromPsychologistName} (${row.data.fromPsychologistId})`);
      console.log(`   Para (Email): ${row.data.toUserEmail || row.data.patient_user_email || row.data.patientEmail}`);
      console.log(`   Patient User ID: ${row.data.patient_user_id || 'N/A'}`);
      console.log(`   Psych User ID: ${row.data.psych_user_id || 'N/A'}`);
      console.log(`   Estado: ${row.data.status}`);
      console.log(`   Fecha: ${new Date(row.data.timestamp || row.data.created_at).toLocaleString()}`);
    } else {
      // Formato antiguo (columnas directas)
      console.log(`   De (Psicólogo): ${row.fromPsychologistName || row.psych_user_email || 'N/A'} (${row.fromPsychologistId || row.psych_user_id || 'N/A'})`);
      console.log(`   Para (Email): ${row.toUserEmail || row.patient_user_email || row.patientEmail || 'N/A'}`);
      console.log(`   Patient User ID: ${row.patient_user_id || 'N/A'}`);
      console.log(`   Psych User ID: ${row.psych_user_id || 'N/A'}`);
      console.log(`   Estado: ${row.status || 'N/A'}`);
      console.log(`   Fecha: ${row.timestamp ? new Date(row.timestamp).toLocaleString() : 'N/A'}`);
    }
  });

  console.log('\n' + '═'.repeat(100));
  
  // Estadísticas
  const pending = data.filter(row => {
    const status = row.data?.status || row.status;
    return status === 'PENDING';
  });
  
  const accepted = data.filter(row => {
    const status = row.data?.status || row.status;
    return status === 'ACCEPTED';
  });
  
  const rejected = data.filter(row => {
    const status = row.data?.status || row.status;
    return status === 'REJECTED';
  });

  console.log('\n📈 Estadísticas:');
  console.log(`   Pendientes: ${pending.length}`);
  console.log(`   Aceptadas: ${accepted.length}`);
  console.log(`   Rechazadas: ${rejected.length}`);
  
  if (pending.length > 0) {
    console.log('\n📧 Invitaciones pendientes por email:');
    pending.forEach(row => {
      const email = row.data?.toUserEmail || row.toUserEmail;
      const psychName = row.data?.fromPsychologistName || row.fromPsychologistName;
      console.log(`   - ${email} (de ${psychName})`);
    });
  }
}

checkInvitations()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
