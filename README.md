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

3. Run the app:
   `npm run dev`

Optional: Backend SMTP (password reset emails) 🔧
- The backend supports sending password reset emails via SMTP. See `backend/.env.example` for variable names.
- Add the following env vars in `backend/.env` or in your environment: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- For local development you can use MailHog (open-source dev SMTP + web UI):
  - `docker run --rm -p 1025:1025 -p 8025:8025 mailhog/mailhog`
  - Set `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, `SMTP_FROM="Dygo <no-reply@local>"` (no auth needed)
  - View caught emails at: `http://localhost:8025`
- If SMTP isn't configured, the server will log the reset link and return it in the forgot-password response for dev convenience.
- Additionally, if no SMTP env vars are set and `NODE_ENV` is not `production`, the backend will automatically create a Nodemailer/Ethereal test account so emails are sent without any local setup; a preview URL will be logged and returned for convenience (Ethereal is for dev/test only).
