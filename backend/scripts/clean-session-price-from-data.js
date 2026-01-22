// Script para limpiar price, percent_psych y paid del JSONB data en sesiones
// Estos campos deben estar en columnas, no en data JSONB

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanSessionData() {
  console.log('🔍 Obteniendo todas las sesiones...');
  
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*');
    
  if (error) {
    console.error('❌ Error obteniendo sesiones:', error);
    process.exit(1);
  }
  
  console.log(`📊 Total sesiones: ${sessions.length}`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const session of sessions) {
    const data = session.data || {};
    
    // Verificar si tiene price, percent_psych o paid en data JSONB
    const hasFieldsInData = data.price !== undefined || 
                            data.percent_psych !== undefined || 
                            data.paid !== undefined;
    
    if (!hasFieldsInData) {
      skipped++;
      continue;
    }
    
    console.log(`\n🔧 Limpiando sesión ${session.id}:`);
    console.log(`   price en data: ${data.price}`);
    console.log(`   percent_psych en data: ${data.percent_psych}`);
    console.log(`   paid en data: ${data.paid}`);
    console.log(`   price en columna: ${session.price}`);
    console.log(`   percent_psych en columna: ${session.percent_psych}`);
    console.log(`   paid en columna: ${session.paid}`);
    
    // Extraer valores del data o columnas
    const finalPrice = session.price ?? data.price ?? null;
    const finalPercentPsych = session.percent_psych ?? data.percent_psych ?? null;
    const finalPaid = session.paid ?? data.paid ?? false;
    
    if (finalPrice === null || finalPercentPsych === null) {
      console.error(`   ❌ No se puede determinar price o percent_psych - saltando`);
      skipped++;
      continue;
    }
    
    // Limpiar data JSONB
    const { price: _, percent_psych: __, paid: ___, ...cleanData } = data;
    
    // Actualizar sesión
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        data: cleanData,
        price: finalPrice,
        percent_psych: finalPercentPsych,
        paid: finalPaid
      })
      .eq('id', session.id);
      
    if (updateError) {
      console.error(`   ❌ Error actualizando sesión ${session.id}:`, updateError);
      continue;
    }
    
    console.log(`   ✅ Actualizado: price=${finalPrice}, percent_psych=${finalPercentPsych}, paid=${finalPaid}`);
    updated++;
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   Actualizadas: ${updated}`);
  console.log(`   Saltadas: ${skipped}`);
  console.log(`   Total: ${sessions.length}`);
}

cleanSessionData().catch(console.error);
