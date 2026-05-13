import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Bot, User as UserIcon, Loader2, RefreshCw, Sparkles, FileText, TrendingUp, AlertCircle, Lock, Globe, ExternalLink, Search } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import { ai } from '../services/genaiService';

interface GroundingSource {
  uri: string;
  title: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: GroundingSource[];
  searchQueries?: string[];
  usedWebSearch?: boolean;
}

interface Patient {
  id: string;
  name: string;
  email?: string;
  active?: boolean;
  tags?: string[];
}

interface Session {
  id: string;
  patient_user_id?: string;
  patientId?: string;
  patientName?: string;
  date: string;
  starts_on?: string;
  status: string;
  type?: string;
  price?: number;
  percent_psych?: number;
  paid?: boolean;
  paymentMethod?: string;
  notes?: string;
}

interface Invoice {
  id: string;
  invoiceNumber?: string;
  patientName?: string;
  patient_user_id?: string;
  amount: number;
  total?: number;
  status: string;
  date?: string;
  invoice_date?: string;
  created_at?: string;
  description?: string;
  is_rectificativa?: boolean;
}

interface SessionEntry {
  id: string;
  session_id?: string;
  target_user_id?: string;
  creator_user_id?: string;
  summary?: string;
  transcript?: string;
  status?: string;
  created_at?: string;
  timestamp?: number;
  date?: string;
}

interface PsychologistAIChatProps {
  psychologistId: string;
  psychologistName?: string;
}

const QUICK_PROMPTS = [
  { icon: TrendingUp, label: 'Resumen de actividad', prompt: 'Hazme un resumen de mi actividad reciente: número de pacientes activos, sesiones completadas este mes y facturación.' },
  { icon: FileText, label: 'Pacientes sin sesión reciente', prompt: 'Dime qué pacientes no han tenido sesión en los últimos 30 días según los datos disponibles.' },
  { icon: Sparkles, label: 'Próximos pasos clínicos', prompt: 'Basándote en lo que sabes de mis pacientes y sesiones, ¿cuáles son los pacientes que podrían necesitar más atención o seguimiento próximo?' },
  { icon: FileText, label: 'Reporte de facturación', prompt: 'Genera un reporte de facturación: facturas pendientes de cobro, facturas pagadas y total facturado.' },
];

