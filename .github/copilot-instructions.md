# Copilot Instructions for mainds

Quick reference for AI agents working in this repo:

- Backend: `backend/server.js` (Express, file-based `db.json`). For development the server returns password reset links in the response and logs them.
- SMTP: Removed — password recovery was disabled in this build.
- Frontend: React + Vite (`App.tsx`, `components/*`, `services/*`). Auth flows live in `components/AuthScreen.tsx` and `services/authService.ts`.
- Dev note: Passwords are stored in plaintext in this demo. Do NOT use this code in production without adding proper hashing, rate-limiting, and secure token handling.
- **Subscription plans (psychologists):** Starter (€9.99, ≤10 patients), Mainder (€19.99, ≤30 patients), Supermainder (€29.99, unlimited). 14-day free trial. Plan enforcement in `backend/server.js` (`PSYCH_PLANS`, `checkRelationLimit`). Stripe price IDs via `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_MAINDER`, `STRIPE_PRICE_ID_SUPERMAINDER` env vars.
- **Patient premium:** €4.99/month with 14-day trial for AI voice diary. Separate subscription stored in `patientSubscriptions` (local) / `patient_subscriptions` (Supabase). A user can have both a psychologist and a patient subscription.

Example: to implement email-related functionality, use nodemailer in `backend/server.js` and guard behavior when SMTP is not configured (log/return reset link in dev).