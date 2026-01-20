import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const createAuthUser = async () => {
  const email = 'garryjavi@gmail.com';
  
  // Verificar si ya existe en Auth
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.log('❌ Error al listar usuarios:', listError);
    process.exit(1);
  }
  
  const existingUser = users.users.find(u => u.email === email);
  
  if (existingUser) {
    console.log('✅ El usuario ya existe en Supabase Auth');
    console.log('ID:', existingUser.id);
    console.log('Email:', existingUser.email);
    return;
  }
  
  // Crear usuario en Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    email_confirm: true,
    user_metadata: {
      full_name: 'Garry Javi'
    }
  });
  
  if (error) {
    console.log('❌ Error al crear usuario en Auth:', error);
    process.exit(1);
  }
  
  console.log('✅ Usuario creado en Supabase Auth:');
  console.log('ID:', data.user.id);
  console.log('Email:', data.user.email);
  console.log('\n⚠️ IMPORTANTE: Ahora actualiza el usuario en la tabla users con este supabaseId:', data.user.id);
};

createAuthUser().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
