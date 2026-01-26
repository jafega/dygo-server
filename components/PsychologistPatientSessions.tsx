import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Video, MapPin, CheckCircle, XCircle, DollarSign, Filter, Save, X, Trash2, FileText, Receipt, Ticket } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';
import SessionDetailsModal from './SessionDetailsModal';

interface Session {
  id: string;
  patientId: string;
  patient_user_id?: string;
  patientName: string;
  patientPhone?: string;
  date: string;
  startTime: string;
  endTime: string;
  starts_on?: string;
  ends_on?: string;
  type: 'in-person' | 'online' | 'home-visit';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available' | 'paid';
  notes?: string;
  meetLink?: string;
  price: number;
  paid: boolean;
  percent_psych: number;
  tags?: string[];
  session_entry_id?: string;
  invoice_id?: string;
  bonus_id?: string;
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
  const [filterEntry, setFilterEntry] = useState<string[]>(['with-entry', 'without-entry']);
  const [sessionDetailsModalOpen, setSessionDetailsModalOpen] = useState(false);
  const [selectedSessionForDetails, setSelectedSessionForDetails] = useState<Session | null>(null);
  const [sessionEntries, setSessionEntries] = useState<Map<string, { status: 'pending' | 'done' }>>(new Map());
  
  // Estados para bonos
  const [availableBonos, setAvailableBonos] = useState<any[]>([]);
  const [isLoadingBonos, setIsLoadingBonos] = useState(false);
  const [isAssigningBono, setIsAssigningBono] = useState(false);
  
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
        
