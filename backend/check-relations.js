import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== Consultando usuarios ===');
const { data: users, error: usersError } = await supabase.from('users').select('*').in('id', ['be26ba5d-aa25-4861-a15a-585a3ce331e6', 'bcccd2a2-b203-4f76-9321-9c4a6ac58046']);

if (usersError) {
  console.error('Error:', usersError);
} else {
  users.forEach(u => {
    const email = u.data?.email || u.user_email;
    const isPsych = u.is_psychologist || u.data?.is_psychologist;
    console.log(`ID: ${u.id}`);
    console.log(`  Email: ${email}`);
    console.log(`  isPsychologist: ${isPsych}`);
    console.log('');
  });
}

console.log('=== Consultando relaciones ===');
const { data: rels, error: relsError } = await supabase.from('care_relationships').select('*');

if (relsError) {
  console.error('Error:', relsError);
} else {
  console.log(`Total: ${rels.length} relaciones`);
  rels.forEach(rel => {
    console.log(`\nRelación ID: ${rel.id}`);
    console.log(`  psychologist_user_id: ${rel.psychologist_user_id}`);
    console.log(`  patient_user_id: ${rel.patient_user_id}`);
    console.log(`  endedAt: ${rel.endedAt || 'null (activa)'}`);
  });
}
