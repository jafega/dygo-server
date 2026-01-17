// Script para actualizar el accessList del paciente
const SUPABASE_URL = 'https://xvripjmxelforlwatqxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cmlwam14ZWxmb3Jsd2F0cXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwNjc4OCwiZXhwIjoyMDgzOTgyNzg4fQ.ITX7o-Vy9ydcKsk_ZG0fZQPPJ7jwoDgGMOnZM92c0Wo';

async function updatePatient() {
  try {
    // Obtener el paciente actual
    const getUrl = `${SUPABASE_URL}/rest/v1/users?select=*`;
    const getResponse = await fetch(getUrl, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    const rows = await getResponse.json();
    const patientRow = rows.find(r => r.data.email === 'garridojavierfernandez@gmail.com');
    
    if (!patientRow) {
      console.log('❌ Paciente no encontrado');
      return;
    }

    const patient = patientRow.data;
    console.log('👤 Paciente actual:');
    console.log(`  ID: ${patient.id}`);
    console.log(`  AccessList actual: ${JSON.stringify(patient.accessList)}`);

    // Actualizar con el ID correcto del psicólogo
    const updatedPatient = {
      ...patient,
      accessList: ['03125ea5-f128-440e-94a3-b2c657130013']
    };

    // Actualizar en Supabase
    const updateUrl = `${SUPABASE_URL}/rest/v1/users?id=eq.${patient.id}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ data: updatedPatient })
    });

    if (updateResponse.ok) {
      console.log('\n✅ AccessList actualizado correctamente');
      console.log(`  Nuevo accessList: ["03125ea5-f128-440e-94a3-b2c657130013"]`);
    } else {
      const error = await updateResponse.text();
      console.log('❌ Error al actualizar:', error);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

updatePatient();