const PsychologistAIChat: React.FC<PsychologistAIChatProps> = ({ psychologistId, psychologistName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sessionEntries, setSessionEntries] = useState<SessionEntry[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load data scoped strictly to this psychologist
  const loadPsychologistData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);
    try {
      // All fetches include psychologistId to scope data server-side
      const [patientsRes, sessionsRes, invoicesRes, entriesRes] = await Promise.all([
        apiFetch(`${API_URL}/psychologist/${encodeURIComponent(psychologistId)}/patients`),
        apiFetch(`${API_URL}/sessions?psychologistId=${encodeURIComponent(psychologistId)}&limit=500`),
        apiFetch(`${API_URL}/invoices?psychologistId=${encodeURIComponent(psychologistId)}&limit=500`),
        apiFetch(`${API_URL}/session-entries?creator_user_id=${encodeURIComponent(psychologistId)}`),
      ]);

      const patientsData = patientsRes.ok ? await patientsRes.json() : [];
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : [];
      const invoicesData = invoicesRes.ok ? await invoicesRes.json() : [];
      const entriesData = entriesRes.ok ? await entriesRes.json() : [];

      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      setSessionEntries(Array.isArray(entriesData) ? entriesData : []);
      setDataLoaded(true);
    } catch (err) {
      console.error('[AIChat] Error loading psychologist data:', err);
      setDataError('No se pudieron cargar los datos. El asistente funcionará con información limitada.');
      setDataLoaded(true);
    } finally {
      setIsLoadingData(false);
    }
  }, [psychologistId]);

  useEffect(() => {
    loadPsychologistData();
  }, [loadPsychologistData]);

  // Build a privacy-scoped context string. Only includes data fetched for this psychologist.
  const buildContext = (userQuestion?: string): string => {
    const now = new Date();
    const today = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const todayIso = now.toISOString().slice(0, 10);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const ms90 = 90 * 24 * 60 * 60 * 1000;

    const getSessionDate = (s: Session): Date | null => {
      const raw = s.starts_on || s.date;
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    };
    const getInvoiceDate = (inv: Invoice): Date | null => {
      const raw = inv.invoice_date || inv.date || inv.created_at;
      if (!raw) return null;
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    };

    const activePatients = patients.filter(p => p.active !== false);
    const inactivePatients = patients.filter(p => p.active === false);

    // Only real sessions (exclude availability slots)
    const realSessions = sessions.filter(s => s.status !== 'available');

    // Build patient lookup
    const patientById = new Map<string, Patient>();
    patients.forEach(p => patientById.set(p.id, p));
    const resolvePatientName = (s: Session | SessionEntry | Invoice): string => {
      if ('patientName' in s && s.patientName) return s.patientName!;
      const pid = (s as any).patient_user_id || (s as any).patientId || (s as any).target_user_id;
      if (pid && patientById.has(pid)) return patientById.get(pid)!.name;
      return 'Paciente';
    };

    // Per-patient aggregates
    const sessionsByPatient = new Map<string, Session[]>();
    realSessions.forEach(s => {
      const pid = s.patient_user_id || s.patientId;
      if (!pid) return;
      if (!sessionsByPatient.has(pid)) sessionsByPatient.set(pid, []);
      sessionsByPatient.get(pid)!.push(s);
    });
    sessionsByPatient.forEach(arr => arr.sort((a, b) => {
      const da = getSessionDate(a)?.getTime() ?? 0;
      const db = getSessionDate(b)?.getTime() ?? 0;
      return db - da;
    }));

    const entriesByPatient = new Map<string, SessionEntry[]>();
    sessionEntries.forEach(e => {
      const pid = e.target_user_id;
      if (!pid) return;
      if (!entriesByPatient.has(pid)) entriesByPatient.set(pid, []);
      entriesByPatient.get(pid)!.push(e);
    });
    entriesByPatient.forEach(arr => arr.sort((a, b) => {
      const da = new Date(a.created_at || a.date || a.timestamp || 0).getTime();
      const db = new Date(b.created_at || b.date || b.timestamp || 0).getTime();
      return db - da;
    }));

    // === STATISTICS ===
    const sessionsThisMonth = realSessions.filter(s => {
      const d = getSessionDate(s);
      return d && d >= startOfMonth && d <= now;
    });
    const completedThisMonth = sessionsThisMonth.filter(s => s.status === 'completed');
    const upcomingSessions = realSessions.filter(s => {
      const d = getSessionDate(s);
      return d && d > now && (s.status === 'scheduled' || s.status === 'confirmed' || !s.status);
    }).sort((a, b) => (getSessionDate(a)?.getTime() ?? 0) - (getSessionDate(b)?.getTime() ?? 0));
    const next7DaysSessions = upcomingSessions.filter(s => {
      const d = getSessionDate(s)!;
      return d.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000;
    });

    const invoicesThisMonth = invoices.filter(inv => {
      const d = getInvoiceDate(inv);
      return d && d >= startOfMonth;
    });
    const billedThisMonth = invoicesThisMonth
      .filter(inv => inv.status !== 'draft' && !inv.is_rectificativa)
      .reduce((sum, inv) => sum + (inv.total ?? inv.amount ?? 0), 0);
    const pendingInvoices = invoices.filter(inv => inv.status === 'sent' || inv.status === 'pending');
    const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + (inv.total ?? inv.amount ?? 0), 0);
    const overdueInvoices = pendingInvoices.filter(inv => {
      const d = getInvoiceDate(inv);
      return d && now.getTime() - d.getTime() > 30 * 24 * 60 * 60 * 1000;
    });

    // Patients without recent session (>30 days)
    const patientsWithoutRecent: { p: Patient; lastDate: Date | null }[] = [];
    const patientsActiveByRecency: { p: Patient; lastDate: Date | null; count30: number }[] = [];
    activePatients.forEach(p => {
      const list = sessionsByPatient.get(p.id) || [];
      const lastDate = list.length > 0 ? getSessionDate(list[0]) : null;
      const count30 = list.filter(s => {
        const d = getSessionDate(s);
        return d && now.getTime() - d.getTime() <= ms30;
      }).length;
      patientsActiveByRecency.push({ p, lastDate, count30 });
      if (!lastDate || now.getTime() - lastDate.getTime() > ms30) {
        patientsWithoutRecent.push({ p, lastDate });
      }
    });
    patientsActiveByRecency.sort((a, b) => (b.lastDate?.getTime() ?? 0) - (a.lastDate?.getTime() ?? 0));

    // === BUILD BLOCKS ===
    const fmtDate = (d: Date | null) => d ? d.toLocaleDateString('es-ES') : 'sin fecha';
    const daysAgo = (d: Date | null) => d ? Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000)) : null;

    const statsBlock = `- Pacientes activos: ${activePatients.length}${inactivePatients.length ? ` (+${inactivePatients.length} inactivos)` : ''}
- Sesiones este mes: ${sessionsThisMonth.length} (${completedThisMonth.length} completadas)
- Sesiones próximos 7 días: ${next7DaysSessions.length}
- Próximas sesiones programadas (total futuras): ${upcomingSessions.length}
- Facturado este mes (no rectificativas, no borradores): ${billedThisMonth.toFixed(2)}€
- Facturas pendientes de cobro: ${pendingInvoices.length} (${pendingAmount.toFixed(2)}€)
- Facturas vencidas (>30 días sin pagar): ${overdueInvoices.length}`;

    const patientsBlock = patientsActiveByRecency.length > 0
      ? patientsActiveByRecency.slice(0, 80).map(({ p, lastDate, count30 }) => {
          const d = daysAgo(lastDate);
          const lastStr = lastDate ? `última sesión hace ${d}d (${fmtDate(lastDate)})` : 'sin sesiones';
          const tags = p.tags?.length ? ` [${p.tags.join(', ')}]` : '';
          return `- ${p.name} | ${lastStr} | ${count30} ses. últimos 30d${tags}`;
        }).join('\n')
      : 'Sin pacientes activos registrados.';

    const upcomingBlock = next7DaysSessions.length > 0
      ? next7DaysSessions.slice(0, 30).map(s => {
          const d = getSessionDate(s);
          const when = d ? d.toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
          return `- ${when} | ${resolvePatientName(s)} | Estado: ${s.status || 'scheduled'}${s.type ? ` | ${s.type}` : ''}`;
        }).join('\n')
      : 'Sin sesiones programadas en los próximos 7 días.';

    // Recent sessions with NOTES (truncated). Latest 40.
    const recentSessions = [...realSessions].sort((a, b) => {
      const da = getSessionDate(a)?.getTime() ?? 0;
      const db = getSessionDate(b)?.getTime() ?? 0;
      return db - da;
    }).slice(0, 40);

    const sessionsBlock = recentSessions.length > 0
      ? recentSessions.map(s => {
          const d = getSessionDate(s);
          const dateStr = fmtDate(d);
          const price = s.price != null ? ` | ${s.price}€` : '';
          const paid = s.paid != null ? (s.paid ? ' | Pagado' : ' | Pendiente') : '';
          const notes = s.notes ? ` | Notas: "${String(s.notes).slice(0, 180).replace(/\s+/g, ' ').trim()}"` : '';
          return `- ${dateStr} | ${resolvePatientName(s)} | ${s.status}${price}${paid}${notes}`;
        }).join('\n')
      : 'Sin sesiones registradas.';

    // Clinical notes (session-entries) — most recent 25 with their summary
    const recentClinicalNotes = [...sessionEntries].sort((a, b) => {
      const da = new Date(a.created_at || a.date || a.timestamp || 0).getTime();
      const db = new Date(b.created_at || b.date || b.timestamp || 0).getTime();
      return db - da;
    }).slice(0, 25);

    const clinicalNotesBlock = recentClinicalNotes.length > 0
      ? recentClinicalNotes.map(e => {
          const d = e.created_at || e.date;
          const dateStr = d ? new Date(d).toLocaleDateString('es-ES') : '—';
          const summary = (e.summary || '').replace(/\s+/g, ' ').trim().slice(0, 350);
          return summary ? `- ${dateStr} | ${resolvePatientName(e)} | ${summary}` : null;
        }).filter(Boolean).join('\n')
      : 'Sin notas clínicas registradas.';

    const recentInvoices = [...invoices].sort((a, b) => {
      const da = getInvoiceDate(a)?.getTime() ?? 0;
      const db = getInvoiceDate(b)?.getTime() ?? 0;
      return db - da;
    }).slice(0, 40);

    const invoicesBlock = recentInvoices.length > 0
      ? recentInvoices.map(inv => {
          const dateStr = fmtDate(getInvoiceDate(inv));
          const total = (inv.total ?? inv.amount ?? 0).toFixed(2);
          return `- ${inv.invoiceNumber || inv.id.slice(0, 8)} | ${resolvePatientName(inv)} | ${total}€ | ${inv.status} | ${dateStr}${inv.is_rectificativa ? ' [RECTIF.]' : ''}`;
        }).join('\n')
      : 'Sin facturas registradas.';

    const patientsWithoutRecentBlock = patientsWithoutRecent.length > 0
      ? patientsWithoutRecent
          .sort((a, b) => (a.lastDate?.getTime() ?? 0) - (b.lastDate?.getTime() ?? 0))
          .slice(0, 30)
          .map(({ p, lastDate }) => `- ${p.name} | ${lastDate ? `hace ${daysAgo(lastDate)}d` : 'nunca'}`).join('\n')
      : 'Todos los pacientes activos han tenido sesión recientemente.';

    // === ON-DEMAND PATIENT DEEP DIVE ===
    // If user mentions a patient name, include their full recent history.
    let deepDiveBlock = '';
    if (userQuestion) {
      const q = userQuestion.toLowerCase();
      const matched = patients.filter(p => {
        if (!p.name) return false;
        const tokens = p.name.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
        return tokens.some(t => q.includes(t));
      }).slice(0, 3);

      if (matched.length > 0) {
        deepDiveBlock = matched.map(p => {
          const ses = (sessionsByPatient.get(p.id) || []).slice(0, 15);
          const ents = (entriesByPatient.get(p.id) || []).slice(0, 10);
          const sLines = ses.length > 0
            ? ses.map(s => {
                const d = getSessionDate(s);
                const notes = s.notes ? ` — "${String(s.notes).slice(0, 220).replace(/\s+/g, ' ').trim()}"` : '';
                return `  · ${fmtDate(d)} | ${s.status}${notes}`;
              }).join('\n')
            : '  · (sin sesiones)';
          const eLines = ents.length > 0
            ? ents.map(e => {
                const d = e.created_at || e.date;
                const dateStr = d ? new Date(d).toLocaleDateString('es-ES') : '—';
                const summary = (e.summary || '').replace(/\s+/g, ' ').trim().slice(0, 400);
                return `  · ${dateStr} — ${summary || '(sin resumen)'}`;
              }).join('\n')
            : '  · (sin notas clínicas)';
          return `### Paciente: ${p.name}${p.active === false ? ' [INACTIVO]' : ''}${p.tags?.length ? ` [tags: ${p.tags.join(', ')}]` : ''}
Sesiones recientes (${ses.length}):
${sLines}
Notas clínicas recientes (${ents.length}):
${eLines}`;
        }).join('\n\n');
      }
    }

    let block = `FECHA ACTUAL: ${today} (${todayIso})

PSICÓLOGO: ${psychologistName || 'Usuario'}

=== INDICADORES CLAVE ===
${statsBlock}

=== PACIENTES ACTIVOS POR RECENCIA (${activePatients.length}) ===
${patientsBlock}

=== PACIENTES SIN SESIÓN EN ÚLTIMOS 30 DÍAS (${patientsWithoutRecent.length}) ===
${patientsWithoutRecentBlock}

=== PRÓXIMAS SESIONES (7 días) ===
${upcomingBlock}

=== SESIONES RECIENTES CON NOTAS (últimas ${recentSessions.length}) ===
${sessionsBlock}

=== NOTAS CLÍNICAS RECIENTES (resúmenes, últimas ${recentClinicalNotes.length}) ===
${clinicalNotesBlock}

=== FACTURAS RECIENTES (últimas ${recentInvoices.length}) ===
${invoicesBlock}`;

    if (deepDiveBlock) {
      block += `\n\n=== DETALLE DE PACIENTES MENCIONADOS EN LA PREGUNTA ===\n${deepDiveBlock}`;
    }

    return block.trim();
  };

  const buildSystemPrompt = (withWebSearch: boolean) => {
    const base = `Eres un asistente de IA especializado para psicólogos clínicos, integrado en la plataforma mainds.

Tu función es ayudar al psicólogo con:
- Análisis de su actividad clínica y administrativa con los datos privados que se te facilitan
- Generación de reportes, resúmenes y comparativas (mes actual, últimos 30 días, etc.)
- Identificación de pacientes que requieren atención o seguimiento
- Recomendación de próximos pasos clínicos y administrativos
- Respuesta a preguntas concretas sobre pacientes, sesiones, notas clínicas y facturación

CÓMO RESPONDER:
- Usa SIEMPRE los datos del bloque "DATOS PRIVADOS" para responder; nunca inventes nombres, fechas o cifras.
- Si la información no está en los datos, dilo claramente ("no consta en tus datos") y sugiere qué registrar.
- Cita fechas y cifras concretas cuando las tengas (€, nº de sesiones, días sin verse, etc.).
- Usa formato Markdown: encabezados con \`##\`, listas con \`-\`, negrita con \`**\`. Sé conciso y claro.
- Cuando hables de un paciente concreto, usa su nombre tal como aparece en los datos.
- Si te preguntan por un periodo (este mes, últimas 4 semanas...), úsalo como referencia con la FECHA ACTUAL dada.`;

    const webSearchSection = withWebSearch ? `
- Búsqueda de información actualizada en internet sobre temas clínicos, legales, formativos o de gestión relacionados con la psicología

CUANDO USES BÚSQUEDA WEB:
- Cita SIEMPRE las fuentes con nombre del medio/organismo y URL completa.
- Prioriza fuentes académicas (PubMed, APA, SEPE, BOE, WHO/OMS, universidades), colegios profesionales y organismos oficiales.
- Indica la fecha de publicación si la conoces.
- Si encuentras información contradictoria, menciona ambas fuentes y explica el contexto.
- Distingue claramente entre lo que proviene de la búsqueda web y lo que proviene de los datos del psicólogo.` : '';

    const privacy = `

REGLAS ESTRICTAS DE PRIVACIDAD Y SEGURIDAD (SIEMPRE ACTIVAS, CON O SIN BÚSQUEDA WEB):
1. SOLO puedes usar los datos del contexto privado para información sobre este psicólogo. No inventes ni asumas datos que no estén presentes.
2. NUNCA reveles datos de otros psicólogos, pacientes de otros psicólogos, ni cruces información entre cuentas.
3. La búsqueda web es solo para información general (técnicas terapéuticas, normativa, formación, etc.), NUNCA para buscar datos de pacientes o personas reales.
4. No incluyas datos clínicos sensibles en respuestas que no los soliciten explícitamente.
5. Las notas clínicas de sesiones son confidenciales; no las reproduzcas textualmente salvo estricta necesidad. Resume.
6. Mantén siempre un tono profesional y clínico apropiado.

Responde siempre en español. Sé conciso, claro y útil.`;

    return base + webSearchSection + privacy;
  };

  const sendMessage = async (userInput: string) => {
    if (!userInput.trim() || isLoading) return;
    if (!ai) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '⚠️ El asistente de IA no está disponible. Configura GEMINI_API_KEY en el servidor para activarlo.',
        timestamp: Date.now(),
      }]);
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userInput.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create a placeholder assistant message that we'll fill in via streaming
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);

    try {
      const context = buildContext(userInput);
      const systemPrompt = buildSystemPrompt(webSearchEnabled);

      // Build conversation history for multi-turn chat
      const conversationHistory = messages
        .slice(-10)
        .map(m => `${m.role === 'user' ? 'PSICÓLOGO' : 'ASISTENTE'}: ${m.content}`)
        .join('\n\n');

      const webNote = webSearchEnabled
        ? '\n[BÚSQUEDA WEB ACTIVADA: puedes usar Google Search para complementar tu respuesta con fuentes externas. Cita todas las fuentes.]'
        : '';

      const fullPrompt = `${systemPrompt}

=== DATOS PRIVADOS DISPONIBLES (solo de este psicólogo, NO buscar en internet) ===
${context}

=== HISTORIAL DE CONVERSACIÓN ===
${conversationHistory}

=== NUEVA PREGUNTA ===${webNote}
PSICÓLOGO: ${userInput}

ASISTENTE:`;

      const requestConfig: any = {};
      if (webSearchEnabled) {
        requestConfig.tools = [{ googleSearch: {} }];
      }

      // Stream the response so the UI updates progressively
      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: Object.keys(requestConfig).length > 0 ? requestConfig : undefined,
      });

      let acc = '';
      let lastChunk: any = null;
      for await (const chunk of stream) {
        lastChunk = chunk;
        const t = (chunk as any).text;
        if (t) {
          acc += t;
          // Update placeholder content incrementally
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: acc } : m));
        }
      }

      const assistantContent = acc.trim() || 'No se pudo generar una respuesta. Intenta reformular tu pregunta.';

      // Extract grounding metadata (sources) from Google Search grounding (last chunk)
      const candidate = lastChunk?.candidates?.[0];
      const groundingMeta = candidate?.groundingMetadata;
      const rawSources: GroundingSource[] = (groundingMeta?.groundingChunks || [])
        .filter((c: any) => c?.web?.uri)
        .map((c: any) => ({ uri: c.web.uri as string, title: (c.web.title as string) || c.web.uri }))
        // Deduplicate by URI
        .filter((s: GroundingSource, idx: number, arr: GroundingSource[]) => arr.findIndex(x => x.uri === s.uri) === idx)
        .slice(0, 8);
      const searchQueries: string[] = groundingMeta?.webSearchQueries || [];

      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        content: assistantContent,
        sources: rawSources.length > 0 ? rawSources : undefined,
        searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
        usedWebSearch: webSearchEnabled && (rawSources.length > 0 || searchQueries.length > 0),
      } : m));
    } catch (err) {
      console.error('[AIChat] Error calling Gemini:', err);
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        content: 'Hubo un error al conectar con el asistente de IA. Por favor, intenta de nuevo.',
      } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  // Lightweight markdown renderer supporting headings, bullets, numbered lists, bold and inline code.
  const renderInline = (text: string, keyBase: string) => {
    // Split by **bold** and `code` while preserving order
    const tokens: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) tokens.push(text.slice(lastIndex, m.index));
      const t = m[0];
      if (t.startsWith('**')) {
        tokens.push(<strong key={`${keyBase}-b-${idx++}`}>{t.slice(2, -2)}</strong>);
      } else {
        tokens.push(
          <code key={`${keyBase}-c-${idx++}`} className="px-1 py-0.5 bg-slate-100 rounded text-[0.85em] font-mono text-slate-700">
            {t.slice(1, -1)}
          </code>
        );
      }
      lastIndex = m.index + t.length;
    }
    if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
    return tokens;
  };

  const renderContent = (text: string) => {
    const lines = text.split('\n');
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let pIdx = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Heading
      const h = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      if (h) {
        const level = h[1].length;
        const content = h[2];
        const cls = level === 1
          ? 'text-base font-semibold mt-2 mb-1'
          : level === 2
          ? 'text-sm font-semibold mt-2 mb-1'
          : 'text-sm font-semibold mt-1.5 mb-0.5';
        blocks.push(<div key={`h-${i}`} className={cls}>{renderInline(content, `h-${i}`)}</div>);
        i++;
        continue;
      }

      // Bullet list
      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
          i++;
        }
        blocks.push(
          <ul key={`ul-${i}`} className="list-disc pl-5 my-1 space-y-0.5">
            {items.map((it, j) => (
              <li key={`li-${i}-${j}`}>{renderInline(it, `li-${i}-${j}`)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
          i++;
        }
        blocks.push(
          <ol key={`ol-${i}`} className="list-decimal pl-5 my-1 space-y-0.5">
            {items.map((it, j) => (
              <li key={`oli-${i}-${j}`}>{renderInline(it, `oli-${i}-${j}`)}</li>
            ))}
          </ol>
        );
        continue;
      }

      // Blank line
      if (trimmed === '') {
        blocks.push(<div key={`sp-${i}`} className="h-2" />);
        i++;
        continue;
      }

      // Paragraph (collect consecutive non-special lines)
      const paraLines: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '' || /^(#{1,3})\s+/.test(t) || /^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) break;
        paraLines.push(lines[i]);
        i++;
      }
      const pkey = `p-${pIdx++}`;
      blocks.push(
        <p key={pkey} className="my-1">
          {paraLines.map((pl, k) => (
            <React.Fragment key={`${pkey}-l-${k}`}>
              {renderInline(pl, `${pkey}-l-${k}`)}
              {k < paraLines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      );
    }
    return blocks;
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-140px)] sm:h-[calc(100dvh-120px)] max-h-[900px] min-h-[420px] sm:min-h-[500px]">
      {/* Header - compact, hidden on mobile since outer page header already shows 'Asistente IA' */}
      <div className="hidden sm:flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">Asistente IA</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Lock size={11} className="text-emerald-600" />
              <span className="text-xs text-emerald-600 font-medium">Datos privados</span>
              {webSearchEnabled && (
                <>
                  <span className="text-xs text-slate-400">·</span>
                  <Globe size={11} className="text-blue-500" />
                  <span className="text-xs text-blue-600 font-medium">Web activada</span>
                </>
              )}
              {isLoadingData && (
                <span className="text-xs text-slate-400 ml-1">· Cargando...</span>
              )}
              {dataLoaded && !isLoadingData && (
                <span className="text-xs text-slate-400 ml-1">
                  · {patients.filter(p => p.active !== false).length}p · {sessions.filter(s => s.status !== 'available').length}s · {invoices.length}f
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Limpiar chat"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
          )}
          <button
            onClick={loadPsychologistData}
            disabled={isLoadingData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
            title="Actualizar datos"
          >
            <RefreshCw size={13} className={isLoadingData ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Mobile-only compact action bar */}
      <div className="flex sm:hidden items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
          <Lock size={11} className="text-emerald-600 flex-shrink-0" />
          <span className="text-emerald-600 font-medium">Privado</span>
          {isLoadingData && <span className="text-slate-400 truncate">· Cargando…</span>}
          {dataLoaded && !isLoadingData && (
            <span className="text-slate-400 truncate">
              · {patients.filter(p => p.active !== false).length}p · {sessions.filter(s => s.status !== 'available').length}s · {invoices.length}f
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              title="Limpiar chat"
              aria-label="Limpiar chat"
            >
              <RefreshCw size={15} />
            </button>
          )}
          <button
            onClick={loadPsychologistData}
            disabled={isLoadingData}
            className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
            title="Actualizar datos"
            aria-label="Actualizar datos"
          >
            <RefreshCw size={15} className={isLoadingData ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Web search toggle + privacy bar */}
      <div className="flex items-center gap-2 mb-2 sm:mb-3">
        {/* Privacy pill - hidden on mobile (shown in compact bar above) */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex-1 min-w-0">
          <Lock size={11} className="flex-shrink-0" />
          <span className="truncate"><strong>Privacidad:</strong> solo tus pacientes, sesiones y facturas. Nunca datos de otras cuentas.</span>
        </div>
        {/* Web search toggle */}
        <button
          onClick={() => setWebSearchEnabled(v => !v)}
          title={webSearchEnabled ? 'Desactivar búsqueda web' : 'Activar búsqueda web (para consultas sobre técnicas, normativa, formación...)'}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs font-medium border transition-all flex-1 sm:flex-shrink-0 sm:flex-none ${
            webSearchEnabled
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          <Globe size={13} />
          {webSearchEnabled ? 'Búsqueda web: ON' : 'Búsqueda web: OFF'}
        </button>
      </div>

      {/* Web search info banner (shown when active) - hidden on mobile to save space */}
      {webSearchEnabled && (
        <div className="hidden sm:flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 mb-3">
          <Search size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>Búsqueda web activa.</strong> El asistente puede consultar internet para temas clínicos, normativos o formativos. Las fuentes se mostrarán en cada respuesta. Los datos de tus pacientes siguen siendo privados.
          </span>
        </div>
      )}

      {/* Data error banner */}
      {dataError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs mb-3">
          <AlertCircle size={14} />
          {dataError}
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-1 mb-3 sm:mb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Sparkles size={28} className="text-violet-600" />
              </div>
              <h3 className="font-semibold text-slate-700 mb-1">¿En qué puedo ayudarte?</h3>
              <p className="text-sm text-slate-500 max-w-xs">
                Pregúntame sobre tus pacientes, sesiones, facturación o pídeme que genere reportes.
              </p>
            </div>

            {/* Quick prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {QUICK_PROMPTS.map((qp, i) => {
                const Icon = qp.icon;
                return (
                  <button
                    key={i}
                    onClick={() => sendMessage(qp.prompt)}
                    disabled={isLoading || isLoadingData}
                    className="flex items-center gap-2.5 px-4 py-3 bg-white border border-slate-200 rounded-xl text-left hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-sm text-slate-700 disabled:opacity-50 shadow-sm"
                  >
                    <Icon size={16} className="text-indigo-500 flex-shrink-0" />
                    <span className="font-medium">{qp.label}</span>
                  </button>
                );
              })}
              {/* Web search quick prompts */}
              {webSearchEnabled && (
                <>
                  <button
                    onClick={() => sendMessage('¿Cuáles son las últimas guías clínicas o protocolos basados en evidencia para el tratamiento del trastorno de ansiedad generalizada? Cita las fuentes.')
                    }
                    disabled={isLoading}
                    className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-left hover:border-blue-400 hover:bg-blue-100 transition-colors text-sm text-blue-700 disabled:opacity-50 shadow-sm"
                  >
                    <Globe size={16} className="text-blue-500 flex-shrink-0" />
                    <span className="font-medium">Guías clínicas recientes</span>
                  </button>
                  <button
                    onClick={() => sendMessage('¿Qué dice la normativa española vigente sobre el secreto profesional y la protección de datos en psicología clínica? Menciona la fuente legal (BOE, LOPD, etc.).')}
                    disabled={isLoading}
                    className="flex items-center gap-2.5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-left hover:border-blue-400 hover:bg-blue-100 transition-colors text-sm text-blue-700 disabled:opacity-50 shadow-sm"
                  >
                    <Globe size={16} className="text-blue-500 flex-shrink-0" />
                    <span className="font-medium">Normativa para psicólogos</span>
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 sm:gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  message.role === 'user'
                    ? 'bg-indigo-600'
                    : 'bg-gradient-to-br from-violet-600 to-indigo-600'
                }`}>
                  {message.role === 'user'
                    ? <UserIcon size={14} className="text-white" />
                    : <Bot size={14} className="text-white" />
                  }
                </div>

                {/* Bubble */}
                <div className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[80%] min-w-0 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl text-sm leading-relaxed break-words ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                  }`}>
                    {message.role === 'assistant' && !message.content && isLoading ? (
                      webSearchEnabled ? (
                        <div className="flex items-center gap-2">
                          <Search size={13} className="text-blue-500 animate-pulse" />
                          <span className="text-xs text-blue-600">Buscando en internet...</span>
                        </div>
                      ) : (
                        <div className="flex gap-1 items-center h-4">
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]"></span>
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]"></span>
                          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]"></span>
                        </div>
                      )
                    ) : (
                      renderContent(message.content)
                    )}
                  </div>

                  {/* Sources from web search */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="w-full max-w-full mt-1">
                      <div className="flex items-center gap-1.5 mb-1.5 px-1">
                        <Globe size={11} className="text-blue-500" />
                        <span className="text-xs text-blue-600 font-medium">Fuentes web</span>
                        {message.searchQueries && message.searchQueries.length > 0 && (
                          <span className="text-xs text-slate-400 ml-1">— búsqueda: "{message.searchQueries[0]}"</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {message.sources.map((src, si) => (
                          <a
                            key={si}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2 px-3 py-2 bg-white border border-blue-100 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                          >
                            <ExternalLink size={12} className="text-blue-400 mt-0.5 flex-shrink-0 group-hover:text-blue-600" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-blue-700 truncate">{src.title}</p>
                              <p className="text-[10px] text-slate-400 truncate">{src.uri}</p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs text-slate-400">{formatTime(message.timestamp)}</span>
                    {message.usedWebSearch && (
                      <span className="flex items-center gap-1 text-[10px] text-blue-500">
                        <Globe size={10} />
                        web
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0">
        <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder={isMobile
              ? 'Pregúntale a la IA'
              : webSearchEnabled
              ? 'Pregunta sobre técnicas, normativa, formación... (búsqueda web activa)'
              : 'Pregunta sobre tus pacientes, sesiones, facturación... (Enter para enviar)'}
            disabled={isLoading}
            rows={1}
            style={{ resize: 'none', minHeight: '36px', maxHeight: '120px' }}
            className="flex-1 px-2 py-1.5 text-sm text-slate-800 placeholder-slate-400 bg-transparent outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Enviar"
            className={`w-10 h-10 sm:w-9 sm:h-9 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
              webSearchEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isLoading
              ? <Loader2 size={16} className="animate-spin" />
              : webSearchEnabled ? <Globe size={16} /> : <Send size={16} />
            }
          </button>
        </div>
        <p className="hidden sm:block text-xs text-slate-400 mt-1.5 text-center">
          {webSearchEnabled
            ? 'Web ON · Las fuentes aparecerán bajo cada respuesta · Privacidad siempre activa'
            : 'Solo tus datos · Asistente basado en Gemini'
          }
        </p>
      </form>
    </div>
  );
};

export default PsychologistAIChat;
