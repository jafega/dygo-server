import { GoogleGenAI, Type } from "@google/genai";
import { JournalEntry, Goal, WeeklyReport, EmotionStructure } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface AnalysisResult {
  summary: string;
  sentimentScore: number;
  structuredEmotions: EmotionStructure[];
  advice: string;
}

// Helper to extract text from feedback union type
const getFeedbackText = (feedback?: string | { text: string }): string => {
    if (!feedback) return '';
    if (typeof feedback === 'string') return feedback;
    return feedback.text;
};

export async function analyzeJournalEntry(transcript: string, date: string, userId: string, pastEntries?: JournalEntry[]): Promise<JournalEntry> {
  // Construct context from past psychologist feedback if available
  let psychContext = "";
  if (pastEntries && pastEntries.length > 0) {
      const recentFeedback = pastEntries
          .slice(0, 5) // Last 5 entries
          .map(e => getFeedbackText(e.psychologistFeedback))
          .filter(t => t.length > 0)
          .join(". ");
      
      if (recentFeedback) {
          psychContext = `CONTEXTO CLÍNICO PREVIO (Instrucciones del Psicólogo del usuario): "${recentFeedback}". ÚSALO para alinear tu consejo.`;
      }
  }

  const prompt = `
    Analiza la siguiente transcripción de una conversación de diario personal del día ${date}.
    
    ${psychContext}
    
    TAREA PRINCIPAL: Extracción de Emociones basada en la RUEDA DE LOS SENTIMIENTOS (Nivel 2 prioridad para análisis).
    
    TAREA SECUNDARIA (CONSEJO):
    Genera un consejo o reflexión breve.
    IMPORTANTE: 
    - EVITA CLICHÉS de autoayuda ("tú puedes", "sonríe", "todo saldrá bien"). 
    - Adopta un tono de PSICÓLOGO CLÍNICO (Terapia Cognitivo-Conductual o Humanista). 
    - Fomenta la introspección, la validación emocional o la reestructuración cognitiva.
    - Si hay contexto clínico previo, asegúrate de que tu consejo sea coherente con él.
    
    Extrae:
    1. Resumen conciso.
    2. Sentimiento (1-10).
    3. Estructura de emociones (Nivel 1, 2, 3).
    4. Consejo Clínico (breve, 1-2 frases).
    
    Transcripción:
    "${transcript}"
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          sentimentScore: { type: Type.NUMBER },
          structuredEmotions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                level1: { type: Type.STRING, description: "Emoción Base" },
                level2: { type: Type.STRING, description: "Emoción Secundaria" },
                level3: { type: Type.STRING, description: "Emoción Terciaria" }
              },
              required: ["level1", "level2", "level3"]
            }
          },
          advice: { type: Type.STRING }
        },
        required: ["summary", "sentimentScore", "structuredEmotions", "advice"]
      }
    }
  });

  const result: AnalysisResult = JSON.parse(response.text || "{}");
  
  const safeStructuredEmotions = result.structuredEmotions || [];
  const flatEmotions = safeStructuredEmotions.length > 0 
    ? safeStructuredEmotions.map(e => e.level2 || e.level1) 
    : [];

  return {
    id: crypto.randomUUID(),
    userId: userId,
    date: date,
    timestamp: Date.now(),
    transcript: transcript,
    summary: result.summary || "No summary available.",
    sentimentScore: result.sentimentScore || 5,
    emotions: flatEmotions,
    structuredEmotions: safeStructuredEmotions,
    advice: result.advice || "Reflexiona sobre lo vivido hoy."
  };
}

// Function to generate simple text summary for the USER (Personal advice)
export async function generateWeeklyInsights(entries: JournalEntry[]): Promise<string> {
  if (entries.length === 0) return "No hay suficientes datos para generar insights.";

  const inputData = entries.map(e => ({
      date: e.date,
      summary: e.summary,
      emotions: e.emotions,
      psychologistFeedback: getFeedbackText(e.psychologistFeedback)
  }));

  const prompt = `
    Actúa como un psicólogo clínico experimentado revisando el diario de un paciente.
    Datos de los últimos días: ${JSON.stringify(inputData)}
    
    OBJETIVO:
    Generar un "Insight Semanal" para el paciente.
    
    REGLAS ESTRICTAS:
    1. NO uses lenguaje de libro de autoayuda barato (ej: "Sigue tus sueños", "Sé positivo").
    2. Identifica patrones de conducta o pensamiento basándote en los datos.
    3. Si existen notas de "psychologistFeedback" en los datos, TU PRIORIDAD es reforzar esas indicaciones. El usuario debe sentir que la IA y su psicólogo humano están alineados.
    4. Usa un tono empático, profesional, reflexivo y maduro.
    5. Máximo 3 frases. Habla de "tú" al usuario.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text || "No se pudieron generar insights.";
}

// New: Function to generate objective clinical summary for the PSYCHOLOGIST
export async function generateClinicalSummary(entries: JournalEntry[]): Promise<string> {
  if (entries.length === 0) return "No hay suficientes datos para generar un resumen clínico.";

  const prompt = `
    Actúa como un asistente clínico redactando un informe para un psicólogo.
    Aquí tienes los registros recientes del paciente:
    ${JSON.stringify(entries.map(e => ({ date: e.date, summary: e.summary, emotions: e.emotions, sentiment: e.sentimentScore })))}
    
    Genera un "Resumen de Estado" objetivo y técnico en tercera persona (ej: "El paciente reporta...", "Se observa...").
    NO des consejos. 
    Enfócate en:
    1. Estabilidad emocional reciente.
    2. Principales estresores o temas recurrentes detectados.
    3. Evolución del estado de ánimo.
    
    Máximo 4 frases concisas.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text || "No se pudo generar el resumen clínico.";
}

// New: Structured Weekly Report
export async function generateWeeklyReport(entries: JournalEntry[]): Promise<WeeklyReport> {
  const prompt = `
    Analiza las siguientes entradas de diario de la última semana y genera un "Informe Semanal".
    Entradas: ${JSON.stringify(entries.map(e => ({ date: e.date, text: e.summary, emotions: e.emotions })))}
    
    Genera un JSON. Las recomendaciones deben ser accionables y basadas en terapia cognitivo-conductual, evitando tópicos vacíos.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          themes: { type: Type.ARRAY, items: { type: Type.STRING } },
          moodSummary: { type: Type.STRING },
          milestones: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["themes", "moodSummary", "milestones", "recommendations"]
      }
    }
  });

  return JSON.parse(response.text || "{}") as WeeklyReport;
}

// New: Track Goals Progress
export async function analyzeGoalsProgress(transcript: string, goals: Goal[]): Promise<Goal[]> {
  if (goals.length === 0) return [];

  const prompt = `
    Metas: ${JSON.stringify(goals.map(g => ({ id: g.id, description: g.description })))}
    Transcripción: "${transcript}"
    
    Evalúa si el usuario avanzó en sus metas. Sé un observador crítico pero motivador. Si no hay avance, sugiere un primer paso pequeño.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                id: { type: Type.STRING },
                aiFeedback: { type: Type.STRING }
            }
        }
      }
    }
  });

  const updates = JSON.parse(response.text || "[]");

  // Merge updates into goals
  return goals.map(g => {
    const update = updates.find((u: any) => u.id === g.id);
    if (update) {
        return { ...g, aiFeedback: update.aiFeedback };
    }
    return g;
  });
}