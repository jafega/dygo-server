import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPaidSessions() {
  const patientId = '9fedb976-f7f7-4fee-bcd4-9b8a92b1fc0f'; // ID del paciente en cuestión
  const psychologistId = 'be26ba5d-aa25-4861-a15a-585a3ce331e6';
  
  console.log('\n🔍 Verificando sesiones del paciente:', patientId);
  console.log('👨‍⚕️ Psicólogo:', psychologistId);
  console.log('─'.repeat(80));
  
  // Obtener todas las sesiones del paciente con este psicólogo
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('patient_user_id', patientId)
    .eq('psychologist_user_id', psychologistId)
    .order('starts_on', { ascending: false });
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`\n📊 Total de sesiones encontradas: ${sessions.length}`);
  console.log('─'.repeat(80));
  
  // Agrupar por estado
  const byStatus = {};
  sessions.forEach(s => {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  });
  
  console.log('\n📋 Sesiones por estado:');
  Object.keys(byStatus).forEach(status => {
    console.log(`   ${status}: ${byStatus[status]}`);
  });
  
  // Sesiones completadas
  const completedSessions = sessions.filter(s => s.status === 'completed');
  console.log(`\n✅ Sesiones completadas: ${completedSessions.length}`);
  
  // Sesiones pagadas
  const paidSessions = completedSessions.filter(s => s.paid === true);
  console.log(`💰 Sesiones pagadas (paid=true): ${paidSessions.length}`);
  console.log(`💸 Sesiones sin pagar (paid=false/null): ${completedSessions.length - paidSessions.length}`);
  
  console.log('\n─'.repeat(80));
  console.log('📝 Detalle de TODAS las sesiones:');
  console.log('─'.repeat(80));
  
  sessions.forEach((session, index) => {
    const date = new Date(session.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    console.log(`\n${index + 1}. ID: ${session.id}`);
    console.log(`   📅 Fecha: ${date}`);
    console.log(`   ⏰ ${session.start_time} - ${session.end_time}`);
    console.log(`   📊 Estado: ${session.status}`);
    console.log(`   💰 Pagada: ${session.paid === true ? '✅ SÍ' : '❌ NO'} (valor: ${JSON.stringify(session.paid)})`);
    console.log(`   💵 Precio: €${session.price || 0}`);
    console.log(`   📄 Invoice ID: ${session.invoice_id || 'Sin factura'}`);
    console.log(`   🎟️ Bonus ID: ${session.bonus_id || 'Sin bono'}`);
    console.log(`   📊 Percent psych: ${session.percent_psych || 'N/A'}%`);
  });
  
  console.log('\n' + '─'.repeat(80));
  console.log('✨ Resumen de sesiones con paid=true:');
  console.log('─'.repeat(80));
  
  if (paidSessions.length === 0) {
    console.log('❌ No hay sesiones con paid=true');
  } else {
    paidSessions.forEach((session, index) => {
      const date = new Date(session.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
      console.log(`\n${index + 1}. ${date} - ${session.start_time} (ID: ${session.id})`);
      console.log(`   Estado: ${session.status}, Precio: €${session.price}`);
    });
  }
  
  console.log('\n✅ Verificación completa\n');
}

checkPaidSessions().catch(console.error);
