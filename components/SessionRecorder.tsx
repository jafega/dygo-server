import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, AudioLines } from 'lucide-react';
import { Attachment } from '../types';

interface SessionRecorderProps {
  onComplete: (transcript: string, audioAttachment: Attachment | null) => void;
  onCancel: () => void;
}

const SessionRecorder: React.FC<SessionRecorderProps> = ({ onComplete, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) chunksRef.current.push(evt.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (audioBlob.size === 0) {
          onComplete(transcript.trim(), null);
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const url = reader.result as string;
          const audioAttachment: Attachment = {
            id: crypto.randomUUID(),
            type: 'AUDIO',
            url,
            name: `session-${new Date().toISOString().slice(0, 10)}.webm`
          };
          onComplete(transcript.trim(), audioAttachment);
        };
        reader.readAsDataURL(audioBlob);
      };

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.lang = 'es-ES';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const res = event.results[i];
            if (res.isFinal) finalText += res[0].transcript;
          }
          if (finalText) {
            setTranscript(prev => `${prev}${prev ? ' ' : ''}${finalText.trim()}`);
          }
        };

        recognition.onerror = (evt: any) => {
          console.warn('SpeechRecognition error', evt?.error || evt);
        };

        recognition.start();
      } else {
        setError('Tu navegador no soporta transcripción automática. Puedes pegar el transcript manualmente luego.');
      }

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error('Error starting recorder', err);
      setError('No se pudo iniciar la grabación. Verifica permisos de micrófono.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <AudioLines size={18} /> Grabar sesión
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="px-4 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
              >
                <Mic size={16} /> Grabar
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="px-4 py-2 rounded-full bg-slate-800 text-white hover:bg-slate-900 flex items-center gap-2"
              >
                <Square size={14} /> Detener
              </button>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transcript (auto)</label>
            <textarea
              className="mt-2 w-full min-h-[120px] p-3 text-sm border border-slate-200 rounded-lg bg-slate-50"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Transcripción generada automáticamente..."
            />
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg bg-slate-100 text-slate-700">
            Cancelar
          </button>
          <button
            onClick={() => onComplete(transcript.trim(), null)}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Usar transcript
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionRecorder;
