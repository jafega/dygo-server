// Script para verificar el usuario del paciente
const SUPABASE_URL = 'https://xvripjmxelforlwatqxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cmlwam14ZWxmb3Jsd2F0cXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwNjc4OCwiZXhwIjoyMDgzOTgyNzg4fQ.ITX7o-Vy9ydcKsk_ZG0fZQPPJ7jwoDgGMOnZM92c0Wo';

async function checkPatient() {
  try {
    // Buscar usuario por email
    const url = `${SUPABASE_URL}/rest/v1/users?select=*`;
    console.log('Obteniendo usuarios de Supabase...\n');
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (response.ok) {
      const rows = await response.json();
      console.log(`✅ Total de usuarios: ${rows.length}\n`);
      
      // Buscar el paciente
      const patientRow = rows.find(r => r.data.email === 'garridojavierfernandez@gmail.com');
      
      if (patientRow) {
        const patient = patientRow.data;
        console.log('👤 Paciente encontrado:');
        console.log(`  ID: ${patient.id}`);
        console.log(`  Email: ${patient.email}`);
        console.log(`  Nombre: ${patient.name}`);
        console.log(`  Role: ${patient.role}`);
        console.log(`  AccessList: ${JSON.stringify(patient.accessList || [])}`);
        
        if (!patient.accessList || patient.accessList.length === 0) {
          console.log('\n❌ PROBLEMA: El paciente NO tiene psicólogo asignado en accessList');
          console.log('Esto explica por qué no puede ver la disponibilidad.');
        } else {
          console.log('\n✅ El paciente tiene psicólogo asignado');
          console.log(`   Psicólogo ID: ${patient.accessList[0]}`);
        }
      } else {
        console.log('❌ No se encontró el paciente con email garridojavierfernandez@gmail.com');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Error:', errorText);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPatient();
