// Script para popular columnas directas de invoices desde data JSONB
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.log('❌ Variables de Supabase no configuradas');
  process.exit(1);
}

async function populateInvoiceColumns() {
  try {
    // 1. Obtener todas las invoices
    console.log('📥 Obteniendo todas las facturas...\n');
    const getResponse = await fetch(`${SUPABASE_URL}/rest/v1/invoices?select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!getResponse.ok) {
      throw new Error(`Error obteniendo facturas: ${await getResponse.text()}`);
    }

    const invoices = await getResponse.json();
    console.log(`✅ Total de facturas: ${invoices.length}\n`);

    // 2. Para cada invoice, extraer datos y actualizar
    for (const invoice of invoices) {
      const data = invoice.data || {};
      const amount = data.amount || 0;
      const status = data.status || 'pending';
      const tax = amount * 0.21;
      const total = amount + tax;

      console.log(`📝 Factura ${invoice.id} (${data.invoiceNumber || 'N/A'}):`);
      console.log(`   Amount: ${amount}€`);
      console.log(`   Tax (21%): ${tax.toFixed(2)}€`);
      console.log(`   Total: ${total.toFixed(2)}€`);
      console.log(`   Status: ${status}`);

      // 3. Actualizar la fila
      const updateResponse = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoice.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          amount: amount,
          tax: tax,
          total: total,
          status: status
        })
      });

      if (updateResponse.ok) {
        console.log(`   ✅ Actualizada\n`);
      } else {
        const errorText = await updateResponse.text();
        console.log(`   ❌ Error: ${errorText}\n`);
      }
    }

    console.log('✨ Proceso completado');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

populateInvoiceColumns();
