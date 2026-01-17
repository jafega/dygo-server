import React, { useState, useEffect } from 'react';
import { JournalEntry } from '../types';
import { ChevronLeft, ChevronRight, Layers, Plus, Calendar as CalendarIcon, LayoutGrid, Clock, Video, MapPin, User, X } from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { API_URL } from '../services/config';
import { formatDate, formatTime, formatDateWithWeekday } from '../services/dateUtils';

interface Session {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available';
  notes?: string;
  meetLink?: string;
}

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
  onSelectEntry?: (entry: JournalEntry) => void;
}

type ViewMode = 'MONTH' | 'WEEK' | 'LIST';

const CalendarView: React.FC<CalendarViewProps> = ({ entries, onSelectDate, onSelectEntry }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [patientSessions, setPatientSessions] = useState<Session[]>([]);
  const [psychologistId, setPsychologistId] = useState<string | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadPatientData = async () => {
      const user = getCurrentUser();
      if (!user || user.role !== 'PATIENT') return;
      
      // Get assigned psychologist
      if (user.accessList && user.accessList.length > 0) {
        setPsychologistId(user.accessList[0]);
        
        // Load patient sessions
        try {
          const response = await fetch(`${API_URL}/sessions?patientId=${user.id}`);
          if (response.ok) {
            const sessions = await response.json();
            setPatientSessions(sessions.filter((s: Session) => s.status === 'scheduled' || s.status === 'completed'));
          }
        } catch (err) {
          console.error('Error loading patient sessions:', err);
        }
      }
    };
    
    loadPatientData();
  }, []);

  const loadAvailability = async () => {
    if (!psychologistId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions?psychologistId=${psychologistId}`);
      if (response.ok) {
        const sessions = await response.json();
        setAvailableSlots(sessions.filter((s: Session) => s.status === 'available'));
        setShowAvailability(true);
      }
    } catch (err) {
      console.error('Error loading availability:', err);
      alert('Error al cargar la disponibilidad');
    } finally {
      setIsLoading(false);
    }
  };

  const bookSession = async (slotId: string) => {
    const user = getCurrentUser();
    if (!user) return;
    
    try {
      const response = await fetch(`${API_URL}/sessions/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'scheduled',
          patientId: user.id,
          patientName: user.name
        })
      });
      
      if (response.ok) {
        alert('¡Cita reservada exitosamente!');
        setShowAvailability(false);
        // Reload sessions
        const sessionsResponse = await fetch(`${API_URL}/sessions?patientId=${user.id}`);
        if (sessionsResponse.ok) {
          const sessions = await sessionsResponse.json();
          setPatientSessions(sessions.filter((s: Session) => s.status === 'scheduled' || s.status === 'completed'));
        }
      }
    } catch (err) {
      console.error('Error booking session:', err);
      alert('Error al reservar la cita');
    }
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
    return entries.filter(e => e.date === dateStr).sort((a, b) => b.timestamp - a.timestamp);
  };

  const getEntryLabel = (entry: JournalEntry) => {
    if (entry.createdBy === 'PSYCHOLOGIST') {
      if (entry.psychologistEntryType === 'SESSION') return 'Sesión';
      if (entry.psychologistEntryType === 'FEEDBACK') return 'Feedback';
      return 'Nota interna';
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
      .filter(e => e.createdBy !== 'PSYCHOLOGIST' || e.psychologistEntryType === 'SESSION')
      .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="relative">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 transition-all duration-300">
      
      {/* Patient Appointments Section */}
      {psychologistId && patientSessions.length > 0 && (
        <div className="mb-6 pb-6 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4">
            <User size={16} /> Mis Próximas Citas
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {patientSessions.map(session => (
                <div key={session.id} className="p-3 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {session.type === 'online' ? (
                        <Video size={14} className="text-indigo-600" />
                      ) : (
                        <MapPin size={14} className="text-purple-600" />
                      )}
                      <span className="text-xs font-semibold text-slate-700">
                        {session.type === 'online' ? 'Online' : 'Presencial'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      session.status === 'scheduled' ? 'bg-green-100 text-green-700' :
                      session.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {session.status === 'scheduled' ? 'Programada' :
                       session.status === 'completed' ? 'Completada' : 'Cancelada'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    {formatDateWithWeekday(session.date)}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {session.startTime} - {session.endTime}
                  </div>
                  {session.meetLink && session.status === 'scheduled' && (
                    <a
                      href={session.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                    >
                      <Video size={12} /> Unirse a la videollamada
                    </a>
                  )}
                </div>
              ))}
            </div>
        </div>
      )}

      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        
        {/* Title & Arrows */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <button onClick={handlePrev} disabled={viewMode === 'LIST'} className={`p-2 rounded-full text-slate-600 transition-colors ${viewMode === 'LIST' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`}><ChevronLeft size={20}/></button>
          <h2 className="text-lg md:text-xl font-bold text-slate-800 w-32 md:w-48 text-center capitalize">{getHeaderText()}</h2>
          <button onClick={handleNext} disabled={viewMode === 'LIST'} className={`p-2 rounded-full text-slate-600 transition-colors ${viewMode === 'LIST' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`}><ChevronRight size={20}/></button>
        </div>

        {/* Right side: Book Appointment Button + View Toggle */}
        <div className="flex items-center gap-3">
          {/* Book Appointment Button for Patients */}
          {psychologistId && (
            <button
              onClick={loadAvailability}
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
            >
              <CalendarIcon size={16} />
              {isLoading ? 'Cargando...' : 'Reservar Hora'}
            </button>
          )}

          {/* View Toggle */}
          <div className="bg-slate-100 p-1 rounded-lg flex shrink-0">
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
                <CalendarIcon size={14} /> Mes
            </button>
          <button 
            onClick={() => setViewMode('LIST')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'LIST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid size={14} /> Lista
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
        <div className="flex flex-col gap-3">
          {listEntries.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Aún no hay entradas.</div>
          ) : (
            listEntries.map((entry) => {
              const entryDate = new Date(entry.timestamp);
              const dateStr = entry.date;
              return (
                <button
                  key={entry.id}
                  onClick={() => (onSelectEntry ? onSelectEntry(entry) : onSelectDate(dateStr))}
                  className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {formatDate(entryDate)}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={12} /> {formatTime(entryDate)}
                    </div>
                  </div>
                  <div className="mt-2">
                    {entry.createdBy === 'PSYCHOLOGIST' && entry.psychologistEntryType === 'SESSION' ? (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                        Sesión clínica
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                        Diario
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3">{entry.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {typeof entry.sentimentScore === 'number' && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${entry.sentimentScore >= 7 ? 'bg-green-50 text-green-700 border-green-200' : entry.sentimentScore >= 4 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                        {entry.sentimentScore}/10
                      </span>
                    )}
                    {entry.emotions?.length > 0 && entry.emotions.slice(0, 5).map((em) => (
                      <span key={em} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-medium">
                        {em}
                      </span>
                    ))}
                  </div>
                </button>
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
                    onClick={() => onSelectDate(dateStr)}
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
                                  <Clock size={12} /> {formatTime(previewEntries[0].timestamp)}
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
              onClick={() => onSelectDate(dateStr)}
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

    {/* Availability Modal */}
    {showAvailability && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Disponibilidad del Psicólogo</h2>
            <button
              onClick={() => setShowAvailability(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {availableSlots.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              No hay horarios disponibles en este momento.
            </div>
          ) : (
            <div className="space-y-3">
              {availableSlots.map(slot => (
                <div
                  key={slot.id}
                  className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-sm font-bold text-slate-800">
                          {formatDateWithWeekday(slot.date)}
                        </div>
                        <div className="flex items-center gap-2">
                          {slot.type === 'online' ? (
                            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full flex items-center gap-1">
                              <Video size={12} /> Online
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-1 rounded-full flex items-center gap-1">
                              <MapPin size={12} /> Presencial
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-600 flex items-center gap-2">
                        <Clock size={14} />
                        {slot.startTime} - {slot.endTime}
                      </div>
                    </div>
                    <button
                      onClick={() => bookSession(slot.id)}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Reservar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
  </div>
  );
};

export default CalendarView;