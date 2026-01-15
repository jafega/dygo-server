import React, { useState } from 'react';
import { JournalEntry } from '../types';
import { ChevronLeft, ChevronRight, Layers, Plus, Calendar as CalendarIcon, LayoutGrid, Clock } from 'lucide-react';

interface CalendarViewProps {
  entries: JournalEntry[];
  onSelectDate: (date: string) => void;
}

type ViewMode = 'MONTH' | 'WEEK' | 'LIST';

const CalendarView: React.FC<CalendarViewProps> = ({ entries, onSelectDate }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');

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

    const listEntries = [...entries].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-6 transition-all duration-300">
      
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
        
        {/* Title & Arrows */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-4">
          <button onClick={handlePrev} disabled={viewMode === 'LIST'} className={`p-2 rounded-full text-slate-600 transition-colors ${viewMode === 'LIST' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`}><ChevronLeft size={20}/></button>
          <h2 className="text-lg md:text-xl font-bold text-slate-800 w-32 md:w-48 text-center capitalize">{getHeaderText()}</h2>
          <button onClick={handleNext} disabled={viewMode === 'LIST'} className={`p-2 rounded-full text-slate-600 transition-colors ${viewMode === 'LIST' ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100'}`}><ChevronRight size={20}/></button>
        </div>

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
                  onClick={() => onSelectDate(dateStr)}
                  className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-800">
                      {entryDate.toLocaleDateString()}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={12} /> {entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3">{entry.summary}</p>
                  {entry.emotions?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.emotions.slice(0, 5).map((em) => (
                        <span key={em} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-medium">
                          {em}
                        </span>
                      ))}
                    </div>
                  )}
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

          const latestEntry = dayEntries.length > 0 ? dayEntries[0] : null;

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
                          {latestEntry ? (
                              <>
                                  <div className="flex items-center gap-2 mb-2">
                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                          <Clock size={12} /> {new Date(latestEntry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                      </span>
                                      {dayEntries.length > 1 && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">
                                              +{dayEntries.length - 1} más
                                          </span>
                                      )}
                                  </div>
                                  <p className="text-sm text-slate-700 line-clamp-2 md:line-clamp-3 leading-relaxed">
                                      {latestEntry.summary}
                                  </p>
                                  {latestEntry.emotions.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5 mt-3">
                                          {latestEntry.emotions.slice(0, 4).map(em => (
                                              <span key={em} className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-medium">
                                                  {em}
                                              </span>
                                          ))}
                                      </div>
                                  )}
                              </>
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
                  {latestEntry ? (
                    <div className="flex flex-col gap-1 items-start h-full overflow-hidden">
                      <p className="text-[9px] md:text-xs text-slate-600 leading-tight w-full text-left line-clamp-3">
                        {latestEntry.summary}
                      </p>
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
  );
};

export default CalendarView;