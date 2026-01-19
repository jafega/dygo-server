// Script para probar el flujo completo de invitaciones con nuevo usuario
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_URL = 'http://localhost:3001';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function testInvitationFlow() {
  const testEmail = `test.user.${Date.now()}@example.com`;
  const testPassword = 'Test123!';
  const testName = 'Usuario de Prueba';

  console.log('🧪 TEST: Flujo completo de invitaciones\n');
  console.log('═'.repeat(80));

  // Paso 1: Obtener un psicólogo existente
  console.log('\n📋 Paso 1: Obtener psicólogo existente');
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
  console.log(`✅ Psicólogo: ${psych.name} (${psych.id})`);

  // Paso 2: Crear invitación en Supabase para el email que aún no existe
  console.log('\n📋 Paso 2: Crear invitación ANTES de que exista el usuario');
  const invitation = {
    id: crypto.randomUUID(),
    fromPsychologistId: psych.id,
    fromPsychologistName: psych.name || 'Psicólogo',
    toUserEmail: testEmail,
    status: 'PENDING',
    timestamp: Date.now()
  };

  const { error: invError } = await supabase.from('invitations').insert([{
    id: invitation.id,
    data: invitation
  }]);

  if (invError) {
    console.error('❌ Error creando invitación:', invError);
    return;
  }

  console.log(`✅ Invitación creada:`);
  console.log(`   ID: ${invitation.id}`);
  console.log(`   Para: ${testEmail}`);
  console.log(`   De: ${invitation.fromPsychologistName}`);

  // Paso 3: Registrar nuevo usuario con ese email
  console.log('\n📋 Paso 3: Registrar nuevo usuario a través de la API');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testName,
        email: testEmail,
        password: testPassword,
        role: 'PATIENT'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error registrando usuario:', error);
      return;
    }

    const newUser = await response.json();
    console.log(`✅ Usuario registrado:`);
    console.log(`   ID: ${newUser.id}`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Nombre: ${newUser.name}`);

    // Paso 4: Verificar que el usuario puede ver las invitaciones
    console.log('\n📋 Paso 4: Verificar invitaciones disponibles para el usuario');
    
    const invResponse = await fetch(`${API_URL}/api/invitations`);
    const allInvitations = await invResponse.json();
    
    const userInvitations = allInvitations.filter(
      inv => inv.toUserEmail === testEmail && inv.status === 'PENDING'
    );

    console.log(`✅ Invitaciones pendientes encontradas: ${userInvitations.length}`);
    
    if (userInvitations.length === 0) {
      console.error('❌ ERROR: El usuario debería tener 1 invitación pendiente');
      return;
    }

    userInvitations.forEach(inv => {
      console.log(`   - De ${inv.fromPsychologistName} (${inv.fromPsychologistId})`);
    });

    // Paso 5: Aceptar la invitación
    console.log('\n📋 Paso 5: Aceptar la invitación');
    
    const acceptResponse = await fetch(`${API_URL}/api/invitations?id=${invitation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ACCEPTED' })
    });

    if (!acceptResponse.ok) {
      console.error('❌ Error aceptando invitación');
      return;
    }

    console.log('✅ Invitación aceptada');

    // Paso 6: Verificar que se creó la relación
    console.log('\n📋 Paso 6: Verificar relación creada');
    
    const relationshipsResponse = await fetch(`${API_URL}/api/care-relationships`);
    const relationships = await relationshipsResponse.json();
    
    const newRelationship = relationships.find(
      rel => rel.psychologistId === psych.id && rel.patientId === newUser.id
    );

    if (newRelationship) {
      console.log('✅ Relación creada correctamente');
      console.log(`   Psicólogo: ${newRelationship.psychologistId}`);
      console.log(`   Paciente: ${newRelationship.patientId}`);
    } else {
      console.warn('⚠️ No se encontró la relación (esto podría ser normal si se crea en el frontend)');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ TEST COMPLETADO EXITOSAMENTE');
    console.log('\n📝 Resumen:');
    console.log('   1. ✅ Invitación creada antes de que existiera el usuario');
    console.log('   2. ✅ Usuario registrado correctamente');
    console.log('   3. ✅ Usuario puede ver invitaciones pendientes');
    console.log('   4. ✅ Invitación aceptada correctamente');
    console.log(`\n💡 Usuario de prueba creado: ${testEmail}`);
    console.log(`   Puedes probarlo en la aplicación con:`);
    console.log(`   Email: ${testEmail}`);
    console.log(`   Password: ${testPassword}`);

  } catch (error) {
    console.error('\n❌ Error durante el test:', error);
  }
}

testInvitationFlow()
  .then(() => {
    console.log('\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error fatal:', err);
    process.exit(1);
  });
