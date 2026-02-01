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
  const [transcriptWarning, setTranscriptWarning] = useState(false);
  
  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Buffer para agrupar transcripciones del usuario y evitar duplicados
  const userTranscriptBufferRef = useRef<string>('');
  const userBufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionRef = useRef<any>(null);
  const contextCacheRef = useRef<{ entries: any[], context: string } | null>(null);
  
  // Refs for playback queue
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Refs for accumulation
  const fullTranscriptRef = useRef<string>('');
  const timerRef = useRef<number | null>(null);
  const sessionLimitRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);
  const isInitialized = useRef(false);
  
  // Web Speech Recognition como respaldo
  const recognitionRef = useRef<any>(null);
  const userSpeechTranscriptRef = useRef<string>('');

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
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
          streamRef.current = stream;
          console.log('[VoiceSession] ✅ Microphone access granted');
          console.log('[VoiceSession] Audio tracks:', stream.getAudioTracks().map(t => ({
            label: t.label,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
          })));
        } catch (micError) {
          console.error('[VoiceSession] ❌ Microphone access denied or failed:', micError);
          throw new Error('No se pudo acceder al micrófono. Por favor, permite el acceso al micrófono.');
        }

        // 2. Prepare Context (Updated to include Psychologist Feedback)
        console.log('[VoiceSession] Loading recent entries...');
        // Sort explicitly by date descending to ensure index 0 is the most recent
        // Usamos versión optimizada que excluye transcripts y archivos para ahorrar tokens
        // Reducido de 5 a 2 días para minimizar consumo de tokens (solo lo más reciente)
        const recentEntries = user ? await getLastDaysEntriesSummary(user.id, 2) : [];
        console.log('[VoiceSession] Loaded', recentEntries.length, 'entries');
        
        // Función para truncar texto y reducir tokens (límites muy agresivos)
        const truncate = (text: string | undefined, maxChars: number = 120) => {
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
            ? recentEntries.map((e, index) => {
                  const feedbackText = getFeedbackText(e.psychologistFeedback);
                  const priority = index === 0 ? "[PRIORIDAD]" : "";
                  const summary = truncate(e.summary, 100);
                  const feedback = feedbackText ? truncate(feedbackText, 120) : null;
                  return `${e.date}${priority}: ${summary}${feedback ? ` | Psicólogo: ${feedback}` : ''}`;
               }).join('\n')
            : "Primera sesión.";
          
          contextCacheRef.current = { entries: recentEntries, context: contextStr };
        }

        // Selected Language and Voice
        const selectedLanguage = settings?.language || 'es-ES';
        const selectedVoice = settings?.voice || 'Kore';

        console.log('[VoiceSession] Preparing to connect...', { selectedLanguage, selectedVoice });

        // Inicializar Web Speech Recognition como respaldo
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          console.log('[VoiceSession] 🎙️ Initializing Web Speech Recognition as backup...');
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.lang = selectedLanguage;
          recognition.continuous = true;
          recognition.interimResults = false; // Solo resultados finales
          
          recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal) {
                const transcript = result[0].transcript;
                console.log('[VoiceSession] 🗣️ Web Speech captured:', transcript);
                userSpeechTranscriptRef.current += transcript + ' ';
                // Guardar INMEDIATAMENTE en fullTranscriptRef
                fullTranscriptRef.current += `Usuario (Web Speech): ${transcript}\n`;
                console.log('[VoiceSession] 💾 Saved to fullTranscriptRef. Current length:', fullTranscriptRef.current.length);
                setTranscriptWarning(false);
              }
            }
          };
          
          recognition.onerror = (evt: any) => {
            console.warn('[VoiceSession] ⚠️ Speech Recognition error:', evt.error);
          };
          
          recognition.onend = () => {
            // Reiniciar si aún está montado y conectado
            if (isMounted.current && status === 'connected') {
              try {
                recognition.start();
              } catch (e) {
                console.warn('[VoiceSession] Could not restart recognition:', e);
              }
            }
          };
          
          try {
            recognition.start();
            console.log('[VoiceSession] ✅ Web Speech Recognition started');
          } catch (e) {
            console.warn('[VoiceSession] ⚠️ Could not start Speech Recognition:', e);
          }
        } else {
          console.warn('[VoiceSession] ⚠️ Web Speech Recognition not available in this browser');
        }

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
                
                // Verificar si hay transcripción después de 30 segundos
                if (prev === 30 && fullTranscriptRef.current.length < 10) {
                  console.warn('[VoiceSession] ⚠️ No transcript detected after 30 seconds');
                  setTranscriptWarning(true);
                }
              }, 1000);
              
              // Límite de duración: 10 minutos (600 segundos)
              sessionLimitRef.current = setTimeout(() => {
                console.log('[VoiceSession] ⏰ Límite de 10 minutos alcanzado');
                cleanup();
                onSessionEnd(fullTranscriptRef.current);
                alert('La sesión ha alcanzado el límite de 10 minutos.');
              }, 600000); // 10 minutos = 600,000 ms

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
              
              // Log completo del mensaje para debugging
              console.log('[VoiceSession] 📨 Received message:', {
                hasOutputTranscription: !!msg.serverContent?.outputTranscription,
                hasInputTranscription: !!msg.serverContent?.inputTranscription,
                hasModelTurn: !!msg.serverContent?.modelTurn,
                hasInterrupted: !!msg.serverContent?.interrupted,
                fullMessage: msg
              });
              
              if (msg.serverContent?.outputTranscription?.text) {
                const text = msg.serverContent.outputTranscription.text;
                console.log('[VoiceSession] 🎤 IA transcript:', text);
                fullTranscriptRef.current += `IA: ${text}\n`;
                setTranscript(prev => prev + text);
                setTranscriptWarning(false); // Reset warning if we get transcription
              }
              
              if (msg.serverContent?.inputTranscription?.text) {
                const text = msg.serverContent.inputTranscription.text;
                console.log('[VoiceSession] 👤 User transcript from Gemini:', text);
                
                // Limpiar timeout previo
                if (userBufferTimeoutRef.current) {
                  clearTimeout(userBufferTimeoutRef.current);
                }
                
                // Acumular en buffer
                userTranscriptBufferRef.current = text;
                
                // Guardar después de 1 segundo de silencio (reducido de 1.5s)
                userBufferTimeoutRef.current = setTimeout(() => {
                  if (userTranscriptBufferRef.current.trim()) {
                    console.log('[VoiceSession] 💾 Saving Gemini user transcript to fullTranscriptRef:', userTranscriptBufferRef.current);
                    fullTranscriptRef.current += `Usuario (Gemini): ${userTranscriptBufferRef.current}\n`;
                    console.log('[VoiceSession] 📊 fullTranscriptRef length:', fullTranscriptRef.current.length, 'chars');
                    userTranscriptBufferRef.current = '';
                  }
                }, 1000);
                setTranscriptWarning(false); // Reset warning if we get transcription
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
            systemInstruction: `Eres dygo, compañero de diario empático. Inicia: saluda y pregunta cómo le fue (1-2 frases). Si hay nota del psicólogo (marcada [PRIORIDAD]), pregunta sobre ESO primero. Estilo: breve (máx 2 oraciones), pregunta por emociones siempre, explora más temas. No aconsejes ni juzgues. Idioma: ${languageInstruction}.

Contexto:
${contextStr}`,

            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
            },
            // Habilitar transcripción tanto de entrada como de salida
            inputAudioTranscription: { language: selectedLanguage },
            outputAudioTranscription: { language: selectedLanguage },
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
    console.log('[VoiceSession] 🧹 Cleanup called');
    console.log('[VoiceSession] 📊 Current transcript length BEFORE cleanup:', fullTranscriptRef.current.length);
    
    if (timerRef.current) clearInterval(timerRef.current);
    if (sessionLimitRef.current) clearTimeout(sessionLimitRef.current);
    
    // Detener Web Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        console.log('[VoiceSession] 🛑 Web Speech Recognition stopped');
      } catch (e) {
        console.warn('[VoiceSession] Could not stop recognition:', e);
      }
    }
    
    // Limpiar buffer de transcripción del usuario de Gemini
    if (userBufferTimeoutRef.current) {
      clearTimeout(userBufferTimeoutRef.current);
    }
    // Flush any pending user transcript from Gemini
    if (userTranscriptBufferRef.current.trim()) {
      console.log('[VoiceSession] 💾 Flushing pending Gemini user transcript:', userTranscriptBufferRef.current);
      fullTranscriptRef.current += `Usuario (Gemini): ${userTranscriptBufferRef.current}\n`;
      userTranscriptBufferRef.current = '';
    }
    
    console.log('[VoiceSession] 📝 Final transcript length:', fullTranscriptRef.current.length, 'chars');
    console.log('[VoiceSession] 📝 Final transcript preview (first 300 chars):', fullTranscriptRef.current.substring(0, 300));
    console.log('[VoiceSession] 📝 Web Speech captured:', userSpeechTranscriptRef.current.length, 'chars');
    
    // Verificar si tenemos transcripción
    if (fullTranscriptRef.current.length < 20) {
      console.error('[VoiceSession] ⚠️⚠️⚠️ WARNING: Very short or empty transcript!');
      console.error('[VoiceSession] This might cause "No se detectó audio" error');
    }
    
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
    console.log('[VoiceSession] 📞 Hanging up...');
    cleanup();
    const finalTranscript = fullTranscriptRef.current;
    console.log('[VoiceSession] 📤 Sending transcript to onSessionEnd. Length:', finalTranscript.length);
    onSessionEnd(finalTranscript);
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
      <div className="h-20 flex flex-col items-center justify-center text-center px-4 gap-2">
        {error ? (
            <p className="text-red-300 bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>
        ) : transcriptWarning ? (
            <div className="text-amber-300 bg-amber-900/30 px-4 py-2 rounded-lg">
              <p className="text-sm">⚠️ Transcripción de respaldo activa</p>
              <p className="text-xs mt-1">Usando reconocimiento de voz del navegador para capturar tu audio.</p>
            </div>
        ) : (
            <>
              <p className="text-slate-400 text-sm max-w-xs animate-pulse">
                  {isAiSpeaking ? "dygo te está hablando..." : "dygo está esperando..."}
              </p>
              {fullTranscriptRef.current.length > 0 && (
                <p className="text-slate-500 text-xs">
                  📝 {fullTranscriptRef.current.length} caracteres transcritos
                </p>
              )}
            </>
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