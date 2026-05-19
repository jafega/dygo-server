// services/chatAnonymizer.ts
//
// LOPD/GDPR — PII anonymization helper used ONLY by the psychologist AI chat
// (`components/PsychologistAIChat.tsx`).
//
// Goal: avoid sending patient names, emails, phones, DNI/NIE and IBAN in plain
// text to the external LLM. The chat component:
//   1. Builds a per-message dictionary from the psychologist's own name and
//      the patients they already have loaded in memory.
//   2. Calls `anonymize()` on the full prompt; PII is replaced by stable opaque
//      tokens of the form `[PACIENTE_001]`, `[EMAIL_001]`, `[TELEFONO_001]`,
//      `[DNI_001]`, `[IBAN_001]`, `[PROFESIONAL_001]`.
//   3. Sends the anonymized prompt to Gemini through the existing backend
//      proxy. The model is instructed to keep tokens verbatim.
//   4. As the stream returns, the component calls `deanonymize()` on each
//      stable chunk so the UI shows the real names back to the psychologist.
//
// Nothing is persisted: the state map lives only for one `sendMessage` call.

export interface PiiItem {
  value: string;
  type: 'PACIENTE' | 'PROFESIONAL' | 'EMAIL' | 'TELEFONO' | 'DNI' | 'IBAN';
}

export interface AnonymizerState {
  counters: Partial<Record<PiiItem['type'], number>>;
  tokenByKey: Map<string, string>;     // "TYPE:lowercased-value" -> token
  valueByToken: Map<string, string>;   // token -> original value
}

export const TOKEN_REGEX = /\[(PACIENTE|PROFESIONAL|EMAIL|TELEFONO|DNI|IBAN)_\d{3,6}\]/g;

interface Patientish {
  name?: string;
  email?: string;
  phone?: string;
  dni?: string;
  iban?: string;
}

const REGEX_PATTERNS: { type: PiiItem['type']; regex: RegExp }[] = [
  // IBAN (covers ES + others). Letters + 2 digits, then groups of 4 alnum.
  { type: 'IBAN', regex: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/g },
  // Spanish DNI / NIE
  { type: 'DNI', regex: /\b[XYZ]?\d{7,8}[A-HJ-NP-TV-Z]\b/gi },
  // Email
  { type: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Spanish phone (mobile/landline 6/7/8/9-starting), with optional +34 / 0034
  { type: 'TELEFONO', regex: /(?:\+?34[\s.-]?|0034[\s.-]?)?[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createAnonymizerState(): AnonymizerState {
  return { counters: {}, tokenByKey: new Map(), valueByToken: new Map() };
}

/**
 * Build the dictionary used to anonymize this conversation turn.
 *
 * @param patients - the list of patients already loaded by the chat component.
 * @param psychologistName - the psychologist's own name (also PII).
 */
export function buildChatDictionary(
  patients: Patientish[],
  psychologistName?: string,
): PiiItem[] {
  const items: PiiItem[] = [];

  const pushName = (raw: string | undefined, type: 'PACIENTE' | 'PROFESIONAL') => {
    if (!raw) return;
    const v = String(raw).trim();
    if (v.length < 2) return;
    items.push({ value: v, type });
    // Also add individual name tokens (>=3 chars) when the full name has
    // multiple parts — so a question mentioning only the first name still
    // gets anonymized.
    const parts = v.split(/\s+/).filter(p => p.length >= 3);
    if (parts.length > 1) for (const p of parts) items.push({ value: p, type });
  };

  pushName(psychologistName, 'PROFESIONAL');

  for (const p of patients || []) {
    pushName(p.name, 'PACIENTE');
    if (p.email) items.push({ value: String(p.email).trim(), type: 'EMAIL' });
    if (p.phone) items.push({ value: String(p.phone).trim(), type: 'TELEFONO' });
    if (p.dni)   items.push({ value: String(p.dni).trim(),   type: 'DNI' });
    if (p.iban)  items.push({ value: String(p.iban).trim(),  type: 'IBAN' });
  }

  // Dedup (case-insensitive per type), then sort by length DESC so longer
  // values get replaced before their substrings.
  const seen = new Set<string>();
  const out: PiiItem[] = [];
  for (const it of items) {
    const key = it.type + ':' + it.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  out.sort((a, b) => b.value.length - a.value.length);
  return out;
}

function mintToken(state: AnonymizerState, type: PiiItem['type'], original: string): string {
  const key = type + ':' + original.toLowerCase();
  const existing = state.tokenByKey.get(key);
  if (existing) return existing;
  const n = (state.counters[type] = (state.counters[type] || 0) + 1);
  const token = `[${type}_${String(n).padStart(3, '0')}]`;
  state.tokenByKey.set(key, token);
  state.valueByToken.set(token, original);
  return token;
}

/**
 * Replace every PII occurrence in `text` with a stable opaque token.
 * Safe to call multiple times during one conversation turn — repeated values
 * reuse the same token via the state map.
 */
export function anonymize(text: string, dict: PiiItem[], state: AnonymizerState): string {
  if (!text) return text;
  let out = text;

  // 1) Dictionary-based replacement with Unicode-aware word boundaries.
  for (const item of dict) {
    const escaped = escapeRegExp(item.value);
    let re: RegExp;
    try {
      re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
    } catch {
      re = new RegExp(`\\b${escaped}\\b`, 'gi');
    }
    out = out.replace(re, (match) => mintToken(state, item.type, match));
  }

  // 2) Regex fallbacks for free-form PII (emails, phones, DNI, IBAN typed by
  // the user but not yet in the patients list).
  for (const { regex, type } of REGEX_PATTERNS) {
    out = out.replace(regex, (match) => {
      // Skip if the match is already a token
      if (/^\[(PACIENTE|PROFESIONAL|EMAIL|TELEFONO|DNI|IBAN)_\d{3,6}\]$/.test(match)) return match;
      return mintToken(state, type, match.trim());
    });
  }

  return out;
}

/**
 * Replace tokens in `text` with their original values.
 */
export function deanonymize(text: string, state: AnonymizerState): string {
  if (!text || state.valueByToken.size === 0) return text;
  return text.replace(TOKEN_REGEX, (token) => {
    const original = state.valueByToken.get(token);
    return original != null ? original : token;
  });
}

/**
 * Streaming helper: feeds `chunk` into a tail buffer so a token split across
 * two chunks (e.g. "[PACIENTE_" + "001]") is never emitted half-replaced.
 * Returns the portion of text that is safe to flush to the UI right now
 * (already de-anonymized). Call `drainStreamBuffer()` after the last chunk
 * to flush the remaining tail.
 */
export interface StreamBuffer {
  pending: string;
}
export function createStreamBuffer(): StreamBuffer {
  return { pending: '' };
}
export function pushStreamChunk(
  buffer: StreamBuffer,
  chunk: string,
  state: AnonymizerState,
): string {
  buffer.pending += chunk || '';
  // Keep the last 32 chars in the buffer in case a token is mid-assembly.
  if (buffer.pending.length <= 32) return '';
  const safe = buffer.pending.slice(0, buffer.pending.length - 32);
  buffer.pending = buffer.pending.slice(-32);
  return deanonymize(safe, state);
}
export function drainStreamBuffer(buffer: StreamBuffer, state: AnonymizerState): string {
  const out = deanonymize(buffer.pending, state);
  buffer.pending = '';
  return out;
}
