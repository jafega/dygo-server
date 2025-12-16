/*
  Quick script to call the create-checkout-session endpoint to ensure backend and Stripe are configured.
  Usage: node scripts/check_checkout.js [--url http://localhost:3001]
*/

const argv = process.argv.slice(2);
const urlArgIndex = argv.indexOf('--url');
const baseUrl = (urlArgIndex !== -1 && argv[urlArgIndex + 1]) ? argv[urlArgIndex + 1] : 'http://localhost:3001';

(async () => {
  try {
    const res = await fetch(`${baseUrl}/api/stripe/create-checkout-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await res.json().catch(() => null);
    console.log('Status:', res.status);
    console.log('Response:', data || 'No JSON body');
  } catch (err) {
    console.error('Error calling create-checkout-session', err);
    process.exit(1);
  }
})();
