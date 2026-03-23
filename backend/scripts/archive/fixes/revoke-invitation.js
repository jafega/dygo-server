// Script para revocar una invitación directamente usando la API
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';

async function revokeInvitation(invitationId) {
  console.log(`🗑️ Revocando invitación: ${invitationId}`);
  console.log(`📡 API URL: ${API_URL}/invitations?id=${invitationId}\n`);

  try {
    const response = await fetch(`${API_URL}/invitations?id=${invitationId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Error:', errorData);
      return;
    }

    const result = await response.json();
    console.log('✅ Respuesta del servidor:', result);
    console.log('\n📝 Ahora ejecuta: node scripts/check-invitations.js para verificar que se eliminó de Supabase');
  } catch (error) {
    console.error('❌ Error en la petición:', error);
  }
}

const invId = process.argv[2];

if (!invId) {
  console.error('❌ Uso: node scripts/revoke-invitation.js <invitation-id>');
  console.log('\nPara obtener los IDs de invitaciones, ejecuta: node scripts/check-invitations.js');
  process.exit(1);
}

revokeInvitation(invId)
  .then(() => {
    console.log('\n✅ Proceso completado');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
