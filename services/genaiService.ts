import { GoogleGenAI, Type } from "@google/genai";
import { JournalEntry, Goal, WeeklyReport, EmotionStructure } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

interface AnalysisResult {
  summary: string;
  sentimentScore: number;
  structuredEmotions: EmotionStructure[];
  advice: string;
}

interface ClinicalSessionResult {
  sessionSummary: string;
  sessionGoal: string;
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
    1. Resumen conciso EN PRIMERA PERSONA (como si fuera el usuario escribiendo su diario). Ejemplo: "Me sentí..." en lugar de "El usuario se sintió...".
    2. Sentimiento (1-10).
    3. Estructura de emociones (Nivel 1, 2, 3).
    4. Consejo Clínico (breve, 1-2 frases).
    
    Transcripción:
    "${transcript}"
  `;

  if (!ai) {
  throw new Error("Falta la API key de Gemini");
}

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
    creator_user_id: userId,  // El creador es el mismo usuario
    target_user_id: userId,   // El objetivo es el mismo usuario (diario personal)
    entry_type: 'voice_session',  // Tipo de entrada para sesiones de voz
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

// New: Analyze a clinical session transcript (summary + therapeutic goal)
export async function analyzeClinicalSession(transcript: string, date: string): Promise<ClinicalSessionResult> {
  if (!ai) {
    throw new Error("Falta la API key de Gemini");
  }

  const prompt = `
    Analiza la siguiente transcripción de una sesión clínica del día ${date}.

    OBJETIVO:
    1) Resumen clínico breve (3-5 frases) en tercera persona.
    2) Meta terapéutica clara y concreta (1 frase) para la próxima sesión.

    REGLAS:
    - Tono profesional, objetivo y conciso.
    - No uses clichés ni autoayuda superficial.
    - No incluyas datos sensibles; si aparecen, generaliza.

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
          sessionSummary: { type: Type.STRING },
          sessionGoal: { type: Type.STRING }
        },
        required: ["sessionSummary", "sessionGoal"]
      }
    }
  });

  const result: ClinicalSessionResult = JSON.parse(response.text || "{}");
  return {
    sessionSummary: result.sessionSummary || "Resumen no disponible.",
    sessionGoal: result.sessionGoal || "Definir una meta terapéutica concreta para la próxima sesión."
  };
}

// Function to generate simple text summary for the USER (Personal advice)
export async function generateWeeklyInsights(entries: JournalEntry[]): Promise<string> {
   if (!ai) {
  throw new Error("Falta la API key de Gemini");
}
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
   if (!ai) {
  throw new Error("Falta la API key de Gemini");
}
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

  const raw = response.text || "No se pudo generar el resumen clínico.";
  return raw.replace(/^"?Resumen de Estado:?"?\s*/i, '');
}

// New: Structured Weekly Report
export async function generateWeeklyReport(entries: JournalEntry[]): Promise<WeeklyReport> {
   if (!ai) {
  throw new Error("Falta la API key de Gemini");
}
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
   if (!ai) {
  throw new Error("Falta la API key de Gemini");
}
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

// Extract text from document using Gemini API
export async function extractTextFromDocument(fileUrl: string, fileName: string): Promise<string> {
  if (!ai) {
    throw new Error("Falta la API key de Gemini");
  }

  try {
    // Fetch file from URL
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    
    // Convert blob to base64
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);

    // Determine MIME type from blob or filename
    let mimeType = blob.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = fileName.toLowerCase().split('.').pop();
      const mimeMap: Record<string, string> = {
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
      mimeType = mimeMap[ext || ''] || 'application/octet-stream';
    }

    const prompt = `
      Extrae TODO el texto de este documento.
      Proporciona el contenido completo sin omitir nada.
      Si es una transcripción de sesión terapéutica, mantén todo el diálogo tal cual.
      NO resumas, NO interpretes, solo extrae el texto completo.
    `;

    const genResponse = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }]
    });

    return genResponse.text || "No se pudo extraer texto del documento.";
  } catch (error) {
    console.error('Error extracting text from document:', error);
    throw new Error("Error al extraer texto del documento.");
  }
}

// New: Transcribe audio/video file using Gemini API
export async function transcribeAudioFile(audioBlob: Blob): Promise<string> {
  if (!ai) {
    throw new Error("Falta la API key de Gemini");
  }

  try {
    // Convert blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = btoa(binary);

    // Determine MIME type
    const mimeType = audioBlob.type || 'audio/webm';

    const prompt = `
      Transcribe el siguiente archivo de audio/video a texto.
      Proporciona una transcripción completa y precisa de todo lo que se dice.
      NO resumas, NO omitas nada, transcribe literalmente todo.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          }
        ]
      }]
    });

    return response.text || "No se pudo transcribir el audio.";
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error("Error al transcribir el audio. Intenta pegar el transcript manualmente.");
  }
}