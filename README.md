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


