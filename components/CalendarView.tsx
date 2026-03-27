import React, { useState } from 'react';
import { JournalEntry } from '../types';
import { ChevronLeft, ChevronRight, Layers, Plus, Calendar as CalendarIcon, LayoutGrid, Clock, Lightbulb, FileText, MessageCircle, Mic, Heart, Smile, ChevronDown, ChevronUp, Sparkles, TrendingUp, Paperclip, Download, Eye, Image as ImageIcon, File, Music } from 'lucide-react';
import { decompressTranscript } from '../services/genaiService';

interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  url: string;
  size?: number;
}

const getAttachmentIcon = (type: string) => {
  if (type.startsWith('image/') || type === 'IMAGE') return <ImageIcon size={16} className="text-blue-600" />;
  if (type.startsWith('audio/') || type === 'AUDIO') return <Music size={16} className="text-purple-600" />;
  if (type === 'DOCUMENT' || type.includes('pdf') || type.includes('word') || type.includes('text')) return <FileText size={16} className="text-red-600" />;
  return <File size={16} className="text-slate-600" />;
};

const isImageType = (type: string) => type.startsWith('image/') || type === 'IMAGE';

const AttachmentList: React.FC<{ attachments: AttachmentItem[] }> = ({ attachments }) => (
  <div className="space-y-2">
    <div className="text-xs font-semibold text-slate-600 flex items-center gap-1">
      <Paperclip size={12} />
      Archivos adjuntos ({attachments.length})
    </div>
    <div className="grid grid-cols-1 gap-1.5">
      {attachments.map((att) => (
        <div key={att.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-2 hover:border-slate-300 transition-colors">
          <div className="flex-shrink-0">{getAttachmentIcon(att.type)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-900 truncate">{att.name}</div>
            {att.size != null && (
              <div className="text-[10px] text-slate-500">
                {att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / 1048576).toFixed(1)} MB`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isImageType(att.type) && (
              <a href={att.url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Ver imagen">
                <Eye size={14} className="text-slate-600" />
              </a>
            )}
            <a href={att.url} download={att.name} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="Descargar">
              <Download size={14} className="text-slate-600" />
            </a>
          </div>
        </div>
      ))}
    </div>
    {attachments.some(a => isImageType(a.type)) && (
      <div className="grid grid-cols-2 gap-1.5 mt-1">
        {attachments.filter(a => isImageType(a.type)).map((att) => (
          <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer"
            className="relative group rounded-lg overflow-hidden border-2 border-slate-200 hover:border-indigo-400 transition-all aspect-square">
            <img src={att.url} alt={att.name} className="w-full h-32 object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </a>
        ))}
      </div>
    )}
  </div>
);

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
  onSelectEntry?: (entry: JournalEntry) => void;
  currentUserId?: string;
}

const CalendarView: React.FC<CalendarViewProps> = ({ entries, onSelectDate, onSelectEntry, currentUserId }) => {
  const [expandedTranscripts, setExpandedTranscripts] = useState<{ [key: string]: boolean }>({});
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: { advice: boolean; feedback: boolean } }>({});

  // Toggle transcript visibility for a specific entry
  const toggleTranscript = (entryId: string) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  const toggleSection = (entryId: string, section: 'advice' | 'feedback') => {
    setExpandedSections(prev => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [section]: !prev[entryId]?.[section]
      }
    }));
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days} días`;
    
    const date = new Date(timestamp);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

    const listEntries = [...entries]
      .filter(e => {
        // Verificar que la entrada pertenece al usuario actual
        const isForCurrentUser = e.target_user_id === currentUserId || e.userId === currentUserId;
        if (!isForCurrentUser) return false;
        
        const entryType = e.entry_type || e.entryType;
        // Mostrar sesiones de voz y feedback
        if (entryType === 'voice_session' || entryType === 'voiceSession') return true;
        if (entryType === 'feedback') return true;
        // NO mostrar otros tipos
        return false;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="max-w-2xl mx-auto">
      {/* Feed Container */}
      <div className="space-y-3 md:space-y-4">
        {listEntries.length === 0 ? (
          <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 p-8 md:p-12 text-center">
            <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-4 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center">
              <Sparkles className="w-10 h-10 md:w-12 md:h-12 text-purple-600" />
            </div>
            <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-2">Tu historia comienza aquí</h3>
            <p className="text-sm md:text-base text-slate-500 max-w-md mx-auto">
              Comienza hablando con la IA para crear tu primera entrada y comenzar tu viaje de autodescubrimiento
            </p>
          </div>
        ) : (
          listEntries.map((entry) => {
            const entryDate = new Date(entry.timestamp);
            const entryType = entry.entry_type || entry.entryType;
            const isVoiceSession = entryType === 'voice_session' || entryType === 'voiceSession';
            const isFeedback = entryType === 'feedback';
            
            // Debug: ver qué campos tiene la entrada
            if (isVoiceSession) {
              const decompressedTranscript = entry.transcript ? decompressTranscript(entry.transcript) : '';
              console.log('📝 VoiceSession entry:', {
                id: entry.id,
                hasSummary: !!entry.summary,
                summaryPreview: entry.summary?.substring(0, 50),
                hasTranscript: !!entry.transcript,
                transcriptLength: entry.transcript?.length || 0,
                decompressedTranscriptLength: decompressedTranscript?.length || 0,
                transcriptPreview: decompressedTranscript?.substring(0, 100),
                hasAdvice: !!entry.advice,
                emotions: entry.emotions
              });
            }
            
            // Para entradas de tipo feedback, el contenido está en entry.content
            // Para feedback adjunto a voice sessions, está en psychologistFeedback
            const feedback = isFeedback && entry.content
              ? { text: entry.content, attachments: (entry as any).attachments || [] }
              : typeof entry.psychologistFeedback === 'string'
              ? { text: entry.psychologistFeedback, attachments: [] }
              : entry.psychologistFeedback && typeof entry.psychologistFeedback === 'object'
              ? { text: (entry.psychologistFeedback as any).text || '', attachments: (entry.psychologistFeedback as any).attachments || [] }
              : null;

            const showTranscript = expandedTranscripts[entry.id] || false;
            const isAdviceExpanded = expandedSections[entry.id]?.advice || false;
            const isFeedbackExpanded = expandedSections[entry.id]?.feedback || false;

            return (
              <article
                key={entry.id}
                className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Card Header - Estilo redes sociales */}
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar/Icon */}
                      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isFeedback 
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                          : 'bg-gradient-to-br from-purple-500 to-pink-600'
                      }`}>
                        {isFeedback ? (
                          <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
                        ) : (
                          <Mic className="w-5 h-5 md:w-6 md:h-6 text-white" />
                        )}
                      </div>
                      
                      {/* Tipo y timestamp */}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm md:text-base text-slate-900">
                          {isFeedback ? 'Feedback de tu psicólogo' : 'Tu sesión con IA'}
                        </div>
                        <div className="text-xs md:text-sm text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          {getTimeAgo(entry.timestamp)}
                        </div>
                      </div>
                    </div>

                    {/* Sin badge de puntuación - Solo emociones se mantienen */}
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 md:p-6 space-y-3 md:space-y-4">
                  
                  {/* Feedback Content */}
                  {isFeedback && feedback?.text && (
                    <div className="prose prose-sm md:prose-base max-w-none">
                      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{feedback.text}</p>
                    </div>
                  )}
                  {isFeedback && feedback?.attachments && feedback.attachments.length > 0 && (
                    <AttachmentList attachments={feedback.attachments as any[]} />
                  )}

                  {/* Voice Session Content */}
                  {isVoiceSession && (
                    <>
                      {/* Resumen del Día - Destacado */}
                      {entry.summary && (
                        <div className="border border-purple-200 rounded-xl md:rounded-2xl overflow-hidden bg-gradient-to-br from-purple-50 to-indigo-50 p-4 md:p-5">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-200 flex items-center justify-center">
                              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-purple-700" />
                            </div>
                            <span className="font-semibold text-sm md:text-base text-purple-900">Resumen de tu día</span>
                          </div>
                          <div className="prose prose-sm md:prose-base max-w-none">
                            <p className="text-slate-800 leading-relaxed">{entry.summary}</p>
                          </div>
                        </div>
                      )}

                      {/* Emociones - Pills style (sin duplicados) */}
                      {entry.emotions && entry.emotions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Array.from(new Set(entry.emotions)).slice(0, 6).map((em, idx) => (
                            <span 
                              key={`${em}-${idx}`} 
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs md:text-sm font-medium"
                            >
                              <Heart className="w-3 h-3 md:w-3.5 md:h-3.5 text-pink-500" />
                              {em}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Consejo - Collapsible */}
                      {entry.advice && (
                        <div className="border border-amber-200 rounded-xl md:rounded-2xl overflow-hidden bg-gradient-to-br from-amber-50 to-yellow-50">
                          <button
                            onClick={() => toggleSection(entry.id, 'advice')}
                            className="w-full px-4 py-3 md:px-5 md:py-4 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-200 flex items-center justify-center">
                                <Lightbulb className="w-4 h-4 md:w-5 md:h-5 text-amber-700" />
                              </div>
                              <span className="font-semibold text-sm md:text-base text-amber-900">Consejo de la IA</span>
                            </div>
                            {isAdviceExpanded ? (
                              <ChevronUp className="w-5 h-5 text-amber-600" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-amber-600" />
                            )}
                          </button>
                          {isAdviceExpanded && (
                            <div className="px-4 pb-4 md:px-5 md:pb-5 pt-2">
                              <p className="text-sm md:text-base text-slate-700 leading-relaxed">{entry.advice}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Feedback del psicólogo - Collapsible */}
                      {feedback?.text && (
                        <div className="border border-indigo-200 rounded-xl md:rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-50 to-blue-50">
                          <button
                            onClick={() => toggleSection(entry.id, 'feedback')}
                            className="w-full px-4 py-3 md:px-5 md:py-4 flex items-center justify-between hover:bg-indigo-100/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-200 flex items-center justify-center">
                                <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-indigo-700" />
                              </div>
                              <span className="font-semibold text-sm md:text-base text-indigo-900">Feedback del Psicólogo</span>
                            </div>
                            {isFeedbackExpanded ? (
                              <ChevronUp className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-indigo-600" />
                            )}
                          </button>
                          {isFeedbackExpanded && (
                            <div className="px-4 pb-4 md:px-5 md:pb-5 pt-2 space-y-3">
                              <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-wrap">{feedback.text}</p>
                              {feedback?.attachments && feedback.attachments.length > 0 && (
                                <AttachmentList attachments={feedback.attachments as any[]} />
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Transcripción - Collapsible */}
                      {entry.transcript && entry.transcript.trim().length > 0 && (
                        <div className="border border-slate-200 rounded-xl md:rounded-2xl overflow-hidden bg-slate-50">
                          <button
                            onClick={() => toggleTranscript(entry.id)}
                            className="w-full px-4 py-3 md:px-5 md:py-4 flex items-center justify-between hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center gap-2 md:gap-3">
                              <FileText className="w-4 h-4 md:w-5 md:h-5 text-slate-600" />
                              <span className="font-medium text-sm md:text-base text-slate-700">Ver transcripción completa</span>
                            </div>
                            {showTranscript ? (
                              <ChevronUp className="w-5 h-5 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-500" />
                            )}
                          </button>
                          {showTranscript && (
                            <div className="px-4 pb-4 md:px-5 md:pb-5 pt-2 bg-white border-t border-slate-200">
                              <div className="max-h-60 md:max-h-80 overflow-y-auto">
                                <p className="text-xs md:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{decompressTranscript(entry.transcript)}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Card Footer - Metadata */}
                <div className="px-4 md:px-6 py-3 bg-slate-50 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs md:text-sm text-slate-500">
                    <span>
                      {entryDate.toLocaleDateString('es-ES', { 
                        day: 'numeric', 
                        month: 'long',
                        year: entryDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                      })}
                    </span>
                    <span>{entryDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CalendarView;