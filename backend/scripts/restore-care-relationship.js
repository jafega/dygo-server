// Restore specific care relationship
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function restoreCareRelationship() {
  console.log('🔄 Checking existing care_relationships...');
  
  const { data: existing, error: checkError } = await supabase
    .from('care_relationships')
    .select('*');
  
  if (checkError) {
    console.error('❌ Error checking care_relationships:', checkError);
    return;
  }
  
  console.log(`📊 Found ${existing?.length || 0} existing relationships:`);
  existing?.forEach(rel => {
    console.log(`   ${rel.id}: ${rel.psychologistId} → ${rel.patientId}`);
  });
  
  // Verificar si ya existe la relación
  const targetPsychId = '69e56e57-c0d3-424e-a872-1d67e400ba0e';
  const targetPatientId = '03125ea5-f128-440e-94a3-b2c657130013';
  
  const exists = existing?.find(rel => 
    rel.psychologistId === targetPsychId && rel.patientId === targetPatientId
  );
  
  if (exists) {
    console.log('✅ La relación ya existe:', exists);
    return;
  }
  
  console.log('🔄 Creating care relationship...');
  console.log(`   Psychologist: ${targetPsychId}`);
  console.log(`   Patient: ${targetPatientId}`);
  
  const relationship = {
    id: crypto.randomUUID(),
    psychologistId: targetPsychId,
    patientId: targetPatientId,
    createdAt: new Date().toISOString()
  };
  
  // Intentar insertar como objeto plano primero
  const { data: inserted1, error: error1 } = await supabase
    .from('care_relationships')
    .insert(relationship)
    .select();
  
  if (error1) {
    console.log('⚠️ First attempt failed, trying with data wrapper...');
    // Intentar con estructura de data
    const wrappedRelationship = {
      id: relationship.id,
      data: {
        psychologistId: targetPsychId,
        patientId: targetPatientId,
        createdAt: Date.now()
      }
    };
    
    const { data: inserted2, error: error2 } = await supabase
      .from('care_relationships')
      .insert(wrappedRelationship)
      .select();
    
    if (error2) {
      console.error('❌ Error creating relationship:', error2);
      return;
    }
    
    console.log('✅ Relationship created (wrapped):', inserted2);
    return;
  }
  
  console.log('✅ Relationship created:', inserted1);
}

restoreCareRelationship()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Script failed:', err);
    process.exit(1);
  });
