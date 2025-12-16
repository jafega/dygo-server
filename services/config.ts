
// If true, the app attempts to talk to localhost:3001. 
// If the fetch fails, it might fallback or error depending on implementation.
// Set this to true to use the "Real Backend".
export const API_URL =  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';

// Google OAuth client id (set in .env.local as VITE_GOOGLE_CLIENT_ID for the frontend)
export const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';

// Simple check to see if we should try using backend.
// In production this should be true. For development you can allow a local fallback
// by setting VITE_ALLOW_LOCAL_FALLBACK=true in .env.local (not recommended for prod).
export const USE_BACKEND = true; 
export const ALLOW_LOCAL_FALLBACK = (String((import.meta as any).env?.VITE_ALLOW_LOCAL_FALLBACK || '').toLowerCase() === 'true');
