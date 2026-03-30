import React, { useState, useRef, useEffect } from 'react';
import { X, FileText, Upload, Mic, Save, Loader, CheckCircle, Sparkles, AlertCircle, Check, XCircle } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser, apiFetch } from '../services/authService';
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
  paid?: boolean;
  paymentMethod?: '' | 'Bizum' | 'Transferencia' | 'Efectivo';
  session_entry_id?: string;
  invoice_id?: string;
  bonus_id?: string;
}

interface Bono {
  id: string;
  pacient_user_id: string;
  psychologist_user_id: string;
  total_sessions_amount: number;
  total_price_bono_amount: number;
  paid: boolean;
  sessions_used?: number;
  sessions_remaining?: number;
  created_at: string;
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

const SessionDetailsModal: React.FC<SessionDetailsModalProps> = ({ session: initialSession, onClose, onSave }) => {
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
  const [replaceMode, setReplaceMode] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [existingEntry, setExistingEntry] = useState<SessionEntry | null>(null);
  const [isLoadingEntry, setIsLoadingEntry] = useState(false);
  
  // Estados para bonos
  const [availableBonos, setAvailableBonos] = useState<Bono[]>([]);
  const [isLoadingBonos, setIsLoadingBonos] = useState(false);
  const [isAssigningBono, setIsAssigningBono] = useState(false);
  const [assignedBono, setAssignedBono] = useState<Bono | null>(null);
  
  // Estado para la sesión actualizada
  const [session, setSession] = useState<Session>(initialSession);

  // Recargar sesión completa al abrir el modal para asegurar que tiene todos los campos
  useEffect(() => {
    const reloadSession = async () => {
      try {
        const response = await apiFetch(`${API_URL}/sessions/${initialSession.id}`);
        if (response.ok) {
          const sessionData = await response.json();
          setSession(sessionData);
        }
      } catch (error) {
        console.error('Error reloading session:', error);
        // Si falla, usar la sesión inicial
        setSession(initialSession);
      }
    };

    reloadSession();
  }, [initialSession.id]);

  // Cargar session_entry existente si existe
  useEffect(() => {
    const loadExistingEntry = async () => {
      setIsLoadingEntry(true);
      try {
        let entry = null;

        // Si tenemos session_entry_id, buscar directamente por ID
        if (session.session_entry_id) {
          const responseById = await apiFetch(`${API_URL}/session-entries/${session.session_entry_id}`);
          if (responseById.ok) {
            entry = await responseById.json();
          }
        }

        // Si no encontramos por ID, buscar por session_id (fallback)
        if (!entry) {
          const response = await apiFetch(`${API_URL}/session-entries?session_id=${session.id}`);
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
          // summary y transcript ahora están en columnas separadas, no en data
          setTranscript(entry.transcript || entry.data?.transcript || '');
          setEditedSummary(entry.summary || entry.data?.summary || '');
          setAiSummary(entry.summary || entry.data?.summary || '');
          setStatus(entry.status || entry.data?.status || 'pending');
        }
      } catch (error) {
        console.error('Error loading existing entry:', error);
      } finally {
        setIsLoadingEntry(false);
      }
    };

    loadExistingEntry();
  }, [session.id, session.session_entry_id]);
  
  // Cargar bonos disponibles del paciente
  useEffect(() => {
    const loadAvailableBonos = async () => {
      if (!session.patient_user_id && !session.patientId) return;
      
      setIsLoadingBonos(true);
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return;
        
        const patientUserId = session.patient_user_id || session.patientId;
        const psychologistUserId = currentUser.id;
        
        const response = await apiFetch(
          `${API_URL}/bonos/available/${patientUserId}?psychologist_user_id=${psychologistUserId}`
        );
        
        if (response.ok) {
          const bonos = await response.json();
          setAvailableBonos(bonos);
        }
      } catch (error) {
        console.error('Error loading available bonos:', error);
      } finally {
        setIsLoadingBonos(false);
      }
    };

    loadAvailableBonos();
  }, [session.patient_user_id, session.patientId]);

  // Cargar información del bono asignado si existe
  useEffect(() => {
    const loadAssignedBono = async () => {
      if (!session.bonus_id) {
        setAssignedBono(null);
        return;
      }
      
      try {
        const response = await apiFetch(`${API_URL}/bonos/${session.bonus_id}`);
        if (response.ok) {
          const bono = await response.json();
          setAssignedBono(bono);
          console.log('📦 Bono asignado cargado:', bono);
        }
      } catch (error) {
        console.error('Error loading assigned bono:', error);
      }
    };

    loadAssignedBono();
  }, [session.bonus_id]);

