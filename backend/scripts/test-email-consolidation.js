/**
 * Script para probar la consolidación de usuarios al añadir email
 * 
 * Casos de prueba:
 * 1. Usuario temporal + email nuevo → Actualiza normalmente
 * 2. Usuario temporal + email existente → Consolida usuarios
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_URL = 'http://localhost:3001';

// Helper para hacer peticiones
async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

// Limpiar datos de prueba
async function cleanup() {
  console.log('🧹 Limpiando datos de prueba...');
  
  // Eliminar usuarios de prueba
  await supabase.from('users').delete().like('user_email', '%@test-consolidation.local');
  await supabase.from('users').delete().like('user_email', 'temp_%@noemail.dygo.local');
  
  console.log('✅ Limpieza completada\n');
}

// Test 1: Usuario temporal con email nuevo (sin consolidación)
async function testNewEmail() {
  console.log('📝 Test 1: Usuario temporal con email nuevo');
  console.log('=' .repeat(50));
  
  try {
    // Buscar un psicólogo existente
    const { data: users } = await supabase
      .from('users')
      .select('id, data, is_psychologist')
      .eq('is_psychologist', true)
      .limit(1);
    
    if (!users || users.length === 0) {
      console.log('❌ No hay psicólogos en el sistema');
      return;
    }
    
    const psychId = users[0].id;
    console.log(`✓ Usando psicólogo: ${psychId}`);
    
    // Crear paciente sin email
    console.log('\n1. Crear paciente sin email...');
    const patient = await apiRequest('/api/admin/create-patient', {
      method: 'POST',
      headers: {
        'x-user-id': psychId
      },
      body: JSON.stringify({
        name: 'Test Paciente Sin Email',
        phone: '123456789'
      })
    });
    
    console.log(`✓ Paciente creado: ${patient.patient.id}`);
    console.log(`  Email: ${patient.patient.email}`);
    console.log(`  has_temp_email: ${patient.patient.has_temp_email}`);
    
    const tempUserId = patient.patient.id;
    
    // Añadir email nuevo
    console.log('\n2. Añadir email nuevo al paciente...');
    const newEmail = `new-user-${Date.now()}@test-consolidation.local`;
    
    const updated = await apiRequest(`/api/users/${tempUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email: newEmail
      })
    });
    
    console.log(`✓ Usuario actualizado`);
    console.log(`  ID: ${updated.id}`);
    console.log(`  Email: ${updated.user_email || updated.email}`);
    console.log(`  Consolidado: ${updated.consolidated ? 'SÍ' : 'NO'}`);
    
    if (updated.id === tempUserId && !updated.consolidated) {
      console.log('\n✅ Test 1 PASADO: Usuario actualizado correctamente sin consolidación');
    } else {
      console.log('\n❌ Test 1 FALLIDO: Comportamiento inesperado');
    }
    
  } catch (error) {
    console.error('\n❌ Test 1 ERROR:', error.message);
  }
  
  console.log('\n');
}

// Test 2: Usuario temporal con email existente (con consolidación)
async function testExistingEmail() {
  console.log('📝 Test 2: Usuario temporal con email existente (consolidación)');
  console.log('=' .repeat(50));
  
  try {
    // Buscar un psicólogo existente
    const { data: users } = await supabase
      .from('users')
      .select('id, data, is_psychologist')
      .eq('is_psychologist', true)
      .limit(1);
    
    if (!users || users.length === 0) {
      console.log('❌ No hay psicólogos en el sistema');
      return;
    }
    
    const psychId = users[0].id;
    console.log(`✓ Usando psicólogo: ${psychId}`);
    
    // Crear usuario real primero
    console.log('\n1. Crear usuario real con email...');
    const realEmail = `real-user-${Date.now()}@test-consolidation.local`;
    
    const { data: realUser } = await supabase
      .from('users')
      .insert({
        id: `real-${Date.now()}`,
        data: {
          name: 'Usuario Real Test',
          email: realEmail,
          role: 'PATIENT'
        },
        user_email: realEmail,
        is_psychologist: false
      })
      .select()
      .single();
    
    console.log(`✓ Usuario real creado: ${realUser.id}`);
    console.log(`  Email: ${realUser.user_email}`);
    
    // Crear paciente temporal
    console.log('\n2. Crear paciente temporal sin email...');
    const tempPatient = await apiRequest('/api/admin/create-patient', {
      method: 'POST',
      headers: {
        'x-user-id': psychId
      },
      body: JSON.stringify({
        name: 'Test Paciente Temporal',
        phone: '987654321'
      })
    });
    
    console.log(`✓ Paciente temporal creado: ${tempPatient.patient.id}`);
    console.log(`  Email: ${tempPatient.patient.email}`);
    console.log(`  Relación creada con: ${psychId}`);
    
    const tempUserId = tempPatient.patient.id;
    const relationshipId = tempPatient.relationship.id;
    
    // Verificar relación antes de consolidar
    console.log('\n3. Verificar relación antes de consolidar...');
    const { data: relBefore } = await supabase
      .from('care_relationships')
      .select('*')
      .eq('id', relationshipId)
      .single();
    
    console.log(`✓ Relación encontrada:`);
    console.log(`  ID: ${relBefore.id}`);
    console.log(`  Psicólogo: ${relBefore.psychologist_user_id}`);
    console.log(`  Paciente: ${relBefore.patient_user_id}`);
    
    // Añadir email existente al temporal
    console.log('\n4. Añadir email existente al temporal (debe consolidar)...');
    const consolidated = await apiRequest(`/api/users/${tempUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email: realEmail
      })
    });
    
    console.log(`✓ Respuesta recibida`);
    console.log(`  ID: ${consolidated.id}`);
    console.log(`  Email: ${consolidated.user_email || consolidated.email}`);
    console.log(`  Consolidado: ${consolidated.consolidated ? 'SÍ' : 'NO'}`);
    
    // Verificar que el usuario temporal fue eliminado
    console.log('\n5. Verificar que el usuario temporal fue eliminado...');
    const { data: deletedUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', tempUserId)
      .maybeSingle();
    
    if (!deletedUser) {
      console.log(`✓ Usuario temporal ${tempUserId} eliminado correctamente`);
    } else {
      console.log(`❌ Usuario temporal ${tempUserId} aún existe`);
    }
    
    // Verificar que la relación apunta al usuario real
    console.log('\n6. Verificar que la relación apunta al usuario real...');
    const { data: relAfter } = await supabase
      .from('care_relationships')
      .select('*')
      .eq('psychologist_user_id', psychId)
      .eq('patient_user_id', realUser.id)
      .maybeSingle();
    
    if (relAfter) {
      console.log(`✓ Relación actualizada correctamente:`);
      console.log(`  ID: ${relAfter.id}`);
      console.log(`  Psicólogo: ${relAfter.psychologist_user_id}`);
      console.log(`  Paciente: ${relAfter.patient_user_id}`);
    } else {
      console.log(`❌ No se encontró relación con el usuario real`);
    }
    
    // Verificar resultado final
    if (
      consolidated.id === realUser.id &&
      consolidated.consolidated === true &&
      !deletedUser &&
      relAfter &&
      relAfter.patient_user_id === realUser.id
    ) {
      console.log('\n✅ Test 2 PASADO: Consolidación exitosa');
    } else {
      console.log('\n❌ Test 2 FALLIDO: Consolidación incompleta');
    }
    
  } catch (error) {
    console.error('\n❌ Test 2 ERROR:', error.message);
  }
  
  console.log('\n');
}

// Test 3: Usuario temporal con múltiples relaciones
async function testMultipleRelationships() {
  console.log('📝 Test 3: Usuario temporal con múltiples relaciones');
  console.log('=' .repeat(50));
  
  try {
    // Buscar dos psicólogos diferentes
    const { data: users } = await supabase
      .from('users')
      .select('id, data, is_psychologist')
      .eq('is_psychologist', true)
      .limit(2);
    
    if (!users || users.length < 2) {
      console.log('⚠️ Se necesitan al menos 2 psicólogos para este test');
      return;
    }
    
    const psychId1 = users[0].id;
    const psychId2 = users[1].id;
    console.log(`✓ Usando psicólogo 1: ${psychId1}`);
    console.log(`✓ Usando psicólogo 2: ${psychId2}`);
    
    // Crear usuario real
    console.log('\n1. Crear usuario real...');
    const realEmail = `multi-rel-${Date.now()}@test-consolidation.local`;
    
    const { data: realUser } = await supabase
      .from('users')
      .insert({
        id: `real-multi-${Date.now()}`,
        data: {
          name: 'Usuario Real Multi',
          email: realEmail,
          role: 'PATIENT'
        },
        user_email: realEmail,
        is_psychologist: false
      })
      .select()
      .single();
    
    console.log(`✓ Usuario real creado: ${realUser.id}`);
    
    // Crear paciente temporal con psicólogo 1
    console.log('\n2. Crear paciente temporal (Psicólogo 1)...');
    const tempPatient1 = await apiRequest('/api/admin/create-patient', {
      method: 'POST',
      headers: {
        'x-user-id': psychId1
      },
      body: JSON.stringify({
        name: 'Test Multi Relaciones',
        phone: '111222333'
      })
    });
    
    const tempUserId = tempPatient1.patient.id;
    console.log(`✓ Paciente temporal creado: ${tempUserId}`);
    console.log(`  Relación con Psicólogo 1 creada`);
    
    // Crear relación con psicólogo 2
    console.log('\n3. Crear relación con Psicólogo 2...');
    const { data: rel2 } = await supabase
      .from('care_relationships')
      .insert({
        id: `rel-${Date.now()}`,
        psychologist_user_id: psychId2,
        patient_user_id: tempUserId,
        data: { status: 'active' },
        active: true
      })
      .select()
      .single();
    
    console.log(`✓ Relación con Psicólogo 2 creada: ${rel2.id}`);
    
    // Consolidar
    console.log('\n4. Consolidar añadiendo email existente...');
    const consolidated = await apiRequest(`/api/users/${tempUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email: realEmail
      })
    });
    
    console.log(`✓ Consolidación completada`);
    console.log(`  Usuario final: ${consolidated.id}`);
    
    // Verificar ambas relaciones
    console.log('\n5. Verificar que ambas relaciones apuntan al usuario real...');
    const { data: relations } = await supabase
      .from('care_relationships')
      .select('*')
      .eq('patient_user_id', realUser.id)
      .in('psychologist_user_id', [psychId1, psychId2]);
    
    console.log(`✓ Relaciones encontradas: ${relations.length}`);
    relations.forEach(rel => {
      console.log(`  - Psicólogo ${rel.psychologist_user_id} → Paciente ${rel.patient_user_id}`);
    });
    
    if (relations.length === 2 && consolidated.id === realUser.id) {
      console.log('\n✅ Test 3 PASADO: Múltiples relaciones consolidadas correctamente');
    } else {
      console.log('\n❌ Test 3 FALLIDO');
    }
    
  } catch (error) {
    console.error('\n❌ Test 3 ERROR:', error.message);
  }
  
  console.log('\n');
}

// Ejecutar tests
async function runTests() {
  console.log('\n🧪 TEST DE CONSOLIDACIÓN DE USUARIOS\n');
  console.log('Asegúrate de que el servidor esté corriendo en http://localhost:3001\n');
  
  await cleanup();
  
  await testNewEmail();
  await testExistingEmail();
  await testMultipleRelationships();
  
  console.log('🏁 Tests completados');
  console.log('\n⚠️ Recuerda ejecutar la limpieza si es necesario');
  
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Error ejecutando tests:', err);
  process.exit(1);
});
