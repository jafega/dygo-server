/*
  Simple helper to POST a test webhook event to the local server.
  Usage: node backend/scripts/post_test_event.js fixtures/invoice_payment_failed.json
*/
import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
if (argv.length < 1) {
  console.error('Usage: node post_test_event.js <fixture.json> [--url http://localhost:3001/webhook]');
  process.exit(1);
}

const fixturePath = path.resolve(process.cwd(), argv[0]);
const urlArgIndex = argv.indexOf('--url');
const webhookUrl = (urlArgIndex !== -1 && argv[urlArgIndex + 1]) ? argv[urlArgIndex + 1] : 'http://localhost:3001/webhook';

(async () => {
  try {
    const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text);
  } catch (err) {
    console.error('Error posting event', err);
    process.exit(1);
  }
})();
