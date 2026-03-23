// Script para verificar sesiones en Supabase
const SUPABASE_URL = 'https://xvripjmxelforlwatqxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cmlwam14ZWxmb3Jsd2F0cXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwNjc4OCwiZXhwIjoyMDgzOTgyNzg4fQ.ITX7o-Vy9ydcKsk_ZG0fZQPPJ7jwoDgGMOnZM92c0Wo';

async function checkSessions() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/sessions?select=*`;
    console.log('Obteniendo todas las sesiones de Supabase...\n');
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (response.ok) {
      const rows = await response.json();
      console.log(`✅ Total de sesiones: ${rows.length}\n`);
      
      if (rows.length > 0) {
        console.log('Detalles de las sesiones:');
        rows.forEach((row, index) => {
          const data = row.data;
          console.log(`\nSesión ${index + 1}:`);
          console.log(`  ID: ${row.id}`);
          console.log(`  psychologistId: ${data.psychologistId || 'NO TIENE'}`);
          console.log(`  patientId: ${data.patientId || 'DISPONIBLE'}`);
          console.log(`  startTime: ${data.startTime || 'N/A'}`);
          console.log(`  endTime: ${data.endTime || 'N/A'}`);
          console.log(`  status: ${data.status || 'N/A'}`);
          console.log(`  type: ${data.type || 'N/A'}`);
        });

        // Contar por psicólogo
        const byPsych = {};
        rows.forEach(row => {
          const pid = row.data.psychologistId || 'sin-psicologo';
          if (!byPsych[pid]) byPsych[pid] = 0;
          byPsych[pid]++;
        });

        console.log('\n📊 Sesiones por psicólogo:');
        Object.keys(byPsych).forEach(pid => {
          console.log(`  ${pid}: ${byPsych[pid]} sesiones`);
        });

        // Contar disponibles
        const available = rows.filter(r => !r.data.patientId || r.data.status === 'available');
        console.log(`\n🟢 Sesiones disponibles: ${available.length}`);
        
        const booked = rows.filter(r => r.data.patientId && r.data.status !== 'available');
        console.log(`🔵 Sesiones reservadas: ${booked.length}`);
      } else {
        console.log('⚠️  No hay sesiones en la base de datos.');
        console.log('Los clientes no pueden ver horarios disponibles porque no existen.');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Error:', errorText);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSessions();
