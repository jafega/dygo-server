import React, { useEffect, useRef, useState } from 'react';
import { LiveServerMessage, Modality } from '@google/genai';
import { ai } from '../services/genaiService';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audioUtils';
import { getLastDaysEntriesSummary } from '../services/storageService';
import { getCurrentUser } from '../services/authService';
import { Mic, MicOff, PhoneOff, Phone, User, Signal } from 'lucide-react';
import { ClinicalNoteContent, UserSettings } from '../types';


interface VoiceSessionProps {
  onSessionEnd: (transcript: string) => void;
  onCancel: () => void;
  settings?: UserSettings;
}

const VoiceSession: React.FC<VoiceSessionProps> = ({ onSessionEnd, onCancel, settings }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [duration, setDuration] = useState(0);
  
  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sessionRef = useRef<any>(null);
  const contextCacheRef = useRef<{ entries: any[], context: string } | null>(null);
  
  // Refs for playback queue
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Refs for accumulation
  const fullTranscriptRef = useRef<string>('');
  const timerRef = useRef<number | null>(null);
  const isMounted = useRef(true);
  const isInitialized = useRef(false);

  // Format seconds into MM:SS
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Helper to extract text from feedback union type
  const getFeedbackText = (feedback?: string | ClinicalNoteContent): string => {
      if (!feedback) return '';
      if (typeof feedback === 'string') return feedback;
      return feedback.text;
  };

  useEffect(() => {
    console.log('[VoiceSession] useEffect triggered');
    isMounted.current = true; // Marcar como montado
    
    const startSession = async () => {
      console.log('[VoiceSession] startSession called');
      console.log('[VoiceSession] isInitialized:', isInitialized.current);
      
      if (isInitialized.current) {
        console.log('[VoiceSession] Already initialized, skipping...');
        return;
      }
      
      isInitialized.current = true;
      console.log('[VoiceSession] ai available:', !!ai);
      
      if (!ai) {
        console.error('[VoiceSession] No AI instance - missing API key');
        setError("Falta la API key de Gemini (VITE_GEMINI_API_KEY)");
        setStatus("error");
        return;
      }

      try {
        console.log('[VoiceSession] Starting session...');
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        console.log('[VoiceSession] API key present:', !!apiKey);



        const user = await getCurrentUser();
        console.log('[VoiceSession] User loaded:', user?.id);
        
        // 1. Audio Setup
        console.log('[VoiceSession] Setting up audio contexts...');
        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        
        inputContextRef.current = inputAudioContext;
        audioContextRef.current = outputAudioContext;

        console.log('[VoiceSession] Requesting microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        console.log('[VoiceSession] Microphone access granted');

        // 2. Prepare Context (Updated to include Psychologist Feedback)
        console.log('[VoiceSession] Loading recent entries...');
        // Sort explicitly by date descending to ensure index 0 is the most recent
        // Usamos versión optimizada que excluye transcripts y archivos para ahorrar tokens
        // Reducido de 5 a 3 días para minimizar consumo de tokens
        const recentEntries = user ? await getLastDaysEntriesSummary(user.id, 3) : [];
        console.log('[VoiceSession] Loaded', recentEntries.length, 'entries');
        
        // Función para truncar texto y reducir tokens
        const truncate = (text: string | undefined, maxChars: number = 200) => {
          if (!text) return '';
          return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
        };
        
        // Cachear contexto para evitar regenerar si las entradas no cambian
        let contextStr: string;
        const entriesKey = JSON.stringify(recentEntries.map(e => ({ id: e.id, date: e.date })));
        const cachedKey = contextCacheRef.current ? JSON.stringify(contextCacheRef.current.entries.map(e => ({ id: e.id, date: e.date }))) : null;
        
        console.log('[VoiceSession] Checking context cache...', { 
          hasCache: !!contextCacheRef.current, 
          cacheMatch: cachedKey === entriesKey 
        });
        
        if (cachedKey === entriesKey && contextCacheRef.current) {
          // Usar contexto cacheado
          console.log('[VoiceSession] ✅ Using cached context');
          contextStr = contextCacheRef.current.context;
        } else {
          // Generar nuevo contexto y cachearlo
          console.log('[VoiceSession] 🔄 Generating new context...');
          contextStr = recentEntries.length > 0 
            ? `HISTORIAL RECIENTE Y FEEDBACK DEL PSICÓLOGO (ORDENADO DEL MÁS RECIENTE AL MÁS ANTIGUO):
               ${recentEntries.map((e, index) => {
                  const feedbackText = getFeedbackText(e.psychologistFeedback);
                  const recencyLabel = index === 0 ? "!!! ÚLTIMO FEEDBACK (MÁXIMA PRIORIDAD) !!!" : "Feedback previo";
                  return `
                  - Día ${e.date}:
                    Resumen: ${truncate(e.summary, 150)}
                    ${feedbackText ? `NOTA DEL PSICÓLOGO (${recencyLabel}): "${truncate(feedbackText, 200)}".` : 'Sin nota del psicólogo.'}
               `}).join('\n')}`
            : "Esta es la primera vez que hablas con el usuario.";
          
          contextCacheRef.current = { entries: recentEntries, context: contextStr };
        }

        // Selected Language and Voice
        const selectedLanguage = settings?.language || 'es-ES';
        const selectedVoice = settings?.voice || 'Kore';

        console.log('[VoiceSession] Preparing to connect...', { selectedLanguage, selectedVoice });

        // Map generic codes to specific instructions
        const languageInstruction = selectedLanguage === 'en-US' 
            ? 'Inglés' 
            : selectedLanguage === 'fr-FR' 
                ? 'Francés' 
                : 'Español de España (Castellano), natural y cercano.';

        // 3. Connect Live API
        console.log('[VoiceSession] 🔌 Connecting to Gemini Live API...');
        console.log('[VoiceSession] Context string length:', contextStr.length, 'chars');
        console.log('[VoiceSession] Voice settings:', { selectedLanguage, selectedVoice, languageInstruction });
        
        const connectionStartTime = Date.now();
        
        // Agregar timeout para detectar conexiones colgadas
        const connectionTimeout = setTimeout(() => {
          const elapsed = Date.now() - connectionStartTime;
          console.error('[VoiceSession] ⏰ Connection timeout - taking too long to connect', { elapsedMs: elapsed });
          setError('La conexión está tardando mucho. Intenta de nuevo.');
          setStatus('error');
        }, 15000); // 15 segundos timeout
        
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              console.log('[VoiceSession] Live API connected! onopen triggered');
              console.log('[VoiceSession] isMounted.current:', isMounted.current);
              clearTimeout(connectionTimeout); // Limpiar timeout si conecta exitosamente
              
              if (!isMounted.current) {
                console.warn('[VoiceSession] Component unmounted, skipping status update');
                return;
              }
              console.log('[VoiceSession] Setting status to connected...');
              setStatus('connected');
              console.log('[VoiceSession] Status set to connected');
              
              // La IA comenzará a hablar automáticamente basándose en las instrucciones del sistema
              // No necesitamos enviar un mensaje inicial porque el systemInstruction ya lo cubre

              // Start Timer
              timerRef.current = window.setInterval(() => {
                setDuration(prev => prev + 1);
              }, 1000);

              // Setup Input Stream
              const source = inputAudioContext.createMediaStreamSource(stream);
              sourceRef.current = source;
              
              // Aumentado de 4096 a 8192 para procesar chunks más grandes y reducir overhead
              const processor = inputAudioContext.createScriptProcessor(8192, 1, 1);
              processorRef.current = processor;
              
              processor.onaudioprocess = (e) => {
                if (isMuted) return; // Don't send data if muted
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then(session => {
                   session.sendRealtimeInput({ media: pcmBlob });
                });
              };
              
              source.connect(processor);
              processor.connect(inputAudioContext.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
              if (!isMounted.current) return;
              
              if (msg.serverContent?.outputTranscription?.text) {
                const text = msg.serverContent.outputTranscription.text;
                fullTranscriptRef.current += `IA: ${text}\n`;
                setTranscript(prev => prev + text);
              }
              
              if (msg.serverContent?.inputTranscription?.text) {
                 const text = msg.serverContent.inputTranscription.text;
                 fullTranscriptRef.current += `Usuario: ${text}\n`;
              }

              // Handle Audio Output
              const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioData) {
                setIsAiSpeaking(true);
                const ctx = audioContextRef.current!;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                const buffer = await decodeAudioData(base64ToUint8Array(audioData), ctx);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                
                source.onended = () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setIsAiSpeaking(false);
                };
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += buffer.duration;
                sourcesRef.current.add(source);
              }

              // Handle Interruption
              if (msg.serverContent?.interrupted) {
                sourcesRef.current.forEach(s => s.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                setIsAiSpeaking(false);
              }
            },
            onclose: () => {
              console.log("[VoiceSession] Session closed");
            },
            onerror: (err) => {
              console.error("[VoiceSession] Session error", err);
              setError("Se cortó la llamada. Intenta de nuevo.");
              setStatus('error');
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: `
              Eres "dygo", un compañero de diario inteligente, empático y curioso.
              
              SALUDO INICIAL: Cuando comience la sesión, saluda brevemente al usuario de forma cálida y pregunta cómo le fue el día. Usa máximo 1-2 frases.
              
              DIRECTRIZ SUPREMA: FEEDBACK CLÍNICO
              Revisa el contexto proporcionado abajo. Si el psicólogo ha dejado notas (especialmente las del ÚLTIMO día), TUS PREGUNTAS DEBEN DARLE PRIORIDAD A ESOS TEMAS.
              Ejemplo: Si el psicólogo dijo "Indagar sobre su sueño", tú debes preguntar: "¿Y qué tal has dormido hoy?". Esto es más importante que cualquier otra cosa.
              
              TU PERSONALIDAD Y ESTILO:
              1. **CALIDEZ BREVE**: Sé amable, cercano y usa un tono suave ("Cuéntame", "Te escucho"), pero MANTÉN TUS RESPUESTAS CORTAS. No hagas discursos. Máximo 1-2 oraciones por intervención.
              2. **CAZADOR DE EMOCIONES**: Si el usuario te cuenta un hecho (ej: "Fui a la oficina"), pero no dice cómo se sintió, TU TRABAJO es preguntar: "¿Y cómo te hizo sentir eso?" o "¿Qué emoción te despertó?".
              3. **AMPLITUD**: No te quedes con lo primero que digan. Cuando terminen un tema, pregunta: "¿Pasó algo más interesante hoy?" o "¿Algún otro momento que quieras guardar?".
              4. **ESCUCHA ACTIVA**: Usa validaciones cortas ("Entiendo...", "Vaya...", "Claro") antes de lanzar tu pregunta.

              RESTRICCIONES:
              - NO des consejos de vida ni soluciones. Solo ayudas a documentar.
              - NO juzgues (ni "qué bien" ni "qué mal").
              - Habla en ${languageInstruction}.
              
              CONTEXTO DEL USUARIO:
              ${contextStr}
            `,
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          }
        });
        
        console.log('[VoiceSession] Waiting for session promise to resolve...');
        sessionRef.current = await sessionPromise;
        console.log('[VoiceSession] Session promise resolved!', sessionRef.current);

      } catch (err) {
        console.error("[VoiceSession] Init error", err);
        setError(err instanceof Error ? err.message : "No se pudo establecer la llamada.");
        setStatus('error');
      }

    };

    startSession();

    return () => {
      console.log('[VoiceSession] Cleanup');
      isMounted.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Stop mic
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      inputContextRef.current.close();
    }
    
    // Stop speakers
    sourcesRef.current.forEach(s => s.stop());
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };

  const handleHangUp = () => {
    cleanup();
    onSessionEnd(fullTranscriptRef.current);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col items-center justify-between py-12 px-6 text-white font-sans">
      
      {/* Top Info */}
      <div className="flex flex-col items-center gap-2 mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="flex items-center gap-2 text-slate-400 text-sm font-medium tracking-wide uppercase">
            <Signal size={16} className={status === 'connected' ? "text-green-500" : "text-slate-500"} />
            {status === 'connecting' ? "Conectando..." : status === 'connected' ? "Escuchando..." : "Error"}
        </div>
        <h2 className="text-3xl font-light tracking-tight flex items-center gap-2">
            <span className="font-semibold">dygo</span>
        </h2>
        <p className="text-xl font-mono text-slate-300 tabular-nums">
            {status === 'connected' ? formatTime(duration) : "00:00"}
        </p>
      </div>

      {/* Main Visual - Avatar / Visualizer */}
      <div className="relative flex items-center justify-center">
        {/* Background pulses */}
        <div className={`absolute w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl transition-all duration-1000 ${isAiSpeaking ? 'scale-150 opacity-100' : 'scale-100 opacity-30'}`}></div>
        <div className={`absolute w-48 h-48 rounded-full bg-rose-500/20 blur-2xl transition-all duration-700 ${!isAiSpeaking && status === 'connected' ? 'scale-125 opacity-80' : 'scale-100 opacity-20'}`}></div>
        
        {/* Center Avatar - DYGO LOGO (White & Floating) */}
        <div className="relative z-10 w-40 h-40 flex items-center justify-center">
            {isAiSpeaking ? (
                <div className="flex gap-1 h-12 items-center">
                    <div className="w-2 bg-indigo-400 rounded-full animate-[bounce_1s_infinite] h-8"></div>
                    <div className="w-2 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_0.1s] h-12"></div>
                    <div className="w-2 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_0.2s] h-6"></div>
                    <div className="w-2 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_0.3s] h-10"></div>
                </div>
            ) : (
                 <svg viewBox="0 0 100 100" fill="none" className="w-32 h-32 text-white">
                    {/* Continuous stroke 'd' / delta design */}
                    <path 
                        d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" 
                        stroke="currentColor" 
                        strokeWidth="10" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                    />
                 </svg>
            )}
        </div>
      </div>

      {/* Transcript hint / Error */}
      <div className="h-20 flex items-center justify-center text-center px-4">
        {error ? (
            <p className="text-red-300 bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>
        ) : (
            <p className="text-slate-400 text-sm max-w-xs animate-pulse">
                {isAiSpeaking ? "dygo te está hablando..." : "dygo está esperando..."}
            </p>
        )}
      </div>

      {/* Controls */}
      <div className="w-full max-w-sm grid grid-cols-3 gap-8 items-center mb-8">
        
        {/* Mute Button */}
        <div className="flex flex-col items-center gap-2">
            <button 
                onClick={toggleMute}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
            >
                {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </button>
            <span className="text-xs text-slate-400 font-medium">Silenciar</span>
        </div>

        {/* Hang Up Button */}
        <div className="flex flex-col items-center gap-2">
            <button 
                onClick={handleHangUp}
                className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-500/40 hover:bg-red-600 hover:scale-105 transition-all"
            >
                <PhoneOff size={36} fill="currentColor" />
            </button>
            <span className="text-xs text-slate-400 font-medium">Colgar</span>
        </div>

        {/* Cancel/Hide Button (Optional visual balance) */}
        <div className="flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer" onClick={onCancel}>
             <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                <span className="text-xs font-bold">Cancelar</span>
             </div>
        </div>

      </div>
    </div>
  );
};

export default VoiceSession;