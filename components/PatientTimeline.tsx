import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, Mic, ThumbsUp, Clock, User, X, Paperclip, Download, Eye, FileText, Image as ImageIcon, File, Music, Trash2 } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';

interface Attachment {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
}

interface Entry {
  id: string;
  content: string;
  sentiment?: string;
  timestamp: string;
  userId?: string;
  createdBy?: 'PATIENT' | 'PSYCHOLOGIST';
  createdByPsychologistId?: string;
  entryType?: 'voiceSession' | 'internalNote' | 'feedback';
  creator_user_id?: string;
  target_user_id?: string;
  attachments?: Attachment[];
}

interface PatientTimelineProps {
  patientId: string;
  psychologistId: string;
}

const PatientTimeline: React.FC<PatientTimelineProps> = ({ patientId, psychologistId }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntryType, setNewEntryType] = useState<'internalNote' | 'feedback'>('internalNote');
  const [newEntryContent, setNewEntryContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{current: number, total: number}>({current: 0, total: 0});
  const [relationship, setRelationship] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentUser();
    loadEntries();
    loadRelationship();
  }, [patientId, psychologistId]);

  const loadCurrentUser = async () => {
    const user = await getCurrentUser();
    if (user) {
      setCurrentUserId(user.id);
      console.log('👤 Usuario actual:', user.id);
    }
  };

  const loadRelationship = async () => {
    if (!psychologistId || !patientId) return;
    
    try {
      const response = await fetch(`${API_URL}/relationships?psychologistId=${psychologistId}&patientId=${patientId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setRelationship(data[0]);
          console.log('🔗 Relación cargada:', {
            psychologist_user_id: data[0].psychologist_user_id,
            patient_user_id: data[0].patient_user_id
          });
        }
      }
    } catch (error) {
      console.error('Error loading relationship:', error);
    }
  };

  const loadEntries = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/entries?userId=${patientId}`);
      if (response.ok) {
        const data = await response.json();
        // Filtrar solo voiceSession, internal_note y feedback
        const filteredEntries = data.filter((entry: Entry) => 
          ['voiceSession', 'internal_note', 'internalNote', 'feedback'].includes(entry.entryType || '')
        );
        // Ordenar por fecha descendente
        filteredEntries.sort((a: Entry, b: Entry) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        console.log('🔍 Entries cargadas:', filteredEntries.map(e => ({
          id: e.id,
          type: e.entryType,
          createdBy: e.createdBy,
          creator_user_id: e.creator_user_id,
          createdByPsychologistId: e.createdByPsychologistId
        })));
        console.log('🔍 Usuario actual para comparar:', currentUserId);
        setEntries(filteredEntries);
      }
    } catch (error) {
      console.error('Error loading entries:', error);
    }
    setIsLoading(false);
  };

  const handleDeleteEntry = async (entryId: string, entryType: string) => {
    const entryTypeLabel = entryType === 'internal_note' || entryType === 'internalNote' ? 'nota interna' : 'feedback';
    
    if (!confirm(`¿Estás seguro de que quieres eliminar esta ${entryTypeLabel}?`)) {
      return;
    }

    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await fetch(`${API_URL}/entries/${entryId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        // Actualizar lista local eliminando la entrada
        setEntries(entries.filter(entry => entry.id !== entryId));
      } else {
        alert('Error al eliminar la entrada');
      }
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Error al eliminar la entrada');
    }
  };

  const handleSaveEntry = async () => {
    if (!newEntryContent.trim()) {
      alert('Por favor, escribe algo antes de guardar');
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      // Subir archivos adjuntos si existen
      let uploadedAttachments: Attachment[] = [];
      if (attachments.length > 0) {
        setUploadingFiles(true);
        uploadedAttachments = await uploadAttachments(attachments);
        setUploadingFiles(false);
      }

      // Convertir entryType a formato snake_case para Supabase
      const entryTypeForDb = newEntryType === 'internalNote' ? 'internal_note' : 'feedback';

      const newEntry = {
        id: crypto.randomUUID(),
        content: newEntryContent,
        timestamp: new Date().toISOString(),
        creator_user_id: psychologistId,
        target_user_id: patientId,
        createdBy: 'PSYCHOLOGIST',
        createdByPsychologistId: psychologistId,
        entryType: entryTypeForDb,
        sentiment: 'neutral',
        attachments: uploadedAttachments
      };

      const response = await fetch(`${API_URL}/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(newEntry)
      });

      if (response.ok) {
        setNewEntryContent('');
        setAttachments([]);
        setShowAddModal(false);
        await loadEntries();
      } else {
        alert('Error al guardar la entrada');
      }
    } catch (error) {
      console.error('Error saving entry:', error);
      alert('Error al guardar la entrada');
    }
    setIsSaving(false);
  };

  const uploadAttachments = async (files: File[]): Promise<Attachment[]> => {
    const uploadedAttachments: Attachment[] = [];
    console.log('📤 Subiendo', files.length, 'archivos...');
    setUploadProgress({current: 0, total: files.length});

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({current: i + 1, total: files.length});
      try {
        console.log('📁 Procesando archivo:', file.name);
        // Leer archivo como base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Extraer solo la parte base64 (sin el prefijo data:...)
            const base64Data = result.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        console.log('✅ Archivo leído como base64, tamaño:', base64.length);

        const response = await fetch(`${API_URL}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileData: base64,
            userId: patientId,
            folder: 'patient-attachments'
          })
        });

        console.log('📡 Respuesta del servidor:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Archivo subido exitosamente:', data);
          uploadedAttachments.push({
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            url: data.url,
            size: file.size
          });
        } else {
          const errorText = await response.text();
          console.error('❌ Error en respuesta:', response.status, errorText);
        }
      } catch (error) {
        console.error('❌ Error uploading file:', file.name, error);
      }
    }

    console.log('✅ Archivos subidos:', uploadedAttachments.length, 'de', files.length);
    setUploadProgress({current: 0, total: 0});
    return uploadedAttachments;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachments([...attachments, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon size={16} className="text-blue-600" />;
    if (type.startsWith('audio/')) return <Music size={16} className="text-purple-600" />;
    if (type === 'application/pdf') return <FileText size={16} className="text-red-600" />;
    if (type.includes('word')) return <FileText size={16} className="text-blue-700" />;
    return <File size={16} className="text-slate-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getEntryIcon = (type?: string) => {
    switch (type) {
      case 'voiceSession':
        return <Mic className="text-indigo-600" size={20} />;
      case 'internalNote':
      case 'internal_note':
        return <MessageSquare className="text-slate-600" size={20} />;
      case 'feedback':
        return <ThumbsUp className="text-green-600" size={20} />;
      default:
        return <MessageSquare className="text-slate-400" size={20} />;
    }
  };

  const getEntryTypeLabel = (type?: string) => {
    switch (type) {
      case 'voiceSession':
        return 'Sesión de Voz';
      case 'internalNote':
      case 'internal_note':
        return 'Nota Interna';
      case 'feedback':
        return 'Feedback';
      default:
        return 'Entrada';
    }
  };

  const getEntryBgColor = (type?: string) => {
    switch (type) {
      case 'voiceSession':
        return 'bg-indigo-50 border-indigo-200';
      case 'internalNote':
      case 'internal_note':
        return 'bg-slate-50 border-slate-200';
      case 'feedback':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-white border-slate-200';
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Ayer ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `Hace ${diffDays} días`;
    } else {
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  };

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="text-base sm:text-lg font-bold text-slate-900">Timeline del Paciente</h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs sm:text-sm font-medium"
        >
          <Plus size={16} />
          <span>Nueva Entrada</span>
        </button>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="text-center py-8 sm:py-12 text-sm text-slate-500">Cargando timeline...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 sm:py-12 text-sm text-slate-500">
          No hay entradas todavía. Añade la primera entrada.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg border p-3 sm:p-4 ${getEntryBgColor(entry.entryType)}`}
            >
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-white rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                  {getEntryIcon(entry.entryType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-2">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-semibold text-slate-900">
                        {getEntryTypeLabel(entry.entryType)}
                      </span>
                      {entry.createdBy === 'PSYCHOLOGIST' && (
                        <span className="text-[9px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium">
                          Psicólogo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-slate-500">
                        <Clock size={12} className="sm:w-3.5 sm:h-3.5" />
                        <span className="whitespace-nowrap">{formatDate(entry.timestamp)}</span>
                      </div>
                      {/* Botón eliminar solo para internal_note y feedback creados por el usuario actual */}
                      {(() => {
                        const isInternalOrFeedback = entry.entryType === 'internal_note' || entry.entryType === 'internalNote' || entry.entryType === 'feedback';
                        const hasCurrentUser = !!currentUserId;
                        const isCreator = entry.creator_user_id === currentUserId;
                        const showButton = isInternalOrFeedback && hasCurrentUser && isCreator;
                        
                        console.log(`🗑️ Entry ${entry.id}:`, {
                          entryType: entry.entryType,
                          isInternalOrFeedback,
                          currentUserId,
                          creator_user_id: entry.creator_user_id,
                          hasCurrentUser,
                          isCreator,
                          showButton
                        });
                        
                        return showButton && (
                          <button
                            onClick={() => handleDeleteEntry(entry.id, entry.entryType || '')}
                            className="p-1 sm:p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                            title="Eliminar entrada"
                          >
                            <Trash2 size={12} className="sm:w-3.5 sm:h-3.5 text-slate-400 group-hover:text-red-600" />
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap break-words">
                    {entry.content}
                  </p>
                  
                  {/* Attachments */}
                  {entry.attachments && entry.attachments.length > 0 && (
                    <div className="mt-2 sm:mt-3 space-y-1.5 sm:space-y-2">
                      <div className="text-[10px] sm:text-xs font-semibold text-slate-600 flex items-center gap-1">
                        <Paperclip size={12} className="sm:w-3.5 sm:h-3.5" />
                        Archivos adjuntos ({entry.attachments.length})
                      </div>
                      <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                        {entry.attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center gap-2 sm:gap-3 bg-white rounded-lg border border-slate-200 p-2 sm:p-3 hover:border-slate-300 transition-colors"
                          >
                            <div className="flex-shrink-0">
                              {getFileIcon(attachment.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                                {attachment.name}
                              </div>
                              <div className="text-[10px] sm:text-xs text-slate-500">
                                {formatFileSize(attachment.size)}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                              {attachment.type.startsWith('image/') && (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                  title="Ver imagen"
                                >
                                  <Eye size={14} className="sm:w-4 sm:h-4 text-slate-600" />
                                </a>
                              )}
                              <a
                                href={attachment.url}
                                download={attachment.name}
                                className="p-1.5 sm:p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                title="Descargar"
                              >
                                <Download size={14} className="sm:w-4 sm:h-4 text-slate-600" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Image preview */}
                      {entry.attachments.some(a => a.type.startsWith('image/')) && (
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                          {entry.attachments
                            .filter(a => a.type.startsWith('image/'))
                            .map((attachment) => (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative group rounded-lg overflow-hidden border-2 border-slate-200 hover:border-indigo-400 transition-all aspect-square"
                              >
                                <img
                                  src={attachment.url}
                                  alt={attachment.name}
                                  className="w-full h-32 object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                  <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </a>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {entry.sentiment && entry.sentiment !== 'neutral' && (
                    <div className="mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        entry.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                        entry.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {entry.sentiment === 'positive' ? '😊 Positivo' :
                         entry.sentiment === 'negative' ? '😔 Negativo' :
                         '😐 Neutral'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Nueva Entrada</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Entry Type Selection */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tipo de Entrada</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewEntryType('internalNote')}
                    className={`flex items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      newEntryType === 'internalNote'
                        ? 'border-slate-600 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <MessageSquare size={20} className="text-slate-600" />
                    <span className="font-medium text-slate-900">Nota Interna</span>
                  </button>
                  <button
                    onClick={() => setNewEntryType('feedback')}
                    className={`flex items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      newEntryType === 'feedback'
                        ? 'border-green-600 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <ThumbsUp size={20} className="text-green-600" />
                    <span className="font-medium text-slate-900">Feedback</span>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Contenido</label>
                <textarea
                  value={newEntryContent}
                  onChange={(e) => setNewEntryContent(e.target.value)}
                  placeholder={
                    newEntryType === 'internalNote'
                      ? 'Escribe una nota privada sobre el paciente...'
                      : 'Escribe un feedback para el paciente...'
                  }
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  rows={8}
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Archivos Adjuntos</label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 hover:border-indigo-400 transition-colors">
                  <input
                    type="file"
                    id="file-upload"
                    multiple
                    accept="image/*,audio/*,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center cursor-pointer"
                  >
                    <Paperclip size={32} className="text-slate-400 mb-2" />
                    <span className="text-sm text-slate-600 font-medium">
                      Click para seleccionar archivos
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Imágenes, audios, PDFs, Word
                    </span>
                  </label>
                </div>

                {/* Selected files list */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 bg-slate-50 rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex-shrink-0">
                          {getFileIcon(file.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {file.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                        <button
                          onClick={() => removeAttachment(index)}
                          className="p-1 hover:bg-slate-200 rounded transition-colors"
                        >
                          <X size={16} className="text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  {newEntryType === 'internalNote' ? (
                    <>
                      <strong>Nota Interna:</strong> Solo visible para ti como psicólogo. El paciente no podrá ver esta entrada.
                    </>
                  ) : (
                    <>
                      <strong>Feedback:</strong> Esta entrada será visible para el paciente y puede ayudarle en su proceso terapéutico.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Upload Progress */}
            {uploadingFiles && uploadProgress.total > 0 && (
              <div className="px-6 pb-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                    <span className="text-sm font-medium text-indigo-900">
                      Subiendo archivos... {uploadProgress.current} de {uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-indigo-200 rounded-full h-2">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAttachments([]);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEntry}
                disabled={isSaving || uploadingFiles || !newEntryContent.trim()}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingFiles ? 'Subiendo archivos...' : isSaving ? 'Guardando...' : 'Guardar Entrada'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientTimeline;
