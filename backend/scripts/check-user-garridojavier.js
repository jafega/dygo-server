// Script para verificar el usuario garridojavierfernandez@gmail.com
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function checkUser() {
  console.log('🔍 Buscando invitaciones para garridojavierfernandez@gmail.com...\n');

  // Buscar invitaciones por invited_patient_email
  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('*')
    .eq('invited_patient_email', 'garridojavierfernandez@gmail.com');

  if (invError) {
    console.error('❌ Error consultando invitaciones:', invError);
    return;
  }

  console.log(`📊 Invitaciones encontradas por invited_patient_email: ${invitations?.length || 0}`);
  if (invitations && invitations.length > 0) {
    console.log(JSON.stringify(invitations, null, 2));
  }

  // Buscar usuarios
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('*');

  if (userError) {
    console.error('❌ Error consultando usuarios:', userError);
    return;
  }

  const user = users?.find(u => {
    const userData = u.data || u;
    return userData.email === 'garridojavierfernandez@gmail.com';
  });

  if (user) {
    console.log('\n✅ Usuario garridojavierfernandez@gmail.com encontrado:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Data:`, JSON.stringify(user.data || user, null, 2));
  } else {
    console.log('\n❌ Usuario garridojavierfernandez@gmail.com NO encontrado');
  }
}

checkUser()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
