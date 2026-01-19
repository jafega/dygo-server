// Script simple para verificar que las invitaciones están asociadas correctamente por email
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

async function verifyInvitationsByEmail() {
  console.log('🔍 Verificando asociación de invitaciones por email\n');

  // Obtener todas las invitaciones pendientes
  const { data: invitations, error: invError } = await supabase
    .from('invitations')
    .select('*');

  if (invError) {
    console.error('❌ Error consultando invitaciones:', invError);
    return;
  }

  const pendingInvitations = invitations.filter(row => {
    const inv = row.data || row;
    return inv.status === 'PENDING';
  });

  if (pendingInvitations.length === 0) {
    console.log('✅ No hay invitaciones pendientes');
    return;
  }

  console.log(`📊 Invitaciones pendientes: ${pendingInvitations.length}\n`);

  // Para cada invitación, verificar si existe un usuario con ese email
  for (const row of pendingInvitations) {
    const inv = row.data || row;
    console.log(`📧 Email: ${inv.toUserEmail}`);
    console.log(`   De: ${inv.fromPsychologistName}`);
    console.log(`   ID: ${inv.id}`);

    // Buscar usuario con ese email
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*');

    if (userError) {
      console.log(`   ⚠️ Error buscando usuario: ${userError.message}`);
      continue;
    }

    const user = users.find(u => {
      const userData = u.data || u;
      return userData.email?.toLowerCase() === inv.toUserEmail?.toLowerCase();
    });

    if (user) {
      const userData = user.data || user;
      console.log(`   ✅ Usuario existe: ${userData.name} (${userData.id})`);
      console.log(`   📌 El usuario PUEDE ver esta invitación en Conexiones`);
    } else {
      console.log(`   ⏳ Usuario NO existe aún`);
      console.log(`   📌 La invitación estará disponible cuando se registre con: ${inv.toUserEmail}`);
    }
    console.log('');
  }

  console.log('═'.repeat(80));
  console.log('\n💡 Cómo funciona:');
  console.log('   • Las invitaciones se asocian por EMAIL, no por userId');
  console.log('   • Cuando un usuario se registra, getPendingInvitationsForEmail(email) las encuentra');
  console.log('   • El panel ConnectionsPanel las carga automáticamente');
  console.log('   • El usuario puede aceptar/rechazar desde la UI');
}

verifyInvitationsByEmail()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
