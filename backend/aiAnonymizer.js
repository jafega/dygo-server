// backend/aiAnonymizer.js
//
// LOPD / GDPR — PII anonymization layer for the AI proxy.
//
// Goal: ensure that no patient or professional personal data leaves the server
// in plaintext when calling the external LLM (Google Gemini). The proxy:
//   1. Builds a per-request dictionary of PII strings tied to the authenticated
//      user (the user's own name/email/phone + names/emails/phones of every
//      patient or psychologist they are connected to via care_relationships).
//   2. Replaces every occurrence in the prompt with a stable opaque token of
//      the form `[NOMBRE_001]`, `[EMAIL_001]`, `[TELEFONO_001]`, `[DNI_001]`,
//      `[IBAN_001]`.
//   3. Applies regex fallbacks for emails, phones, DNI/NIE and IBAN that may
//      appear free-form in the prompt (e.g. inside a clinical note).
//   4. After the LLM responds, the reverse map is applied to the response text
//      so the client receives the real values back.
//
// IMPORTANT LIMITATIONS
// - Anonymization only applies to text. Inline binary data (PDFs, audio sent
//   to Gemini for transcription/extraction) is forwarded untouched: the model
//   needs the raw bytes to do its job. Those flows must have separate consent.
// - Tokens are kept only in memory for the duration of a single request — they
//   are never persisted nor logged.

// Token format: bracket-wrapped uppercase label + 3-digit counter. Brackets
// help the LLM treat them as opaque placeholders to be preserved verbatim.
const TOKEN_RE_GLOBAL = /\[(NOMBRE|EMAIL|TELEFONO|DNI|IBAN)_\d{3,6}\]/g;

