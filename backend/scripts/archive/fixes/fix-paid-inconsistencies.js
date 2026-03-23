import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixInconsistencies() {
  console.log('\n🔧 Corrigiendo inconsistencias en sesiones...');
  console.log('─'.repeat(80));
  
  // Buscar todas las sesiones que tienen paid=true pero NO están completed
  const { data: inconsistentSessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('paid', true)
    .neq('status', 'completed');
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`\n⚠️  Sesiones inconsistentes encontradas: ${inconsistentSessions.length}`);
  
  if (inconsistentSessions.length === 0) {
    console.log('✅ No hay inconsistencias que corregir');
    return;
  }
  
  console.log('─'.repeat(80));
  
  for (const session of inconsistentSessions) {
    const date = new Date(session.starts_on).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    console.log(`\n📋 Sesión inconsistente:`);
    console.log(`   ID: ${session.id}`);
    console.log(`   Fecha: ${date}`);
    console.log(`   Estado: ${session.status}`);
    console.log(`   Pagada: ${session.paid}`);
    console.log(`   Precio: €${session.price}`);
    
    // Corregir: si no está completed, no debería estar pagada
    console.log(`   🔧 Acción: Cambiando paid=true a paid=false`);
    
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ paid: false })
      .eq('id', session.id);
    
    if (updateError) {
      console.error(`   ❌ Error actualizando sesión ${session.id}:`, updateError);
    } else {
      console.log(`   ✅ Sesión actualizada correctamente`);
    }
  }
  
  console.log('\n' + '─'.repeat(80));
  console.log('✅ Corrección completa\n');
  
  // Verificar el resultado
  console.log('🔍 Verificando resultado...');
  const { data: verifyPaid } = await supabase
    .from('sessions')
    .select('id, status, paid')
    .eq('paid', true);
  
  console.log(`\n📊 Sesiones con paid=true después de la corrección: ${verifyPaid.length}`);
  
  const byStatus = {};
  verifyPaid.forEach(s => {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  });
  
  console.log('   Por estado:', byStatus);
  console.log('\n✅ Todas las sesiones con paid=true deberían estar en estado completed\n');
}

fixInconsistencies().catch(console.error);
