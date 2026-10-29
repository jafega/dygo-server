// Test de integración del webhook de Stripe (npm run test:webhook).
//
// Arranca server.js aislado (puerto aleatorio, base de datos temporal, sin
// Supabase) con un secreto de webhook de prueba, y le envía el fixture
// test/fixtures/invoice_payment_failed.json firmado como lo firmaría Stripe.
// No llama a la API de Stripe.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { startServer } from './helpers/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBHOOK_SECRET = 'whsec_test_mainds_local';
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'invoice_payment_failed.json'), 'utf-8');

let srv;

test.before(async () => {
  srv = await startServer({
    env: { STRIPE_SECRET_KEY: 'sk_test_dummy_no_network', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET },
    db: {
      users: [],
      subscriptions: [{
        id: 'psych-webhook-1', psychologist_user_id: 'psych-webhook-1',
        stripe_subscription_id: 'sub_test_123', stripe_customer_id: 'cus_test_123',
        stripe_status: 'active', access_blocked: false
      }]
    }
  });
});

test.after(async () => { await srv?.stop(); });

const post = (urlPath, body, headers = {}) => fetch(srv.baseUrl + urlPath, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body
});

test('webhook sin firma → 400 y no toca la suscripción', async () => {
  const r = await post('/webhook', fixture);
  assert.equal(r.status, 400);
  assert.equal(srv.readDb().subscriptions[0].stripe_status, 'active');
});

test('webhook con firma inválida → 400', async () => {
  const r = await post('/api/webhook', fixture, { 'stripe-signature': 't=1,v1=deadbeef' });
  assert.equal(r.status, 400);
});

test('invoice.payment_failed firmado → 200 y bloquea la suscripción', async () => {
  const stripe = new Stripe('sk_test_dummy_no_network', { apiVersion: '2022-11-15' });
  const header = stripe.webhooks.generateTestHeaderString({ payload: fixture, secret: WEBHOOK_SECRET });
  const r = await post('/webhook', fixture, { 'stripe-signature': header });
  assert.equal(r.status, 200);
  const sub = srv.readDb().subscriptions.find(s => s.stripe_subscription_id === 'sub_test_123');
  assert.equal(sub.stripe_status, 'past_due');
  assert.equal(sub.access_blocked, true);
});
