
// If true, the app attempts to talk to localhost:3001. 
// If the fetch fails, it might fallback or error depending on implementation.
// Set this to true to use the "Real Backend".
const ENV_API_URL = (import.meta as any).env?.VITE_API_URL as string | undefined;
const getDefaultApiUrl = () => {
	if (typeof window === 'undefined') return '/api';
	const host = window.location.hostname;
	const port = window.location.port;

	// Local dev on desktop
	if (host === 'localhost' || host === '127.0.0.1') {
		return 'http://localhost:3005/api';
	}

	// Dev en red local (ej. 192.168.x.x:3000) para usar el backend del mismo host
	const isLan = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.endsWith('.local');
	if (isLan && port === '3000') {
		return `http://${host}:3005/api`;
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

import { createClient } from '@supabase/supabase-js';

// Supabase client env (frontend)
export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_REDIRECT_URL = (import.meta as any).env?.VITE_SUPABASE_REDIRECT_URL || '';

// Singleton Supabase client instance
let supabaseClient: any = null;

export const getSupabaseClient = () => {
  if (!supabaseClient && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
};
