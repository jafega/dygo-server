import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GARRYJAVI_ID = 'be26ba5d-aa25-4861-a15a-585a3ce331e6'; // garryjavi@gmail.com (PSICÓLOGO)
const GARRIDOJAVIER_ID = 'bcccd2a2-b203-4f76-9321-9c4a6ac58046'; // garridojavierfernandez@gmail.com (PACIENTE)

console.log('🔧 Arreglando configuración de usuarios y relaciones...\n');

// 1. Actualizar garridojavierfernandez para que sea paciente (no psicólogo)
console.log('1️⃣ Actualizando garridojavierfernandez@gmail.com a is_psychologist=false');
const { error: updateError } = await supabase
  .from('users')
  .update({ is_psychologist: false })
  .eq('id', GARRIDOJAVIER_ID);

if (updateError) {
  console.error('❌ Error actualizando usuario:', updateError);
} else {
  console.log('✅ Usuario actualizado correctamente\n');
}

// 2. Eliminar la relación invertida (donde garridojavier es el psicólogo)
console.log('2️⃣ Eliminando relación invertida (garridojavier como psicólogo)');
const { error: deleteError } = await supabase
  .from('care_relationships')
  .delete()
  .eq('psychologist_user_id', GARRIDOJAVIER_ID)
  .eq('patient_user_id', GARRYJAVI_ID);

if (deleteError) {
  console.error('❌ Error eliminando relación:', deleteError);
} else {
  console.log('✅ Relación invertida eliminada\n');
}

// 3. Verificar estado final
console.log('3️⃣ Verificando estado final...\n');

const { data: users } = await supabase.from('users').select('*').in('id', [GARRYJAVI_ID, GARRIDOJAVIER_ID]);
users.forEach(u => {
  const email = u.data?.email || u.user_email;
  const isPsych = u.is_psychologist;
  console.log(`${email}: is_psychologist=${isPsych}`);
});

console.log('');

const { data: rels } = await supabase.from('care_relationships').select('*');
console.log(`Total relaciones: ${rels.length}`);
rels.forEach(rel => {
  console.log(`  Psicólogo: ${rel.psychologist_user_id} → Paciente: ${rel.patient_user_id}`);
});

console.log('\n✅ Arreglo completado!');
