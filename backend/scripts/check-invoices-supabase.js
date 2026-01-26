// Script para verificar que las facturas se guardan correctamente en Supabase
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInvoices() {
  console.log('🔍 Verificando facturas en Supabase...\n');
  
  try {
    // 1. Obtener todas las facturas
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (invoicesError) {
      console.error('❌ Error obteniendo facturas:', invoicesError);
      return;
    }
    
    console.log(`✅ Total de facturas encontradas: ${invoices?.length || 0}\n`);
    
    if (invoices && invoices.length > 0) {
      console.log('📋 Últimas 5 facturas:\n');
      
      for (const invoice of invoices) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`ID: ${invoice.id}`);
        console.log(`Status: ${invoice.status}`);
        console.log(`Amount: €${invoice.amount}`);
        console.log(`Tax: €${invoice.tax}`);
        console.log(`Total: €${invoice.total}`);
        console.log(`Created: ${new Date(invoice.created_at).toLocaleString()}`);
        
        // Campos en JSONB
        const data = invoice.data || {};
        console.log(`\n📦 Datos JSONB:`);
        console.log(`  - Invoice Number: ${data.invoiceNumber || 'N/A'}`);
        console.log(`  - Invoice Type: ${data.invoice_type || 'N/A'}`);
        console.log(`  - Patient Name: ${data.patientName || 'N/A'}`);
        console.log(`  - Date: ${data.date || 'N/A'}`);
        console.log(`  - Due Date: ${data.dueDate || 'N/A'}`);
        console.log(`  - Tax Rate: ${data.taxRate || 'N/A'}%`);
        console.log(`  - Session IDs: ${data.sessionIds ? data.sessionIds.length : 0} sesiones`);
        console.log(`  - Bono IDs: ${data.bonoIds ? data.bonoIds.length : 0} bonos`);
        
        if (data.billing_client_name) {
          console.log(`\n👤 Datos del Cliente:`);
          console.log(`  - Nombre: ${data.billing_client_name}`);
          console.log(`  - DNI/CIF: ${data.billing_client_tax_id || 'N/A'}`);
          console.log(`  - Dirección: ${data.billing_client_address || 'N/A'}`);
        }
        
        if (data.billing_psychologist_name) {
          console.log(`\n🩺 Datos del Psicólogo:`);
          console.log(`  - Nombre: ${data.billing_psychologist_name}`);
          console.log(`  - DNI/CIF: ${data.billing_psychologist_tax_id || 'N/A'}`);
          console.log(`  - Dirección: ${data.billing_psychologist_address || 'N/A'}`);
        }
        
        // Verificar sesiones asociadas si existen
        if (data.sessionIds && data.sessionIds.length > 0) {
          console.log(`\n🔗 Verificando sesiones asociadas...`);
          const { data: sessions, error: sessionsError } = await supabase
            .from('sessions')
            .select('id, invoice_id')
            .in('id', data.sessionIds);
          
          if (sessionsError) {
            console.error(`  ❌ Error: ${sessionsError.message}`);
          } else {
            const assignedCount = sessions.filter(s => s.invoice_id === invoice.id).length;
            console.log(`  ✅ ${assignedCount}/${data.sessionIds.length} sesiones con invoice_id asignado`);
            
            if (assignedCount < data.sessionIds.length) {
              console.log(`  ⚠️ Algunas sesiones no tienen invoice_id asignado`);
            }
          }
        }
        
        // Verificar bonos asociados si existen
        if (data.bonoIds && data.bonoIds.length > 0) {
          console.log(`\n🎫 Verificando bonos asociados...`);
          const { data: bonos, error: bonosError } = await supabase
            .from('bono')
            .select('id, invoice_id')
            .in('id', data.bonoIds);
          
          if (bonosError) {
            console.error(`  ❌ Error: ${bonosError.message}`);
          } else {
            const assignedCount = bonos.filter(b => b.invoice_id === invoice.id).length;
            console.log(`  ✅ ${assignedCount}/${data.bonoIds.length} bonos con invoice_id asignado`);
            
            if (assignedCount < data.bonoIds.length) {
              console.log(`  ⚠️ Algunos bonos no tienen invoice_id asignado`);
            }
          }
        }
        
        console.log('');
      }
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    } else {
      console.log('ℹ️  No hay facturas en la base de datos\n');
    }
    
    // 2. Contar facturas por estado
    console.log('📊 Estadísticas por estado:\n');
    
    const statuses = ['draft', 'pending', 'paid', 'overdue', 'cancelled'];
    for (const status of statuses) {
      const { count, error } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      
      if (!error) {
        console.log(`  ${status}: ${count || 0} factura(s)`);
      }
    }
    
    console.log('\n✅ Verificación completada');
    
  } catch (error) {
    console.error('❌ Error inesperado:', error);
  }
}

// Ejecutar verificación
checkInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
