// Script para crear una invitación de prueba
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

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

async function createTestInvitation() {
  // Primero obtener un psicólogo existente
  const { data: users, error: usersError } = await supabase.from('users').select('*');
  
  if (usersError) {
    console.error('❌ Error consultando usuarios:', usersError);
    return;
  }

  const psychologists = users.filter(row => {
    const user = row.data || row;
    return user.role === 'PSYCHOLOGIST' || user.isPsychologist;
  });

  if (psychologists.length === 0) {
    console.error('❌ No hay psicólogos en la base de datos');
    return;
  }

  const psych = psychologists[0].data || psychologists[0];
  const testEmail = 'test.invitation@example.com';
  
  const invitation = {
    id: crypto.randomUUID(),
    fromPsychologistId: psych.id,
    fromPsychologistName: psych.name || 'Psicólogo de Prueba',
    toUserEmail: testEmail,
    status: 'PENDING',
    timestamp: Date.now()
  };

  console.log('📧 Creando invitación de prueba:');
  console.log(`   De: ${invitation.fromPsychologistName} (${invitation.fromPsychologistId})`);
  console.log(`   Para: ${invitation.toUserEmail}`);
  console.log(`   ID: ${invitation.id}`);
  console.log('');

  const { error } = await supabase.from('invitations').insert([{
    id: invitation.id,
    data: invitation
  }]);

  if (error) {
    console.error('❌ Error creando invitación:', error);
    return;
  }

  console.log('✅ Invitación de prueba creada exitosamente');
  console.log('');
  console.log('Para probar:');
  console.log(`1. Intenta revocar esta invitación desde el panel de Conexiones`);
  console.log(`2. Verifica que se elimine de Supabase ejecutando: node scripts/check-invitations.js`);
  console.log(`3. O crea un usuario con email: ${testEmail} y verifica que le aparezca la invitación`);
}

createTestInvitation()
  .then(() => {
    console.log('');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