  const handleAssignBono = async (bonoId: string) => {
    setIsAssigningBono(true);
    try {
      const response = await apiFetch(`${API_URL}/sessions/${session.id}/assign-bonus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bonus_id: bonoId })
      });
      
      if (response.ok) {
        alert('Sesión asignada al bono correctamente');
        onSave();
        onClose();
      } else {
        const error = await response.json();
        alert(error.error || 'Error al asignar sesión al bono');
      }
    } catch (error) {
      console.error('Error assigning bono:', error);
      alert('Error al asignar sesión al bono');
    } finally {
      setIsAssigningBono(false);
    }
  };

  const handleUnassignBono = async () => {
    if (!confirm('¿Estás seguro de que quieres desasignar esta sesión del bono?')) return;
    
    setIsAssigningBono(true);
    try {
      const response = await apiFetch(`${API_URL}/sessions/${session.id}/assign-bonus`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        alert('Sesión desasignada del bono correctamente');
        onSave();
        onClose();
      } else {
        const error = await response.json();
        alert(error.error || 'Error al desasignar sesión del bono');
      }
    } catch (error) {
      console.error('Error unassigning bono:', error);
      alert('Error al desasignar sesión del bono');
    } finally {
      setIsAssigningBono(false);
    }
  };

  const generateAISummary = async (text: string, customPrompt: string) => {
    if (!customPrompt.trim()) {
      alert('Por favor, escribe qué quieres que haga la IA');
      return;
    }

    setIsGenerating(true);
    try {
      if (!ai) {
        throw new Error('API de IA no configurada');
      }

      const parts: string[] = [customPrompt];
      if (text.trim()) parts.push(`Contenido de la sesión:\n${text}`);
      if (editedSummary.trim()) parts.push(`Texto IA previo (puedes modificarlo o continuarlo):\n${editedSummary}`);
      const fullPrompt = parts.join('\n\n');

      const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          systemInstruction: 'Eres un asistente clínico de apoyo para psicólogos. Responde siempre con una única anotación directa y definitiva, lista para usar. No ofrezcas opciones, alternativas ni variantes. No hagas preguntas. No uses listas numeradas para presentar distintas versiones. Escribe directamente el contenido solicitado.'
        }
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
          model: 'gemini-2.5-flash',
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
          model: 'gemini-2.5-flash',
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
            model: 'gemini-2.5-flash',
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

        const response = await apiFetch(`${API_URL}/session-entries/${existingEntry.id}`, {
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
        const checkResponse = await apiFetch(`${API_URL}/session-entries?session_id=${session.id}`);
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

            const updateResponse = await apiFetch(`${API_URL}/session-entries/${existingEntry.id}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': currentUser.id
              },
              body: JSON.stringify(updateData)
            });

