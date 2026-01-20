import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GARRYJAVI_ID = 'be26ba5d-aa25-4861-a15a-585a3ce331e6'; // garryjavi@gmail.com (PSICÓLOGO)
const GARRIDOJAVIER_ID = 'bcccd2a2-b203-4f76-9321-9c4a6ac58046'; // garridojavierfernandez@gmail.com (PACIENTE)

console.log('🔧 Recreando relación correcta...\n');

// Crear la relación correcta: garryjavi (psicólogo) → garridojavier (paciente)
const newRelationship = {
  id: crypto.randomUUID(),
  psychologist_user_id: GARRYJAVI_ID,
  patient_user_id: GARRIDOJAVIER_ID,
  data: {
    endedAt: null,
    status: 'ACTIVA'
  }
};

console.log('Insertando relación:', newRelationship);

const { data, error } = await supabase
  .from('care_relationships')
  .insert([newRelationship])
  .select();

if (error) {
  console.error('❌ Error creando relación:', error);
} else {
  console.log('✅ Relación creada correctamente:', data);
}

// Verificar
const { data: rels } = await supabase.from('care_relationships').select('*');
console.log(`\n✅ Total relaciones ahora: ${rels.length}`);
rels.forEach(rel => {
  console.log(`  Psicólogo: ${rel.psychologist_user_id} → Paciente: ${rel.patient_user_id}`);
});
