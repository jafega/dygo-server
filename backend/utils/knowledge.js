// Asistente sobre la biblioteca de la clínica (backlog F5.4). Lógica pura.
//
// Selección por palabras clave (sin embeddings) de los elementos más
// relevantes y construcción del prompt. El prompt SOLO contiene la pregunta
// (ya anonimizada en el navegador) y textos de la biblioteca: nunca datos de
// pacientes ni de la historia clínica.

const STOPWORDS = new Set(('a al algo algun alguna algunas alguno algunos ante antes como con contra cual cuales cuando de del desde donde dos e el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos fue ha hay la las le les lo los mas me mi mis muy ni no nos o os otra otro para pero por porque que quien se sea ser si sin sobre su sus tambien te tiene tu tus un una uno unos y ya yo hacer hago puedo debo cómo qué cuál').split(/\s+/));

export const normalizeText = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ\s]/g, ' ');

export function tokenize(s) {
  return normalizeText(s).split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Elementos de la biblioteca más relevantes para una pregunta.
 * Título y etiquetas pesan más que el cuerpo.
 */
export function rankLibrary(items, question, n = 4) {
  const q = [...new Set(tokenize(question))];
  if (!q.length) return [];
  const scored = [];
  for (const it of items || []) {
    if (it.active === false) continue;
    const title = new Set(tokenize(it.title));
    const tags = new Set((it.tags || []).flatMap(t => tokenize(t)));
    const body = tokenize(it.body);
    const bodyCounts = new Map();
    for (const w of body) bodyCounts.set(w, (bodyCounts.get(w) || 0) + 1);
    let score = 0;
    for (const w of q) {
      if (title.has(w)) score += 5;
      if (tags.has(w)) score += 4;
      score += Math.min(3, bodyCounts.get(w) || 0);
    }
    if (score > 0) scored.push({ item: it, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, n).map(s => s.item);
}

const MAX_ITEM_CHARS = 4000;

/** Prompt para el modelo. */
export function buildLibraryPrompt(question, items, clinicName) {
  const sources = items.map((it, i) => [
    `### Fuente ${i + 1}: ${it.title} (${it.kind})`,
    String(it.body || '').slice(0, MAX_ITEM_CHARS),
    it.url ? `Enlace: ${it.url}` : ''
  ].filter(Boolean).join('\n')).join('\n\n');
  return [
    `Eres el asistente interno de la clínica de psicología "${clinicName}". Respondes a sus profesionales en español.`,
    'Responde SOLO con la información de las fuentes de la biblioteca de la clínica que aparecen abajo.',
    'Si las fuentes no contienen la respuesta, dilo claramente y no inventes. Cita las fuentes por su número (p. ej. [Fuente 2]).',
    'No hagas diagnósticos sobre personas concretas: es un apoyo a los protocolos de la clínica, no sustituye el criterio clínico.',
    '',
    '## Biblioteca de la clínica',
    sources || '(No hay fuentes relevantes.)',
    '',
    '## Pregunta del profesional',
    String(question || '').slice(0, 2000)
  ].join('\n');
}
