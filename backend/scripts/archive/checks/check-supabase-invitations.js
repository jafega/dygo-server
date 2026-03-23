import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

const url = `${SUPABASE_URL}/rest/v1/invitations?select=*`;

fetch(url, {
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('📊 INVITACIONES EN SUPABASE:');
  console.log('Total:', data.length);
  console.log('');
  
  data.forEach((inv, i) => {
    console.log(`Invitación #${i+1}:`);
    console.log('  ID:', inv.id);
    console.log('  Psicólogo Email:', inv.psychologistEmail || inv.fromPsychologistEmail || 'N/A');
    console.log('  Paciente Email:', inv.patientEmail || inv.toUserEmail || 'N/A');
    console.log('  Iniciador:', inv.initiatorEmail || 'N/A');
    console.log('  Estado:', inv.status);
    console.log('  Creada:', inv.createdAt || inv.timestamp);
    console.log('');
  });
})
.catch(err => {
  console.error('Error:', err.message);
});
