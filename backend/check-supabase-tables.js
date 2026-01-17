// Script temporal para verificar tablas en Supabase
const SUPABASE_URL = 'https://xvripjmxelforlwatqxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cmlwam14ZWxmb3Jsd2F0cXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwNjc4OCwiZXhwIjoyMDgzOTgyNzg4fQ.ITX7o-Vy9ydcKsk_ZG0fZQPPJ7jwoDgGMOnZM92c0Wo';

async function checkTables() {
  try {
    // Verificar psychologist_profiles
    const url = `${SUPABASE_URL}/rest/v1/psychologist_profiles?select=id&limit=1`;
    console.log('Verificando tabla psychologist_profiles...');
    console.log('URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    console.log('Status:', response.status);
    console.log('Status text:', response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Tabla psychologist_profiles existe');
      console.log('Registros encontrados:', data.length);
      
      // Obtener todos los registros
      const allUrl = `${SUPABASE_URL}/rest/v1/psychologist_profiles?select=*`;
      const allResponse = await fetch(allUrl, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      });
      
      if (allResponse.ok) {
        const allData = await allResponse.json();
        console.log('Total de perfiles:', allData.length);
        console.log('Perfiles:', JSON.stringify(allData, null, 2));
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Error al acceder a la tabla:', errorText);
      console.log('\nLa tabla puede no existir o no tener permisos.');
      console.log('Debes crearla en Supabase con el siguiente SQL:');
      console.log(`
CREATE TABLE IF NOT EXISTS psychologist_profiles (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- Dar permisos
ALTER TABLE psychologist_profiles ENABLE ROW LEVEL SECURITY;

-- Política para permitir operaciones con service role
CREATE POLICY "Enable all access for service role" 
ON psychologist_profiles 
FOR ALL 
USING (true) 
WITH CHECK (true);
      `);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkTables();
