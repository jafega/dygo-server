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
      const [patientsRes, sessionsRes, invoicesRes] = await Promise.all([
        apiFetch(`${API_URL}/psychologist/${encodeURIComponent(psychologistId)}/patients`),
        apiFetch(`${API_URL}/sessions?psychologistId=${encodeURIComponent(psychologistId)}&limit=200`),
        apiFetch(`${API_URL}/invoices?psychologistId=${encodeURIComponent(psychologistId)}&limit=200`),
      ]);

      const patientsData = patientsRes.ok ? await patientsRes.json() : [];
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : [];
      const invoicesData = invoicesRes.ok ? await invoicesRes.json() : [];

      setPatients(Array.isArray(patientsData) ? patientsData : []);
      setSessions(Array.isArray(sessionsData) ? sessionsData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
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
  const buildContext = (): string => {
    const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const activePatients = patients.filter(p => p.active !== false);

    const recentSessions = sessions
      .filter(s => s.status !== 'available')
      .sort((a, b) => {
        const da = new Date(a.starts_on || a.date || 0).getTime();
        const db = new Date(b.starts_on || b.date || 0).getTime();
        return db - da;
      })
      .slice(0, 100);

    const recentInvoices = invoices
      .sort((a, b) => {
        const da = new Date(a.invoice_date || a.date || a.created_at || 0).getTime();
        const db = new Date(b.invoice_date || b.date || b.created_at || 0).getTime();
        return db - da;
      })
      .slice(0, 100);

    const patientsBlock = activePatients.length > 0
      ? activePatients.map(p => `- ${p.name}${p.tags?.length ? ` [tags: ${p.tags.join(', ')}]` : ''}`).join('\n')
      : 'Sin pacientes activos registrados.';

    const sessionsBlock = recentSessions.length > 0
      ? recentSessions.map(s => {
          const dateStr = s.starts_on
            ? new Date(s.starts_on).toLocaleDateString('es-ES')
            : s.date;
          const price = s.price != null ? ` | ${s.price}€` : '';
          const paid = s.paid != null ? (s.paid ? ' | Pagado' : ' | Pendiente pago') : '';
          return `- ${dateStr} | ${s.patientName || 'Paciente'} | Estado: ${s.status}${price}${paid}`;
        }).join('\n')
      : 'Sin sesiones registradas.';

    const invoicesBlock = recentInvoices.length > 0
      ? recentInvoices.map(inv => {
          const dateStr = inv.invoice_date || inv.date
            ? new Date(inv.invoice_date || inv.date || '').toLocaleDateString('es-ES')
            : '—';
          const total = (inv.total ?? inv.amount ?? 0).toFixed(2);
          return `- ${inv.invoiceNumber || inv.id.slice(0, 8)} | ${inv.patientName || 'Cliente'} | ${total}€ | Estado: ${inv.status} | Fecha: ${dateStr}${inv.is_rectificativa ? ' [RECTIFICATIVA]' : ''}`;
        }).join('\n')
      : 'Sin facturas registradas.';

    return `
FECHA ACTUAL: ${today}

PSICÓLOGO: ${psychologistName || 'Usuario'}
ID (solo para referencia interna): ${psychologistId}

=== PACIENTES ACTIVOS (${activePatients.length}) ===
${patientsBlock}

=== SESIONES RECIENTES (últimas ${recentSessions.length}) ===
${sessionsBlock}

=== FACTURAS RECIENTES (últimas ${recentInvoices.length}) ===
${invoicesBlock}
    `.trim();
  };

  const buildSystemPrompt = (withWebSearch: boolean) => {
    const base = `Eres un asistente de IA especializado para psicólogos clínicos, integrado en la plataforma mainds.

Tu función es ayudar al psicólogo con:
- Análisis de su actividad clínica y administrativa
- Generación de reportes y resúmenes
- Identificación de pacientes que requieren atención
- Sugerencia de próximos pasos clínicos y administrativos
- Respuesta a preguntas sobre sus pacientes, sesiones y facturación`;

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
5. Las notas clínicas de sesiones son confidenciales; no las reproduzcas textualmente salvo estricta necesidad.
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
        content: '⚠️ El asistente de IA no está disponible. Configura la variable de entorno VITE_GEMINI_API_KEY para activarlo.',
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

    try {
      const context = buildContext();
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: Object.keys(requestConfig).length > 0 ? requestConfig : undefined,
      });

      const assistantContent = response.text?.trim() || 'No se pudo generar una respuesta. Intenta reformular tu pregunta.';

      // Extract grounding metadata (sources) from Google Search grounding
      const candidate = (response as any).candidates?.[0];
      const groundingMeta = candidate?.groundingMetadata;
      const rawSources: GroundingSource[] = (groundingMeta?.groundingChunks || [])
        .filter((c: any) => c?.web?.uri)
        .map((c: any) => ({ uri: c.web.uri as string, title: (c.web.title as string) || c.web.uri }))
        // Deduplicate by URI
        .filter((s: GroundingSource, idx: number, arr: GroundingSource[]) => arr.findIndex(x => x.uri === s.uri) === idx)
        .slice(0, 8);
      const searchQueries: string[] = groundingMeta?.webSearchQueries || [];

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now(),
        sources: rawSources.length > 0 ? rawSources : undefined,
        searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
        usedWebSearch: webSearchEnabled && (rawSources.length > 0 || searchQueries.length > 0),
      }]);
    } catch (err) {
      console.error('[AIChat] Error calling Gemini:', err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Hubo un error al conectar con el asistente de IA. Por favor, intenta de nuevo.',
        timestamp: Date.now(),
      }]);
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

  // Renders markdown-like bold (**text**) simply
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <React.Fragment key={i}>
          {parts.map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
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
                    {renderContent(message.content)}
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

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {webSearchEnabled ? <Globe size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  {webSearchEnabled ? (
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
                  )}
                </div>
              </div>
            )}
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
