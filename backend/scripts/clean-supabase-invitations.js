import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

// Primero obtenemos todas las invitaciones
const getUrl = `${SUPABASE_URL}/rest/v1/invitations?select=*`;

fetch(getUrl, {
  headers: {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(async (data) => {
  console.log('📊 Invitaciones encontradas:', data.length);
  
  // Filtrar las que no tienen estructura correcta
  const toDelete = data.filter(inv => !inv.psychologistEmail);
  
  console.log('🗑️  Invitaciones a eliminar (sin psychologistEmail):', toDelete.length);
  
  if (toDelete.length === 0) {
    console.log('✅ No hay invitaciones para eliminar');
    return;
  }
  
  // Eliminar cada invitación
  for (const inv of toDelete) {
    console.log(`Eliminando invitación ${inv.id}...`);
    const deleteUrl = `${SUPABASE_URL}/rest/v1/invitations?id=eq.${inv.id}`;
    
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      console.log(`  ✅ Eliminada: ${inv.id}`);
    } else {
      console.log(`  ❌ Error eliminando ${inv.id}:`, await response.text());
    }
  }
  
  console.log('\n✨ Limpieza completada');
})
.catch(err => {
  console.error('Error:', err.message);
});
