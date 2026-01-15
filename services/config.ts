
// If true, the app attempts to talk to localhost:3001. 
// If the fetch fails, it might fallback or error depending on implementation.
// Set this to true to use the "Real Backend".
const ENV_API_URL = (import.meta as any).env?.VITE_API_URL as string | undefined;
const getDefaultApiUrl = () => {
	if (typeof window === 'undefined') return '/api';
	const host = window.location.hostname;
	if (host === 'localhost' || host === '127.0.0.1') {
		return 'http://localhost:3001/api';
	}
	// If frontend is on Vercel without API proxy, default to the known backend.
	if (host.endsWith('.vercel.app') && !host.includes('dygo-server')) {
		return 'https://dygo-server.vercel.app/api';
	}
	return '/api';
};
export const API_URL = ENV_API_URL || getDefaultApiUrl();

// Simple check to see if we should try using backend.
// In production this should be true. For development you can allow a local fallback
// by setting VITE_ALLOW_LOCAL_FALLBACK=true in .env.local (not recommended for prod).
export const USE_BACKEND = true; 
export const ALLOW_LOCAL_FALLBACK = false;

// Supabase client env (frontend)
export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
