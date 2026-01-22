const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateSessionTimes() {
  console.log('🔄 Iniciando migración de fechas/horas de sesiones...\n');
  
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
    
    // Paso 2: Leer perfiles de psicólogos para obtener timezone
    console.log('📖 Leyendo perfiles de psicólogos...');
    const { data: profiles, error: profilesError } = await supabase
      .from('psychologist_profiles')
      .select('user_id, data');
    
    if (profilesError) {
      console.error('❌ Error leyendo perfiles:', profilesError);
    }
    
    const psychologistTimezones = new Map();
    (profiles || []).forEach(profile => {
      const timezone = profile.data?.timezone || 'Europe/Madrid';
      psychologistTimezones.set(profile.user_id, timezone);
    });
    
    console.log(`✅ Encontrados ${psychologistTimezones.size} perfiles con timezone\n`);
    
    // Paso 3: Actualizar cada sesión
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const session of sessions) {
      // Si ya tiene starts_on y ends_on, saltar
      if (session.starts_on && session.ends_on) {
        skipped++;
        continue;
      }
      
      // Obtener date, startTime, endTime de data
      const date = session.data?.date;
      const startTime = session.data?.startTime;
      const endTime = session.data?.endTime;
      
      if (!date || !startTime || !endTime) {
        console.warn(`⚠️ Sesión ${session.id} sin date/startTime/endTime en data`);
        skipped++;
        continue;
      }
      
      // Obtener timezone del psicólogo
      const timezone = psychologistTimezones.get(session.psychologist_user_id) || 'Europe/Madrid';
      
      // Construir timestamps
      const startsOn = `${date}T${startTime}:00`;
      const endsOn = `${date}T${endTime}:00`;
      
      // Crear data sin los campos migrados
      const { date: removedDate, startTime: removedStart, endTime: removedEnd, ...dataWithoutTimes } = session.data || {};
      
      // Actualizar sesión
      const { error: updateError } = await supabase
        .from('sessions')
        .update({
          starts_on: startsOn,
          ends_on: endsOn,
          data: dataWithoutTimes
        })
        .eq('id', session.id);
      
      if (updateError) {
        console.error(`❌ Error actualizando sesión ${session.id}:`, updateError.message);
        errors++;
      } else {
        updated++;
        console.log(`✅ Sesión ${session.id}: ${date} ${startTime}-${endTime} (${timezone})`);
      }
    }
    
    console.log('\n📊 Resumen de migración:');
    console.log(`   ✅ Actualizadas: ${updated}`);
    console.log(`   ⏭️  Saltadas (ya tenían timestamps): ${skipped}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log('\n✨ Migración completada');
    
  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  }
}

migrateSessionTimes();
