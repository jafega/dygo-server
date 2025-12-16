# Copilot Instructions for dygo

Quick reference for AI agents working in this repo:

- Backend: `backend/server.js` (Express, file-based `db.json`). For development the server returns password reset links in the response and logs them.
- SMTP: The backend can send real password reset emails when SMTP env vars are configured. See `backend/.env.example` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in the environment. `dotenv` is used. Run `cd backend && npm install` to install server deps (nodemailer, dotenv).
- Frontend: React + Vite (`App.tsx`, `components/*`, `services/*`). Auth flows live in `components/AuthScreen.tsx` and `services/authService.ts`.
- Dev note: Passwords are stored in plaintext in this demo. Do NOT use this code in production without adding proper hashing, rate-limiting, and secure token handling.

Example: to implement email-related functionality, use nodemailer in `backend/server.js` and guard behavior when SMTP is not configured (log/return reset link in dev).