
// If true, the app attempts to talk to localhost:3001. 
// If the fetch fails, it might fallback or error depending on implementation.
// Set this to true to use the "Real Backend".
export const API_URL = 'http://localhost:3001/api';

// Simple check to see if we should try using backend.
// In a real app, this might be an env var.
export const USE_BACKEND = true; 
