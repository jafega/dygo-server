import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, DollarSign, User, Filter, Edit2, Save, X as XIcon } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';

interface Session {
  id: string;
  patientId: string;
  patient_user_id?: string;
  patientName?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'available' | 'paid';
  type: 'in-person' | 'online' | 'home-visit';
  price?: number;
  percent_psych?: number;
  notes?: string;
  meetLink?: string;
  paid?: boolean;
  tags?: string[]; // Tags heredadas de la relación
}

interface Invoice {
  id: string;
  sessionId?: string;
  sessionIds?: string[];
  status: 'paid' | 'pending' | 'cancelled';
}

interface Patient {
  id: string;
  name: string;
  email: string;
}

interface SessionsListProps {
  psychologistId: string;
}

const SessionsList: React.FC<SessionsListProps> = ({ psychologistId }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<Map<string, Patient>>(new Map());
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [editedSession, setEditedSession] = useState<Session | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filter states
  const [filterPatient, setFilterPatient] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string[]>(['scheduled', 'completed']); // Por defecto todas menos canceladas
  const [filterPayment, setFilterPayment] = useState<string>('all'); // 'all', 'paid', 'unpaid'
  const [filterTags, setFilterTags] = useState<string[]>([]);
  
  // Date range state - default to current month
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  useEffect(() => {
    loadData();
  }, [psychologistId, dateRange]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load sessions
      const params = new URLSearchParams({
        psychologistId,
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      
      const sessionsResponse = await fetch(`${API_URL}/sessions?${params.toString()}`);
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        // Filter out 'available' slots (those without patient)
        const actualSessions = sessionsData.filter((s: Session) => 
          s.status !== 'available' && (s.patientId || s.patient_user_id)
        );
        setSessions(actualSessions);
        
        // Load patient names
        const patientIds = new Set<string>();
        actualSessions.forEach((s: Session) => {
          const pid = s.patient_user_id || s.patientId;
          if (pid) patientIds.add(pid);
        });
        
        const patientsMap = new Map<string, Patient>();
        for (const pid of patientIds) {
          try {
            const patientResponse = await fetch(`${API_URL}/users?id=${pid}`);
            if (patientResponse.ok) {
              const patientData = await patientResponse.json();
              patientsMap.set(pid, patientData);
            }
          } catch (err) {
            console.error('Error loading patient:', pid, err);
          }
        }
        setPatients(patientsMap);
      }

      // Load invoices to check payment status
      const invoicesParams = new URLSearchParams({
        psychologistId,
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      const invoicesResponse = await fetch(`${API_URL}/invoices?${invoicesParams.toString()}`);
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setIsLoading(false);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
      completed: { label: 'Completada', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
      cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle }
    };
    const badge = badges[status as keyof typeof badges] || badges.scheduled;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.color}`}>
        <Icon size={12} />
        {badge.label}
      </span>
    );
  };

  // Calcular duración en horas de una sesión
  const getSessionDurationHours = (session: Session): number => {
    if (!session.startTime || !session.endTime) return 1; // Default 1 hora
    
    const [startHour, startMin] = session.startTime.split(':').map(Number);
    const [endHour, endMin] = session.endTime.split(':').map(Number);
    
    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    
    // Si la hora de fin es menor que la de inicio, significa que cruza medianoche
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60; // Agregar 24 horas en minutos
    }
    
    const durationMinutes = endMinutes - startMinutes;
    return durationMinutes / 60; // Convertir a horas
  };

  // Calcular precio total de la sesión (precio por hora * horas)
  const getSessionTotalPrice = (session: Session): number => {
    const pricePerHour = session.price || 0;
    const hours = getSessionDurationHours(session);
    return pricePerHour * hours;
  };

  const getPsychologistEarnings = (session: Session) => {
    const totalPrice = getSessionTotalPrice(session);
    const percent = session.percent_psych || 70; // Default 70% if not specified
    return (totalPrice * percent) / 100;
  };

  const isSessionPaid = (sessionId: string): boolean => {
    return invoices.some(invoice => 
      invoice.status === 'paid' && 
      (invoice.sessionId === sessionId || invoice.sessionIds?.includes(sessionId))
    );
  };

  const handleOpenSession = (session: Session) => {
    setSelectedSession(session);
    setEditedSession({ ...session });
  };

  const handleCloseModal = () => {
    setSelectedSession(null);
    setEditedSession(null);
  };

  const handleSaveSession = async () => {
    if (!editedSession) return;

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      // Solo enviar los campos que pueden ser actualizados
      // NO enviar patient_user_id ni psychologist_user_id para evitar triggers en care_relationships
      const updatePayload = {
        date: editedSession.date,
        startTime: editedSession.startTime,
        endTime: editedSession.endTime,
        type: editedSession.type,
        status: editedSession.status,
        price: editedSession.price ?? 0,
        paid: editedSession.paid ?? false,
        percent_psych: editedSession.percent_psych ?? 70,
        notes: editedSession.notes,
        meetLink: editedSession.meetLink
      };

      const response = await fetch(`${API_URL}/sessions/${editedSession.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(updatePayload)
      });

      if (response.ok) {
        await loadData();
        handleCloseModal();
        alert('Sesión actualizada correctamente');
      } else {
        const error = await response.json();
        alert('Error al actualizar la sesión: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error updating session:', error);
      alert('Error al actualizar la sesión');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (field: keyof Session, value: any) => {
    if (!editedSession) return;
    setEditedSession({ ...editedSession, [field]: value });
  };


  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.startTime}`);
    const dateB = new Date(`${b.date} ${b.startTime}`);
    return dateB.getTime() - dateA.getTime(); // Most recent first
  });

  // Obtener todas las tags únicas de las sesiones
  const allTags = Array.from(new Set(sessions.flatMap(s => s.tags || [])));

  // Aplicar filtros múltiples
  const displayedSessions = sortedSessions.filter(session => {
    // Filtro por paciente
    if (filterPatient !== 'all') {
      const patientId = session.patient_user_id || session.patientId;
      if (patientId !== filterPatient) return false;
    }
    
    // Filtro por estados (multi-selección)
    if (filterStatus.length > 0 && !filterStatus.includes(session.status)) return false;
    
    // Filtro por estado de pago
    if (filterPayment !== 'all') {
      const isPaid = session.paid || isSessionPaid(session.id);
      if (filterPayment === 'paid' && !isPaid) return false;
      if (filterPayment === 'unpaid' && isPaid) return false;
    }
    
    // Filtro por tags (debe tener al menos una de las tags seleccionadas)
    if (filterTags.length > 0) {
      const sessionTags = session.tags || [];
      const hasMatchingTag = filterTags.some(tag => sessionTags.includes(tag));
      if (!hasMatchingTag) return false;
    }
    
    return true;
  });

  // Calculate metrics based on filtered sessions
  const completedSessions = displayedSessions.filter(s => s.status === 'completed');
  const totalEarnings = completedSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);
  const paidSessions = displayedSessions.filter(s => s.paid && s.status !== 'cancelled');
  const paidEarnings = paidSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);
  const cancelledCount = displayedSessions.filter(s => s.status === 'cancelled').length;
  
  // Calculate potential earnings (completed + scheduled)
  const scheduledSessions = displayedSessions.filter(s => s.status === 'scheduled');
  const potentialEarnings = [...completedSessions, ...scheduledSessions].reduce(
    (sum, s) => sum + getPsychologistEarnings(s), 0
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="text-purple-600" size={24} />
              <h2 className="text-xl font-bold text-slate-800">Sesiones</h2>
            </div>
            <div className="text-sm text-slate-500">
              Total: <span className="font-bold text-slate-800">{sessions.length}</span> sesiones
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter size={16} />
              Rango de fechas:
            </div>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <span className="text-slate-400 self-center">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getFullYear(), now.getMonth(), 1);
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                setDateRange({
                  start: start.toISOString().split('T')[0],
                  end: end.toISOString().split('T')[0]
                });
              }}
              className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors"
            >
              Mes actual
            </button>
          </div>

          {/* Filtros adicionales */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Filter size={18} className="text-purple-600" />
              Filtros
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-4">
              {/* Filtro por Paciente */}
              <div className="flex flex-col gap-1.5 min-w-[200px]">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <User size={14} className="text-blue-600" />
                  Paciente
                </label>
                <select
                  value={filterPatient}
                  onChange={(e) => setFilterPatient(e.target.value)}
                  className="px-4 py-2.5 border-2 border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-slate-400 transition-colors cursor-pointer"
                >
                  <option value="all">👥 Todos los pacientes</option>
                  {Array.from(patients.values()).map((patient: Patient) => (
                    <option key={patient.id} value={patient.id}>
                      👤 {patient.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Estado de Pago */}
              <div className="flex flex-col gap-1.5 min-w-[180px]">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <DollarSign size={14} className="text-green-600" />
                  Estado de Pago
                </label>
                <select
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                  className="px-4 py-2.5 border-2 border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white hover:border-slate-400 transition-colors cursor-pointer"
                >
                  <option value="all">💰 Todas</option>
                  <option value="paid">✅ Pagadas</option>
                  <option value="unpaid">⏳ Por pagar</option>
                </select>
              </div>
            </div>

            {/* Filtro por Estados (multi-selección) */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estados</label>
              <div className="flex flex-wrap items-center gap-2">
                {[{value: 'scheduled', label: 'Programada', icon: '📅'}, 
                  {value: 'completed', label: 'Completada', icon: '✅'}, 
                  {value: 'cancelled', label: 'Cancelada', icon: '❌'}].map(status => {
                  const isSelected = filterStatus.includes(status.value);
                  return (
                    <button
                      key={status.value}
                      onClick={() => {
                        if (isSelected) {
                          setFilterStatus(filterStatus.filter(s => s !== status.value));
                        } else {
                          setFilterStatus([...filterStatus, status.value]);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:shadow-lg'
                          : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span className={isSelected ? 'text-indigo-200' : 'text-slate-500'}>{status.icon}</span>
                      {status.label}
                      {isSelected && (
                        <XIcon size={12} className="ml-0.5" />
                      )}
                    </button>
                  );
                })}
                {filterStatus.length > 0 && (
                  <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-200">
                    {filterStatus.length} seleccionado{filterStatus.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Filtro por Tags */}
            {allTags.length > 0 && (
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tags</label>
                <div className="flex flex-wrap items-center gap-2">
                  {allTags.map(tag => {
                    const isSelected = filterTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => {
                          if (isSelected) {
                            setFilterTags(filterTags.filter(t => t !== tag));
                          } else {
                            setFilterTags([...filterTags, tag]);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700 hover:shadow-lg'
                            : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <span className={isSelected ? 'text-purple-200' : 'text-slate-500'}>🏷️</span>
                        {tag}
                        {isSelected && (
                          <XIcon size={12} className="ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                  {filterTags.length > 0 && (
                    <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-full border border-purple-200">
                      {filterTags.length} seleccionada{filterTags.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Botón para limpiar filtros */}
            {(filterPatient !== 'all' || filterStatus.length !== 2 || filterPayment !== 'all' || filterTags.length > 0) && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setFilterPatient('all');
                    setFilterStatus(['scheduled', 'completed']);
                    setFilterPayment('all');
                    setFilterTags([]);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 hover:border-red-300 transition-colors"
                >
                  <XIcon size={16} />
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Summary */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Sessions Completed */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-purple-700">Sesiones Completadas</div>
              <Calendar className="text-purple-400" size={20} />
            </div>
            <div className="text-3xl font-bold text-purple-900">{completedSessions.length}</div>
            <div className="text-xs text-purple-600 mt-1">en el periodo</div>
          </div>

          {/* Total Earnings */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-green-700">Ganancias Totales</div>
              <DollarSign className="text-green-400" size={20} />
            </div>
            <div className="text-3xl font-bold text-green-900">{totalEarnings.toFixed(2)} €</div>
            <div className="text-xs text-green-600 mt-1">completadas</div>
          </div>

          {/* Potential Earnings */}
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl border border-indigo-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-indigo-700">Ganancias Potenciales</div>
              <DollarSign className="text-indigo-400" size={20} />
            </div>
            <div className="text-3xl font-bold text-indigo-900">{potentialEarnings.toFixed(2)} €</div>
            <div className="text-xs text-indigo-600 mt-1">
              {completedSessions.length + scheduledSessions.length} sesiones (completadas + programadas)
            </div>
          </div>

          {/* Total Collected */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-blue-700">Total Cobrado</div>
              <CheckCircle className="text-blue-400" size={20} />
            </div>
            <div className="text-3xl font-bold text-blue-900">{paidEarnings.toFixed(2)} €</div>
            <div className="text-xs text-blue-600 mt-1">{paidSessions.length} sesiones pagadas</div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {displayedSessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Calendar className="mx-auto text-slate-300 mb-3" size={48} />
          <p className="text-slate-500">
            {sessions.length === 0 
              ? 'No hay sesiones en el rango de fechas seleccionado'
              : 'No hay sesiones para mostrar (todas están canceladas)'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedSessions.map((session) => {
            const patientId = session.patient_user_id || session.patientId;
            const patient = patients.get(patientId);
            const earnings = getPsychologistEarnings(session);
            const isPaid = isSessionPaid(session.id);
            
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-all cursor-pointer hover:border-purple-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: Date, Time & Patient */}
                  <div className="flex items-start gap-3">
                    <div className="bg-purple-100 rounded-lg p-3 text-center min-w-[60px]">
                      <div className="text-xs font-semibold text-purple-600 uppercase">
                        {new Date(session.date).toLocaleDateString('es-ES', { month: 'short' })}
                      </div>
                      <div className="text-2xl font-bold text-purple-900">
                        {new Date(session.date).getDate()}
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <User size={16} className="text-slate-400" />
                        <span className="font-semibold text-slate-800">
                          {patient?.name || 'Paciente no disponible'}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500 flex items-center gap-2">
                        <Clock size={14} />
                        {session.startTime} - {session.endTime}
                      </div>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {getStatusBadge(session.status)}
                        {/* Tags */}
                        {session.tags && session.tags.length > 0 && (
                          <>
                            {session.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-medium border border-purple-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Financial Info */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Tu ganancia</div>
                      <div className="text-2xl font-bold text-green-600 flex items-center gap-1">
                        {earnings.toFixed(2)} €
                      </div>
                      <div className="text-xs text-slate-400">
                        ({session.percent_psych || 70}% de {session.price?.toFixed(2) || '0.00'}€)
                      </div>
                    </div>
                    
                    <div>
                      {(isPaid || session.paid) ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold border border-green-200">
                          <CheckCircle size={12} />
                          💵 Pagada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold border border-amber-200">
                          <Clock size={12} />
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Session Modal */}
      {selectedSession && editedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Editar Sesión</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XIcon size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Patient Name (Read-only) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Paciente</label>
                <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {patients.get(editedSession.patient_user_id || editedSession.patientId)?.name || 'Paciente no disponible'}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={editedSession.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora inicio</label>
                  <input
                    type="time"
                    value={editedSession.startTime}
                    onChange={(e) => handleFieldChange('startTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora fin</label>
                  <input
                    type="time"
                    value={editedSession.endTime}
                    onChange={(e) => handleFieldChange('endTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de sesión</label>
                <select
                  value={editedSession.type}
                  onChange={(e) => handleFieldChange('type', e.target.value as 'in-person' | 'online' | 'home-visit')}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="online">Online</option>
                  <option value="in-person">Presencial</option>
                  <option value="home-visit">Visita a domicilio</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Estado</label>
                <select
                  value={editedSession.status}
                  onChange={(e) => handleFieldChange('status', e.target.value as Session['status'])}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="scheduled">Programada</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="paid">Pagada</option>
                </select>
              </div>

              {/* Paid Checkbox */}
              <div>
                <label className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={editedSession.paid || false}
                    onChange={(e) => handleFieldChange('paid', e.target.checked)}
                    className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-2 focus:ring-green-500"
                  />
                  <div>
                    <div className="font-semibold text-green-700">Sesión pagada</div>
                    <div className="text-xs text-green-600">Marcar como pagada independientemente del estado</div>
                  </div>
                </label>
              </div>

              {/* Price and Percent */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Precio por hora (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editedSession.price || 0}
                    onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Duración: {getSessionDurationHours(editedSession).toFixed(2)}h → Total: {getSessionTotalPrice(editedSession).toFixed(2)}€
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">% Psicólogo</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editedSession.percent_psych || 0}
                    onChange={(e) => handleFieldChange('percent_psych', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Meet Link */}
              {editedSession.type === 'online' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Enlace de reunión</label>
                  <input
                    type="url"
                    value={editedSession.meetLink || ''}
                    onChange={(e) => handleFieldChange('meetLink', e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Notas</label>
                <textarea
                  value={editedSession.notes || ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  rows={4}
                  placeholder="Notas sobre la sesión..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Tags (Read-only - heredadas de la relación) */}
              {editedSession.tags && editedSession.tags.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Tags de la Relación</label>
                  <div className="flex flex-wrap gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    {editedSession.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Las tags se configuran en los ajustes de relación del paciente
                  </p>
                </div>
              )}

              {/* Earnings Preview */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-green-700 mb-1">Tu ganancia estimada</div>
                <div className="text-2xl font-bold text-green-900">
                  {getPsychologistEarnings(editedSession).toFixed(2)} €
                </div>
                <div className="text-xs text-green-600 mt-1">
                  {(editedSession.percent_psych || 0).toFixed(0)}% de {getSessionTotalPrice(editedSession).toFixed(2)}€ ({(editedSession.price || 0).toFixed(2)}€/h × {getSessionDurationHours(editedSession).toFixed(2)}h)
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={handleCloseModal}
                disabled={isSaving}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSession}
                disabled={isSaving}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Guardar cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionsList;
