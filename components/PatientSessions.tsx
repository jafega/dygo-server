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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Mis Sesiones</h2>
            <p className="text-sm text-slate-500 mt-1">Gestiona tus citas con el psicólogo</p>
          </div>
          <button
            onClick={loadAvailability}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="hidden sm:inline">Cargando...</span>
              </>
            ) : (
              <>
                <Plus size={18} />
                <span className="hidden sm:inline">Reservar Cita</span>
                <span className="sm:hidden">Nueva</span>
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
          <label htmlFor="showPast" className="text-sm text-slate-700 cursor-pointer">
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
            <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No tienes citas {showPastSessions ? '' : 'futuras'} programadas</p>
            <p className="text-sm text-slate-400 mt-2">Haz clic en "Nueva" para agendar una sesión</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {displayedSessions.map((session) => {
              const isPast = new Date(session.date) < today || session.status !== 'scheduled';
              return (
                <div
                  key={session.id}
                  className={`p-4 border rounded-xl bg-white ${isPast ? 'border-slate-200 opacity-60' : 'border-indigo-200'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-slate-600" />
                      <span className="font-semibold text-slate-900 text-sm">
                        {formatDate(session.date)}
                      </span>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(session.status)}`}>
                      {getStatusLabel(session.status)}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-slate-600 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock size={16} />
                      <span>{session.startTime} - {session.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {session.type === 'online' ? (
                        <>
                          <Video size={16} className="text-indigo-600" />
                          <span>En línea</span>
                        </>
                      ) : session.type === 'home-visit' ? (
                        <>
                          <MapPin size={16} className="text-green-600" />
                          <span>A domicilio</span>
                        </>
                      ) : (
                        <>
                          <MapPin size={16} className="text-purple-600" />
                          <span>Presencial</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Stethoscope size={16} className="text-indigo-600" />
                      <div>
                        <span className="font-semibold text-slate-900 block leading-tight">{getPsychologistName(session)}</span>
                        {getPsychologistEmail(session) && (
                          <span className="text-xs text-slate-500">{getPsychologistEmail(session)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {session.meetLink && session.status === 'scheduled' ? (
                    <a
                      href={session.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      <Video size={16} />
                      Unirse a la videollamada
                    </a>
                  ) : (
                    <button
                      onClick={() => setSelectedSession(session)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-sm font-medium"
                    >
                      <Eye size={16} />
                      Ver detalles
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Horarios Disponibles</h2>
                  <p className="text-sm text-slate-500 mt-1">Selecciona el horario que mejor te convenga</p>
                </div>
                <button
                  onClick={() => setShowAvailability(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {availableSlots.length === 0 ? (
                <div className="text-center py-10">
                  <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-500 font-medium">No hay horarios disponibles</p>
                  <p className="text-sm text-slate-400 mt-2">Contacta a tu psicólogo para coordinar una cita</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Calendar size={18} className="text-slate-600" />
                            <span className="font-semibold text-slate-900">
                              {formatDate(slot.date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 ml-7">
                            <div className="flex items-center gap-2">
                              <Clock size={16} />
                              <span>{slot.startTime} - {slot.endTime}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {slot.type === 'online' ? (
                                <>
                                  <Video size={16} />
                                  <span>En línea</span>
                                </>
                              ) : (
                                <>
                                  <MapPin size={16} />
                                  <span>Presencial</span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Stethoscope size={16} className="text-indigo-600" />
                              <span>{getPsychologistName(slot)}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => bookSession(slot.id)}
                          disabled={bookingSlotId === slot.id}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
                        >
                          {bookingSlotId === slot.id ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Reservando...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle size={16} />
                              <span>Reservar</span>
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
