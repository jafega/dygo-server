import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findPatientSessions() {
  const psychologistId = 'be26ba5d-aa25-4861-a15a-585a3ce331e6';
  
  console.log('\n🔍 Buscando TODAS las sesiones del psicólogo:', psychologistId);
  console.log('─'.repeat(80));
  
  // Obtener todas las sesiones del psicólogo
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('psychologist_user_id', psychologistId)
    .order('starts_on', { ascending: false });
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`\n📊 Total de sesiones del psicólogo: ${sessions.length}`);
  console.log('─'.repeat(80));
  
  // Agrupar por paciente
  const byPatient = {};
  sessions.forEach(s => {
    const patientId = s.patient_user_id || 'SIN_ID';
    if (!byPatient[patientId]) {
      byPatient[patientId] = [];
    }
    byPatient[patientId].push(s);
  });
  
  console.log(`\n👥 Pacientes únicos encontrados: ${Object.keys(byPatient).length}`);
  console.log('─'.repeat(80));
  
  // Obtener información de cada paciente
  for (const [patientId, patientSessions] of Object.entries(byPatient)) {
    console.log(`\n📋 Paciente ID: ${patientId}`);
    console.log(`   Total sesiones: ${patientSessions.length}`);
    
    // Obtener nombre del paciente
    if (patientId !== 'SIN_ID') {
      const { data: patient } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', patientId)
        .single();
      
      if (patient) {
        console.log(`   Nombre: ${patient.name}`);
        console.log(`   Email: ${patient.email}`);
      }
    }
    
    // Contar por estado
    const byStatus = {};
    patientSessions.forEach(s => {
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    });
    
    console.log(`   Por estado:`, byStatus);
    
    // Contar pagadas
    const completed = patientSessions.filter(s => s.status === 'completed');
    const paid = completed.filter(s => s.paid === true);
    
    console.log(`   Completadas: ${completed.length}`);
    console.log(`   Pagadas: ${paid.length}`);
    
    if (patientSessions.length >= 5) {
      console.log(`\n   🔍 Detalle de sesiones (mostrando primeras 10):`);
      patientSessions.slice(0, 10).forEach((s, i) => {
        const date = new Date(s.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        console.log(`      ${i + 1}. ${date} - ${s.start_time} | Estado: ${s.status} | Pagada: ${s.paid ? '✅' : '❌'} | ID: ${s.id.substring(0, 8)}...`);
      });
    }
  }
  
  console.log('\n✅ Búsqueda completa\n');
}

findPatientSessions().catch(console.error);
