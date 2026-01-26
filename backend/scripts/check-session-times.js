import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSessionTimes() {
  const patientId = 'bcccd2a2-b203-4f76-9321-9c4a6ac58046';
  const psychologistId = 'be26ba5d-aa25-4861-a15a-585a3ce331e6';
  
  console.log('\n⏰ Verificando horarios de sesiones');
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
  
  sessions.forEach((s, i) => {
    const date = new Date(s.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    console.log(`\n${i + 1}. ${date} - Estado: ${s.status}`);
    console.log(`   ID: ${s.id}`);
    console.log(`   starts_on: ${s.starts_on}`);
    console.log(`   ends_on: ${s.ends_on || 'NULL'}`);
    console.log(`   start_time: ${s.start_time || 'NULL'}`);
    console.log(`   end_time: ${s.end_time || 'NULL'}`);
    console.log(`   Precio: €${s.price || 0}`);
    console.log(`   Percent psych: ${s.percent_psych}%`);
    
    // Calcular duración si hay horarios
    if (s.starts_on && s.ends_on) {
      const start = new Date(s.starts_on);
      const end = new Date(s.ends_on);
      const durationMs = end - start;
      const durationHours = durationMs / (1000 * 60 * 60);
      console.log(`   ⏱️ Duración: ${durationHours.toFixed(2)} horas`);
      console.log(`   💰 Valor con duración: €${(s.price * durationHours).toFixed(2)}`);
      console.log(`   💵 Ganancia psych: €${((s.price * durationHours * s.percent_psych) / 100).toFixed(2)}`);
    }
  });
  
  console.log('\n✅ Verificación completa\n');
}

checkSessionTimes().catch(console.error);
