import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔧 Corrigiendo email del usuario bcccd2a2-b203-4f76-9321-9c4a6ac58046');

// Primero ver el estado actual
const { data: before, error: readError } = await supabase
  .from('users')
  .select('id, user_email, data')
  .eq('id', 'bcccd2a2-b203-4f76-9321-9c4a6ac58046')
  .single();

if (readError) {
  console.error('❌ Error leyendo usuario:', readError);
  process.exit(1);
}

console.log('📊 Estado actual:', before);

// Actualizar el email
const { data, error } = await supabase
  .from('users')
  .update({ user_email: 'garridojavierfernandez@gmail.com' })
  .eq('id', 'bcccd2a2-b203-4f76-9321-9c4a6ac58046')
  .select();

if (error) {
  console.error('❌ Error actualizando:', error);
  process.exit(1);
}

console.log('✅ Email actualizado correctamente:', data);
