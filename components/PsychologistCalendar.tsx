import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, X, Users, Video, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { API_URL } from '../services/config';

interface Session {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online' | 'available';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available';
  notes?: string;
  meetLink?: string;
}

interface PsychologistCalendarProps {
  psychologistId: string;
}

const PsychologistCalendar: React.FC<PsychologistCalendarProps> = ({ psychologistId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showNewAvailability, setShowNewAvailability] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAssignPatient, setShowAssignPatient] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Session | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [meetLink, setMeetLink] = useState('');
  
  const [newSession, setNewSession] = useState({
    patientId: '',
    date: '',
    startTime: '',
    endTime: '',
    type: 'online' as 'in-person' | 'online',
    notes: '',
    generateMeetLink: false
  });

  const [newAvailability, setNewAvailability] = useState({
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    duration: 60, // duration in minutes for each slot
    daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday by default
  });

  useEffect(() => {
    loadSessions();
    loadPatients();
  }, [psychologistId, currentDate]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const response = await fetch(`${API_URL}/sessions?psychologistId=${psychologistId}&year=${year}&month=${month}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setIsLoading(false);
  };

  const loadPatients = async () => {
    try {
      console.log('Loading patients for psychologist:', psychologistId);
      console.log('API URL:', `${API_URL}/psychologist/${psychologistId}/patients`);
      const response = await fetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      console.log('Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('Patients loaded:', data);
        setPatients(data);
      } else {
        console.error('Failed to load patients:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek };
  };

  const getSessionsForDate = (date: string) => {
    return sessions.filter(s => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleCreateSession = async () => {
    if (!newSession.patientId || !newSession.date || !newSession.startTime || !newSession.endTime) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    const patient = patients.find(p => p.id === newSession.patientId);
    if (!patient) return;

    // Generate Google Meet link if requested
    let meetLink = '';
    if (newSession.generateMeetLink && newSession.type === 'online') {
      meetLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 15)}`;
    }

    const session: Session = {
      id: Date.now().toString(),
      patientId: newSession.patientId,
      patientName: patient.name,
      date: newSession.date,
      startTime: newSession.startTime,
      endTime: newSession.endTime,
      type: newSession.type,
      status: 'scheduled',
      notes: newSession.notes,
      meetLink: meetLink || undefined
    };

    try {
      const response = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...session, psychologistId })
      });

      if (response.ok) {
        await loadSessions();
        setShowNewSession(false);
        resetNewSession();
      }
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Error al crear la sesión');
    }
  };

  const handleCreateAvailability = async () => {
    // Detailed validation with specific error messages
    if (!newAvailability.startDate) {
      alert('Por favor selecciona la fecha de inicio');
      return;
    }
    if (!newAvailability.endDate) {
      alert('Por favor selecciona la fecha de fin');
      return;
    }
    if (!newAvailability.startTime) {
      alert('Por favor selecciona la hora de inicio');
      return;
    }
    if (!newAvailability.endTime) {
      alert('Por favor selecciona la hora de fin');
      return;
    }
    if (newAvailability.daysOfWeek.length === 0) {
      alert('Por favor selecciona al menos un día de la semana');
      return;
    }

    const allSlots: Session[] = [];
    
    // Generate slots for each day in the range
    const startDate = new Date(newAvailability.startDate);
    const endDate = new Date(newAvailability.endDate);
    
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayOfWeek = date.getDay();
      
      // Check if this day is selected
      if (!newAvailability.daysOfWeek.includes(dayOfWeek)) continue;
      
      const dateStr = date.toISOString().split('T')[0];
      
      // Generate multiple slots for this day based on duration
      const start = new Date(`${dateStr}T${newAvailability.startTime}`);
      const end = new Date(`${dateStr}T${newAvailability.endTime}`);
      const duration = newAvailability.duration;
      
      let current = new Date(start);
      
      while (current < end) {
        const slotEnd = new Date(current.getTime() + duration * 60000);
        if (slotEnd > end) break;
        
        allSlots.push({
          id: `${Date.now()}-${allSlots.length}`,
          patientId: '',
          patientName: 'Disponible',
          date: dateStr,
          startTime: current.toTimeString().slice(0, 5),
          endTime: slotEnd.toTimeString().slice(0, 5),
          type: 'online',
          status: 'available'
        });
        
        current = slotEnd;
      }
    }

    if (allSlots.length === 0) {
      alert('No se generaron espacios disponibles. Verifica las fechas y días seleccionados.');
      return;
    }

    console.log('Creating availability with slots:', allSlots);

    try {
      const response = await fetch(`${API_URL}/sessions/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: allSlots, psychologistId })
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        await loadSessions();
        setShowNewAvailability(false);
        resetNewAvailability();
        alert(`Se crearon ${allSlots.length} espacios disponibles exitosamente`);
      } else {
        alert(`Error al crear disponibilidad: ${data.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error creating availability:', error);
      alert('Error al crear los espacios disponibles');
    }
  };

  const handleUpdateSessionStatus = async (sessionId: string, status: Session['status']) => {
    try {
      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        await loadSessions();
        setSelectedSession(null);
      }
    } catch (error) {
      console.error('Error updating session:', error);
      alert('Error al actualizar la sesión');
    }
  };

  const resetNewSession = () => {
    setNewSession({
      patientId: '',
      date: '',
      startTime: '',
      endTime: '',
      type: 'online',
      notes: '',
      generateMeetLink: false
    });
  };

  const resetNewAvailability = () => {
    setNewAvailability({
      startDate: '',
      endDate: '',
      startTime: '',
      endTime: '',
      duration: 60,
      daysOfWeek: [1, 2, 3, 4, 5]
    });
  };

  const toggleDayOfWeek = (day: number) => {
    setNewAvailability(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort()
    }));
  };

  const handleAssignPatient = async () => {
    if (!selectedPatientId || !selectedSlot) {
      alert('Por favor selecciona un paciente');
      return;
    }

    try {
      const patient = patients.find(p => p.id === selectedPatientId);
      if (!patient) {
        alert('Paciente no encontrado');
        return;
      }

      // Generate Google Meet link if empty
      let finalMeetLink = meetLink.trim();
      if (!finalMeetLink) {
        const randomId = Math.random().toString(36).substring(2, 15);
        finalMeetLink = `https://meet.google.com/${randomId}`;
      }

      // Update slot to scheduled
      const updateResponse = await fetch(`${API_URL}/sessions/${selectedSlot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'scheduled',
          patientId: patient.id,
          patientName: patient.name,
          meetLink: finalMeetLink
        })
      });

      if (updateResponse.ok) {
        alert('¡Paciente asignado exitosamente!');
        await loadSessions();
        setShowAssignPatient(false);
        setSelectedSlot(null);
        setSelectedPatientId('');
        setMeetLink('');
        setSelectedSession(null);
      } else {
        alert('Error al asignar el paciente');
      }
    } catch (error) {
      console.error('Error assigning patient:', error);
      alert('Error al asignar el paciente');
    }
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth();
  const monthName = currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Calendario de Sesiones</h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona tus citas y disponibilidad</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewAvailability(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
          >
            <Clock size={18} />
            <span className="hidden sm:inline">Añadir Disponibilidad</span>
            <span className="sm:hidden">Disponibilidad</span>
          </button>
          <button
            onClick={() => setShowNewSession(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Nueva Sesión</span>
            <span className="sm:hidden">Sesión</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Este Mes</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {sessions.filter(s => s.status === 'scheduled').length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Completadas</div>
          <div className="text-2xl font-bold text-green-600 mt-2">
            {sessions.filter(s => s.status === 'completed').length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Disponibles</div>
          <div className="text-2xl font-bold text-purple-600 mt-2">
            {sessions.filter(s => s.status === 'available').length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Canceladas</div>
          <div className="text-2xl font-bold text-red-600 mt-2">
            {sessions.filter(s => s.status === 'cancelled').length}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Month Navigation */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <button
            onClick={handlePreviousMonth}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h3 className="text-lg font-semibold text-slate-900 capitalize">{monthName}</h3>
          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="p-4">
          {/* Week days */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-slate-500 uppercase py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-2">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: startingDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            
            {/* Days of the month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const daySessions = getSessionsForDate(dateStr);
              const isToday = new Date().toDateString() === new Date(dateStr).toDateString();
              
              return (
                <div
                  key={day}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`
                    aspect-square p-2 border rounded-lg cursor-pointer transition-all
                    ${isToday ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}
                    ${daySessions.length > 0 ? 'bg-purple-50/50' : ''}
                  `}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {day}
                  </div>
                  {daySessions.length > 0 && (
                    <div className="space-y-1">
                      {daySessions.slice(0, 2).map(session => (
                        <div
                          key={session.id}
                          className={`text-[10px] px-1 py-0.5 rounded truncate ${
                            session.status === 'available' 
                              ? 'bg-purple-100 text-purple-700'
                              : session.status === 'scheduled'
                              ? 'bg-green-100 text-green-700'
                              : session.status === 'completed'
                              ? 'bg-slate-100 text-slate-700'
                              : session.status === 'cancelled'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-indigo-100 text-indigo-700'
                          }`}
                        >
                          {session.startTime} {session.patientName}
                        </div>
                      ))}
                      {daySessions.length > 2 && (
                        <div className="text-[10px] text-slate-500 font-medium">
                          +{daySessions.length - 2} más
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day Sessions Detail Modal */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  {new Date(selectedDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <button
                  onClick={() => setSelectedDate('')}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {getSessionsForDate(selectedDate).length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No hay sesiones programadas para este día
                </div>
              ) : (
                <div className="space-y-3">
                  {getSessionsForDate(selectedDate).map(session => (
                    <div
                      key={session.id}
                      onClick={() => {
                        if (session.status === 'available') {
                          setSelectedSlot(session);
                          setShowAssignPatient(true);
                        } else {
                          setSelectedSession(session);
                        }
                      }}
                      className="p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:bg-slate-50 cursor-pointer transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock size={16} className="text-slate-500" />
                            <span className="font-semibold text-slate-900">
                              {session.startTime} - {session.endTime}
                            </span>
                            {session.type === 'online' ? (
                              <Video size={14} className="text-indigo-600" />
                            ) : (
                              <MapPin size={14} className="text-purple-600" />
                            )}
                          </div>
                          <div className="text-sm text-slate-700 font-medium">{session.patientName}</div>
                          {session.notes && (
                            <div className="text-xs text-slate-500 mt-1">{session.notes}</div>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          session.status === 'available' 
                            ? 'bg-purple-100 text-purple-700'
                            : session.status === 'scheduled'
                            ? 'bg-green-100 text-green-700'
                            : session.status === 'completed'
                            ? 'bg-slate-100 text-slate-700'
                            : session.status === 'cancelled'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {session.status === 'available' ? 'Disponible' : 
                           session.status === 'scheduled' ? 'Programada' :
                           session.status === 'completed' ? 'Completada' :
                           session.status === 'cancelled' ? 'Cancelada' : 'Sesión'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Session Detail Modal */}
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
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Paciente</div>
                <div className="text-lg font-semibold text-slate-900">{selectedSession.patientName}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Fecha</div>
                  <div className="text-sm text-slate-900">{new Date(selectedSession.date).toLocaleDateString('es-ES')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Hora</div>
                  <div className="text-sm text-slate-900">{selectedSession.startTime} - {selectedSession.endTime}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Tipo</div>
                <div className="text-sm text-slate-900 flex items-center gap-2">
                  {selectedSession.type === 'online' ? (
                    <><Video size={16} className="text-indigo-600" /> Online</>
                  ) : (
                    <><MapPin size={16} className="text-purple-600" /> Presencial</>
                  )}
                </div>
              </div>

              {selectedSession.notes && (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Notas</div>
                  <div className="text-sm text-slate-700">{selectedSession.notes}</div>
                </div>
              )}

              {selectedSession.meetLink && (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Google Meet</div>
                  <a
                    href={selectedSession.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium"
                  >
                    <Video size={16} />
                    Unirse a la videollamada
                  </a>
                </div>
              )}

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Acciones</div>
                <div className="flex gap-2">
                  {selectedSession.status === 'scheduled' && (
                    <>
                      <button
                        onClick={() => handleUpdateSessionStatus(selectedSession.id, 'completed')}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        Marcar Completada
                      </button>
                      <button
                        onClick={() => handleUpdateSessionStatus(selectedSession.id, 'cancelled')}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {selectedSession.status === 'available' && (
                    <button
                      onClick={() => setSelectedSession(null)}
                      className="w-full px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
                    >
                      Cerrar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Session Modal */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Nueva Sesión</h3>
              <p className="text-sm text-slate-500 mt-1">Programa una sesión con un paciente</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Paciente *</label>
                <select
                  value={newSession.patientId}
                  onChange={(e) => setNewSession({ ...newSession, patientId: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Selecciona un paciente</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>{patient.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha *</label>
                <input
                  type="date"
                  value={newSession.date}
                  onChange={(e) => setNewSession({ ...newSession, date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hora Inicio *</label>
                  <input
                    type="time"
                    value={newSession.startTime}
                    onChange={(e) => setNewSession({ ...newSession, startTime: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hora Fin *</label>
                  <input
                    type="time"
                    value={newSession.endTime}
                    onChange={(e) => setNewSession({ ...newSession, endTime: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo *</label>
                <select
                  value={newSession.type}
                  onChange={(e) => setNewSession({ ...newSession, type: e.target.value as 'in-person' | 'online' })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="online">Online</option>
                  <option value="in-person">Presencial</option>
                </select>
              </div>

              {newSession.type === 'online' && (
                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="generateMeetLink"
                    checked={newSession.generateMeetLink}
                    onChange={(e) => setNewSession({ ...newSession, generateMeetLink: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="generateMeetLink" className="text-sm font-medium text-indigo-900 cursor-pointer flex items-center gap-2">
                    <Video size={16} />
                    Generar enlace de Google Meet
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
                <textarea
                  value={newSession.notes}
                  onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Notas adicionales sobre la sesión..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewSession(false);
                  resetNewSession();
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSession}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md"
              >
                Crear Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Availability Modal */}
      {showNewAvailability && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Añadir Disponibilidad</h3>
              <p className="text-sm text-slate-500 mt-1">Crea espacios libres para que tus pacientes reserven</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Inicio *</label>
                  <input
                    type="date"
                    value={newAvailability.startDate}
                    onChange={(e) => setNewAvailability({ ...newAvailability, startDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Fin *</label>
                  <input
                    type="date"
                    value={newAvailability.endDate}
                    onChange={(e) => setNewAvailability({ ...newAvailability, endDate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Días de la semana *</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 1, label: 'Lun' },
                    { value: 2, label: 'Mar' },
                    { value: 3, label: 'Mié' },
                    { value: 4, label: 'Jue' },
                    { value: 5, label: 'Vie' },
                    { value: 6, label: 'Sáb' },
                    { value: 0, label: 'Dom' }
                  ].map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDayOfWeek(day.value)}
                      className={`flex-1 min-w-[50px] px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                        newAvailability.daysOfWeek.includes(day.value)
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Desde *</label>
                  <input
                    type="time"
                    value={newAvailability.startTime}
                    onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Hasta *</label>
                  <input
                    type="time"
                    value={newAvailability.endTime}
                    onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Duración de cada sesión (minutos) *</label>
                <select
                  value={newAvailability.duration}
                  onChange={(e) => setNewAvailability({ ...newAvailability, duration: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                  <option value="90">90 minutos</option>
                </select>
              </div>

              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-xs text-purple-700 font-medium">
                  Se crearán múltiples espacios de {newAvailability.duration} minutos en los días seleccionados entre las fechas y horas indicadas
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewAvailability(false);
                  resetNewAvailability();
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateAvailability}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-md"
              >
                Crear Disponibilidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Patient to Available Slot Modal */}
      {showAssignPatient && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Asignar Paciente</h3>
                <button
                  onClick={() => {
                    setShowAssignPatient(false);
                    setSelectedSlot(null);
                    setSelectedPatientId('');
                    setMeetLink('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Horario</div>
                <div className="text-lg font-semibold text-slate-900">
                  {new Date(selectedSlot.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {selectedSlot.startTime} - {selectedSlot.endTime}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Seleccionar Paciente *
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">-- Selecciona un paciente --</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} ({patient.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {patients.length === 0 
                    ? 'No tienes pacientes asociados aún' 
                    : `${patients.length} paciente${patients.length !== 1 ? 's' : ''} disponible${patients.length !== 1 ? 's' : ''}`
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Video className="inline-block mr-1" size={16} />
                  Link de Google Meet (Opcional)
                </label>
                <input
                  type="text"
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Si dejas vacío, se generará un link automáticamente
                </p>
              </div>

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-xs text-green-700 font-medium">
                  Al asignar, este espacio cambiará de "Disponible" a "Programada" y aparecerá en verde
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAssignPatient(false);
                  setSelectedSlot(null);
                  setSelectedPatientId('');
                  setMeetLink('');
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignPatient}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium shadow-md"
              >
                Asignar Paciente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PsychologistCalendar;
