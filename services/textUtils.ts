/**
 * Normalizes a string for accent-insensitive, case-insensitive searching.
 * Removes diacritical marks (tildes, accents, etc.) and lowercases.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Returns true if `haystack` includes `needle`, ignoring case and accents.
 */
export function includesNormalized(haystack: string, needle: string): boolean {
  return normalizeText(haystack).includes(normalizeText(needle));
}

/**
 * Returns true if the email is a temporary placeholder (e.g. temp_xxx@noemail.mainds.local).
 * These emails are not real and should never be shown to users.
 */
export function isTempEmail(email: string | null | undefined): boolean {
  return !email || email.includes('@noemail.mainds.local');
}

/**
 * Returns the email for display, or null if it's a temporary placeholder.
 */
export function displayEmail(email: string | null | undefined): string | null {
  return isTempEmail(email) ? null : (email ?? null);
}
