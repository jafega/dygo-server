const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateSessionStatus() {
  console.log('🔄 Iniciando migración de session.status...\n');
  
  try {
    // Paso 1: Leer todas las sesiones actuales
    console.log('📖 Leyendo sesiones existentes...');
    const { data: sessions, error: readError } = await supabase
      .from('sessions')
      .select('*');
    
    if (readError) {
      console.error('❌ Error leyendo sesiones:', readError);
      process.exit(1);
    }
    
    console.log(`✅ Encontradas ${sessions.length} sesiones\n`);
    
    // Paso 2: Actualizar cada sesión
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const session of sessions) {
      // Si ya tiene status en la columna, saltar
      if (session.status) {
        skipped++;
        continue;
      }
      
      // Obtener status de data o asignar 'scheduled' por defecto
      const statusFromData = session.data?.status;
      const newStatus = statusFromData || 'scheduled';
      
      // Crear data sin el campo status
      const { status: removedStatus, ...dataWithoutStatus } = session.data || {};
      
      // Actualizar sesión
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          status: newStatus,
          data: dataWithoutStatus
        })
        .eq('id', session.id);
      
      if (updateError) {
        console.error(`❌ Error actualizando sesión ${session.id}:`, updateError.message);
        errors++;
      } else {
        updated++;
        console.log(`✅ Sesión ${session.id} actualizada: status = ${newStatus}`);
      }
    }
    
    console.log('\n📊 Resumen de migración:');
    console.log(`   ✅ Actualizadas: ${updated}`);
    console.log(`   ⏭️  Saltadas (ya tenían status): ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log('\n✨ Migración completada');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  }
}

migrateSessionStatus();
