import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Video, MapPin, CheckCircle, XCircle, Plus, Loader2, AlertCircle, Eye, X } from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { API_URL } from '../services/config';

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

const PatientSessions: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [psychologistId, setPsychologistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<Session[]>([]);
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user || user.role !== 'PATIENT') return;

      // Get assigned psychologist
      if (user.accessList && user.accessList.length > 0) {
        setPsychologistId(user.accessList[0]);
      }

      const response = await fetch(`${API_URL}/sessions?patientId=${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.filter((s: Session) => s.status === 'scheduled' || s.status === 'completed' || s.status === 'cancelled'));
      }
    } catch (err) {
      console.error('Error loading sessions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailability = async () => {
    if (!psychologistId) {
      alert('No tienes un psicólogo asignado');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/sessions?psychologistId=${psychologistId}`);
      if (response.ok) {
        const allSessions = await response.json();
        const available = allSessions.filter((s: Session) => s.status === 'available');
        
        // Filter only future slots
        const now = new Date();
        const futureSlots = available.filter((slot: Session) => {
          const slotDateTime = new Date(`${slot.date}T${slot.startTime}`);
          return slotDateTime > now;
        });

        setAvailableSlots(futureSlots);
        setShowAvailability(true);

        if (futureSlots.length === 0) {
          alert('No hay horarios disponibles en este momento. Por favor, contacta a tu psicólogo.');
        }
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
        await loadSessions();
      } else {
        const error = await response.json();
        alert('Error al reservar la cita: ' + (error.error || 'Error desconocido'));
      }
    } catch (err) {
      console.error('Error booking session:', err);
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
                            <Video size={16} className="text-green-600" />
                            <span className="text-sm text-slate-700">En línea</span>
                          </>
                        ) : (
                          <>
                            <MapPin size={16} className="text-blue-600" />
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
                          <Video size={16} className="text-green-600" />
                          <span>En línea</span>
                        </>
                      ) : (
                        <>
                          <MapPin size={16} className="text-blue-600" />
                          <span>Presencial</span>
                        </>
                      )}
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
                      <Video size={16} className="text-green-600" />
                      <span className="text-slate-900">En línea</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={16} className="text-blue-600" />
                      <span className="text-slate-900">Presencial</span>
                    </>
                  )}
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
