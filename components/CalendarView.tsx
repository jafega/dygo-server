import React, { useState } from 'react';
import { JournalEntry } from '../types';
import { ChevronLeft, ChevronRight, Layers, Plus, Calendar as CalendarIcon, LayoutGrid, Clock, Lightbulb, FileText, MessageCircle, Mic, Heart, Smile } from 'lucide-react';

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
  onSelectEntry?: (entry: JournalEntry) => void;
  currentUserId?: string;
}

const CalendarView: React.FC<CalendarViewProps> = ({ entries, onSelectDate, onSelectEntry, currentUserId }) => {
  const [expandedTranscripts, setExpandedTranscripts] = useState<{ [key: string]: boolean }>({});

  // Toggle transcript visibility for a specific entry
  const toggleTranscript = (entryId: string) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
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
      .sort((a, b) => b.timestamp - a.timestamp);

  return (
  <>
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 transition-all duration-300">

      {/* Content Container - Solo vista de lista */}
      <div className="flex flex-col gap-4">
          {listEntries.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <div className="mb-4">
                <svg className="w-20 h-20 mx-auto opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-lg font-medium">No hay entradas aún</p>
              <p className="text-sm mt-2">Comienza hablando con la IA para crear tu primera entrada</p>
            </div>
          ) : (
            listEntries.map((entry) => {
              const entryDate = new Date(entry.timestamp);
              const entryType = entry.entry_type || entry.entryType;
              const isVoiceSession = entryType === 'voice_session' || entryType === 'voiceSession';
              const isFeedback = entryType === 'feedback';
              
              const feedback = typeof entry.psychologistFeedback === 'string' 
                ? { text: entry.psychologistFeedback, attachments: [] } 
                : entry.psychologistFeedback;

              const showTranscript = expandedTranscripts[entry.id] || false;

              return (
                <div
                  key={entry.id}
                  className={`bg-gradient-to-br rounded-2xl p-5 md:p-6 shadow-sm border transition-all hover:shadow-md ${
                    isFeedback 
                      ? 'from-blue-50 to-indigo-50 border-indigo-200' 
                      : 'from-white to-purple-50/30 border-slate-200'
                  }`}
                >
                  {/* Header con fecha y tipo */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {isFeedback ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-full">
                            <MessageCircle size={14} /> Feedback del Psicólogo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-purple-700 bg-purple-100 px-3 py-1.5 rounded-full">
                            <Mic size={14} /> Sesión con IA
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 mt-2">
                        {entryDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        <span className="text-slate-400 ml-2">•</span>
                        <span className="ml-2">{entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    {/* Puntuación de ánimo */}
                    {!isFeedback && typeof entry.sentimentScore === 'number' && (
                      <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-lg border-2 ${
                        entry.sentimentScore >= 7 
                          ? 'bg-green-50 text-green-700 border-green-300' 
                          : entry.sentimentScore >= 4 
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-300' 
                          : 'bg-red-50 text-red-700 border-red-300'
                      }`}>
                        <Smile size={20} />
                        {entry.sentimentScore}/10
                      </div>
                    )}
                  </div>

                  {/* Contenido específico para Feedback */}
                  {isFeedback && feedback?.text && (
                    <div className="bg-white/70 backdrop-blur-sm rounded-xl p-5 border border-indigo-100">
                      <p className="text-base text-slate-800 leading-relaxed whitespace-pre-wrap">{feedback.text}</p>
                    </div>
                  )}

                  {/* Contenido específico para Voice Session */}
                  {isVoiceSession && (
                    <div className="space-y-4">
                      {/* Resumen */}
                      {entry.summary && (
                        <div className="bg-white/70 backdrop-blur-sm rounded-xl p-5 border border-slate-200">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText size={16} className="text-purple-600" />
                            <h4 className="text-sm font-bold text-slate-700">Resumen</h4>
                          </div>
                          <p className="text-base text-slate-800 leading-relaxed">{entry.summary}</p>
                        </div>
                      )}

                      {/* Emociones */}
                      {entry.emotions && entry.emotions.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
                            <Heart size={16} className="text-pink-500" /> Emociones detectadas
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {entry.emotions.map((em, idx) => (
                              <span key={`${em}-${idx}`} className="px-4 py-2 bg-white text-slate-700 rounded-full border-2 border-purple-200 font-medium text-sm hover:bg-purple-50 transition-colors">
                                {em}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Consejo */}
                      {entry.advice && (
                        <div className="bg-amber-50 rounded-xl p-5 border-2 border-amber-200">
                          <div className="flex items-center gap-2 mb-3">
                            <Lightbulb size={18} className="text-amber-600" />
                            <h4 className="text-sm font-bold text-amber-800">Consejo de la IA</h4>
                          </div>
                          <p className="text-base text-slate-800 leading-relaxed">{entry.advice}</p>
                        </div>
                      )}

                      {/* Feedback del psicólogo (si existe en sesión de voz) */}
                      {feedback?.text && (
                        <div className="bg-indigo-50 rounded-xl p-5 border-2 border-indigo-200">
                          <div className="flex items-center gap-2 mb-3">
                            <MessageCircle size={18} className="text-indigo-600" />
                            <h4 className="text-sm font-bold text-indigo-800">Feedback del Psicólogo</h4>
                          </div>
                          <p className="text-base text-slate-800 leading-relaxed whitespace-pre-wrap">{feedback.text}</p>
                        </div>
                      )}

                      {/* Transcripción (colapsable) */}
                      {entry.transcript && entry.transcript.length > 50 && (
                        <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                          <button
                            onClick={() => toggleTranscript(entry.id)}
                            className="w-full px-5 py-3 text-left font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <FileText size={16} />
                              Transcripción completa
                            </span>
                            <span className="text-slate-400">{showTranscript ? '▼' : '▶'}</span>
                          </button>
                          {showTranscript && (
                            <div className="px-5 py-4 border-t border-slate-200 bg-white">
                              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">{entry.transcript}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
    </div>
  </>
  );
};

export default CalendarView;