            if (updateResponse.ok) {
              // Asegurarse de que la sesión tenga el session_entry_id correcto
              await apiFetch(`${API_URL}/sessions/${session.id}`, {
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

        const response = await apiFetch(`${API_URL}/session-entries`, {
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
          await apiFetch(`${API_URL}/sessions/${session.id}`, {
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

  // Debug logging
  console.log('🔍 SessionDetailsModal render:', {
    sessionId: session.id,
    invoice_id: session.invoice_id,
    bonus_id: session.bonus_id,
    availableBonos: availableBonos.length,
    assignedBono: assignedBono?.id,
    patient_user_id: session.patient_user_id,
    patientId: session.patientId
  });

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
              <span className="hidden sm:inline"> • {(() => {
                const d = session.date || ((session as any).starts_on ? new Date((session as any).starts_on).toLocaleDateString('sv-SE', { timeZone: (session as any).schedule_timezone || 'Europe/Madrid' }) : null);
                return d ? new Date(d + 'T12:00:00').toLocaleDateString('es-ES') : '—';
              })()} • {session.startTime || '—'} - {session.endTime || '—'}</span>
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
          {/* Payment Status Section */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-6 space-y-3">
            {/* Invoice Status */}
            {session.invoice_id && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Facturada</span>
                </div>
                <p className="text-xs text-green-600 mt-1">Esta sesión está asociada a una factura</p>
              </div>
            )}
            
            {/* Payment Method - Mostrar si está pagada */}
            {session.paid && session.paymentMethod && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-blue-700">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Método de pago: {session.paymentMethod}</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">Sesión marcada como pagada</p>
              </div>
            )}
            
            {/* Bonus Section - Solo mostrar si NO tiene invoice_id */}
            {console.log('🔍 Bonus section check:', {
              hasInvoiceId: !!session.invoice_id,
              invoiceIdValue: session.invoice_id,
              hasBonusId: !!session.bonus_id,
              bonusIdValue: session.bonus_id,
              shouldShow: !session.invoice_id
            })}
            {!session.invoice_id && (
              <>
                {session.bonus_id ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-purple-700">
                        <CheckCircle size={16} />
                        <span className="text-sm font-medium">Asignada a bono</span>
                      </div>
                      <button
                        onClick={handleUnassignBono}
                        disabled={isAssigningBono}
                        className="text-xs text-purple-600 hover:text-purple-800 underline disabled:opacity-50"
                      >
                        Desasignar
                      </button>
                    </div>
                    {assignedBono ? (
                      <div className="bg-white border border-purple-200 rounded p-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-purple-900">
                              Bono ID: {assignedBono.id}
                            </div>
                            <div className="text-xs text-purple-600">
                              Precio: {assignedBono.total_price_bono_amount}€ | {assignedBono.sessions_remaining || 0} sesión{assignedBono.sessions_remaining !== 1 ? 'es' : ''} restante{assignedBono.sessions_remaining !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="text-xs text-purple-500">
                            {new Date(assignedBono.created_at).toLocaleDateString('es-ES')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-purple-600">Bono ID: {session.bonus_id}</p>
                    )}
                  </div>
                ) : availableBonos.length > 0 ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="mb-2">
                      <span className="text-sm font-medium text-blue-900">Asignar a bono</span>
                      <p className="text-xs text-blue-600 mt-0.5">El paciente tiene bonos disponibles</p>
                    </div>
                    <div className="space-y-2">
                      {availableBonos.map(bono => (
                        <button
                          key={bono.id}
                          onClick={() => handleAssignBono(bono.id)}
                          disabled={isAssigningBono}
                          className="w-full text-left px-3 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-blue-900">
                                Bono - {bono.total_price_bono_amount}€
                              </div>
                              <div className="text-xs text-blue-600">
                                {bono.sessions_remaining} sesión{bono.sessions_remaining !== 1 ? 'es' : ''} disponible{bono.sessions_remaining !== 1 ? 's' : ''}
                              </div>
                            </div>
                            <div className="text-xs text-blue-500">
                              {new Date(bono.created_at).toLocaleDateString('es-ES')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-slate-600">
                      <XCircle size={16} />
                      <span className="text-sm font-medium">Sin asignar</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {isLoadingBonos ? 'Cargando bonos...' : 'El paciente no tiene bonos disponibles'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

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
                          <XCircle size={12} />
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

            {/* AI Prompt Toggle */}
            <div>
              <div className="flex items-center justify-end mb-1">
                <button
                  onClick={() => setShowAiPrompt(v => !v)}
                  className={`flex items-center gap-1 text-xs font-medium transition-colors px-2 py-1 rounded-md border ${
                    showAiPrompt
                      ? 'border-purple-300 bg-purple-50 text-purple-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-purple-300 hover:text-purple-500 hover:bg-purple-50'
                  }`}
                  title="Usar IA"
                >
                  <Sparkles size={13} />
                  <span>IA</span>
                </button>
              </div>
              {showAiPrompt && (
                <div className="flex gap-2 items-start p-2.5 border border-purple-100 rounded-lg bg-purple-50/40">
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateAISummary(transcript, aiPrompt);
                      }
                    }}
                    placeholder={aiIterateMode ? '¿Quieres que iteremos el resultado de la IA?' : '¿Qué quieres que haga la IA con estas notas?'}
                    rows={2}
                    className="flex-1 px-2.5 py-1.5 border border-purple-200 rounded-lg text-xs resize-none focus:ring-1 focus:ring-purple-400 focus:outline-none bg-white"
                  />
                  <button
                    onClick={() => generateAISummary(transcript, aiPrompt)}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="mt-0.5 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    title="Aplicar"
                  >
                    {isGenerating ? <Loader className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  </button>
                </div>
              )}
            </div>

            {/* AI Result - only when there's content */}
            {aiSummary && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs sm:text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-purple-500" />
                    Resultado IA
                  </label>
                  <button
                    onClick={() => { setAiSummary(''); setEditedSummary(''); setAiIterateMode(false); }}
                    className="text-[10px] text-slate-400 hover:text-red-500 px-1.5 py-0.5 rounded transition-colors"
                  >
                    Limpiar
                  </button>
                </div>
                <textarea
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2.5 sm:px-4 sm:py-3 border-2 border-purple-100 bg-purple-50/30 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-400 resize-none text-sm sm:text-base"
                />
              </div>
            )}

            {/* Status Selection - Compact */}
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
              disabled={isSaving}
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
