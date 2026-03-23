/*
  Quick script to call the create-checkout-session endpoint to ensure backend and Stripe are configured.
  Usage: node scripts/check_checkout.js [--url http://localhost:3001]
*/

const argv = process.argv.slice(2);
const urlArgIndex = argv.indexOf('--url');
const baseUrl = (urlArgIndex !== -1 && argv[urlArgIndex + 1]) ? argv[urlArgIndex + 1] : 'http://localhost:3001';

(async () => {
  try {
    // Try to find an existing user, otherwise create one via /auth/register
    let userId = null;
    try {
      const usersRes = await fetch(`${baseUrl}/api/users`);
      if (usersRes.ok) {
        const users = await usersRes.json().catch(() => []);
        if (Array.isArray(users) && users.length > 0) {
          userId = users[0].id;
          console.log('Using existing user', users[0].email, userId);
        }
      }
    } catch (e) { /* ignore */ }

    if (!userId) {
      // Create a temp user
      const registerRes = await fetch(`${baseUrl}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'test user', email: `test+${Date.now()}@example.com`, password: '123456' }) });
      const newUser = await registerRes.json();
      userId = newUser.id;
      console.log('Created test user', newUser.email, userId);
    }

    const res = await fetch(`${baseUrl}/api/stripe/create-checkout-session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId }, body: '{}' });
    const data = await res.json().catch(() => null);
    console.log('Status:', res.status);
    console.log('Response:', data || 'No JSON body');
    if (data && data.url) console.log('Open this URL in a browser to test checkout:', data.url);
  } catch (err) {
    console.error('Error calling create-checkout-session', err);
    process.exit(1);
  }
})();
