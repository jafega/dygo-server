import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Video, MapPin, CheckCircle, Plus, Loader2, AlertCircle, Eye, X, Stethoscope } from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { API_URL } from '../services/config';
import { getPsychologistsForPatient } from '../services/storageService';
import { User } from '../types';

interface Session {
  id: string;
  patientId: string;
  patientName: string;
  psychologistId: string;
  psychologistName?: string;
  psychologistEmail?: string;
  patientPhone?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online' | 'home-visit';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available';
  notes?: string;
  meetLink?: string;
}

type PsychologistDirectory = Record<string, { id: string; name: string; email?: string }>;

const PatientSessions: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [psychologistId, setPsychologistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Session[]>([]);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [linkedPsychologists, setLinkedPsychologists] = useState<string[]>([]);
  const [psychologistDirectory, setPsychologistDirectory] = useState<PsychologistDirectory>({});

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const user = await getCurrentUser();
      console.log('[PatientSessions] Current user:', { id: user?.id, role: user?.role, name: user?.name });
      if (!user) {
        console.log('[PatientSessions] No user found, exiting');
        return;
      }

      console.log('[PatientSessions] Fetching psychologists and sessions...');
      
      // Optimización: Solo cargar sesiones desde 30 días atrás hasta 6 meses en el futuro
      const today = new Date();
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      const future = new Date(today);
      future.setMonth(future.getMonth() + 6);
      
      const params = new URLSearchParams({
        patientId: user.id,
        startDate: past.toISOString().split('T')[0],
        endDate: future.toISOString().split('T')[0]
      });
      
      const [psychologists, response] = await Promise.all([
        getPsychologistsForPatient(user.id),
        fetch(`${API_URL}/sessions?${params.toString()}`)
      ]);
      
      console.log('[PatientSessions] psychologists from getPsychologistsForPatient:', psychologists);
      console.log('[PatientSessions] sessions response ok:', response.ok);
      
      if (response.ok) {
        const data = await response.json();
        const filteredSessions = data.filter((s: Session) => s.status === 'scheduled' || s.status === 'completed' || s.status === 'cancelled');
        console.log('[PatientSessions] filteredSessions:', filteredSessions.length);
        
        setPsychologistDirectory(prev => {
          const next = { ...prev } as PsychologistDirectory;
          psychologists.forEach((psych: User) => {
            if (!psych || !psych.id) return;
            next[psych.id] = { id: psych.id, name: psych.name, email: psych.email };
          });
          filteredSessions.forEach((session: Session) => {
            if (!session.psychologistId) return;
            const existing = next[session.psychologistId] || { id: session.psychologistId, name: '' };
            next[session.psychologistId] = {
              id: session.psychologistId,
              name: session.psychologistName || existing.name || 'Especialista',
              email: session.psychologistEmail || existing.email
            };
          });
          return next;
        });
        setSessions(filteredSessions);

        // Construir lista de psicólogos: incluir TODOS los de care_relationships
        const psychologistIds = new Set<string>(psychologists.map(p => p.id));
        filteredSessions.forEach((s: Session) => {
          if (s.psychologistId) {
            psychologistIds.add(s.psychologistId);
          }
        });

        const psychologistList = Array.from(psychologistIds);
        console.log('[PatientSessions] linkedPsychologists:', psychologistList);
        setLinkedPsychologists(psychologistList);
        setPsychologistId(prev => {
          if (prev && psychologistList.includes(prev)) {
            return prev;
          }
          return psychologistList[0] || null;
        });
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailability = async () => {
    const candidateIds = psychologistId
      ? [psychologistId, ...linkedPsychologists.filter(id => id !== psychologistId)]
      : linkedPsychologists;

    console.log('[loadAvailability] psychologistId:', psychologistId);
    console.log('[loadAvailability] linkedPsychologists:', linkedPsychologists);
    console.log('[loadAvailability] candidateIds:', candidateIds);

    if (candidateIds.length === 0) {
      alert('No tienes un psicólogo asignado. Por favor, acepta una invitación de un psicólogo primero.');
      return;
    }

    setIsLoading(true);
    try {
      let slotsToShow: Session[] = [];
      let matchedPsychologist: string | null = null;
      const now = new Date();

      for (const candidateId of candidateIds) {
        const url = `${API_URL}/sessions?psychologistId=${candidateId}`;
        console.log('[loadAvailability] Fetching availability from:', url);
        const response = await fetch(url);
        if (!response.ok) {
          console.warn('[loadAvailability] No se pudo cargar la disponibilidad para', candidateId, response.status);
          continue;
        }

        const allSessions = await response.json();
        console.log('[loadAvailability] Sessions returned for', candidateId, ':', allSessions.length, 'total');
        const available = allSessions.filter((s: Session) => s.status === 'available');
        console.log('[loadAvailability] Available sessions:', available.length);
        const futureSlots = available.filter((slot: Session) => {
          const slotDateTime = new Date(`${slot.date}T${slot.startTime}`);
          return slotDateTime > now;
        });
        console.log('[loadAvailability] Future slots:', futureSlots.length);

        if (futureSlots.length > 0) {
          slotsToShow = futureSlots;
          matchedPsychologist = candidateId;
          break;
        }

        if (!matchedPsychologist) {
          matchedPsychologist = candidateId;
          slotsToShow = futureSlots;
        }
      }

      setAvailableSlots(slotsToShow);
      setShowAvailability(true);
      if (matchedPsychologist) {
        setPsychologistId(matchedPsychologist);
      }

      if (slotsToShow.length === 0) {
        alert('No hay horarios disponibles en este momento. Por favor, contacta a tu psicólogo.');
      }
    } catch (err) {
      console.error('Error loading availability:', err);
      alert('Error al cargar la disponibilidad');
    } finally {
      setIsLoading(false);
    }
  };

  const bookSession = async (slotId: string) => {
    const user = await getCurrentUser();
    if (!user) return;

    setBookingSlotId(slotId);
    console.log(`[bookSession] Iniciando reserva de sesión ${slotId} para usuario:`, user);
    
    try {
      // Buscar el slot para verificar si viene de dispo
      const slot = availableSlots.find(s => s.id === slotId);
      if (!slot) {
        alert('Slot no encontrado');
        return;
      }

      // Si el slot viene de la tabla dispo, crear nueva sesión y borrar de dispo
      if ((slot as any).isFromDispo) {
        console.log('[bookSession] Slot viene de tabla dispo, creando nueva sesión...');
        
        const newSession = {
          id: Date.now().toString(),
          patientId: user.id,
          patientName: user.name,
          patientPhone: user.phone || '',
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          type: slot.type,
          status: 'scheduled',
          psychologistId: slot.psychologistId,
          deleteDispoId: slotId // Indicar que se debe borrar este ID de dispo
        };

        const response = await fetch(`${API_URL}/sessions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': slot.psychologist_user_id || slot.psychologistId
          },
          body: JSON.stringify(newSession)
        });

        console.log(`[bookSession] Respuesta recibida. Status: ${response.status}, OK: ${response.ok}`);

        if (response.ok) {
          const createdSession = await response.json();
          console.log(`[bookSession] ✅ Sesión creada exitosamente desde dispo:`, createdSession);
          alert('¡Cita reservada exitosamente!');
          setShowAvailability(false);
          await loadSessions();
        } else {
          const error = await response.json();
          console.error(`[bookSession] ❌ Error del servidor:`, error);
          alert('Error al reservar la cita: ' + (error.error || 'Error desconocido'));
        }
      } else {
        // Lógica anterior: PATCH para sesiones que están en sessions con status available
        const requestBody = {
          status: 'scheduled',
          patientId: user.id,
          patientName: user.name,
          patientPhone: user.phone || ''
        };
        
        console.log(`[bookSession] Haciendo PATCH a ${API_URL}/sessions/${slotId} con:`, requestBody);
        
        const response = await fetch(`${API_URL}/sessions/${slotId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        console.log(`[bookSession] Respuesta recibida. Status: ${response.status}, OK: ${response.ok}`);

        if (response.ok) {
          const updatedSession = await response.json();
          console.log(`[bookSession] ✅ Sesión reservada exitosamente:`, updatedSession);
          alert('¡Cita reservada exitosamente!');
          setShowAvailability(false);
          await loadSessions();
        } else {
          const error = await response.json();
          console.error(`[bookSession] ❌ Error del servidor:`, error);
          alert('Error al reservar la cita: ' + (error.error || 'Error desconocido'));
        }
      }
    } catch (err) {
      console.error('[bookSession] ❌ Error en la petición:', err);
      alert('Error al reservar la cita');
    } finally {
      setBookingSlotId(null);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const futureSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= today && s.status === 'scheduled';
  });

  const pastSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate < today || s.status === 'completed' || s.status === 'cancelled';
  });

  const displayedSessions = showPastSessions ? [...futureSessions, ...pastSessions] : futureSessions;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Programada';
      case 'completed': return 'Completada';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const getPsychologistName = (session?: Partial<Session>) => {
    if (!session) return 'Especialista asignado';
    if (session.psychologistName && session.psychologistName.trim().length > 0) {
      return session.psychologistName;
    }
    if (session.psychologistId && psychologistDirectory[session.psychologistId]) {
      return psychologistDirectory[session.psychologistId].name;
    }
    return 'Especialista asignado';
  };

  const getPsychologistEmail = (session?: Partial<Session>) => {
    if (!session) return '';
    if (session.psychologistEmail && session.psychologistEmail.trim().length > 0) {
      return session.psychologistEmail;
    }
    if (session.psychologistId && psychologistDirectory[session.psychologistId]?.email) {
      return psychologistDirectory[session.psychologistId].email || '';
    }
    return '';
  };

  return (
    <div className="bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-slate-200 bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3 md:mb-4">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900">Mis Citas</h2>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5 md:mt-1">Gestiona tus sesiones</p>
          </div>
          <button
            onClick={loadAvailability}
            disabled={isLoading}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl md:rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm shadow-lg hover:shadow-xl"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Cargando...</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span>Reservar Cita</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showPast"
            checked={showPastSessions}
            onChange={(e) => setShowPastSessions(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
          />
          <label htmlFor="showPast" className="text-xs md:text-sm text-slate-700 cursor-pointer">
            Mostrar citas pasadas
          </label>
        </div>
      </div>

      {/* Table View - Desktop */}
      <div className="hidden md:block overflow-x-auto">
        {isLoading && !showAvailability ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
          </div>
        ) : displayedSessions.length === 0 ? (
          <div className="text-center py-12 bg-slate-50">
            <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No tienes citas {showPastSessions ? '' : 'futuras'} programadas</p>
            <p className="text-sm text-slate-400 mt-2">Haz clic en "Reservar Cita" para agendar una sesión</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Especialista</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Hora</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedSessions.map((session) => {
                const isPast = new Date(session.date) < today || session.status !== 'scheduled';
                return (
                  <tr 
                    key={session.id}
                    className={`hover:bg-slate-50 transition-colors ${isPast ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="text-sm font-medium text-slate-900">
                          {formatDate(session.date)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center">
                          <Stethoscope size={16} className="text-indigo-600" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{getPsychologistName(session)}</div>
                          {getPsychologistEmail(session) && (
                            <div className="text-xs text-slate-500">{getPsychologistEmail(session)}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-700">
                          {session.startTime} - {session.endTime}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {session.type === 'online' ? (
                          <>
                            <Video size={16} className="text-indigo-600" />
                            <span className="text-sm text-slate-700">En línea</span>
                          </>
                        ) : session.type === 'home-visit' ? (
                          <>
                            <MapPin size={16} className="text-green-600" />
                            <span className="text-sm text-slate-700">A domicilio</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={16} className="text-purple-600" />
                            <span className="text-sm text-slate-700">Presencial</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(session.status)}`}>
                        {getStatusLabel(session.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {session.meetLink && session.status === 'scheduled' ? (
                        <a
                          href={session.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          <Video size={14} />
                          Unirse
                        </a>
                      ) : (
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors text-sm font-medium"
                        >
                          <Eye size={14} />
                          Ver detalles
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Card View - Mobile */}
      <div className="md:hidden">
        {isLoading && !showAvailability ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
          </div>
        ) : displayedSessions.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center">
              <Calendar size={32} className="text-indigo-600" />
            </div>
            <p className="text-slate-900 font-semibold text-base mb-1">No tienes citas {showPastSessions ? '' : 'futuras'}</p>
            <p className="text-sm text-slate-500">Reserva tu primera sesión</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {displayedSessions.map((session) => {
              const isPast = new Date(session.date) < today || session.status !== 'scheduled';
              return (
                <div
                  key={session.id}
                  className={`rounded-2xl overflow-hidden shadow-sm border transition-all ${
                    isPast 
                      ? 'border-slate-200 bg-slate-50 opacity-60' 
                      : 'border-indigo-200 bg-gradient-to-br from-white to-indigo-50/30'
                  }`}
                >
                  {/* Header de la card */}
                  <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                      <Calendar size={18} />
                      <span className="font-bold text-sm">
                        {new Date(session.date).toLocaleDateString('es-ES', { 
                          day: 'numeric',
                          month: 'short'
                        })}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      session.status === 'scheduled' ? 'bg-white/20 text-white' :
                      session.status === 'completed' ? 'bg-green-500 text-white' :
                      'bg-red-500 text-white'
                    }`}>
                      {getStatusLabel(session.status)}
                    </span>
                  </div>

                  {/* Body de la card */}
                  <div className="p-4 space-y-3">
                    {/* Hora */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Clock size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Horario</div>
                        <div className="text-sm font-semibold text-slate-900">{session.startTime} - {session.endTime}</div>
                      </div>
                    </div>

                    {/* Tipo */}
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        session.type === 'online' ? 'bg-blue-100' :
                        session.type === 'home-visit' ? 'bg-green-100' : 'bg-purple-100'
                      }`}>
                        {session.type === 'online' ? (
                          <Video size={18} className="text-blue-600" />
                        ) : session.type === 'home-visit' ? (
                          <MapPin size={18} className="text-green-600" />
                        ) : (
                          <MapPin size={18} className="text-purple-600" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-medium">Modalidad</div>
                        <div className="text-sm font-semibold text-slate-900">
                          {session.type === 'online' ? 'En línea' :
                           session.type === 'home-visit' ? 'A domicilio' : 'Presencial'}
                        </div>
                      </div>
                    </div>

                    {/* Especialista */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Stethoscope size={18} className="text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-500 font-medium">Especialista</div>
                        <div className="text-sm font-semibold text-slate-900 truncate">{getPsychologistName(session)}</div>
                        {getPsychologistEmail(session) && (
                          <div className="text-xs text-slate-500 truncate">{getPsychologistEmail(session)}</div>
                        )}
                      </div>
                    </div>

                    {/* Botones de acción */}
                    <div className="pt-2 flex gap-2">
                      {session.meetLink && session.status === 'scheduled' ? (
                        <a
                          href={session.meetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all text-sm font-bold shadow-md"
                        >
                          <Video size={16} />
                          Unirse
                        </a>
                      ) : (
                        <button
                          onClick={() => setSelectedSession(session)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all text-sm font-semibold"
                        >
                          <Eye size={16} />
                          Ver detalles
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedSession(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Detalles de la Sesión</h3>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Fecha</div>
                <div className="text-lg font-semibold text-slate-900">
                  {new Date(selectedSession.date).toLocaleDateString('es-ES', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Horario</div>
                <div className="text-base text-slate-900">
                  {selectedSession.startTime} - {selectedSession.endTime}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Tipo</div>
                <div className="flex items-center gap-2">
                  {selectedSession.type === 'online' ? (
                    <>
                      <Video size={16} className="text-indigo-600" />
                      <span className="text-slate-900">En línea</span>
                    </>
                  ) : selectedSession.type === 'home-visit' ? (
                    <>
                      <MapPin size={16} className="text-green-600" />
                      <span className="text-slate-900">A domicilio</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={16} className="text-purple-600" />
                      <span className="text-slate-900">Presencial</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Especialista</div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
                    <Stethoscope size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{getPsychologistName(selectedSession)}</div>
                    {getPsychologistEmail(selectedSession) && (
                      <div className="text-xs text-slate-500">{getPsychologistEmail(selectedSession)}</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Estado</div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedSession.status)}`}>
                  {getStatusLabel(selectedSession.status)}
                </span>
              </div>

              {selectedSession.notes && (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notas</div>
                  <div className="text-sm text-slate-700 italic bg-slate-50 p-3 rounded-lg">
                    {selectedSession.notes}
                  </div>
                </div>
              )}

              {selectedSession.meetLink && selectedSession.status === 'scheduled' && (
                <div className="pt-4 border-t border-slate-200">
                  <a
                    href={selectedSession.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <Video size={18} />
                    Unirse a la videollamada
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Availability Modal */}
      {showAvailability && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center md:p-4 backdrop-blur-sm" onClick={() => setShowAvailability(false)}>
          <div className="bg-white rounded-t-3xl md:rounded-2xl shadow-2xl w-full md:max-w-2xl max-h-[85vh] md:max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 md:p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-800">Horarios Disponibles</h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-0.5 md:mt-1">Selecciona el que prefieras</p>
                </div>
                <button
                  onClick={() => setShowAvailability(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-3 md:p-6">
              {availableSlots.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center">
                    <AlertCircle size={32} className="text-slate-400" />
                  </div>
                  <p className="text-slate-900 font-semibold mb-1">No hay horarios disponibles</p>
                  <p className="text-sm text-slate-500">Contacta a tu psicólogo para coordinar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-2xl overflow-hidden border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all bg-white"
                    >
                      {/* Header con fecha */}
                      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 border-b border-slate-200">
                        <div className="flex items-center gap-2 text-indigo-900">
                          <Calendar size={18} />
                          <span className="font-bold text-sm">
                            {new Date(slot.date).toLocaleDateString('es-ES', { 
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long'
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Body con detalles */}
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                          {/* Hora */}
                          <div className="flex items-center gap-2">
                            <Clock size={16} className="text-slate-600" />
                            <span className="text-sm font-medium text-slate-900">{slot.startTime} - {slot.endTime}</span>
                          </div>

                          {/* Tipo */}
                          <div className="flex items-center gap-2">
                            {slot.type === 'online' ? (
                              <>
                                <Video size={16} className="text-blue-600" />
                                <span className="text-sm font-medium text-slate-900">En línea</span>
                              </>
                            ) : (
                              <>
                                <MapPin size={16} className="text-purple-600" />
                                <span className="text-sm font-medium text-slate-900">Presencial</span>
                              </>
                            )}
                          </div>

                          {/* Especialista */}
                          <div className="flex items-center gap-2">
                            <Stethoscope size={16} className="text-indigo-600" />
                            <span className="text-sm font-medium text-slate-900 truncate">{getPsychologistName(slot)}</span>
                          </div>
                        </div>

                        {/* Botón de reserva */}
                        <button
                          onClick={() => bookSession(slot.id)}
                          disabled={bookingSlotId === slot.id}
                          className="w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md text-sm"
                        >
                          {bookingSlotId === slot.id ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Reservando...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle size={16} />
                              <span>Reservar esta cita</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientSessions;
