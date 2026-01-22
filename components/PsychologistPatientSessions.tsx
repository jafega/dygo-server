import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Video, MapPin, CheckCircle, XCircle, DollarSign, Filter, Save, X } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';

interface Session {
  id: string;
  patientId: string;
  patient_user_id?: string;
  patientName: string;
  patientPhone?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online' | 'home-visit';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available' | 'paid';
  notes?: string;
  meetLink?: string;
  price: number;
  paid: boolean;
  percent_psych: number;
  tags?: string[];
}

interface PsychologistPatientSessionsProps {
  patientId: string;
  psychologistId: string;
}

const PsychologistPatientSessions: React.FC<PsychologistPatientSessionsProps> = ({ patientId, psychologistId }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [editedSession, setEditedSession] = useState<Session | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string[]>(['scheduled', 'completed']);
  const [filterPayment, setFilterPayment] = useState<string>('all');
  
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
    loadSessions();
  }, [psychologistId, patientId, dateRange]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ 
        psychologistId,
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      
      const response = await fetch(`${API_URL}/sessions?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        const patientSessions = data.filter((s: Session) => 
          (s.patientId === patientId || s.patient_user_id === patientId) &&
          s.status !== 'available'
        );
        setSessions(patientSessions);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setIsLoading(false);
  };

  
  const handleOpenSession = (session: Session) => {
    setSelectedSession(session);
    setEditedSession({ ...session });
  };

  const handleCloseModal = () => {
    setSelectedSession(null);
    setEditedSession(null);
  };

  const handleFieldChange = (field: keyof Session, value: any) => {
    if (!editedSession) return;
    setEditedSession({ ...editedSession, [field]: value });
  };

  const handleSaveSession = async () => {
    if (!editedSession || !selectedSession) return;

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const updatePayload: any = {
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
        await loadSessions();
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

  const getSessionDurationHours = (session: Session): number => {
    if (!session.startTime || !session.endTime) return 1;
    
    const [startHour, startMin] = session.startTime.split(':').map(Number);
    const [endHour, endMin] = session.endTime.split(':').map(Number);
    
    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;
    
    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }
    
    const durationMinutes = endMinutes - startMinutes;
    return durationMinutes / 60;
  };

  const getSessionTotalPrice = (session: Session): number => {
    const pricePerHour = session.price || 0;
    const hours = getSessionDurationHours(session);
    return pricePerHour * hours;
  };

  const getPsychologistEarnings = (session: Session): number => {
    const totalPrice = getSessionTotalPrice(session);
    const percent = session.percent_psych || 0;
    return (totalPrice * percent) / 100;
  };

  const toggleStatusFilter = (status: string) => {
    if (filterStatus.includes(status)) {
      setFilterStatus(filterStatus.filter(s => s !== status));
    } else {
      setFilterStatus([...filterStatus, status]);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock },
      completed: { label: 'Completada', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
      cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
      paid: { label: 'Pagada', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle }
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

  const sortedSessions = [...sessions].sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.startTime}`);
    const dateB = new Date(`${b.date} ${b.startTime}`);
    return dateB.getTime() - dateA.getTime();
  });

  const displayedSessions = sortedSessions.filter(session => {
    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(session.status);
    const isPaid = session.paid;
    const matchesPayment = filterPayment === 'all' || 
                          (filterPayment === 'paid' && isPaid) || 
                          (filterPayment === 'unpaid' && !isPaid);
    return matchesStatus && matchesPayment;
  });

  const completedSessions = displayedSessions.filter(s => s.status === 'completed');
  const totalEarnings = completedSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);
  const paidSessions = displayedSessions.filter(s => s.paid && s.status !== 'cancelled');
  const paidEarnings = paidSessions.reduce((sum, s) => sum + getPsychologistEarnings(s), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 space-y-4">
      {/* Header with Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="text-purple-600" size={20} />
            <h3 className="text-lg font-bold text-slate-800">Sesiones del Paciente</h3>
          </div>
          <div className="text-sm text-slate-500">
            Total: <span className="font-bold text-slate-800">{sessions.length}</span>
          </div>
        </div>

        {/* Date Range */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Filter size={16} />
            Periodo:
          </div>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
          />
          <span className="text-slate-400 self-center">—</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
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
            className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200"
          >
            Mes actual
          </button>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 uppercase">Estado</label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'scheduled', label: 'Programadas' },
              { value: 'completed', label: 'Completadas' },
              { value: 'paid', label: 'Pagadas' },
              { value: 'cancelled', label: 'Canceladas' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => toggleStatusFilter(option.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus.includes(option.value)
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Payment Filter */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600 uppercase">Pago</label>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'Todas' },
              { value: 'paid', label: 'Pagadas' },
              { value: 'unpaid', label: 'Pendientes' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setFilterPayment(option.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterPayment === option.value
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-green-700 mb-2">Completadas</div>
            <div className="text-2xl font-bold text-green-900">{completedSessions.length}</div>
            <div className="text-xs text-green-600 mt-1">sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl border border-indigo-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-indigo-700 mb-2">Generado Total</div>
            <div className="text-2xl font-bold text-indigo-900">{totalEarnings.toFixed(2)} €</div>
            <div className="text-xs text-indigo-600 mt-1">{completedSessions.length} sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-blue-700 mb-2">Cobrado</div>
            <div className="text-2xl font-bold text-blue-900">{paidEarnings.toFixed(2)} €</div>
            <div className="text-xs text-blue-600 mt-1">{paidSessions.length} sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-4 shadow-sm">
            <div className="text-xs font-semibold text-purple-700 mb-2">Total Sesiones</div>
            <div className="text-2xl font-bold text-purple-900">{sessions.length}</div>
            <div className="text-xs text-purple-600 mt-1">en el periodo</div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {displayedSessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Calendar className="mx-auto text-slate-300 mb-3" size={40} />
          <p className="text-slate-500 text-sm">
            {sessions.length === 0 
              ? 'No hay sesiones en este periodo'
              : 'No hay sesiones con los filtros seleccionados'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedSessions.map((session) => {
            const earnings = getPsychologistEarnings(session);
            
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="bg-white rounded-lg border border-slate-200 p-3 hover:shadow-md transition-all cursor-pointer hover:border-purple-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="bg-purple-100 rounded-lg p-2 text-center min-w-[50px]">
                      <div className="text-[10px] font-semibold text-purple-600 uppercase">
                        {new Date(session.date).toLocaleDateString('es-ES', { month: 'short' })}
                      </div>
                      <div className="text-xl font-bold text-purple-900">
                        {new Date(session.date).getDate()}
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="text-sm text-slate-500 flex items-center gap-2 mb-1">
                        <Clock size={14} />
                        {session.startTime} - {session.endTime}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {getStatusBadge(session.status)}
                        {session.type === 'online' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs">
                            <Video size={12} />
                            Online
                          </span>
                        )}
                        {session.paid && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs">
                            <DollarSign size={12} />
                            Pagada
                          </span>
                        )}
                      </div>
                      {session.notes && (
                        <div className="text-xs text-slate-500 line-clamp-1">{session.notes}</div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-900">{earnings.toFixed(2)} €</div>
                    <div className="text-xs text-slate-500">tu ganancia</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Session Modal */}
      {selectedSession && editedSession && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 rounded-t-2xl z-10">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Editar Sesión</h3>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={editedSession.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

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

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo</label>
                <select
                  value={editedSession.type}
                  onChange={(e) => handleFieldChange('type', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="online">Online</option>
                  <option value="in-person">Presencial</option>
                  <option value="home-visit">Visita a domicilio</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Estado</label>
                <select
                  value={editedSession.status}
                  onChange={(e) => handleFieldChange('status', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="scheduled">Programada</option>
                  <option value="completed">Completada</option>
                  <option value="cancelled">Cancelada</option>
                  <option value="paid">Pagada</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100">
                  <input
                    type="checkbox"
                    checked={editedSession.paid || false}
                    onChange={(e) => handleFieldChange('paid', e.target.checked)}
                    className="w-5 h-5 rounded border-green-300 text-green-600"
                  />
                  <div>
                    <div className="font-semibold text-green-700 text-sm">Sesión pagada</div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Precio/h (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editedSession.price || 0}
                    onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Total: {getSessionTotalPrice(editedSession).toFixed(2)}€
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
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {editedSession.type === 'online' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Enlace</label>
                  <input
                    type="url"
                    value={editedSession.meetLink || ''}
                    onChange={(e) => handleFieldChange('meetLink', e.target.value)}
                    placeholder="https://meet.google.com/..."
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Notas</label>
                <textarea
                  value={editedSession.notes || ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-green-700">Tu ganancia</div>
                <div className="text-2xl font-bold text-green-900">
                  {getPsychologistEarnings(editedSession).toFixed(2)} €
                </div>
                <div className="text-xs text-green-600 mt-1">
                  {(editedSession.percent_psych || 0).toFixed(0)}% de {getSessionTotalPrice(editedSession).toFixed(2)}€
                </div>
              </div>
            </div>

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
                    Guardar
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

export default PsychologistPatientSessions;
