import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno del archivo .env.local en la raíz
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function updateGarryjaviPsychologist() {
  console.log('🔧 Actualizando usuario garryjavi...');
  
  try {
    // Buscar el usuario por email
    const { data: users, error: searchError } = await supabase
      .from('users')
      .select('*')
      .eq('user_email', 'garryjavi@gmail.com');
    
    if (searchError) {
      console.error('❌ Error buscando usuario:', searchError);
      return;
    }
    
    if (!users || users.length === 0) {
      console.log('⚠️ Usuario no encontrado');
      return;
    }
    
    const user = users[0];
    console.log('📊 Usuario encontrado:', user.id);
    console.log('📊 is_psychologist actual:', user.is_psychologist);
    
    // Actualizar is_psychologist a false
    const { data, error } = await supabase
      .from('users')
      .update({ is_psychologist: false })
      .eq('id', user.id)
      .select();
    
    if (error) {
      console.error('❌ Error actualizando:', error);
      return;
    }
    
    console.log('✅ Usuario actualizado exitosamente');
    console.log('📊 Nuevo valor de is_psychologist:', data[0].is_psychologist);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

updateGarryjaviPsychologist();
