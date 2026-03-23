import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xfxpbqwekfchafdhqrch.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmeHBicXdla2ZjaGFmZGhxcmNoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY3ODc5NzgxNiwiZXhwIjoyMDAzOTczODE2fQ.bRXIqHSv6p7qJk1vbzRDDCLV-G0qXmRbLnXcB0CX9mE';

const DANIEL_ID = '69e56e57-c0d3-424e-a872-1d67e400ba0e';
const GARRY_ID = '03125ea5-f128-440e-94a3-b2c657130013';

async function cleanCareRelationships() {
  const fetch = (await import('node-fetch')).default;
  try {
    console.log('🔍 Obteniendo todas las care_relationships...');
    
    // Obtener todas las relaciones
    const getAllResponse = await fetch(`${SUPABASE_URL}/rest/v1/care_relationships?select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!getAllResponse.ok) {
      throw new Error(`Error al obtener relaciones: ${getAllResponse.statusText}`);
    }

    const allRelationships = await getAllResponse.json();
    console.log(`\n📊 Total de relaciones encontradas: ${allRelationships.length}`);

    // Mostrar todas las relaciones
    allRelationships.forEach((rel, index) => {
      const psychId = rel.data?.psychologistId || 'N/A';
      const patId = rel.data?.patientId || 'N/A';
      const isDanielGarry = psychId === DANIEL_ID && patId === GARRY_ID;
      console.log(`${index + 1}. ID: ${rel.id} - ${psychId} → ${patId} ${isDanielGarry ? '✅ MANTENER' : '❌ ELIMINAR'}`);
    });

    // Filtrar las que NO son Daniel → Garry
    const toDelete = allRelationships.filter(rel => {
      const psychId = rel.data?.psychologistId;
      const patId = rel.data?.patientId;
      return !(psychId === DANIEL_ID && patId === GARRY_ID);
    });

    console.log(`\n🗑️  Eliminando ${toDelete.length} relaciones...`);

    // Eliminar cada una
    for (const rel of toDelete) {
      console.log(`   Eliminando ID: ${rel.id}`);
      const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/care_relationships?id=eq.${rel.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!deleteResponse.ok) {
        console.error(`   ❌ Error al eliminar ${rel.id}: ${deleteResponse.statusText}`);
      } else {
        console.log(`   ✅ Eliminado`);
      }
    }

    // Verificar resultado final
    console.log('\n🔍 Verificando resultado final...');
    const verifyResponse = await fetch(`${SUPABASE_URL}/rest/v1/care_relationships?select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const finalRelationships = await verifyResponse.json();
    console.log(`\n✅ RESULTADO FINAL: ${finalRelationships.length} relación(es) restante(s)`);
    
    finalRelationships.forEach((rel, index) => {
      const psychId = rel.data?.psychologistId || 'N/A';
      const patId = rel.data?.patientId || 'N/A';
      console.log(`${index + 1}. ID: ${rel.id}`);
      console.log(`   Psicólogo: ${psychId}`);
      console.log(`   Paciente: ${patId}`);
    });

    if (finalRelationships.length === 1 && 
        finalRelationships[0].data?.psychologistId === DANIEL_ID && 
        finalRelationships[0].data?.patientId === GARRY_ID) {
      console.log('\n🎉 ¡Perfecto! Solo queda la relación Daniel → Garry');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanCareRelationships();
