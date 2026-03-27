/**
 * Detects the user's country calling prefix from the browser's locale.
 * Falls back to +34 (Spain) if detection fails.
 */
export function detectDefaultPrefix(): string {
  try {
    const locale = navigator.language || 'es-ES';
    const region = locale.split('-')[1]?.toUpperCase();
    const map: Record<string, string> = {
      ES: '+34', MX: '+52', AR: '+54', CO: '+57', CL: '+56',
      PE: '+51', VE: '+58', EC: '+593', BO: '+591', PY: '+595',
      UY: '+598', US: '+1', CA: '+1', GB: '+44', DE: '+49',
      FR: '+33', IT: '+39', PT: '+351', BR: '+55',
    };
    return (region && map[region]) ? map[region] : '+34';
  } catch {
    return '+34';
  }
}

/**
 * Ensures a phone number has a country prefix.
 * If it already starts with +, returns as-is (cleaned).
 * Otherwise prepends the given defaultPrefix.
 */
export function normalizePhone(phone: string, defaultPrefix = '+34'): string {
  const cleaned = phone.trim().replace(/\s+/g, ' ');
  if (!cleaned) return cleaned;
  if (cleaned.startsWith('+')) return cleaned;
  // Remove a leading 0 (national trunk prefix) if present
  const digits = cleaned.startsWith('0') ? cleaned.slice(1) : cleaned;
  return `${defaultPrefix}${digits}`;
}
