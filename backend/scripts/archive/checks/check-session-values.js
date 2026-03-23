import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSessionValues() {
  const patientId = 'bcccd2a2-b203-4f76-9321-9c4a6ac58046';
  const psychologistId = 'be26ba5d-aa25-4861-a15a-585a3ce331e6';
  
  console.log('\n💰 Verificando valores de sesiones del paciente');
  console.log('─'.repeat(80));
  
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
  
  console.log(`\n📊 Total de sesiones: ${sessions.length}`);
  console.log('─'.repeat(80));
  
  const completedSessions = sessions.filter(s => s.status === 'completed');
  
  console.log(`\n✅ Sesiones completadas: ${completedSessions.length}`);
  console.log('─'.repeat(80));
  
  let totalCompletedValue = 0;
  
  console.log('\n📝 Detalle de sesiones completadas:\n');
  completedSessions.forEach((s, i) => {
    const date = new Date(s.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const price = s.price || 0;
    totalCompletedValue += price;
    
    console.log(`${i + 1}. ${date} - ${s.start_time || 'Sin hora'}`);
    console.log(`   ID: ${s.id}`);
    console.log(`   Estado: ${s.status}`);
    console.log(`   Precio: €${price}`);
    console.log(`   Pagada: ${s.paid ? '✅' : '❌'}`);
    console.log(`   Percent psych: ${s.percent_psych}%`);
    console.log(`   Invoice ID: ${s.invoice_id || 'Sin factura'}`);
    console.log(`   Bonus ID: ${s.bonus_id || 'Sin bono'}`);
    console.log('');
  });
  
  console.log('─'.repeat(80));
  console.log(`💰 TOTAL VALOR DE SESIONES COMPLETADAS: €${totalCompletedValue}`);
  console.log('─'.repeat(80));
  
  // Todas las sesiones (incluyendo no completadas)
  console.log('\n📋 TODAS las sesiones (incluyendo canceladas/programadas):');
  console.log('─'.repeat(80));
  
  let totalAllValue = 0;
  sessions.forEach((s, i) => {
    const date = new Date(s.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    const price = s.price || 0;
    if (s.status !== 'cancelled') {
      totalAllValue += price;
    }
    console.log(`${i + 1}. ${date} - Estado: ${s.status} - Precio: €${price}`);
  });
  
  console.log('─'.repeat(80));
  console.log(`💵 Total (excluyendo canceladas): €${totalAllValue}`);
  console.log('─'.repeat(80));
  
  console.log('\n✅ Verificación completa\n');
}

checkSessionValues().catch(console.error);
