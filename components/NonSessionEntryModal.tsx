import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Upload, Mic, Save, Loader, Sparkles, Check } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser, apiFetch } from '../services/authService';
import { ai } from '../services/genaiService';

interface NonSessionEntry {
  id: string;
  creator_user_id: string;
  target_user_id: string;
  status: 'pending' | 'done';
  summary?: string | null;
  transcript?: string | null;
  data?: {
    transcript?: string;
    summary?: string;
    status?: 'pending' | 'done';
    file?: string;
    file_name?: string;
    file_type?: string;
  };
  created_at?: string;
}

interface NonSessionEntryModalProps {
  patientUserId: string;
  patientName?: string;
  psychologistUserId: string;
  existingEntryId?: string;
  onClose: () => void;
  onSave: () => void;
}

type EntryMode = 'transcript' | 'upload' | 'record';

const NonSessionEntryModal: React.FC<NonSessionEntryModalProps> = ({
  patientUserId,
  patientName,
  psychologistUserId,
  existingEntryId,
  onClose,
  onSave,
}) => {
  const [entryMode, setEntryMode] = useState<EntryMode>('transcript');
  const [transcript, setTranscript] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [status, setStatus] = useState<'pending' | 'done'>('done');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiIterateMode, setAiIterateMode] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [existingEntry, setExistingEntry] = useState<NonSessionEntry | null>(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  // Cargar entrada existente (si se abrió en modo edición)
  useEffect(() => {
    const loadExisting = async () => {
      if (!existingEntryId) return;
      setIsLoadingEntry(true);
      try {
        const response = await apiFetch(`${API_URL}/non-session-entries/${existingEntryId}`);
        if (response.ok) {
          const entry: NonSessionEntry = await response.json();
          setExistingEntry(entry);
          setTranscript(entry.transcript || entry.data?.transcript || '');
          setEditedSummary(entry.summary || entry.data?.summary || '');
          setAiSummary(entry.summary || entry.data?.summary || '');
          setStatus((entry.status || entry.data?.status || 'pending') as 'pending' | 'done');
        }
      } catch (err) {
        console.error('Error loading non-session entry:', err);
      } finally {
        setIsLoadingEntry(false);
      }
    };
    loadExisting();
  }, [existingEntryId]);

  const generateAISummary = async (text: string, customPrompt: string) => {
    if (!customPrompt.trim()) {
      alert('Por favor, escribe qué quieres que haga la IA');
      return;
    }
    setIsGenerating(true);
    try {
      if (!ai) throw new Error('API de IA no configurada');

      const parts: string[] = [customPrompt];
      if (text.trim()) parts.push(`Contenido:\n${text}`);
      if (editedSummary.trim()) parts.push(`Texto IA previo (puedes modificarlo o continuarlo):\n${editedSummary}`);
      const fullPrompt = parts.join('\n\n');

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          systemInstruction: 'Eres un asistente clínico de apoyo para psicólogos. Responde siempre con una única anotación directa y definitiva, lista para usar. No ofrezcas opciones, alternativas ni variantes. No hagas preguntas. No uses listas numeradas para presentar distintas versiones. Escribe directamente el contenido solicitado.',
        },
      });

      const summary = result.text || 'No se pudo generar la respuesta';
      setAiSummary(summary);
      setEditedSummary(summary);
      setAiPrompt('');
      setAiIterateMode(true);
    } catch (error) {
      console.error('Error generating AI response:', error);
      alert('Error al generar la respuesta con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => setUploadedFileData(event.target?.result as string);
    reader.readAsDataURL(file);

    if (file.type.startsWith('text/')) {
      const textReader = new FileReader();
      textReader.onload = (event) => setTranscript(event.target?.result as string);
      textReader.readAsText(file);
    }
  };

  const runTranscription = async (replace: boolean) => {
    if (!uploadedFile) return;
    setIsTranscribing(true);
    try {
      if (!ai) throw new Error('API de IA no configurada');
      const fileType = uploadedFile.type;
      let transcriptText = '';

      if (fileType.startsWith('audio/') || fileType.startsWith('video/') || fileType === 'application/pdf') {
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });
        const base64Data = fileData.split(',')[1];

        const promptText = fileType === 'application/pdf'
          ? 'Extrae todo el texto de este documento PDF. Proporciona únicamente el contenido textual sin añadir comentarios adicionales.'
          : 'Transcribe el siguiente archivo de audio/video. Proporciona únicamente la transcripción del contenido hablado, sin añadir comentarios adicionales.';

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                { inlineData: { mimeType: fileType, data: base64Data } },
              ],
            },
          ],
        });
        transcriptText = result.text || '';
      } else if (
        fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileType === 'application/msword'
      ) {
        const { default: mammoth } = await import('mammoth');
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        transcriptText = result.value || '';
      }

      if (!transcriptText) throw new Error('No se pudo obtener transcript del archivo');

      if (replace || !transcript) {
        setTranscript(transcriptText);
      } else {
        setTranscript(transcript + '\n\n--- Nuevo contenido ---\n\n' + transcriptText);
      }
    } catch (error) {
      console.error('Error al transcribir:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error al transcribir el archivo: ${errorMessage}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());

        setIsTranscribing(true);
        try {
          if (!ai) throw new Error('API de IA no configurada');
          const reader = new FileReader();
          const audioData = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const base64Data = audioData.split(',')[1];

          const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Transcribe el siguiente audio. Proporciona únicamente la transcripción del contenido hablado, sin añadir comentarios adicionales.' },
                  { inlineData: { mimeType: 'audio/webm', data: base64Data } },
                ],
              },
            ],
          });

          const transcriptText = result.text || '';
          if (!transcriptText) throw new Error('No se pudo obtener transcript de la grabación');

          if (transcript) {
            setTranscript(transcript + '\n\n--- Grabación adicional ---\n\n' + transcriptText);
          } else {
            setTranscript(transcriptText);
          }
        } catch (error) {
          console.error('Error al transcribir grabación:', error);
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          alert(`Error al transcribir la grabación: ${errorMessage}`);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error al iniciar la grabación');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSave = async () => {
    if (!transcript.trim() && !uploadedFile && !audioBlob && !existingEntry) {
      alert('Por favor, proporciona contenido para la entrada');
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      let fileData: string | null = null;
      if (uploadedFileData || audioBlob) {
        if (audioBlob) {
          const reader = new FileReader();
          fileData = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(audioBlob);
          });
        } else {
          fileData = uploadedFileData;
        }
      }

      const basePayload = {
        transcript,
        summary: editedSummary,
        status,
        file: fileData,
        file_name: uploadedFile?.name || (audioBlob ? 'recording.webm' : undefined),
        file_type: uploadedFile?.type || (audioBlob ? 'audio/webm' : undefined),
      };

      if (existingEntry) {
        const response = await apiFetch(`${API_URL}/non-session-entries/${existingEntry.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id,
          },
          body: JSON.stringify(basePayload),
        });
        if (response.ok) {
          alert('Entrada actualizada correctamente');
          onSave();
          onClose();
        } else {
          const error = await response.json().catch(() => ({}));
          alert('Error al actualizar: ' + (error.error || 'Error desconocido'));
        }
      } else {
        const response = await apiFetch(`${API_URL}/non-session-entries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id,
          },
          body: JSON.stringify({
            ...basePayload,
            creator_user_id: psychologistUserId || currentUser.id,
            target_user_id: patientUserId,
            entry_type: 'non_session_note',
          }),
        });
        if (response.ok) {
          alert('Entrada guardada correctamente');
          onSave();
          onClose();
        } else {
          const error = await response.json().catch(() => ({}));
          alert('Error al guardar: ' + (error.error || 'Error desconocido'));
        }
      }
    } catch (error) {
      console.error('Error saving non-session entry:', error);
      alert('Error al guardar la entrada');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-[200] flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="bg-white/20 p-1.5 sm:p-2 rounded-lg flex-shrink-0">
            <FileText size={18} className="sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold truncate">
              {existingEntry ? 'Editar entrada sin sesión' : 'Nueva entrada sin sesión'}
            </h2>
            <p className="text-xs sm:text-sm text-purple-100 truncate">
              {patientName || 'Paciente'} • {new Date().toLocaleDateString('es-ES')}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 active:bg-white/30 rounded-lg transition-all flex-shrink-0"
        >
          <X size={20} className="sm:w-6 sm:h-6" />
        </button>
      </div>

      {isLoadingEntry ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader className="animate-spin text-purple-600" size={32} />
            <p className="text-slate-600 text-sm">Cargando...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setEntryMode('transcript')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                  entryMode === 'transcript'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300'
                }`}
              >
                <FileText size={20} />
                <span className="font-medium text-xs sm:text-sm">Escribir</span>
              </button>
              <button
                onClick={() => setEntryMode('upload')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                  entryMode === 'upload'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300'
                }`}
              >
                <Upload size={20} />
                <span className="font-medium text-xs sm:text-sm">Subir</span>
              </button>
              <button
                onClick={() => setEntryMode('record')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 rounded-xl border-2 transition-all ${
                  entryMode === 'record'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300'
                }`}
              >
                <Mic size={20} />
                <span className="font-medium text-xs sm:text-sm">Grabar</span>
              </button>
            </div>

            {entryMode === 'transcript' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Contenido de la entrada</label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Escribe las notas..."
                  rows={10}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base leading-relaxed"
                />
              </div>
            )}

            {entryMode === 'upload' && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.pdf,.doc,.docx,.mp3,.mp4,.wav,.webm,.m4a"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isTranscribing}
                  className="w-full px-3 py-6 sm:px-4 sm:py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all flex flex-col items-center gap-2 disabled:opacity-50"
                >
                  <Upload size={28} className="text-slate-400" />
                  <div className="text-center">
                    <span className="block text-sm font-medium text-slate-700">
                      {uploadedFile ? uploadedFile.name : 'Toca para subir'}
                    </span>
                    <span className="block text-xs text-slate-500 mt-1">
                      PDF, Word, Audio, Video
                    </span>
                  </div>
                </button>

                {uploadedFile && !isTranscribing && (
                  <div className="mt-3 space-y-2">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-green-600" />
                        <span className="text-sm text-green-700 truncate">{uploadedFile.name}</span>
                      </div>
                      {(uploadedFile.type === 'application/pdf' || uploadedFile.type.startsWith('audio/') || uploadedFile.type.startsWith('video/')) && !transcript && (
                        <button
                          onClick={() => runTranscription(false)}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-all flex items-center gap-1.5 flex-shrink-0"
                        >
                          <Sparkles size={12} />
                          Generar transcript
                        </button>
                      )}
                    </div>

                    {(uploadedFile.type === 'application/pdf' || uploadedFile.type.startsWith('audio/') || uploadedFile.type.startsWith('video/')) && transcript && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => runTranscription(false)}
                          className="flex-1 min-w-[140px] px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-xs font-medium hover:from-green-700 hover:to-emerald-700 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Sparkles size={12} />
                          Añadir al transcript
                        </button>
                        <button
                          onClick={() => runTranscription(true)}
                          className="flex-1 min-w-[140px] px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg text-xs font-medium hover:from-orange-700 hover:to-red-700 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Sparkles size={12} />
                          Sustituir transcript
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isTranscribing && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                    <Loader className="animate-spin text-blue-600" size={16} />
                    <span className="text-sm text-blue-700">Procesando archivo...</span>
                  </div>
                )}

                {transcript && (
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Transcript</label>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={8}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base leading-relaxed"
                    />
                  </div>
                )}
              </div>
            )}

            {entryMode === 'record' && (
              <div className="space-y-3">
                <div className="flex items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-xl">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      disabled={isTranscribing}
                      className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      <Mic size={18} />
                      Iniciar grabación
                    </button>
                  ) : (
                    <button
                      onClick={stopRecording}
                      className="px-5 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium flex items-center gap-2 animate-pulse"
                    >
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                      </span>
                      Detener
                    </button>
                  )}
                </div>
                {isTranscribing && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                    <Loader className="animate-spin text-blue-600" size={16} />
                    <span className="text-sm text-blue-700">Transcribiendo grabación...</span>
                  </div>
                )}
                {transcript && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Transcript</label>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={8}
                      className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base leading-relaxed"
                    />
                  </div>
                )}
              </div>
            )}

            {/* AI Summary */}
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-purple-600" />
                  Resumen con IA
                </label>
                <button
                  onClick={() => setShowAiPrompt(!showAiPrompt)}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                >
                  {showAiPrompt ? 'Ocultar' : aiIterateMode ? 'Iterar' : 'Generar con IA'}
                </button>
              </div>

              {showAiPrompt && (
                <div className="space-y-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={aiIterateMode
                      ? 'Dile a la IA qué cambiar del resumen (p.ej. "hazlo más breve y formal")…'
                      : 'Dile a la IA qué hacer (p.ej. "resume las ideas principales en 5 bullet points")…'}
                    rows={3}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-400"
                  />
                  <button
                    onClick={() => generateAISummary(transcript, aiPrompt)}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {isGenerating ? <Loader className="animate-spin" size={14} /> : <Sparkles size={14} />}
                    {isGenerating ? 'Generando…' : 'Ejecutar'}
                  </button>
                </div>
              )}

              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                placeholder="El resumen generado por IA aparecerá aquí. También puedes escribirlo manualmente."
                rows={6}
                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base leading-relaxed"
              />
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-700">Estado:</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus('pending')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    status === 'pending'
                      ? 'bg-orange-100 text-orange-700 border-2 border-orange-400'
                      : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  Pendiente
                </button>
                <button
                  onClick={() => setStatus('done')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    status === 'done'
                      ? 'bg-green-100 text-green-700 border-2 border-green-400'
                      : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                  }`}
                >
                  Completada
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 bg-white flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader className="animate-spin" size={14} /> : <Save size={14} />}
              {isSaving ? 'Guardando…' : existingEntry ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default NonSessionEntryModal;
