// Test endpoint de relationships vs Supabase directo
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  console.log('\n🔍 COMPARACIÓN: Supabase vs Backend Endpoint\n');
  
  const garryId = '03125ea5-f128-440e-94a3-b2c657130013';
  
  // 1. Consultar Supabase directamente
  console.log('1️⃣ Consultando Supabase directamente...');
  const { data: supabaseRels, error } = await supabase
    .from('care_relationships')
    .select('*');
  
  if (error) {
    console.error('❌ Error en Supabase:', error);
  } else {
    console.log(`   Total en Supabase: ${supabaseRels.length}`);
    const garryRels = supabaseRels.filter(r => r.data?.patientId === garryId);
    console.log(`   Relaciones de Garry (${garryId}): ${garryRels.length}`);
    garryRels.forEach(r => {
      console.log(`   - ID: ${r.id}`);
      console.log(`     PsychID: ${r.data.psychologistId}`);
      console.log(`     PatientID: ${r.data.patientId}`);
    });
  }
  
  // 2. Consultar backend endpoint
  console.log('\n2️⃣ Consultando Backend Endpoint...');
  try {
    const response = await fetch(`${BACKEND_URL}/api/relationships?patientId=${garryId}&_t=${Date.now()}`);
    if (!response.ok) {
      console.error(`❌ Error HTTP: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
    } else {
      const backendRels = await response.json();
      console.log(`   Total devuelto por backend: ${backendRels.length}`);
      backendRels.forEach(r => {
        console.log(`   - ID: ${r.id}`);
        console.log(`     PsychID: ${r.psychologistId}`);
        console.log(`     PatientID: ${r.patientId}`);
      });
      
      if (backendRels.length === 0) {
        console.log('\n❌ PROBLEMA: Backend devuelve array vacío pero Supabase tiene datos');
      } else if (backendRels.length === garryRels.length) {
        console.log('\n✅ OK: Backend y Supabase coinciden');
      } else {
        console.log('\n⚠️ DESINCRONIZADO: Diferentes cantidades de relaciones');
      }
    }
  } catch (err) {
    console.error('❌ Error consultando backend:', err.message);
  }
}

test().catch(console.error);