// Regex fallbacks for PII that may appear free-form (e.g. inside a session
// note). Order matters — longer / more specific patterns first.
const REGEX_PATTERNS = [
  // IBAN (24 chars for ES, allow 15-34 for other countries, with optional spaces)
  {
    type: 'IBAN',
    regex: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/g,
  },
  // Spanish DNI (8 digits + letter) or NIE (X/Y/Z + 7 digits + letter)
  {
    type: 'DNI',
    regex: /\b[XYZ]?\d{7,8}[A-HJ-NP-TV-Z]\b/gi,
  },
  // Email
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // Spanish phone (mobile/landline 6/7/8/9-starting), with optional +34 / 0034
  {
    type: 'TELEFONO',
    regex: /(?:\+?34[\s.-]?|0034[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
  },
];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the per-request PII dictionary for the given authenticated user.
 * Includes the user themselves and every counterpart in their care_relationships.
 *
 * @param {string} userId - the authenticated user id.
 * @param {object} db - the local JSON db (may be empty in cloud mode).
 * @param {object} supabaseDbCache - the in-memory mirror of supabase tables.
 * @returns {Array<{value: string, type: string}>}
 */
function buildPiiDictionary(userId, db, supabaseDbCache) {
  if (!userId) return [];
  const allUsers = (supabaseDbCache && Array.isArray(supabaseDbCache.users) && supabaseDbCache.users.length)
    ? supabaseDbCache.users
    : (db && Array.isArray(db.users) ? db.users : []);
  const allRels = (supabaseDbCache && Array.isArray(supabaseDbCache.careRelationships) && supabaseDbCache.careRelationships.length)
    ? supabaseDbCache.careRelationships
    : (db && Array.isArray(db.careRelationships) ? db.careRelationships : []);

  const relatedIds = new Set([String(userId)]);
  for (const r of allRels) {
    if (!r) continue;
    if (String(r.psychologist_user_id) === String(userId)) relatedIds.add(String(r.patient_user_id));
    if (String(r.patient_user_id) === String(userId)) relatedIds.add(String(r.psychologist_user_id));
  }

  const items = [];
  for (const u of allUsers) {
    if (!u || !relatedIds.has(String(u.id))) continue;
    const candidates = [
      { value: u.name, type: 'NOMBRE' },
      { value: u.firstName, type: 'NOMBRE' },
      { value: u.lastName, type: 'NOMBRE' },
      { value: u.full_name, type: 'NOMBRE' },
      { value: u.email, type: 'EMAIL' },
      { value: u.user_email, type: 'EMAIL' },
      { value: u.phone, type: 'TELEFONO' },
      { value: u.phoneNumber, type: 'TELEFONO' },
      { value: u.dni, type: 'DNI' },
      { value: u.nif, type: 'DNI' },
      { value: u.iban, type: 'IBAN' },
    ];
    for (const c of candidates) {
      if (!c.value) continue;
      const v = String(c.value).trim();
      if (v.length < 2) continue;
      items.push({ value: v, type: c.type });
      // For full names also push individual word tokens (>=3 chars) so a prompt
      // referring to a patient only by first name still gets anonymized.
      if (c.type === 'NOMBRE') {
        const parts = v.split(/\s+/).filter(p => p.length >= 3);
        if (parts.length > 1) {
          for (const p of parts) items.push({ value: p, type: 'NOMBRE' });
        }
      }
    }
  }

  // Deduplicate (case-insensitive per type) and sort by length DESC so longer
  // matches are replaced before their substrings.
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.type + ':' + it.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => b.value.length - a.value.length);
  return out;
}

/**
 * Mutable state held during a single request: counters + bidirectional map.
 */
function createAnonymizerState() {
  return {
    counters: Object.create(null),
    tokenByKey: new Map(),   // "TYPE:lowercased-value" -> token
    valueByToken: new Map(), // token -> original value (used for de-anonymization)
    hits: 0,
  };
}

function mintToken(state, type, originalValue) {
  const key = type + ':' + String(originalValue).toLowerCase();
  const existing = state.tokenByKey.get(key);
  if (existing) return existing;
  const next = (state.counters[type] = (state.counters[type] || 0) + 1);
  const token = `[${type}_${String(next).padStart(3, '0')}]`;
  state.tokenByKey.set(key, token);
  state.valueByToken.set(token, String(originalValue));
  return token;
}

/**
 * Replace PII in a single string using both the dictionary and the regex
 * fallbacks. Returns the anonymized string.
 */
function anonymizeString(input, dict, state) {
  if (typeof input !== 'string' || !input) return input;
  let text = input;

  // 1) Dictionary-based replacement (Unicode-aware word boundary).
  for (const item of dict) {
    const escaped = escapeRegExp(item.value);
    let re;
    try {
      re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
    } catch {
      // Older Node without lookbehind/u-flag — fallback to simpler boundary
      re = new RegExp(`\\b${escaped}\\b`, 'gi');
    }
    text = text.replace(re, (match) => {
      state.hits++;
      return mintToken(state, item.type, match);
    });
  }

  // 2) Regex fallbacks for free-form PII.
  for (const { regex, type } of REGEX_PATTERNS) {
    text = text.replace(regex, (match) => {
      // Don't re-tokenize already-tokenized text
      if (TOKEN_RE_GLOBAL.test(match)) { TOKEN_RE_GLOBAL.lastIndex = 0; return match; }
      TOKEN_RE_GLOBAL.lastIndex = 0;
      state.hits++;
      return mintToken(state, type, match.trim());
    });
  }

  return text;
}

/**
 * Walk the `contents` payload accepted by @google/genai. Supported shapes:
 *   - string
 *   - Array<string | Part | { role, parts: Part[] }>
 *   - { role, parts: Part[] }
 *   - Part: { text } | { inlineData: {...} } | { fileData: {...} }
 *
 * Inline binary parts (inlineData/fileData) are left untouched.
 */
function anonymizeContents(contents, dict, state) {
  if (contents == null) return contents;
  if (typeof contents === 'string') return anonymizeString(contents, dict, state);
  if (Array.isArray(contents)) return contents.map(c => anonymizeContents(c, dict, state));
  if (typeof contents === 'object') {
    const out = Array.isArray(contents) ? [] : {};
    for (const k of Object.keys(contents)) {
      const v = contents[k];
      if (k === 'inlineData' || k === 'fileData') {
        out[k] = v; // binary — pass through unchanged
      } else if (k === 'text' && typeof v === 'string') {
        out[k] = anonymizeString(v, dict, state);
      } else if (Array.isArray(v) || (v && typeof v === 'object')) {
        out[k] = anonymizeContents(v, dict, state);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return contents;
}

/**
 * Replace tokens in a string with their original values.
 */
function deanonymizeString(text, state) {
  if (typeof text !== 'string' || !text) return text;
  if (state.valueByToken.size === 0) return text;
  return text.replace(TOKEN_RE_GLOBAL, (token) => {
    const original = state.valueByToken.get(token);
    return original != null ? original : token;
  });
}

/**
 * Deep de-anonymize an arbitrary JSON-serializable value (string, array,
 * object) — used for response.candidates so structured outputs are restored.
 */
function deanonymizeAny(value, state) {
  if (value == null) return value;
  if (typeof value === 'string') return deanonymizeString(value, state);
  if (Array.isArray(value)) return value.map(v => deanonymizeAny(v, state));
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = deanonymizeAny(value[k], state);
    return out;
  }
  return value;
}

export {
  buildPiiDictionary,
  createAnonymizerState,
  anonymizeContents,
  anonymizeString,
  deanonymizeString,
  deanonymizeAny,
};
