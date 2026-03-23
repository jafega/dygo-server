// Script para crear la tabla sessions directamente en Supabase
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas');
  process.exit(1);
}

const SQL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  )`,
  
  `CREATE INDEX IF NOT EXISTS idx_sessions_psychologist ON sessions USING btree ((data->>'psychologistId'))`,
  
  `CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions USING btree ((data->>'patientId'))`,
  
  `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions USING btree ((data->>'status'))`,
  
  `CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions USING btree ((data->>'date'))`,
  
  `ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`,
  
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'sessions' 
      AND policyname = 'Enable all access for authenticated users'
    ) THEN
      CREATE POLICY "Enable all access for authenticated users" ON sessions
        FOR ALL USING (true) WITH CHECK (true);
    END IF;
   END $$`
];

async function executeSql(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });

  return response;
}

async function createSessionsTable() {
  console.log('🔧 Conectando a Supabase...');
  console.log('🌐 URL:', SUPABASE_URL);
  
  try {
    // Usar PostgREST SQL query endpoint (funciona en Supabase)
    const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    
    if (!projectRef) {
      throw new Error('No se pudo extraer el project ref de SUPABASE_URL');
    }

    console.log('\n📋 Ejecutando migración de tabla sessions...\n');

    // Ejecutar cada statement
    for (let i = 0; i < SQL_STATEMENTS.length; i++) {
      const sql = SQL_STATEMENTS[i];
      const shortSql = sql.substring(0, 60).replace(/\n/g, ' ') + '...';
      
      console.log(`[${i + 1}/${SQL_STATEMENTS.length}] Ejecutando: ${shortSql}`);
      
      // Usar la API de Supabase Management API o ejecutar via psql
      // Como alternativa, usamos el endpoint de SQL editor
      const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok && response.status !== 404) {
        const text = await response.text();
        console.log(`⚠️  Status: ${response.status} - ${text.substring(0, 100)}`);
      }
    }

    console.log('\n✅ Intentando crear tabla usando cliente Supabase...\n');

    // Alternativa: usar createClient y ejecutar SQL
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    // Ejecutar el SQL completo
    const fullSql = SQL_STATEMENTS.join(';\n\n');
    
    console.log('📝 SQL a ejecutar:\n');
    console.log('─'.repeat(60));
    console.log(fullSql);
    console.log('─'.repeat(60));

    // Intentar insertar un registro de prueba después de crear la tabla
    console.log('\n🧪 Verificando que la tabla fue creada...');
    
    const { error: testError } = await supabase
      .from('sessions')
      .select('id')
      .limit(1);

    if (testError && testError.code === '42P01') {
      console.log('\n⚠️  La tabla no existe aún. Necesitas ejecutar el SQL manualmente.');
      console.log('\n📋 Pasos:');
      console.log('1. Ve a: https://app.supabase.com/project/' + projectRef + '/sql/new');
      console.log('2. Copia el SQL mostrado arriba');
      console.log('3. Pégalo en el editor');
      console.log('4. Haz clic en Run\n');
      process.exit(1);
    } else if (testError) {
      console.error('❌ Error verificando tabla:', testError);
      process.exit(1);
    } else {
      console.log('✅ ¡Tabla sessions creada exitosamente!');
      
      // Contar registros existentes
      const { count } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });
      
      console.log(`📊 Total de sesiones en la tabla: ${count || 0}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Solución: Ejecuta el SQL manualmente en Supabase SQL Editor');
    process.exit(1);
  }
}

createSessionsTable();
