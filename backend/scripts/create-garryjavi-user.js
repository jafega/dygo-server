import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

const createUser = async () => {
  const userId = 'psych-001'; // Mantener el mismo ID que en db.json
  
  // Primero verificar si ya existe
  const checkUrl = `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`;
  
  const checkResponse = await fetch(checkUrl, {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  const existing = await checkResponse.json();
  
  if (existing && existing.length > 0) {
    console.log('✅ El usuario garryjavi@gmail.com ya existe en Supabase');
    console.log('Usuario:', existing[0]);
    return;
  }
  
  // Crear el usuario
  const user = {
    id: userId,
    data: {
      name: "Garry Javi",
      email: "garryjavi@gmail.com",
      password: "123",
      role: "PSYCHOLOGIST",
      isPsychologist: true
    },
    user_email: "garryjavi@gmail.com",
    is_psychologist: true
  };
  
  const createUrl = `${SUPABASE_URL}/rest/v1/users`;
  
  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(user)
  });
  
  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    console.log('❌ Error al crear usuario:', errorText);
    process.exit(1);
  }
  
  const created = await createResponse.json();
  console.log('✅ Usuario creado exitosamente en Supabase:');
  console.log(created);
};

createUser().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
