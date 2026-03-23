# Copilot Instructions for dygo

Quick reference for AI agents working in this repo:

- Backend: `backend/server.js` (Express, file-based `db.json`). For development the server returns password reset links in the response and logs them.
- SMTP: Removed — password recovery was disabled in this build.
- Frontend: React + Vite (`App.tsx`, `components/*`, `services/*`). Auth flows live in `components/AuthScreen.tsx` and `services/authService.ts`.
- Dev note: Passwords are stored in plaintext in this demo. Do NOT use this code in production without adding proper hashing, rate-limiting, and secure token handling.

Example: to implement email-related functionality, use nodemailer in `backend/server.js` and guard behavior when SMTP is not configured (log/return reset link in dev).