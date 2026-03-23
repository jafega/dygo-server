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

## Persistence & Backend
- All user data (entradas, metas, settings, invitaciones, usuarios) **must** be saved in the server-side database (`backend/db.json`) when `USE_BACKEND` is enabled.
- By default the app tries to use the backend (see `services/config.ts`). If the backend is unavailable, the app will surface an error unless you explicitly set `VITE_ALLOW_LOCAL_FALLBACK=true` in `.env.local` for development convenience (NOT recommended in production).
- The app now attempts to migrate any localStorage data to the backend on login when the backend is reachable.

Persistence note ⚠️
- Some hosting platforms (Render, Vercel, etc.) provide ephemeral filesystems for web services; writing to a local file (e.g. `db.json` or `database.sqlite`) on those platforms can be lost after restarts or redeploys (often within minutes). To make data durable you must either:
  1. Enable SQLite and mount a persistent disk on your host, then set `USE_SQLITE=true` and `SQLITE_DB_FILE` to the persistent path, or
  2. Use a managed database (Postgres, MySQL, etc.). If you prefer, I can add Postgres support and a migration path from the JSON store.

Postgres support is available: set a `DATABASE_URL` environment variable (e.g. `postgres://user:pass@host:5432/dbname`) and the server will create required tables and attempt to migrate data from `db.json` or SQLite into Postgres on first run. Verify with `GET /api/dbinfo` which will return `persistence: "postgres"` when active. If you want, I can add a CLI migration tool and tests for the Postgres path.

Supabase (Postgres + Auth) quick guide:
- Set these env vars in your deployment:
  - `DATABASE_URL` (Postgres connection string, add `?sslmode=require` if needed)
  - `SUPABASE_URL` (e.g. `https://<project>.supabase.co`)
  - `SUPABASE_ANON_KEY` (frontend anon key)
  - `SUPABASE_SERVICE_ROLE_KEY` (server role key, keep secret)
- To enable OAuth with Supabase:
  1. Configure Google provider at Supabase Dashboard → Auth → Providers (add redirect URL `https://<your-app>/` or `https://<your-app>/?supabase_auth=1`).
  2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your frontend env (.env.local or Render env).
  3. The app's auth screen will redirect to Supabase and handle the callback, exchanging the access token with `POST /api/auth/supabase` to create/return a local user.

If you'd like, I can add a migration audit/CLI or integration tests for Supabase auth.


## Vercel Deployment

**Recommended: Deploy on Vercel (serverless, managed, supports Supabase/Postgres out of the box)**

1. Connect your GitHub repository to Vercel and import the project.
2. In the Vercel dashboard, go to your Project > Settings > Environment Variables and add:
  - `DATABASE_URL` (your Supabase Postgres connection string)
  - `SUPABASE_URL` (e.g. `https://<project>.supabase.co`)
  - `SUPABASE_ANON_KEY` (frontend anon key)
  - `SUPABASE_SERVICE_ROLE_KEY` (server role key, keep secret)
  - `SUPABASE_SSL` (set to `true`)
  - `USE_SQLITE` (set to `false`)
  - Any other required variables (Stripe, Google, etc.)
3. Deploy your project. Vercel will build and deploy automatically.
4. After deployment, verify your API endpoints (e.g. `/api/health`, `/api/dbinfo`) are working and persistence is set to `postgres`.

**Note:** Vercel serverless functions are stateless. All data must be stored in Supabase/Postgres. Do not use local file storage (db.json, SQLite) in production on Vercel.

If you need help with Vercel-specific configuration or want to migrate from Render, just ask!

