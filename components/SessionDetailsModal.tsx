import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Upload, Mic, Save, Loader, CheckCircle, Sparkles, AlertCircle, Check, XCircle as XCircleIcon } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';
import { ai } from '../services/genaiService';

interface Session {
  id: string;
  patientId: string;
  patient_user_id?: string;
  patientName?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online' | 'home-visit';
  status: string;
  notes?: string;
  price: number;
  session_entry_id?: string;
}

interface SessionEntry {
  id: string;
  session_id: string;
  data: {
    transcript: string;
    summary: string;
    status: 'pending' | 'done';
    file?: string;
    file_name?: string;
    file_type?: string;
  };
  created_at: string;
}

interface SessionDetailsModalProps {
  session: Session;
  onClose: () => void;
  onSave: () => void;
}

type EntryMode = 'transcript' | 'upload' | 'record';

const SessionDetailsModal: React.FC<SessionDetailsModalProps> = ({ session, onClose, onSave }) => {
  const [entryMode, setEntryMode] = useState<EntryMode>('transcript');
  const [transcript, setTranscript] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileData, setUploadedFileData] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [existingEntry, setExistingEntry] = useState<SessionEntry | null>(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);

  // Cargar session_entry existente si existe
  useEffect(() => {
    const loadExistingEntry = async () => {
      setIsLoadingEntry(true);
      try {
        let entry = null;

        // Si tenemos session_entry_id, buscar directamente por ID
        if (session.session_entry_id) {
          const responseById = await fetch(`${API_URL}/session-entries/${session.session_entry_id}`);
          if (responseById.ok) {
            entry = await responseById.json();
          }
        }

        // Si no encontramos por ID, buscar por session_id (fallback)
        if (!entry) {
          const response = await fetch(`${API_URL}/session-entries?session_id=${session.id}`);
          if (response.ok) {
            const entries = await response.json();
            if (entries.length > 0) {
              entry = entries[0];
              console.log('⚠️ Entrada encontrada por session_id, pero no por session_entry_id');
            }
          }
        }

        if (entry) {
          setExistingEntry(entry);
          setTranscript(entry.data.transcript || '');
          setEditedSummary(entry.data.summary || '');
          setAiSummary(entry.data.summary || '');
          setStatus(entry.data.status || 'pending');
        }
      } catch (error) {
        console.error('Error loading existing entry:', error);
      } finally {
        setIsLoadingEntry(false);
      }
    };

    loadExistingEntry();
  }, [session.id, session.session_entry_id]);

  const generateAISummary = async (text: string) => {
    if (!text.trim()) {
      alert('Por favor, proporciona un texto para generar el resumen');
      return;
    }

    setIsGenerating(true);
    try {
      if (!ai) {
        throw new Error('API de IA no configurada');
      }

      const prompt = `Eres un asistente de psicología clínica. Genera un resumen profesional y estructurado de la siguiente sesión de terapia.

Transcript de la sesión:
${text}

Por favor, genera un resumen que incluya:
1. **Temas principales tratados**: Los temas clave discutidos en la sesión
2. **Observaciones clínicas**: Estado emocional, comportamiento, y aspectos relevantes del paciente
3. **Intervenciones realizadas**: Técnicas o estrategias terapéuticas aplicadas
4. **Tareas o seguimiento**: Tareas asignadas o aspectos a seguir en próximas sesiones
5. **Notas adicionales**: Cualquier otra información relevante

Mantén un tono profesional y objetivo.`;

      const result = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt
      });

      const summary = result.text || 'No se pudo generar el resumen';
      setAiSummary(summary);
      setEditedSummary(summary);
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Error al generar el resumen con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    // Mantener el transcript existente
    
    // Convertir archivo a base64 para guardarlo
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      setUploadedFileData(base64Data);
    };
    reader.readAsDataURL(file);

    // Solo leer archivos de texto directamente, para audio/video/pdf esperar a que el usuario pulse el botón
    const fileType = file.type;
    if (fileType.startsWith('text/')) {
      // Leer archivo de texto
      const textReader = new FileReader();
      textReader.onload = async (event) => {
        const text = event.target?.result as string;
        setTranscript(text);
      };
      textReader.readAsText(file);
    }
  };

  const handleReplaceTranscript = async () => {
    if (!uploadedFile) return;

    setIsTranscribing(true);
    try {
      if (!ai) {
        throw new Error('API de IA no configurada');
      }

      console.log('📄 Archivo a transcribir (sustituir):', uploadedFile.name, uploadedFile.type);
      const fileType = uploadedFile.type;
      let transcriptText = '';

      // Para archivos de audio/video y PDF, usar Gemini directamente
      if (fileType.startsWith('audio/') || fileType.startsWith('video/') || fileType === 'application/pdf') {
        console.log('🎵 Procesando archivo multimedia...');
        
        // Convertir el archivo a base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });

        // Extraer solo la parte base64 (sin el prefijo data:...)
        const base64Data = fileData.split(',')[1];
        console.log('✓ Archivo convertido a base64, tamaño:', base64Data.length);

        const promptText = fileType === 'application/pdf' 
          ? 'Extrae todo el texto de este documento PDF. Proporciona únicamente el contenido textual sin añadir comentarios adicionales.'
          : 'Transcribe el siguiente archivo de audio/video. Proporciona únicamente la transcripción del contenido hablado, sin añadir comentarios adicionales.';

        // Usar File API de Gemini
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: fileType,
                    data: base64Data
                  }
                }
              ]
            }
          ]
        });

        console.log('✓ Respuesta de Gemini recibida');
        transcriptText = result.text || '';
      }

      if (!transcriptText) {
        throw new Error('No se pudo obtener transcript del archivo');
      }

      console.log('✓ Transcript generado exitosamente (sustituir), longitud:', transcriptText.length);
      // Sustituir el transcript completamente
      setTranscript(transcriptText);
    } catch (error) {
      console.error('❌ Error al transcribir:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error al transcribir el archivo: ${errorMessage}\n\nRevisa la consola para más detalles.`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateTranscript = async () => {
    if (!uploadedFile) return;

    setIsTranscribing(true);
    try {
      if (!ai) {
        throw new Error('API de IA no configurada');
      }

      console.log('📄 Archivo a transcribir:', uploadedFile.name, uploadedFile.type);
      const fileType = uploadedFile.type;
      let transcriptText = '';

      // Para archivos de audio/video y PDF, usar Gemini directamente
      if (fileType.startsWith('audio/') || fileType.startsWith('video/') || fileType === 'application/pdf') {
        console.log('🎵 Procesando archivo multimedia...');
        
        // Convertir el archivo a base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(uploadedFile);
        });

        // Extraer solo la parte base64 (sin el prefijo data:...)
        const base64Data = fileData.split(',')[1];
        console.log('✓ Archivo convertido a base64, tamaño:', base64Data.length);

        const promptText = fileType === 'application/pdf' 
          ? 'Extrae todo el texto de este documento PDF. Proporciona únicamente el contenido textual sin añadir comentarios adicionales.'
          : 'Transcribe el siguiente archivo de audio/video. Proporciona únicamente la transcripción del contenido hablado, sin añadir comentarios adicionales.';

        // Usar File API de Gemini
        const result = await ai.models.generateContent({
          model: 'gemini-2.0-flash-exp',
          contents: [
            {
              role: 'user',
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType: fileType,
                    data: base64Data
                  }
                }
              ]
            }
          ]
        });

        console.log('✓ Respuesta de Gemini recibida');
        transcriptText = result.text || '';
      }

      if (!transcriptText) {
        throw new Error('No se pudo obtener transcript del archivo');
      }

      console.log('✓ Transcript generado exitosamente, longitud:', transcriptText.length);
      // Añadir al transcript existente con separador
      if (transcript) {
        setTranscript(transcript + '\n\n--- Nuevo contenido ---\n\n' + transcriptText);
      } else {
        setTranscript(transcriptText);
      }
    } catch (error) {
      console.error('❌ Error al transcribir:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`Error al transcribir el archivo: ${errorMessage}\n\nRevisa la consola para más detalles.`);
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
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Transcribir automáticamente con Gemini
        setIsTranscribing(true);
        try {
          if (!ai) {
            throw new Error('API de IA no configurada');
          }

          console.log('🎤 Transcribiendo grabación de audio...');
          
          // Convertir el audio blob a base64
          const reader = new FileReader();
          const audioData = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });

          // Extraer solo la parte base64 (sin el prefijo data:...)
          const base64Data = audioData.split(',')[1];
          console.log('✓ Audio convertido a base64, tamaño:', base64Data.length);

          // Usar Gemini para transcribir
          const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: [
              {
                role: 'user',
                parts: [
                  { text: 'Transcribe el siguiente audio de la sesión de terapia. Proporciona únicamente la transcripción del contenido hablado, sin añadir comentarios adicionales.' },
                  {
                    inlineData: {
                      mimeType: 'audio/webm',
                      data: base64Data
                    }
                  }
                ]
              }
            ]
          });

          console.log('✓ Respuesta de Gemini recibida para grabación');
          const transcriptText = result.text || '';
          
          if (!transcriptText) {
            throw new Error('No se pudo obtener transcript de la grabación');
          }

          console.log('✓ Transcript de grabación generado exitosamente, longitud:', transcriptText.length);
          
          // Añadir al transcript existente con separador
          if (transcript) {
            setTranscript(transcript + '\n\n--- Grabación adicional ---\n\n' + transcriptText);
          } else {
            setTranscript(transcriptText);
          }
        } catch (error) {
          console.error('❌ Error al transcribir grabación:', error);
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          alert(`Error al transcribir la grabación: ${errorMessage}\n\nRevisa la consola para más detalles.`);
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
      alert('Por favor, proporciona contenido para la sesión');
      return;
    }

    if (!editedSummary.trim()) {
      alert('Por favor, genera un resumen de la sesión');
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      // Preparar datos del archivo si existe
      let fileData = null;
      if (uploadedFileData || audioBlob) {
        if (audioBlob) {
          // Convertir audioBlob a base64
          const reader = new FileReader();
          fileData = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(audioBlob);
          });
        } else {
          fileData = uploadedFileData;
        }
      }

      // Si existe una entrada, actualizarla
      if (existingEntry) {
        const updateData = {
          transcript: transcript,
          summary: editedSummary,
          status: status,
          file: fileData,
          file_name: uploadedFile?.name || (audioBlob ? 'recording.webm' : undefined),
          file_type: uploadedFile?.type || (audioBlob ? 'audio/webm' : undefined)
        };

        const response = await fetch(`${API_URL}/session-entries/${existingEntry.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify(updateData)
        });

        if (response.ok) {
          alert('Entrada de sesión actualizada correctamente');
          onSave();
          onClose();
        } else {
          const error = await response.json();
          alert('Error al actualizar: ' + (error.error || 'Error desconocido'));
        }
      } else {
        // Antes de crear, verificar si ya existe una entrada para esta sesión
        const checkResponse = await fetch(`${API_URL}/session-entries?session_id=${session.id}`);
        if (checkResponse.ok) {
          const existingEntries = await checkResponse.json();
          if (existingEntries.length > 0) {
            // Ya existe una entrada, actualizar en lugar de crear
            const existingEntry = existingEntries[0];
            console.log('⚠️ Entrada duplicada detectada, actualizando en lugar de crear');
            
            const updateData = {
              transcript: transcript,
              summary: editedSummary,
              status: status,
              file: fileData,
              file_name: uploadedFile?.name || (audioBlob ? 'recording.webm' : undefined),
              file_type: uploadedFile?.type || (audioBlob ? 'audio/webm' : undefined)
            };

            const updateResponse = await fetch(`${API_URL}/session-entries/${existingEntry.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': currentUser.id
              },
              body: JSON.stringify(updateData)
            });

            if (updateResponse.ok) {
              // Asegurarse de que la sesión tenga el session_entry_id correcto
              await fetch(`${API_URL}/sessions/${session.id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'x-user-id': currentUser.id
                },
                body: JSON.stringify({ session_entry_id: existingEntry.id })
              });
              
              alert('Entrada de sesión actualizada correctamente');
              onSave();
              onClose();
            } else {
              const error = await updateResponse.json();
              alert('Error al actualizar: ' + (error.error || 'Error desconocido'));
            }
            return;
          }
        }

        // No existe, crear nueva entrada
        const sessionEntryData = {
          session_id: session.id,
          creator_user_id: currentUser.id,
          target_user_id: session.patient_user_id || session.patientId,
          transcript: transcript,
          summary: editedSummary,
          status: status,
          file: fileData,
          file_name: uploadedFile?.name || (audioBlob ? 'recording.webm' : undefined),
          file_type: uploadedFile?.type || (audioBlob ? 'audio/webm' : undefined),
          entry_type: 'session_note'
        };

        const response = await fetch(`${API_URL}/session-entries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify(sessionEntryData)
        });

        if (response.ok) {
          const savedEntry = await response.json();
          
          // Actualizar la sesión con el session_entry_id
          await fetch(`${API_URL}/sessions/${session.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': currentUser.id
            },
            body: JSON.stringify({ session_entry_id: savedEntry.id })
          });
          
          alert('Entrada de sesión guardada correctamente');
          onSave();
          onClose();
        } else {
          const error = await response.json();
          alert('Error al guardar: ' + (error.error || 'Error desconocido'));
        }
      }
    } catch (error) {
      console.error('Error saving session entry:', error);
      alert('Error al guardar la entrada de sesión');
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
              {existingEntry ? 'Editar Notas' : 'Documentar Sesión'}
            </h2>
            <p className="text-xs sm:text-sm text-purple-100">
              <span className="truncate">{session.patientName || 'Paciente'}</span>
              <span className="hidden sm:inline"> • {new Date(session.date).toLocaleDateString('es-ES')} • {session.startTime} - {session.endTime}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/20 active:bg-white/30 rounded-lg transition-all flex-shrink-0 touch-manipulation"
        >
          <X size={20} className="sm:w-6 sm:h-6" />
        </button>
      </div>

      {isLoadingEntry ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader className="animate-spin text-purple-600" size={32} />
            <p className="text-slate-600 text-xs sm:text-sm">Cargando...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Mode Selection - Compact & Mobile Friendly */}
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => setEntryMode('transcript')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 sm:px-4 sm:py-3 rounded-xl border-2 transition-all active:scale-95 ${
                  entryMode === 'transcript'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 active:bg-purple-50'
                }`}
              >
                <FileText size={20} className="sm:w-[18px] sm:h-[18px]" />
                <span className="font-medium text-xs sm:text-sm">Escribir</span>
              </button>
              <button
                onClick={() => setEntryMode('upload')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 sm:px-4 sm:py-3 rounded-xl border-2 transition-all active:scale-95 ${
                  entryMode === 'upload'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 active:bg-purple-50'
                }`}
              >
                <Upload size={20} className="sm:w-[18px] sm:h-[18px]" />
                <span className="font-medium text-xs sm:text-sm">Subir</span>
              </button>
              <button
                onClick={() => setEntryMode('record')}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 py-3 sm:px-4 sm:py-3 rounded-xl border-2 transition-all active:scale-95 ${
                  entryMode === 'record'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 active:bg-purple-50'
                }`}
              >
                <Mic size={20} className="sm:w-[18px] sm:h-[18px]" />
                <span className="font-medium text-xs sm:text-sm">Grabar</span>
              </button>
            </div>

            {/* Transcript Entry */}
            {entryMode === 'transcript' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Transcript de la sesión</label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="Escribe las notas de la sesión..."
                  rows={10}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base leading-relaxed"
                />
              </div>
            )}

            {/* File Upload */}
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
                  className="w-full px-3 py-6 sm:px-4 sm:py-8 border-2 border-dashed border-slate-300 rounded-lg sm:rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all flex flex-col items-center gap-2 sm:gap-3 disabled:opacity-50 touch-manipulation"
                >
                  <Upload size={28} className="text-slate-400 sm:w-8 sm:h-8" />
                  <div className="text-center">
                    <span className="block text-xs sm:text-sm font-medium text-slate-700">
                      {uploadedFile ? uploadedFile.name : 'Toca para subir'}
                    </span>
                    <span className="block text-[10px] sm:text-xs text-slate-500 mt-1">
                      PDF, Word, Audio, Video
                    </span>
                  </div>
                </button>
                
                {uploadedFile && !isTranscribing && (
                  <div className="mt-3 space-y-2">
                    <div className="p-2.5 sm:p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-green-600 flex-shrink-0 sm:w-4 sm:h-4" />
                        <span className="text-xs sm:text-sm text-green-700 truncate">{uploadedFile.name}</span>
                      </div>
                      {(uploadedFile.type === 'application/pdf' || uploadedFile.type.startsWith('audio/') || uploadedFile.type.startsWith('video/')) && !transcript && (
                        <button
                          onClick={handleGenerateTranscript}
                          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 transition-all flex items-center gap-1.5 flex-shrink-0"
                        >
                          <Sparkles size={12} />
                          Generar transcript
                        </button>
                      )}
                    </div>
                    
                    {/* Botones para añadir o sustituir cuando ya existe transcript */}
                    {(uploadedFile.type === 'application/pdf' || uploadedFile.type.startsWith('audio/') || uploadedFile.type.startsWith('video/')) && transcript && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={handleGenerateTranscript}
                          className="flex-1 min-w-[140px] px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-xs font-medium hover:from-green-700 hover:to-emerald-700 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Sparkles size={12} />
                          Añadir al transcript
                        </button>
                        <button
                          onClick={handleReplaceTranscript}
                          className="flex-1 min-w-[140px] px-3 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg text-xs font-medium hover:from-orange-700 hover:to-red-700 transition-all flex items-center justify-center gap-1.5"
                        >
                          <XCircleIcon size={12} />
                          Sustituir transcript
                        </button>
                      </div>
                    )}
                    {transcript && (
                      <div className="p-2 sm:p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                        <CheckCircle size={14} className="text-blue-600 flex-shrink-0 sm:w-4 sm:h-4" />
                        <span className="text-xs sm:text-sm text-blue-700">Transcript generado correctamente</span>
                      </div>
                    )}
                  </div>
                )}

                {isTranscribing && (
                  <div className="mt-3 p-2.5 sm:p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-2">
                    <Loader className="animate-spin text-purple-600" size={14} />
                    <span className="text-xs sm:text-sm text-purple-700">Generando transcript...</span>
                  </div>
                )}
                
                {transcript && entryMode === 'upload' && (
                  <div className="mt-4">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Transcript (editable)</label>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-slate-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 resize-none text-sm sm:text-base"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Audio Recording */}
            {entryMode === 'record' && (
              <div>
                <div className="flex flex-col items-center gap-3 sm:gap-4 p-6 sm:p-8 border-2 border-slate-200 rounded-lg sm:rounded-xl bg-slate-50">
                  {isTranscribing ? (
                    <>
                      <Loader className="animate-spin text-purple-600" size={40} />
                      <span className="text-xs sm:text-sm text-slate-600">Transcribiendo...</span>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all touch-manipulation ${
                          isRecording
                            ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                            : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                      >
                        <Mic size={28} className="text-white sm:w-8 sm:h-8" />
                      </button>
                      <span className="text-xs sm:text-sm text-slate-600 font-medium">
                        {isRecording ? '🔴 Grabando...' : 'Iniciar grabación'}
                      </span>
                      {audioBlob && (
                        <div className="p-2.5 sm:p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                          <Check size={14} className="text-green-600 flex-shrink-0 sm:w-4 sm:h-4" />
                          <span className="text-xs sm:text-sm text-green-700">Audio transcrito</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {transcript && entryMode === 'record' && (
                  <div className="mt-4">
                    <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">Transcript (editable)</label>
                    <textarea
                      value={transcript}
                      onChange={(e) => setTranscript(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-slate-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 resize-none text-sm sm:text-base"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Generate AI Summary Button */}
            {transcript && !aiSummary && (
              <button
                onClick={() => generateAISummary(transcript)}
                disabled={isGenerating}
                className="w-full px-4 py-3.5 sm:px-6 sm:py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg sm:rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation text-sm sm:text-base"
              >
                {isGenerating ? (
                  <>
                    <Loader className="animate-spin" size={18} />
                    <span>Generando resumen...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Generar resumen con IA</span>
                  </>
                )}
              </button>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                    <Sparkles size={14} className="text-purple-600 sm:w-4 sm:h-4" />
                    Resumen con IA
                  </label>
                  <button
                    onClick={() => generateAISummary(transcript)}
                    disabled={isGenerating || !transcript.trim()}
                    className="text-[10px] sm:text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 active:bg-purple-100 font-medium flex items-center gap-1 touch-manipulation px-2 py-1 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <Loader className="animate-spin" size={12} />
                        <span>Regenerando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} className="sm:w-3.5 sm:h-3.5" />
                        <span>Regenerar</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-green-200 bg-green-50/50 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-500 resize-none text-sm sm:text-base"
                />
              </div>
            )}

            {/* Status Selection - Compact */}
            {aiSummary && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Estado</label>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setStatus('pending')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all active:scale-95 ${
                      status === 'pending'
                        ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300 active:bg-orange-50'
                    }`}
                  >
                    <AlertCircle size={18} />
                    <span className="font-medium text-sm">Pendiente</span>
                  </button>
                  <button
                    onClick={() => setStatus('done')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all active:scale-95 ${
                      status === 'done'
                        ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-green-300 active:bg-green-50'
                    }`}
                  >
                    <CheckCircle size={18} />
                    <span className="font-medium text-sm">Completado</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-3 border border-slate-300 text-slate-700 rounded-xl font-medium hover:bg-slate-100 active:bg-slate-200 transition-all text-base"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !editedSummary.trim()}
              className="px-5 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 active:bg-purple-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-base shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader className="animate-spin" size={16} />
                  <span>{existingEntry ? 'Actualizando...' : 'Guardando...'}</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>{existingEntry ? 'Actualizar' : 'Guardar'}</span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SessionDetailsModal;
