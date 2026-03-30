// Script to find and mark users as master (garryjavi and daniel mendez)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// List all users to find the right ones
const { data: users, error } = await supabase.from('users').select('id, data, user_email, master, is_psychologist');
if (error) { console.error('Error:', error); process.exit(1); }

console.log('=== All users ===');
users.forEach(u => {
  const email = u.data?.email || u.user_email || '';
  const name = u.data?.name || '';
  console.log(`ID: ${u.id}  name: "${name}"  email: "${email}"  master: ${u.master}`);
});

// Find target users
const targets = users.filter(u => {
  const email = String(u.data?.email || u.user_email || '').toLowerCase();
  const name  = String(u.data?.name  || '').toLowerCase();
  return (
    email.includes('garryjavi') ||
    name.includes('garryjavi') ||
    name.includes('daniel') ||
    email.includes('daniel')
  );
});

if (targets.length === 0) {
  console.log('\n⚠️  No matching users found. Check names/emails above and update the filter.');
  process.exit(0);
}

console.log(`\n=== Setting master=true for ${targets.length} user(s) ===`);
for (const u of targets) {
  const email = u.data?.email || u.user_email;
  const name  = u.data?.name || '';
  const { error: updateError } = await supabase
    .from('users')
    .update({ master: true })
    .eq('id', u.id);
  if (updateError) {
    console.error(`❌ Failed for ${email}:`, updateError.message);
  } else {
    console.log(`✅ master=true set for "${name}" (${email})`);
  }
}
