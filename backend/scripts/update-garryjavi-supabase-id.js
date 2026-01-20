import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

const updateUser = async () => {
  const userId = 'psych-001';
  const supabaseId = 'a4fc7437-146a-414f-a44f-d9e4fa134003';
  
  // Actualizar el usuario
  const url = `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      data: {
        name: "Garry Javi",
        email: "garryjavi@gmail.com",
        password: "123",
        role: "PSYCHOLOGIST",
        isPsychologist: true,
        supabaseId: supabaseId
      }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('❌ Error al actualizar usuario:', errorText);
    process.exit(1);
  }
  
  const updated = await response.json();
  console.log('✅ Usuario actualizado exitosamente:');
  console.log(updated);
};

updateUser().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
