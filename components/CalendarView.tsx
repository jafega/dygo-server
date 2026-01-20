import React, { useState } from 'react';
import { JournalEntry } from '../types';
import { ChevronLeft, ChevronRight, Layers, Plus, Calendar as CalendarIcon, LayoutGrid, Clock, Lightbulb, FileText, MessageCircle } from 'lucide-react';

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
  onSelectEntry?: (entry: JournalEntry) => void;
  currentUserId?: string;
}

type ViewMode = 'MONTH' | 'WEEK' | 'LIST';

const CalendarView: React.FC<CalendarViewProps> = ({ entries, onSelectDate, onSelectEntry, currentUserId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [expandedTranscripts, setExpandedTranscripts] = useState<{ [key: string]: boolean }>({});

  // Toggle transcript visibility for a specific entry
  const toggleTranscript = (entryId: string) => {
    setExpandedTranscripts(prev => ({
      ...prev,
      [entryId]: !prev[entryId]
    }));
  };

  // Helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay(); // 0 = Sunday
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const dayNamesFull = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // --- Date Logic ---
  
  // Navigation
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'MONTH') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'WEEK') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      return;
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'MONTH') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'WEEK') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      return;
    }
    setCurrentDate(newDate);
  };

  // Grid Generation
  let daysToRender: { day: number; date: Date; isCurrentMonth: boolean }[] = [];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  if (viewMode === 'MONTH') {
      const daysInMonth = getDaysInMonth(year, month);
      const firstDay = getFirstDayOfMonth(year, month);
      
      // Blanks for prev month
      for (let i = 0; i < firstDay; i++) {
        daysToRender.push({ day: 0, date: new Date(year, month, 1 - (firstDay - i)), isCurrentMonth: false });
      }
      
      // Days of current month
      for (let i = 1; i <= daysInMonth; i++) {
        daysToRender.push({ day: i, date: new Date(year, month, i), isCurrentMonth: true });
      }
  } else if (viewMode === 'WEEK') {
      // WEEK VIEW logic
      // Find the Sunday of the current week based on currentDate
      const dayOfWeek = currentDate.getDay(); // 0 (Sun) to 6 (Sat)
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

      for (let i = 0; i < 7; i++) {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + i);
          daysToRender.push({ 
              day: d.getDate(), 
              date: d, 
              isCurrentMonth: true // Always true visually for week strip
          });
      }
  }

  // --- Rendering Helpers ---

  const getEntriesForDate = (date: Date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return entries
      .filter(e => e.date === dateStr)
      .filter(e => {
        // Mostrar entradas del usuario (diario)
        if (e.createdBy !== 'PSYCHOLOGIST') return true;
        // Mostrar sesiones y feedback del psicólogo
        if (e.psychologistEntryType === 'SESSION' || e.psychologistEntryType === 'FEEDBACK') return true;
        // NO mostrar notas internas
        return false;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  };

  const getEntryLabel = (entry: JournalEntry) => {
    if (entry.createdBy === 'PSYCHOLOGIST') {
      if (entry.psychologistEntryType === 'SESSION') return 'Sesión';
      if (entry.psychologistEntryType === 'FEEDBACK') return 'Feedback';
      // Solo mostrar "Nota interna" si el usuario actual es el creador
      return entry.creator_user_id === currentUserId ? 'Nota interna' : null;
    }
    return 'Diario';
  };

    const getHeaderText = () => {
      if (viewMode === 'MONTH') {
        return `${monthNames[month]} ${year}`;
      }
      if (viewMode === 'WEEK') {
        // Week header: "12 - 18 Enero"
        const first = daysToRender[0].date;
        const last = daysToRender[6].date;
        const m1 = monthNames[first.getMonth()];
        const m2 = monthNames[last.getMonth()];
          
        if (m1 === m2) return `${first.getDate()} - ${last.getDate()} ${m1}`;
        return `${first.getDate()} ${m1.substring(0,3)} - ${last.getDate()} ${m2.substring(0,3)}`;
      }
      return 'Entradas';
    };

    const listEntries = [...entries]
      .filter(e => {
        // Mostrar entradas del usuario (diario)
        if (e.createdBy !== 'PSYCHOLOGIST') return true;
        // Mostrar sesiones y feedback del psicólogo
        if (e.psychologistEntryType === 'SESSION' || e.psychologistEntryType === 'FEEDBACK') return true;
        // Mostrar notas internas solo si el usuario actual es el creador
        if (e.creator_user_id === currentUserId) return true;
        return false;
      })
      .sort((a, b) => b.timestamp - a.timestamp);

  return (
  <>
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 transition-all duration-300">

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        
        {/* Title & Arrows */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          {viewMode !== 'LIST' && <button onClick={handlePrev} className="p-2 rounded-full text-slate-600 transition-colors hover:bg-slate-100"><ChevronLeft size={20}/></button>}
          <h2 className="text-lg md:text-xl font-bold text-slate-800 w-32 md:w-48 text-center capitalize">{getHeaderText()}</h2>
          {viewMode !== 'LIST' && <button onClick={handleNext} className="p-2 rounded-full text-slate-600 transition-colors hover:bg-slate-100"><ChevronRight size={20}/></button>}
        </div>

        {/* View Toggle */}
        <div className="bg-slate-100 p-1 rounded-lg flex shrink-0">
          <button 
            onClick={() => setViewMode('LIST')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'LIST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid size={14} /> Lista
          </button>
          <button 
            onClick={() => setViewMode('WEEK')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'WEEK' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers size={14} /> Semana
          </button>
          <button 
            onClick={() => setViewMode('MONTH')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'MONTH' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <CalendarIcon size={14} /> Calendario
          </button>
        </div>
      </div>

      {/* Weekday Names (Only for Month View) */}
      {viewMode === 'MONTH' && (
        <div className="grid grid-cols-7 gap-2 mb-2 text-center">
            {dayNamesShort.map(d => (
            <div key={d} className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wide">{d}</div>
            ))}
        </div>
      )}

      {/* Content Container */}
      {viewMode === 'LIST' ? (
        <div className="flex flex-col gap-6">
          {listEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Aún no hay entradas.</div>
          ) : (
            listEntries.map((entry) => {
              const entryDate = new Date(entry.timestamp);
              const isPsychEntry = entry.createdBy === 'PSYCHOLOGIST';
              const isSession = entry.psychologistEntryType === 'SESSION';
              const isFeedback = entry.psychologistEntryType === 'FEEDBACK';
              const psychEntryLabel = isSession ? 'Sesión Clínica' : isFeedback ? 'Feedback Clínico' : 'Nota Clínica';
              
              // Parse psychologist note and feedback
              const internalNote = typeof entry.psychologistNote === 'string' 
                ? { text: entry.psychologistNote, attachments: [] } 
                : entry.psychologistNote;
              const feedback = typeof entry.psychologistFeedback === 'string' 
                ? { text: entry.psychologistFeedback, attachments: [] } 
                : entry.psychologistFeedback;

              const showTranscript = expandedTranscripts[entry.id] || false;

              return (
                <div
                  key={entry.id}
                  className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {entryDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={12} /> {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Entry Type Badge */}
                  <div className="mb-4">
                    {isPsychEntry ? (
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${
                        isSession 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' 
                          : isFeedback
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {psychEntryLabel}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                        Entrada de Diario
                      </span>
                    )}
                  </div>

                  {/* Para Feedback Clínico: solo mostrar el feedback */}
                  {isFeedback ? (
                    <>
                      {/* Psychologist Feedback */}
                      {feedback?.text && (
                        <div className="mb-4">
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <h4 className="text-xs font-bold uppercase text-indigo-700 mb-2 flex items-center gap-1">
                              <MessageCircle size={12} /> Feedback del Psicólogo
                            </h4>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{feedback.text}</p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Sentiment Score (no mostrar para feedback) */}
                      {typeof entry.sentimentScore === 'number' && (
                        <div className="mb-3">
                          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                            entry.sentimentScore >= 7 
                              ? 'bg-green-50 text-green-700 border-green-200' 
                              : entry.sentimentScore >= 4 
                              ? 'bg-yellow-50 text-yellow-700 border-yellow-200' 
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            Estado de ánimo: {entry.sentimentScore}/10
                          </span>
                        </div>
                      )}

                      {/* Summary (no mostrar para feedback) */}
                      <div className="mb-4">
                        <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Resumen</h4>
                        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{entry.summary}</p>
                      </div>

                      {/* Emotions (no mostrar para feedback) */}
                      {entry.emotions && entry.emotions.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Emociones</h4>
                          <div className="flex flex-wrap gap-2">
                            {entry.emotions.map((em) => (
                              <span key={em} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 font-medium">
                                {em}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Advice (no mostrar para feedback) */}
                      {entry.advice && (
                        <div className="mb-4">
                          <h4 className="text-xs font-bold uppercase text-slate-400 mb-2 flex items-center gap-1">
                            <Lightbulb size={12} /> Consejo
                          </h4>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{entry.advice}</p>
                        </div>
                      )}

                      {/* Psychologist Feedback (para otros tipos de entrada) */}
                      {feedback?.text && (
                        <div className="mb-4">
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                            <h4 className="text-xs font-bold uppercase text-indigo-700 mb-2 flex items-center gap-1">
                              <MessageCircle size={12} /> Feedback del Psicólogo
                            </h4>
                            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{feedback.text}</p>
                          </div>
                        </div>
                      )}

                      {/* Transcript con botón toggle para sesiones clínicas */}
                      {entry.transcript && entry.transcript.length > 50 && (
                        <div>
                          <button
                            onClick={() => toggleTranscript(entry.id)}
                            className="text-xs font-semibold text-slate-600 hover:text-slate-800 flex items-center gap-2 mb-2 transition-colors"
                          >
                            {showTranscript ? '▼' : '▶'} {showTranscript ? 'Ocultar' : 'Mostrar'} transcripción
                          </button>
                          {showTranscript && (
                            <>
                              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Transcripción</h4>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{entry.transcript}</p>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
      <div className={viewMode === 'MONTH' ? "grid grid-cols-7 gap-1 md:gap-2" : "flex flex-col gap-3"}>
        {daysToRender.map((item, i) => {
          
          // Blank days for Month View
          if (!item.isCurrentMonth && viewMode === 'MONTH' && item.day === 0) {
              return <div key={`blank-${i}`} className="h-24 md:h-32" />;
          }

          const dayEntries = getEntriesForDate(item.date);
          const dateStr = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}-${String(item.date.getDate()).padStart(2, '0')}`;
          
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const isToday = todayStr === dateStr;
          
          // Avg Score
          let avgScore = 0;
          if (dayEntries.length > 0) {
            avgScore = dayEntries.reduce((acc, curr) => acc + curr.sentimentScore, 0) / dayEntries.length;
          }

          const previewEntries = dayEntries.slice(0, 3);

          // --- WEEK VIEW RENDER (Horizontal Cards) ---
          if (viewMode === 'WEEK') {
              return (
                  <div 
                    key={`${dateStr}-${i}`}
                    onClick={() => onSelectDate && onSelectDate(dateStr)}
                    className={`
                        relative w-full flex flex-row items-stretch rounded-xl border transition-all cursor-pointer group hover:shadow-md min-h-[100px]
                        ${isToday ? 'border-indigo-400 ring-1 ring-indigo-400 bg-indigo-50/20' : 'border-slate-200 bg-white'}
                    `}
                  >
                      {/* Left: Date Column */}
                      <div className={`w-20 sm:w-24 shrink-0 flex flex-col items-center justify-center border-r p-2 ${isToday ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                          <span className={`text-xs font-bold uppercase tracking-wide mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                              {dayNamesShort[item.date.getDay()]}
                          </span>
                          <span className={`text-2xl sm:text-3xl font-bold ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                              {item.day}
                          </span>
                          {dayEntries.length > 0 && (
                             <div className={`mt-2 w-2 h-2 rounded-full ${avgScore >= 7 ? 'bg-green-400' : avgScore >= 4 ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
                          )}
                      </div>

                      {/* Right: Content */}
                        <div className="flex-1 p-3 sm:p-4 flex flex-col justify-center">
                          {previewEntries.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <Clock size={12} /> {new Date(previewEntries[0].timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </span>
                                {dayEntries.length > previewEntries.length && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                                    +{dayEntries.length - previewEntries.length} más
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1">
                                {previewEntries.map((entry, idx) => (
                                  <div key={`${entry.id}-${idx}`} className="text-xs text-slate-700 line-clamp-1">
                                    <span className="text-[10px] font-semibold text-slate-500 mr-1">{getEntryLabel(entry)}:</span>
                                    {entry.summary}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                              <div className="h-full flex items-center text-slate-300 text-sm italic">
                                  {isToday ? (
                                      <span className="text-indigo-400 font-medium flex items-center gap-2">
                                          <Plus size={16} /> Añadir entrada hoy
                                      </span>
                                  ) : "Sin entradas"}
                              </div>
                          )}
                      </div>
                      
                      {/* Sentiment Color Stripe on far right */}
                      {dayEntries.length > 0 && (
                          <div className={`w-1.5 shrink-0 rounded-r-xl ${avgScore >= 7 ? 'bg-green-400' : avgScore >= 4 ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
                      )}
                  </div>
              );
          }

          // --- MONTH VIEW RENDER (Vertical Grid Cards) ---
          return (
            <div 
              key={`${dateStr}-${i}`}
              onClick={() => onSelectDate && onSelectDate(dateStr)}
              className={`
                relative flex flex-col justify-between transition-all cursor-pointer overflow-hidden group rounded-xl border h-24 md:h-32
                ${isToday ? 'border-indigo-400 ring-1 ring-indigo-400 bg-indigo-50/30' : 'border-slate-100 hover:border-slate-300 hover:shadow-md bg-white'}
                ${dayEntries.length > 0 ? 'bg-gradient-to-br from-white to-slate-50' : ''}
              `}
            >
              {/* Header: Date + Dot */}
              <div className="flex justify-between items-start shrink-0 p-1.5 md:p-2">
                  <span className={`text-xs md:text-sm font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-600'}`}>{item.day}</span>
                  {dayEntries.length > 0 && (
                      <div className="flex items-center gap-0.5">
                          {dayEntries.length > 1 && <div className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1 rounded-full">+{dayEntries.length - 1}</div>}
                          <div className={`w-2 h-2 rounded-full ${avgScore >= 7 ? 'bg-green-400' : avgScore >= 4 ? 'bg-yellow-400' : 'bg-red-400'}`}></div>
                      </div>
                  )}
              </div>
              
              {/* Content: Summary */}
              <div className="flex-1 p-1.5 md:p-2 pt-0 flex flex-col">
                  {dayEntries.length > 0 ? (
                    <div className="flex flex-col gap-1 items-start h-full overflow-hidden">
                      {dayEntries.slice(0, 2).map((entry, idx) => (
                        <div key={`${entry.id}-${idx}`} className="text-[9px] md:text-xs text-slate-600 leading-tight w-full text-left line-clamp-2">
                          <span className="font-semibold text-slate-500 mr-1">{getEntryLabel(entry)}:</span>
                          {entry.summary}
                        </div>
                      ))}
                    </div>
                  ) : (
                      <div className="flex-1"></div>
                  )}
              </div>
              
              {/* Hover Overlay */}
              {isToday && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-slate-50/90 text-xs text-indigo-600 font-bold transition-opacity backdrop-blur-[1px]">
                  <Plus size={16} className="mb-0.5" />
                  {dayEntries.length > 0 ? 'Añadir' : 'Escribir'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  </>
  );
};

export default CalendarView;