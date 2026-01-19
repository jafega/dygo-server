import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xfxpbqwekfchafdhqrch.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmeHBicXdla2ZjaGFmZGhxcmNoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY3ODc5NzgxNiwiZXhwIjoyMDAzOTczODE2fQ.bRXIqHSv6p7qJk1vbzRDDCLV-G0qXmRbLnXcB0CX9mE';

async function checkInvitation() {
  const fetch = (await import('node-fetch')).default;
  
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log('📋 Buscando usuarios...');
  const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/users?select=*`, { headers });
  const users = await usersRes.json();
  
  const garryjavi = users.find(u => u.data?.email === 'garryjavi@gmail.com');
  const garridojavier = users.find(u => u.data?.email === 'garridojavierfernandez@gmail.com');
  
  console.log('\n✅ Usuarios encontrados:');
  console.log('   garryjavi@gmail.com:', garryjavi?.id);
  console.log('   garridojavierfernandez@gmail.com:', garridojavier?.id);
  
  console.log('\n📨 Buscando invitación...');
  const invRes = await fetch(`${SUPABASE_URL}/rest/v1/invitations?select=*`, { headers });
  const invs = await invRes.json();
  
  const inv = invs.find(i => 
    i.data?.psychologistEmail === 'garryjavi@gmail.com' && 
    i.data?.patientEmail === 'garridojavierfernandez@gmail.com'
  );
  
  if (inv) {
    console.log('✅ Invitación encontrada:');
    console.log('   ID:', inv.id);
    console.log('   Status:', inv.data.status);
    console.log('   psychologistId:', inv.data.psychologistId);
    console.log('   psychologistEmail:', inv.data.psychologistEmail);
    console.log('   patientId:', inv.data.patientId);
    console.log('   patientEmail:', inv.data.patientEmail);
    
    console.log('\n🔍 Verificando campos:');
    const psychIdCorrect = inv.data.psychologistId === garryjavi?.id;
    const patIdCorrect = inv.data.patientId === garridojavier?.id;
    
    console.log('   ¿psychologistId correcto?', psychIdCorrect ? '✅' : `❌ INCORRECTO - Es ${inv.data.psychologistId}, debería ser ${garryjavi?.id}`);
    console.log('   ¿patientId correcto?', patIdCorrect ? '✅' : `❌ INCORRECTO - Es ${inv.data.patientId}, debería ser ${garridojavier?.id}`);
    
    if (!psychIdCorrect || !patIdCorrect) {
      console.log('\n⚠️  Necesita corrección. Corrigiendo...');
      
      const updateData = {
        data: {
          ...inv.data,
          psychologistId: garryjavi.id,
          patientId: garridojavier.id
        }
      };
      
      const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/invitations?id=eq.${inv.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updateData)
      });
      
      if (updateRes.ok) {
        console.log('✅ Invitación corregida');
      } else {
        console.log('❌ Error al corregir:', await updateRes.text());
      }
    } else {
      console.log('\n✅ La invitación está correctamente configurada');
      console.log('👉 garridojavierfernandez@gmail.com puede aceptarla desde Connections');
    }
  } else {
    console.log('❌ No se encontró la invitación');
  }
}

checkInvitation().catch(console.error);
