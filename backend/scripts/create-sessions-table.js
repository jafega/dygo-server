// Script para crear la tabla sessions en Supabase
// Uso: node scripts/create-sessions-table.js

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en .env');
  process.exit(1);
}

async function createSessionsTable() {
  console.log('🔧 Conectando a Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    // Verificar si la tabla ya existe
    console.log('🔍 Verificando si la tabla sessions existe...');
    const { data: existingData, error: checkError } = await supabase
      .from('sessions')
      .select('id')
      .limit(1);

    if (!checkError) {
      console.log('✅ La tabla sessions ya existe');
      const { count, error: countError } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });
      
      if (!countError) {
        console.log(`📊 Total de sesiones existentes: ${count || 0}`);
      }
      return;
    }

    // Si la tabla no existe, mostrar instrucciones
    if (checkError.code === '42P01' || checkError.message.includes('does not exist')) {
      console.log('⚠️ La tabla sessions no existe en Supabase');
      console.log('\n📋 Para crear la tabla, sigue estos pasos:\n');
      console.log('1. Ve a tu proyecto Supabase: ' + SUPABASE_URL.replace('/rest/v1', ''));
      console.log('2. Navega a SQL Editor en el menú lateral');
      console.log('3. Crea una nueva query');
      console.log('4. Copia y pega el contenido del archivo:');
      console.log('   backend/scripts/create-sessions-table.sql');
      console.log('5. Ejecuta la query (botón Run)\n');
      
      console.log('📄 Contenido del SQL:\n');
      const sqlPath = path.join(__dirname, 'create-sessions-table.sql');
      if (fs.existsSync(sqlPath)) {
        const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
        console.log('─'.repeat(60));
        console.log(sqlContent);
        console.log('─'.repeat(60));
      }
      
      console.log('\n💡 Después de crear la tabla, reinicia el servidor backend');
    } else {
      throw checkError;
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createSessionsTable();
