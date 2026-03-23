// Script para crear el bucket de avatares en Supabase
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function createAvatarsBucket() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
    process.exit(1);
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    console.log('📦 Creando bucket de avatares...');

    // Intentar crear el bucket
    const { data: bucketData, error: bucketError } = await supabase.storage
      .createBucket('avatars', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
      });

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('ℹ️ El bucket "avatars" ya existe');
      } else {
        console.error('❌ Error creando bucket:', bucketError);
        throw bucketError;
      }
    } else {
      console.log('✅ Bucket "avatars" creado exitosamente');
    }

    // Verificar que el bucket existe
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listando buckets:', listError);
    } else {
      const avatarsBucket = buckets.find(b => b.id === 'avatars');
      if (avatarsBucket) {
        console.log('✅ Bucket verificado:', avatarsBucket);
      } else {
        console.error('⚠️ No se encontró el bucket después de crearlo');
      }
    }

    console.log('\n✅ Configuración de avatares completada');
    console.log('📝 Los usuarios ahora pueden subir fotos de perfil');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createAvatarsBucket();