        // Cargar session_entries para mostrar estados
        const entriesResponse = await fetch(`${API_URL}/session-entries?target_user_id=${patientId}`);
        if (entriesResponse.ok) {
          const entries = await entriesResponse.json();
          const entriesMap = new Map();
          entries.forEach((entry: any) => {
            // Usar entry.id como clave para que coincida con session.session_entry_id
            entriesMap.set(entry.id, { status: entry.data?.status || entry.status || 'pending' });
          });
          setSessionEntries(entriesMap);
        }
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setIsLoading(false);
  };

  
  const handleOpenSession = (session: Session) => {
    setSelectedSession(session);
    setEditedSession({ ...session });
    loadAvailableBonos(session.patient_user_id || session.patientId);
  };
  
  const loadAvailableBonos = async (patientUserId: string) => {
    if (!patientUserId) return;
    
    setIsLoadingBonos(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      const response = await fetch(
        `${API_URL}/bonos/available/${patientUserId}?psychologist_user_id=${currentUser.id}`
      );
      
      if (response.ok) {
        const bonos = await response.json();
        setAvailableBonos(bonos);
      }
    } catch (error) {
      console.error('Error loading available bonos:', error);
    } finally {
      setIsLoadingBonos(false);
    }
  };

  const handleAssignBono = async (bonoId: string) => {
    if (!editedSession) return;
    
    setIsAssigningBono(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${editedSession.id}/assign-bonus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bonus_id: bonoId })
      });
      
      if (response.ok) {
        alert('Sesión asignada al bono correctamente');
        setEditedSession({ ...editedSession, bonus_id: bonoId });
        await loadAvailableBonos(editedSession.patient_user_id || editedSession.patientId);
        await loadSessions(); // Recargar la lista de sesiones
      } else {
        const error = await response.json();
        alert(error.error || 'Error al asignar sesión al bono');
      }
    } catch (error) {
      console.error('Error assigning bono:', error);
      alert('Error al asignar sesión al bono');
    } finally {
      setIsAssigningBono(false);
    }
  };

  const handleUnassignBono = async () => {
    if (!editedSession) return;
    
    if (!confirm('¿Estás seguro de que quieres desasignar esta sesión del bono?')) return;
    
    setIsAssigningBono(true);
    try {
      const response = await fetch(`${API_URL}/sessions/${editedSession.id}/assign-bonus`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        alert('Sesión desasignada del bono correctamente');
        setEditedSession({ ...editedSession, bonus_id: undefined });
        await loadAvailableBonos(editedSession.patient_user_id || editedSession.patientId);
        await loadSessions(); // Recargar la lista de sesiones
      } else {
        const error = await response.json();
        alert(error.error || 'Error al desasignar sesión del bono');
      }
    } catch (error) {
      console.error('Error unassigning bono:', error);
      alert('Error al desasignar sesión del bono');
    } finally {
      setIsAssigningBono(false);
    }
  };

  const handleOpenSessionDetails = async (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Si ya tiene entrada, abrir directamente para editar
    if (session.session_entry_id) {
      setSelectedSessionForDetails(session);
      setSessionDetailsModalOpen(true);
    } else {
      // Si no tiene entrada, crear una vacía automáticamente
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
          alert('Error: Usuario no autenticado');
          return;
        }

        const sessionEntryData = {
          session_id: session.id,
          creator_user_id: currentUser.id,
          target_user_id: session.patient_user_id || session.patientId,
          transcript: '',
          summary: '',
          status: 'pending',
          entry_type: 'session_note'
        };

        const response = await fetch(`${API_URL}/session-entries`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify(sessionEntryData)
        });

        if (response.ok) {
          const savedEntry = await response.json();
          console.log('✅ Session entry creada automáticamente:', savedEntry.id);
          
          // Actualizar la sesión con el session_entry_id (el backend ya lo hace en Supabase)
          session.session_entry_id = savedEntry.id;
          
          setSelectedSessionForDetails(session);
          setSessionDetailsModalOpen(true);
        } else {
          console.error('Error creando session entry automáticamente');
          alert('Error al crear la entrada de sesión');
        }
      } catch (error) {
        console.error('Error creando session entry:', error);
        alert('Error al crear la entrada de sesión');
      }
    }
  };

  const handleCloseSessionDetails = () => {
    setSessionDetailsModalOpen(false);
    setSelectedSessionForDetails(null);
  };

  const handleSaveSessionDetails = () => {
    loadSessions();
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

  const handleDeleteSession = async () => {
    if (!editedSession) return;

    if (!confirm('¿Estás seguro de que quieres eliminar esta sesión? Esta acción no se puede deshacer.')) {
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await fetch(`${API_URL}/sessions/${editedSession.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        await loadSessions();
        handleCloseModal();
        alert('Sesión eliminada correctamente');
      } else {
        const error = await response.json();
        alert('Error al eliminar la sesión: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error al eliminar la sesión');
    } finally {
      setIsSaving(false);
    }
  };

  const getSessionDurationHours = (session: Session): number => {
    // Priorizar usar starts_on y ends_on de Supabase si existen
    if (session.starts_on && session.ends_on) {
      const startDate = new Date(session.starts_on);
      const endDate = new Date(session.ends_on);
      
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      
      // Solo retornar si la duración es positiva y razonable (máx 24 horas)
      if (durationHours > 0 && durationHours <= 24) {
        return durationHours;
      }
    }
    
    // Fallback: intentar construir desde date + startTime/endTime
    if (session.date && session.startTime && session.endTime) {
      const startDate = new Date(session.date + 'T' + session.startTime);
      const endDate = new Date(session.date + 'T' + session.endTime);
      
      // Si endTime es menor que startTime, asumir que termina al día siguiente
      if (session.endTime < session.startTime) {
        endDate.setDate(endDate.getDate() + 1);
      }
      
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      
      if (durationHours > 0 && durationHours <= 24) {
        return durationHours;
      }
    }
    
    // Último fallback: usar startTime y endTime para calcular minutos
    if (session.startTime && session.endTime) {
      const [startHour, startMin] = session.startTime.split(':').map(Number);
      const [endHour, endMin] = session.endTime.split(':').map(Number);
      
      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;
      
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60;
      }
      
      const durationMinutes = endMinutes - startMinutes;
      return durationMinutes / 60;
    }
    
    // Si no hay información de tiempo, asumir 1 hora por defecto
    return 1;
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

  const toggleEntryFilter = (option: string) => {
    if (filterEntry.includes(option)) {
      setFilterEntry(filterEntry.filter(e => e !== option));
    } else {
      setFilterEntry([...filterEntry, option]);
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
    
    // Filtro de entradas
    if (filterEntry.length === 0) return false;
    
    const hasEntry = session.session_entry_id;
    const entryStatus = hasEntry ? sessionEntries.get(session.session_entry_id)?.status : undefined;
    const hasCompletedEntry = hasEntry && entryStatus === 'done';
    const hasIncompleteEntry = hasEntry && entryStatus !== 'done';
    
    const showWithEntry = filterEntry.includes('with-entry');
    const showWithoutEntry = filterEntry.includes('without-entry');
    
    let matchesEntry = false;
    
    // Si ambos están seleccionados, mostrar todo
    if (showWithEntry && showWithoutEntry) {
      matchesEntry = true;
    }
    // Si solo "Completada" está seleccionado, mostrar solo las que tienen entrada completada
    else if (showWithEntry && !showWithoutEntry) {
      matchesEntry = hasCompletedEntry;
    }
    // Si solo "Sin completar" está seleccionado, mostrar las que no tienen entrada o la tienen incompleta
    else if (showWithoutEntry && !showWithEntry) {
      matchesEntry = !hasEntry || hasIncompleteEntry;
    }
    
    return matchesStatus && matchesPayment && matchesEntry;
  });

  const completedSessions = displayedSessions.filter(s => s.status === 'completed');
  const totalSessionValue = completedSessions.reduce((sum, s) => sum + getSessionTotalPrice(s), 0);
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
    <div className="h-full overflow-auto bg-slate-50 p-2 sm:p-4 space-y-3 sm:space-y-4">
      {/* Header with Filters */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-2">
            <Calendar className="text-purple-600 w-[18px] h-[18px] sm:w-5 sm:h-5" />
            <h3 className="text-base sm:text-lg font-bold text-slate-800">Sesiones del Paciente</h3>
          </div>
          <div className="text-xs sm:text-sm text-slate-500">
            Total: <span className="font-bold text-slate-800">{sessions.length}</span>
          </div>
        </div>

        {/* Date Range */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700">
            <Filter size={14} />
            Periodo:
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-2.5 sm:px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500"
            />
            <span className="text-slate-400 self-center hidden sm:inline">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-2.5 sm:px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500"
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
              className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-xs sm:text-sm font-medium hover:bg-purple-200"
            >
              Mes actual
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <label className="text-[10px] sm:text-xs font-semibold text-slate-600 uppercase">Estado</label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {[
              { value: 'scheduled', label: 'Programadas' },
              { value: 'completed', label: 'Completadas' },
              { value: 'cancelled', label: 'Canceladas' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => toggleStatusFilter(option.value)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
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
          <label className="text-[10px] sm:text-xs font-semibold text-slate-600 uppercase">Pago</label>
          <div className="flex gap-1.5 sm:gap-2">
            {[
              { value: 'all', label: 'Todas' },
              { value: 'paid', label: 'Pagadas' },
              { value: 'unpaid', label: 'Pendientes' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setFilterPayment(option.value)}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
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

        {/* Entry Filter */}
        <div className="space-y-2">
          <label className="text-[10px] sm:text-xs font-semibold text-slate-600 uppercase">Entrada</label>
          <div className="flex gap-1.5 sm:gap-2">
            {[
              { value: 'with-entry', label: 'Completada' },
              { value: 'without-entry', label: 'Sin completar' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => toggleEntryFilter(option.value)}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
                  filterEntry.includes(option.value)
                    ? 'bg-blue-600 text-white'
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg sm:rounded-xl border border-green-200 p-2.5 sm:p-4 shadow-sm">
            <div className="text-[10px] sm:text-xs font-semibold text-green-700 mb-1 sm:mb-2">Completadas</div>
            <div className="text-xl sm:text-2xl font-bold text-green-900">{completedSessions.length}</div>
            <div className="text-[9px] sm:text-xs text-green-600 mt-0.5 sm:mt-1">sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg sm:rounded-xl border border-indigo-200 p-2.5 sm:p-4 shadow-sm">
            <div className="text-[10px] sm:text-xs font-semibold text-indigo-700 mb-1 sm:mb-2">Valor Total</div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-900">{totalSessionValue.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-xs text-indigo-600 mt-0.5 sm:mt-1">{completedSessions.length} sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg sm:rounded-xl border border-emerald-200 p-2.5 sm:p-4 shadow-sm">
            <div className="text-[10px] sm:text-xs font-semibold text-emerald-700 mb-1 sm:mb-2">Mi Ganancia</div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-900">{totalEarnings.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-xs text-emerald-600 mt-0.5 sm:mt-1">{completedSessions.length} sesiones</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg sm:rounded-xl border border-blue-200 p-2.5 sm:p-4 shadow-sm">
            <div className="text-[10px] sm:text-xs font-semibold text-blue-700 mb-1 sm:mb-2">Cobrado</div>
            <div className="text-xl sm:text-2xl font-bold text-blue-900">{paidEarnings.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1">{paidSessions.length} sesiones</div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {displayedSessions.length === 0 ? (
        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-6 sm:p-8 text-center">
          <Calendar className="mx-auto text-slate-300 mb-3" size={32} />
          <p className="text-slate-500 text-xs sm:text-sm">
            {sessions.length === 0 
              ? 'No hay sesiones en este periodo'
              : 'No hay sesiones con los filtros seleccionados'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayedSessions.map((session) => {
            const earnings = getPsychologistEarnings(session);
            const isCompleted = session.status === 'completed';
            
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="bg-white rounded-lg border border-slate-200 p-2.5 sm:p-3 hover:shadow-md transition-all cursor-pointer hover:border-purple-300"
              >
                <div className="flex items-start justify-between gap-2 sm:gap-3">
                  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="bg-purple-100 rounded-lg p-1.5 sm:p-2 text-center min-w-[40px] sm:min-w-[50px] flex-shrink-0">
                      <div className="text-[9px] sm:text-[10px] font-semibold text-purple-600 uppercase">
                        {new Date(session.date).toLocaleDateString('es-ES', { month: 'short' })}
                      </div>
                      <div className="text-lg sm:text-xl font-bold text-purple-900">
                        {new Date(session.date).getDate()}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm text-slate-500 flex items-center gap-1.5 sm:gap-2 mb-1">
                        <Clock size={12} />
                        <span className="truncate">{session.startTime} - {session.endTime}</span>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap mb-1.5 sm:mb-2">
                        {getStatusBadge(session.status)}
                        {session.type === 'online' && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-indigo-50 text-indigo-700 rounded-full text-[9px] sm:text-xs">
                            <Video size={10} className="sm:w-3 sm:h-3" />
                            <span className="hidden sm:inline">Online</span>
                          </span>
                        )}
                        {session.paid && session.status === 'completed' && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-green-50 text-green-700 rounded-full text-[9px] sm:text-xs">
                            <DollarSign size={10} className="sm:w-3 sm:h-3" />
                            <span className="hidden sm:inline">Pagada</span>
                          </span>
                        )}
                        {session.invoice_id && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-emerald-50 text-emerald-700 rounded-full text-[9px] sm:text-xs">
                            <Receipt size={10} className="sm:w-3 sm:h-3" />
                            <span className="hidden sm:inline">Facturada</span>
                          </span>
                        )}
                        {session.bonus_id && (
                          <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-purple-50 text-purple-700 rounded-full text-[9px] sm:text-xs">
                            <Ticket size={10} className="sm:w-3 sm:h-3" />
                            <span className="hidden sm:inline">Bono</span>
                          </span>
                        )}
                      </div>
                      {session.notes && (
                        <div className="text-[10px] sm:text-xs text-slate-500 line-clamp-1">{session.notes}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isCompleted && (
                      <button
                        onClick={(e) => handleOpenSessionDetails(session, e)}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 transition-all flex items-center justify-center group ${
                          !session.session_entry_id
                            ? 'border-red-300 bg-red-50 hover:border-red-500 hover:bg-red-100'
                            : sessionEntries.get(session.session_entry_id)?.status === 'done'
                            ? 'border-green-500 bg-green-50 hover:bg-green-100'
                            : 'border-orange-400 bg-orange-50 hover:border-orange-500 hover:bg-orange-100'
                        }`}
                        title={
                          !session.session_entry_id
                            ? 'Rellenar detalles de sesión'
                            : sessionEntries.get(session.session_entry_id)?.status === 'done'
                            ? 'Detalles completados - Click para editar'
                            : 'Detalles pendientes - Click para completar'
                        }
                      >
                        {!session.session_entry_id ? (
                          <FileText size={16} className="text-red-500 group-hover:text-red-600" />
                        ) : sessionEntries.get(session.session_entry_id)?.status === 'done' ? (
                          <CheckCircle size={16} className="text-green-600" />
                        ) : (
                          <FileText size={16} className="text-orange-500 group-hover:text-orange-600" />
                        )}
                      </button>
                    )}
                    <div className="text-right">
                      <div className="text-base sm:text-lg font-bold text-purple-900">{earnings.toFixed(2)} €</div>
                      <div className="text-[9px] sm:text-xs text-slate-500">ganancia</div>
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

              {/* Sección de Bonos - Solo si no tiene invoice_id */}
              {!editedSession.invoice_id && (
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700">Gestión de Bonos</label>
                  
                  {editedSession.bonus_id ? (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-purple-700">
                          <Ticket size={16} />
                          <span className="text-sm font-medium">Asignada a bono</span>
                        </div>
                        <button
                          onClick={handleUnassignBono}
                          disabled={isAssigningBono}
                          className="text-xs text-purple-600 hover:text-purple-800 underline disabled:opacity-50"
                        >
                          Desasignar
                        </button>
                      </div>
                      <p className="text-xs text-purple-600 mt-1">Esta sesión pertenece a un bono del paciente</p>
                    </div>
                  ) : availableBonos.length > 0 ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-blue-900">Asignar a bono</span>
                        <p className="text-xs text-blue-600 mt-0.5">El paciente tiene bonos disponibles</p>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {availableBonos.map(bono => (
                          <button
                            key={bono.id}
                            onClick={() => handleAssignBono(bono.id)}
                            disabled={isAssigningBono}
                            className="w-full text-left px-3 py-2 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-sm font-medium text-blue-900">
                                  Bono - {bono.total_price_bono_amount}€
                                </div>
                                <div className="text-xs text-blue-600">
                                  {bono.sessions_remaining} sesión{bono.sessions_remaining !== 1 ? 'es' : ''} disponible{bono.sessions_remaining !== 1 ? 's' : ''}
                                </div>
                              </div>
                              <div className="text-xs text-blue-500">
                                {new Date(bono.created_at).toLocaleDateString('es-ES')}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-slate-600">
                        <XCircle size={16} />
                        <span className="text-sm font-medium">Sin asignar</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {isLoadingBonos ? 'Cargando bonos...' : 'El paciente no tiene bonos disponibles'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {editedSession.invoice_id && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <Receipt size={16} />
                    <span className="text-sm font-medium">Facturada</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">Esta sesión está asociada a una factura</p>
                </div>
              )}

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

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={handleDeleteSession}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar
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

      {/* Session Details Modal */}
      {sessionDetailsModalOpen && selectedSessionForDetails && (
        <SessionDetailsModal
          session={selectedSessionForDetails}
          onClose={handleCloseSessionDetails}
          onSave={handleSaveSessionDetails}
        />
      )}
    </div>
  );
};

export default PsychologistPatientSessions;
