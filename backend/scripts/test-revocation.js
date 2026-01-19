// Script para probar que la revocación de invitaciones funciona correctamente
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const API_URL = 'http://localhost:3001';

async function testRevocationFlow() {
  console.log('🧪 TEST: Revocación de invitaciones\n');
  console.log('═'.repeat(80));

  try {
    // Paso 1: Obtener invitaciones actuales
    console.log('\n📋 Paso 1: Obtener invitaciones actuales');
    const initialResponse = await fetch(`${API_URL}/api/invitations`);
    const initialInvitations = await initialResponse.json();
    console.log(`✅ Total de invitaciones: ${initialInvitations.length}`);
    
    const pendingBefore = initialInvitations.filter(inv => inv.status === 'PENDING');
    console.log(`   Pendientes: ${pendingBefore.length}`);

    if (pendingBefore.length === 0) {
      console.log('\n⚠️ No hay invitaciones pendientes para probar.');
      console.log('   Ejecuta: node scripts/create-test-invitation.js');
      return;
    }

    // Paso 2: Seleccionar una invitación para revocar
    const invitationToRevoke = pendingBefore[0];
    console.log(`\n📧 Invitación seleccionada para revocar:`);
    console.log(`   ID: ${invitationToRevoke.id}`);
    console.log(`   Para: ${invitationToRevoke.toUserEmail}`);
    console.log(`   De: ${invitationToRevoke.fromPsychologistName}`);

    // Paso 3: Revocar la invitación
    console.log(`\n📋 Paso 2: Revocar invitación`);
    const deleteResponse = await fetch(`${API_URL}/api/invitations?id=${invitationToRevoke.id}`, {
      method: 'DELETE',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      console.error(`❌ Error al revocar: ${error}`);
      return;
    }

    const deleteResult = await deleteResponse.json();
    console.log('✅ Invitación revocada');
    if (deleteResult.remainingInvitations) {
      console.log(`   Invitaciones restantes: ${deleteResult.remainingInvitations.length}`);
    }

    // Paso 4: Esperar un momento y verificar que se eliminó
    console.log(`\n📋 Paso 3: Verificar eliminación (esperando 1 segundo...)`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Paso 5: Obtener invitaciones nuevamente
    const finalResponse = await fetch(`${API_URL}/api/invitations?_t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    const finalInvitations = await finalResponse.json();
    
    console.log(`✅ Total de invitaciones después: ${finalInvitations.length}`);
    
    const pendingAfter = finalInvitations.filter(inv => inv.status === 'PENDING');
    console.log(`   Pendientes: ${pendingAfter.length}`);

    // Paso 6: Verificar que la invitación específica no existe
    const stillExists = finalInvitations.find(inv => inv.id === invitationToRevoke.id);
    
    if (stillExists) {
      console.error(`\n❌ ERROR: La invitación ${invitationToRevoke.id} AÚN EXISTE`);
      console.error(`   Esto indica un problema de caché o sincronización`);
      console.log('\n   Estado de la invitación:');
      console.log(`   - ID: ${stillExists.id}`);
      console.log(`   - Status: ${stillExists.status}`);
      console.log(`   - Email: ${stillExists.toUserEmail}`);
    } else {
      console.log(`\n✅ ÉXITO: La invitación ${invitationToRevoke.id} fue eliminada correctamente`);
      console.log(`   Ya no aparece en la lista de invitaciones`);
    }

    // Paso 7: Verificar el cambio en la cantidad
    const expectedCount = initialInvitations.length - 1;
    if (finalInvitations.length === expectedCount) {
      console.log(`✅ Cantidad correcta: ${initialInvitations.length} → ${finalInvitations.length}`);
    } else {
      console.error(`❌ Cantidad incorrecta: Esperado ${expectedCount}, Actual ${finalInvitations.length}`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ TEST COMPLETADO');
    console.log('\n📝 Resumen:');
    console.log(`   • Invitaciones antes: ${initialInvitations.length}`);
    console.log(`   • Invitaciones después: ${finalInvitations.length}`);
    console.log(`   • Eliminadas: ${initialInvitations.length - finalInvitations.length}`);
    console.log(`   • Invitación revocada: ${invitationToRevoke.id}`);
    console.log(`   • Estado: ${stillExists ? '❌ AÚN EXISTE (ERROR)' : '✅ ELIMINADA CORRECTAMENTE'}`);

  } catch (error) {
    console.error('\n❌ Error durante el test:', error);
  }
}

testRevocationFlow()
  .then(() => {
    console.log('\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error fatal:', err);
    process.exit(1);
  });
