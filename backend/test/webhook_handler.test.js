import fs from 'fs';
import path from 'path';
import http from 'http';


// This is a very small integration-style test: start the server and POST a fixture to /webhook
// NOTE: It's intentionally lightweight and not run in CI automatically in this demo.

const serverPath = path.resolve(process.cwd(), 'server.js');

const startServer = () => {
  return new Promise((resolve, reject) => {
    const child = require('child_process').spawn('node', [serverPath], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: '3002' } });
    child.stdout.on('data', (d) => console.log('[server]', d.toString()));
    child.stderr.on('data', (d) => console.error('[server-err]', d.toString()));
    setTimeout(() => resolve(child), 1000);
  });
};

(async () => {
  const child = await startServer();
  try {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'test/fixtures/invoice_payment_failed.json'), 'utf-8'));
    const res = await fetch('http://localhost:3002/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture) });
    console.log('Webhook post status:', res.status);
    const text = await res.text();
    console.log('Body:', text);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
