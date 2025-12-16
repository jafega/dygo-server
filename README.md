<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1JPTsVij3m8trFrph34MVx0gxQTRO_dcn

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`

   Then install backend dependencies as well:
   ```bash
   cd backend && npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key

Optional: Enable Google Sign-In (OAuth)
- Add `VITE_GOOGLE_CLIENT_ID` to your `.env.local` with a Google OAuth Client ID (Web applications).
- The auth screen will show a Google Sign-In button automatically when this value is present.

Optional: Enable Stripe (DYGO Premium demo)
- Add your Stripe keys to `backend/.env` (use test keys when developing):
  - `STRIPE_SECRET_KEY` (server secret) and `STRIPE_PUBLISHABLE_KEY` (client publishable key).
  - Optionally `STRIPE_WEBHOOK_SECRET` to verify webhooks (recommended if using Stripe CLI forwarding with signing enabled).
  - Optionally provide `STRIPE_PRICE_ID_EUR` to reuse an existing €9.99 monthly Price ID instead of creating one on the fly.
  - `FRONTEND_URL` can be set to your frontend origin (e.g. `http://localhost:5173`) to control success/cancel/portal redirects.
- When configured the app will show a **DYGO Premium** card in `Perfil y Ajustes` allowing users to open Stripe Checkout (hosted Checkout) to subscribe monthly (€9.99 EUR by default).
- Local webhook testing options:
  1. Stripe CLI (recommended):
     - Install the CLI and run: `stripe listen --forward-to http://localhost:3001/webhook`.
     - Use `stripe trigger checkout.session.completed` or other triggers to send test events.
     - If you set `STRIPE_WEBHOOK_SECRET`, the server will verify signatures; the CLI will print the signing secret to your console when you run `stripe listen`.
  2. Manual test events (no Stripe CLI):
     - We've included a small helper to POST test fixtures directly to the local server without signatures: `cd backend && npm run post-test-event`.
     - Fixtures live in `backend/test/fixtures` and you can add more as needed.
- Testing the checkout flow locally:
  1. Start the backend: `cd backend && node server.js` (or `npm start`).
  2. Configure your test keys in `backend/.env` and open the app at `http://localhost:5173`.
  3. Open `Perfil y Ajustes` for a test user and click **Activar Premium**, which will open Stripe Checkout (test card numbers work in test mode).
- **Important:** Do NOT commit your secret keys into the repo; put them in `backend/.env` and add that file to `.gitignore`.

Forgotten password (demo reset)
- This build provides a demo 'reset password' flow from the auth screen. Click '¿Olvidaste tu contraseña?' and enter the email and a new password to reset it.
- For production safety, set `PASSWORD_RESET_SECRET` in `backend/.env` — when that is set and `NODE_ENV=production`, the reset endpoint will require the secret. In development the endpoint works without the secret for convenience.

3. Run the app:
   `npm run dev`

## UI updates
- The **Superadmin** user management view was updated for improved responsiveness on small screens: controls stack vertically on mobile, buttons expand to full width when needed, and long names/emails are truncated for better layout. 


