import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.log('Please ensure backend/.env has these variables configured.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanupAcceptedInvitations() {
  console.log('\n🧹 Limpiando invitaciones aceptadas...\n');
  
  // Buscar todas las invitaciones con status ACCEPTED
  const { data: acceptedInvitations, error: searchError } = await supabase
    .from('invitations')
    .select('*')
    .eq('status', 'ACCEPTED');
  
  if (searchError) {
    console.error('❌ Error buscando invitaciones:', searchError.message);
    return;
  }
  
  if (!acceptedInvitations || acceptedInvitations.length === 0) {
    console.log('✅ No hay invitaciones con status ACCEPTED para limpiar.\n');
    return;
  }
  
  console.log(`⚠️  Encontradas ${acceptedInvitations.length} invitaciones con status ACCEPTED:\n`);
  
  for (const inv of acceptedInvitations) {
    console.log(`   - ID: ${inv.id}`);
    console.log(`     Email: ${inv.patient_email}`);
    console.log(`     Psicólogo ID: ${inv.psychologist_id}`);
    console.log(`     Paciente ID: ${inv.patient_id || 'null'}`);
    console.log(`     Creada: ${new Date(inv.created_at).toLocaleString()}\n`);
  }
  
  // Preguntar confirmación (en modo interactivo usaríamos readline, aquí lo hacemos directo)
  console.log('🗑️  Eliminando invitaciones aceptadas...\n');
  
  const { error: deleteError } = await supabase
    .from('invitations')
    .delete()
    .eq('status', 'ACCEPTED');
  
  if (deleteError) {
    console.error('❌ Error eliminando invitaciones:', deleteError.message);
    return;
  }
  
  console.log(`✅ ${acceptedInvitations.length} invitación(es) eliminada(s) exitosamente.\n`);
  console.log('📋 Las care_relationships correspondientes se mantienen intactas.\n');
}

cleanupAcceptedInvitations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
