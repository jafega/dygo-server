import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSessionDurations() {
  console.log('\n🔧 Corrigiendo duraciones de sesiones...');
  console.log('─'.repeat(80));
  
  // Buscar todas las sesiones con duración negativa o inválida
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .not('starts_on', 'is', null)
    .not('ends_on', 'is', null);
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`\n📊 Total de sesiones a verificar: ${sessions.length}`);
  console.log('─'.repeat(80));
  
  let fixed = 0;
  
  for (const session of sessions) {
    const startDate = new Date(session.starts_on);
    const endDate = new Date(session.ends_on);
    
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);
    
    // Si la duración es negativa o mayor a 24 horas, hay un problema
    if (durationHours < 0 || durationHours > 24) {
      console.log(`\n⚠️  Sesión con duración inv\u00e1lida:`);
      console.log(`   ID: ${session.id}`);
      console.log(`   Fecha: ${new Date(session.starts_on).toLocaleString('es-ES')}`);
      console.log(`   starts_on: ${session.starts_on}`);
      console.log(`   ends_on: ${session.ends_on}`);
      console.log(`   Duración calculada: ${durationHours.toFixed(2)} horas`);
      
      if (durationHours < 0) {
        // La hora de fin es antes que la de inicio - probablemente termina al día siguiente
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        
        const newDurationHours = (newEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        
        if (newDurationHours > 0 && newDurationHours <= 24) {
          console.log(`   🔧 Corrigiendo: ends_on + 1 día`);
          console.log(`   Nuevo ends_on: ${newEndDate.toISOString()}`);
          console.log(`   Nueva duración: ${newDurationHours.toFixed(2)} horas`);
          
          const { error: updateError } = await supabase
            .from('sessions')
            .update({ ends_on: newEndDate.toISOString() })
            .eq('id', session.id);
          
          if (updateError) {
            console.error(`   ❌ Error actualizando: ${updateError.message}`);
          } else {
            console.log(`   ✅ Sesión corregida`);
            fixed++;
          }
        } else {
          console.log(`   ⚠️  No se puede corregir automáticamente (duración resultante: ${newDurationHours.toFixed(2)}h)`);
        }
      } else {
        console.log(`   ⚠️  Duración mayor a 24 horas - revisar manualmente`);
      }
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log(`✅ Corrección completa - ${fixed} sesiones corregidas`);
  console.log('─'.repeat(80) + '\n');
}

fixSessionDurations().catch(console.error);
