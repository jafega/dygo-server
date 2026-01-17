// Script para verificar facturas en Supabase
const SUPABASE_URL = 'https://xvripjmxelforlwatqxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cmlwam14ZWxmb3Jsd2F0cXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQwNjc4OCwiZXhwIjoyMDgzOTgyNzg4fQ.ITX7o-Vy9ydcKsk_ZG0fZQPPJ7jwoDgGMOnZM92c0Wo';

async function checkInvoices() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/invoices?select=*`;
    console.log('Obteniendo todas las facturas de Supabase...\n');
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (response.ok) {
      const rows = await response.json();
      console.log(`✅ Total de facturas: ${rows.length}\n`);
      
      if (rows.length > 0) {
        console.log('Detalles de las facturas:');
        rows.forEach((row, index) => {
          const data = row.data;
          console.log(`\nFactura ${index + 1}:`);
          console.log(`  ID: ${row.id}`);
          console.log(`  Número: ${data.invoiceNumber || 'N/A'}`);
          console.log(`  psychologistId: ${data.psychologistId || 'NO TIENE'}`);
          console.log(`  patientId: ${data.patientId || 'NO TIENE'}`);
          console.log(`  patientName: ${data.patientName || 'N/A'}`);
          console.log(`  amount: ${data.amount || 0}`);
          console.log(`  status: ${data.status || 'N/A'}`);
          console.log(`  date: ${data.date || 'N/A'}`);
        });
      } else {
        console.log('No hay facturas en la base de datos.');
      }
    } else {
      const errorText = await response.text();
      console.log('❌ Error:', errorText);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkInvoices();
