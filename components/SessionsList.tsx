import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, Clock, DollarSign, User, Filter, Edit2, Save, X as XIcon, FileText, Trash2, Receipt, Ticket } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';
import SessionDetailsModal from './SessionDetailsModal';

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
  session_entry_id?: string;
  invoice_id?: string;
  bonus_id?: string;
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
  const [allPsychologistTags, setAllPsychologistTags] = useState<string[]>([]);
  const [sessionDetailsModalOpen, setSessionDetailsModalOpen] = useState(false);
  const [selectedSessionForDetails, setSelectedSessionForDetails] = useState<Session | null>(null);
  const [sessionEntries, setSessionEntries] = useState<Map<string, { status: 'pending' | 'done' }>>(new Map());
  
  // Estados para bonos
  const [availableBonos, setAvailableBonos] = useState<any[]>([]);
  const [isLoadingBonos, setIsLoadingBonos] = useState(false);
  const [isAssigningBono, setIsAssigningBono] = useState(false);
  
  // Filter states
  const [filterPatient, setFilterPatient] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string[]>(['scheduled', 'completed']); // Por defecto todas menos canceladas
  const [filterPayment, setFilterPayment] = useState<string>('all'); // 'all', 'paid', 'unpaid'
  const [filterEntry, setFilterEntry] = useState<string[]>(['with-entry', 'without-entry']);
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

  // Colores predefinidos para las etiquetas (20 colores diferentes)
  const tagColors = [
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-yellow-100 text-yellow-700 border-yellow-200',
    'bg-red-100 text-red-700 border-red-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
    'bg-teal-100 text-teal-700 border-teal-200',
    'bg-orange-100 text-orange-700 border-orange-200',
    'bg-lime-100 text-lime-700 border-lime-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-sky-100 text-sky-700 border-sky-200',
    'bg-violet-100 text-violet-700 border-violet-200',
    'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-slate-100 text-slate-700 border-slate-200',
    'bg-stone-100 text-stone-700 border-stone-200',
    'bg-zinc-100 text-zinc-700 border-zinc-200'
  ];

  const getTagColor = (tag: string, index: number) => {
    // Usar el índice global de todas las tags del psicólogo para colores consistentes
    const globalIndex = allPsychologistTags.indexOf(tag);
    return tagColors[globalIndex >= 0 ? globalIndex % tagColors.length : index % tagColors.length];
  };

  useEffect(() => {
    loadData();
    loadAllPsychologistTags();
  }, [psychologistId, dateRange]);

  const loadAllPsychologistTags = async () => {
    if (!psychologistId) return;
    
    try {
      const response = await fetch(`${API_URL}/relationships?psychologistId=${psychologistId}`);
      if (response.ok) {
        const relationships = await response.json();
        const allTags = new Set<string>();
        relationships.forEach((rel: any) => {
          if (rel.tags && Array.isArray(rel.tags)) {
            rel.tags.forEach((tag: string) => allTags.add(tag));
          }
        });
        setAllPsychologistTags(Array.from(allTags).sort());
      }
    } catch (error) {
      console.error('Error loading psychologist tags:', error);
    }
  };

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
        
        // Cargar session_entries para mostrar estados
        const entriesResponse = await fetch(`${API_URL}/session-entries?creator_user_id=${psychologistId}`);
        if (entriesResponse.ok) {
          const entries = await entriesResponse.json();
          const entriesMap = new Map();
          entries.forEach((entry: any) => {
            // Usar entry.id como clave para que coincida con session.session_entry_id
            entriesMap.set(entry.id, { status: entry.data?.status || entry.status || 'pending' });
          });
          setSessionEntries(entriesMap);
        }
        
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
        await loadData(); // Recargar la lista de sesiones
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
        await loadData(); // Recargar la lista de sesiones
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

  const handleCloseModal = () => {
    setSelectedSession(null);
    setEditedSession(null);
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
        await loadData();
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
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error('Error creando session entry automáticamente:', response.status, errorData);
          alert(`Error al crear la entrada de sesión: ${errorData.error || 'Error desconocido'}`);
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
    loadData();
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
    
    // Filtro de entradas
    if (filterEntry.length > 0) {
      const hasEntry = session.session_entry_id;
      const entryStatus = hasEntry ? sessionEntries.get(session.session_entry_id)?.status : undefined;
      const hasCompletedEntry = hasEntry && entryStatus === 'done';
      const hasIncompleteEntry = hasEntry && entryStatus !== 'done';
      
      const showWithEntry = filterEntry.includes('with-entry');
      const showWithoutEntry = filterEntry.includes('without-entry');
      
      // Si no hay filtros seleccionados, no mostrar nada
      if (!showWithEntry && !showWithoutEntry) return false;
      
      // Si ambos están seleccionados, mostrar todo
      if (showWithEntry && showWithoutEntry) return true;
      
      // Si solo "Completada" está seleccionado, mostrar solo las que tienen entrada completada
      if (showWithEntry && !showWithoutEntry) {
        return hasCompletedEntry;
      }
      
      // Si solo "Sin completar" está seleccionado, mostrar las que no tienen entrada o la tienen incompleta
      if (showWithoutEntry && !showWithEntry) {
        return !hasEntry || hasIncompleteEntry;
      }
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
    <div className="space-y-3 sm:space-y-4 md:space-y-6">
      {/* Header with Date Range Selector */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-3 md:p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Calendar className="text-purple-600 flex-shrink-0" size={18} />
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-800">Sesiones</h2>
            </div>
            <div className="text-xs sm:text-sm md:text-sm text-slate-500">
              Total: <span className="font-bold text-slate-800">{sessions.length}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-sm font-semibold text-slate-700">
              <Filter size={14} className="flex-shrink-0" />
              <span className="hidden sm:inline">Rango de fechas:</span>
              <span className="sm:hidden">Fechas:</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="flex-1 px-1.5 sm:px-3 py-1 sm:py-2 border border-slate-300 rounded text-[11px] sm:text-sm md:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-0"
              />
              <span className="text-slate-400 text-[10px] flex-shrink-0">—</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="flex-1 px-1.5 sm:px-3 py-1 sm:py-2 border border-slate-300 rounded text-[11px] sm:text-sm md:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent min-w-0"
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
                className="px-1.5 sm:px-3 md:px-4 py-1 sm:py-2 bg-purple-100 text-purple-700 rounded text-[10px] sm:text-sm md:text-sm font-medium hover:bg-purple-200 transition-colors flex-shrink-0 whitespace-nowrap"
              >
                <span className="hidden sm:inline">Mes actual</span>
                <span className="sm:hidden">Este mes</span>
              </button>
            </div>
          </div>

          {/* Filtros adicionales */}
          <div className="space-y-2 sm:space-y-3 md:space-y-4 pt-2 sm:pt-3 md:pt-4 border-t border-slate-200">
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-sm font-bold text-slate-700">
              <Filter size={14} className="text-purple-600 flex-shrink-0" />
              Filtros
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 sm:gap-3 md:gap-4">
              {/* Filtro por Paciente */}
              <div className="flex flex-col gap-1 sm:gap-1.5 min-w-[140px] sm:min-w-[200px]">
                <label className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs md:text-xs font-semibold text-slate-600">
                  <User size={12} className="text-blue-600 flex-shrink-0" />
                  Paciente
                </label>
                <select
                  value={filterPatient}
                  onChange={(e) => setFilterPatient(e.target.value)}
                  className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 border-2 border-slate-300 rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-slate-400 transition-colors cursor-pointer"
                >
                  <option value="all">👥 Todos</option>
                  {Array.from(patients.values()).map((patient: Patient) => (
                    <option key={patient.id} value={patient.id}>
                      👤 {patient.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro por Estado de Pago */}
              <div className="flex flex-col gap-1 sm:gap-1.5 min-w-[140px] sm:min-w-[180px]">
                <label className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs md:text-xs font-semibold text-slate-600">
                  <DollarSign size={12} className="text-green-600 flex-shrink-0" />
                  <span className="hidden sm:inline">Estado de Pago</span>
                  <span className="sm:hidden">Pago</span>
                </label>
                <select
                  value={filterPayment}
                  onChange={(e) => setFilterPayment(e.target.value)}
                  className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 border-2 border-slate-300 rounded-lg sm:rounded-xl text-xs sm:text-sm md:text-sm font-medium focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white hover:border-slate-400 transition-colors cursor-pointer"
                >
                  <option value="all">💰 Todas</option>
                  <option value="paid">✅ Pagadas</option>
                  <option value="unpaid">⏳ Por pagar</option>
                </select>
              </div>
            </div>

            {/* Filtro por Estado de Entrada */}
            <div className="flex-1">
              <label className="block text-[10px] sm:text-xs md:text-xs font-semibold text-slate-600 mb-1 sm:mb-1.5">Entrada</label>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {[{value: 'with-entry', label: 'Completada', icon: '✅'}, 
                  {value: 'without-entry', label: 'Sin completar', icon: '⏳'}].map(entry => {
                  const isSelected = filterEntry.includes(entry.value);
                  return (
                    <button
                      key={entry.value}
                      onClick={() => {
                        if (isSelected) {
                          setFilterEntry(filterEntry.filter(e => e !== entry.value));
                        } else {
                          setFilterEntry([...filterEntry, entry.value]);
                        }
                      }}
                      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs md:text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 hover:shadow-lg'
                          : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span className={isSelected ? 'text-blue-200' : 'text-slate-500'}>{entry.icon}</span>
                      <span className="hidden sm:inline">{entry.label}</span>
                      {isSelected && (
                        <XIcon size={10} className="ml-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtro por Estados (multi-selección) */}
            <div className="flex-1">
              <label className="block text-[10px] sm:text-xs md:text-xs font-semibold text-slate-600 mb-1 sm:mb-1.5">Estados</label>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                      className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs md:text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700 hover:shadow-lg'
                          : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <span className={isSelected ? 'text-indigo-200' : 'text-slate-500'}>{status.icon}</span>
                      <span className="hidden sm:inline">{status.label}</span>
                      {isSelected && (
                        <XIcon size={10} className="ml-0.5" />
                      )}
                    </button>
                  );
                })}
                {filterStatus.length > 0 && (
                  <span className="text-[10px] sm:text-xs md:text-xs font-medium text-indigo-700 bg-indigo-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-indigo-200">
                    {filterStatus.length}
                  </span>
                )}
              </div>
            </div>

            {/* Filtro por Tags */}
            {allTags.length > 0 && (
              <div className="flex-1">
                <label className="block text-[10px] sm:text-xs md:text-xs font-semibold text-slate-600 mb-1 sm:mb-1.5">Tags</label>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                        className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 md:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs md:text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700 hover:shadow-lg'
                            : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <span className={isSelected ? 'text-purple-200' : 'text-slate-500'}>🏷️</span>
                        <span className="truncate max-w-[100px] sm:max-w-none">{tag}</span>
                        {isSelected && (
                          <XIcon size={10} className="ml-0.5 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                  {filterTags.length > 0 && (
                    <span className="text-[10px] sm:text-xs md:text-xs font-medium text-purple-700 bg-purple-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-purple-200">
                      {filterTags.length}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Botón para limpiar filtros */}
            {(filterPatient !== 'all' || filterStatus.length !== 2 || filterPayment !== 'all' || filterEntry.length !== 2 || filterTags.length > 0) && (
              <div className="flex justify-end pt-1.5 sm:pt-2">
                <button
                  onClick={() => {
                    setFilterPatient('all');
                    setFilterStatus(['scheduled', 'completed']);
                    setFilterPayment('all');
                    setFilterEntry(['with-entry', 'without-entry']);
                    setFilterTags([]);
                  }}
                  className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs sm:text-sm md:text-sm font-medium hover:bg-red-100 hover:border-red-300 transition-colors"
                >
                  <XIcon size={14} className="flex-shrink-0" />
                  <span className="hidden sm:inline">Limpiar filtros</span>
                  <span className="sm:hidden">Limpiar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Summary */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          {/* Total Sessions Completed */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg sm:rounded-xl border border-purple-200 p-2 sm:p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-purple-700 leading-tight">Completadas</div>
              <Calendar className="text-purple-400 flex-shrink-0" size={14} />
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-purple-900">{completedSessions.length}</div>
            <div className="text-[9px] sm:text-[10px] md:text-xs text-purple-600 mt-0.5 sm:mt-1">en el periodo</div>
          </div>

          {/* Total Earnings */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg sm:rounded-xl border border-green-200 p-2 sm:p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-green-700 leading-tight">Ganancias</div>
              <DollarSign className="text-green-400 flex-shrink-0" size={14} />
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-green-900">{totalEarnings.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-[10px] md:text-xs text-green-600 mt-0.5 sm:mt-1">completadas</div>
          </div>

          {/* Potential Earnings */}
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg sm:rounded-xl border border-indigo-200 p-2 sm:p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-indigo-700 leading-tight">Potenciales</div>
              <DollarSign className="text-indigo-400 flex-shrink-0" size={14} />
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-indigo-900">{potentialEarnings.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-[10px] md:text-xs text-indigo-600 mt-0.5 sm:mt-1">
              <span className="hidden sm:inline">{completedSessions.length + scheduledSessions.length} sesiones</span>
              <span className="sm:hidden">{completedSessions.length + scheduledSessions.length}</span>
            </div>
          </div>

          {/* Total Collected */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg sm:rounded-xl border border-blue-200 p-2 sm:p-3 md:p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1 sm:mb-1.5 md:mb-2">
              <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-blue-700 leading-tight">Cobrado</div>
              <CheckCircle className="text-blue-400 flex-shrink-0" size={14} />
            </div>
            <div className="text-lg sm:text-2xl md:text-3xl font-bold text-blue-900">{paidEarnings.toFixed(2)} €</div>
            <div className="text-[9px] sm:text-[10px] md:text-xs text-blue-600 mt-0.5 sm:mt-1">
              <span className="hidden sm:inline">{paidSessions.length} sesiones</span>
              <span className="sm:hidden">{paidSessions.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      {displayedSessions.length === 0 ? (
        <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-4 sm:p-6 md:p-8 text-center">
          <Calendar className="mx-auto text-slate-300 mb-2 sm:mb-3" size={32} />
          <p className="text-xs sm:text-sm text-slate-500">
            {sessions.length === 0 
              ? 'No hay sesiones en el rango de fechas seleccionado'
              : 'No hay sesiones para mostrar (todas están canceladas)'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {displayedSessions.map((session) => {
            const patientId = session.patient_user_id || session.patientId;
            const patient = patients.get(patientId);
            const earnings = getPsychologistEarnings(session);
            const isPaid = isSessionPaid(session.id);
            const isCompleted = session.status === 'completed';
            
            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-2 sm:p-3 md:p-4 hover:shadow-md transition-all cursor-pointer hover:border-purple-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                  {/* Top row in mobile: Date + Session Details Button */}
                  <div className="flex items-start justify-between gap-2 sm:hidden">
                    <div className="bg-purple-100 rounded p-1.5 text-center min-w-[40px]">
                      <div className="text-[9px] font-semibold text-purple-600 uppercase">
                        {new Date(session.date).toLocaleDateString('es-ES', { month: 'short' })}
                      </div>
                      <div className="text-base font-bold text-purple-900">
                        {new Date(session.date).getDate()}
                      </div>
                    </div>
                    
                    {/* Session Details Button for completed sessions - Mobile top right */}
                    {isCompleted && (
                      <button
                        onClick={(e) => handleOpenSessionDetails(session, e)}
                        className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center group flex-shrink-0 ${
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
                  </div>

                  {/* Left: Date, Time & Patient - Desktop */}
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="hidden sm:block bg-purple-100 rounded-lg p-2 md:p-3 text-center min-w-[55px] md:min-w-[60px]">
                      <div className="text-[10px] md:text-xs font-semibold text-purple-600 uppercase">
                        {new Date(session.date).toLocaleDateString('es-ES', { month: 'short' })}
                      </div>
                      <div className="text-xl md:text-2xl font-bold text-purple-900">
                        {new Date(session.date).getDate()}
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <User size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-xs sm:text-sm md:text-sm text-slate-800 truncate">
                          {patient?.name || 'Paciente no disponible'}
                        </span>
                      </div>
                      <div className="text-xs sm:text-sm md:text-sm text-slate-500 flex items-center gap-1 sm:gap-1.5 mb-1 sm:mb-2">
                        <Clock size={10} className="flex-shrink-0" />
                        {session.startTime} - {session.endTime}
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-wrap">
                        {getStatusBadge(session.status)}
                        {session.invoice_id && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] sm:text-[10px] md:text-xs font-medium border border-emerald-200">
                            <Receipt size={10} />
                            <span className="hidden sm:inline">Facturada</span>
                          </span>
                        )}
                        {session.bonus_id && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[9px] sm:text-[10px] md:text-xs font-medium border border-purple-200">
                            <Ticket size={10} />
                            <span className="hidden sm:inline">Bono</span>
                          </span>
                        )}
                        {/* Tags */}
                        {session.tags && session.tags.length > 0 && (
                          <>
                            {session.tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={idx}
                                className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] md:text-xs font-medium border ${getTagColor(tag, idx)}`}
                              >
                                {tag}
                              </span>
                            ))}
                            {session.tags.length > 2 && (
                              <span className="text-[9px] sm:text-[10px] text-slate-400">+{session.tags.length - 2}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Right: Financial Info */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:gap-2 pl-0 sm:pl-0">
                    {/* Session Details Button for completed sessions - Desktop only */}
                    {isCompleted && (
                      <button
                        onClick={(e) => handleOpenSessionDetails(session, e)}
                        className={`hidden sm:flex w-8 h-8 rounded-full border-2 transition-all items-center justify-center group flex-shrink-0 ${
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
                          <FileText size={14} className="text-red-500 group-hover:text-red-600" />
                        ) : sessionEntries.get(session.session_entry_id)?.status === 'done' ? (
                          <CheckCircle size={14} className="text-green-600" />
                        ) : (
                          <FileText size={14} className="text-orange-500 group-hover:text-orange-600" />
                        )}
                      </button>
                    )}
                    <div className="text-left sm:text-right">
                      <div className="text-[8px] sm:text-[9px] md:text-xs text-slate-500 hidden sm:block">Tu ganancia</div>
                      <div className="text-base sm:text-lg md:text-2xl font-bold text-green-600 flex items-center gap-1">
                        {earnings.toFixed(2)} €
                      </div>
                      <div className="text-[9px] sm:text-[10px] md:text-xs text-slate-400 hidden sm:block">
                        ({session.percent_psych || 70}% de {session.price?.toFixed(2) || '0.00'}€)
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0">
                      {(isPaid || session.paid) ? (
                        <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 bg-green-100 text-green-700 rounded-full text-[9px] sm:text-[10px] md:text-xs font-semibold border border-green-200">
                          <CheckCircle size={10} className="flex-shrink-0" />
                          <span className="hidden sm:inline">💵 Pagada</span>
                          <span className="sm:hidden">✓</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 md:px-3 py-0.5 sm:py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] sm:text-[10px] md:text-xs font-semibold border border-amber-200">
                          <Clock size={10} className="flex-shrink-0" />
                          <span className="hidden sm:inline">Pendiente</span>
                          <span className="sm:hidden">⏳</span>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold text-slate-800">Editar Sesión</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors"
              >
                <XIcon size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
              {/* Patient Name (Read-only) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Paciente</label>
                <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-base">
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
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                />
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora inicio</label>
                  <input
                    type="time"
                    value={editedSession.startTime}
                    onChange={(e) => handleFieldChange('startTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora fin</label>
                  <input
                    type="time"
                    value={editedSession.endTime}
                    onChange={(e) => handleFieldChange('endTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de sesión</label>
                <select
                  value={editedSession.type}
                  onChange={(e) => handleFieldChange('type', e.target.value as 'in-person' | 'online' | 'home-visit')}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
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
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
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
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Precio/h (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editedSession.price || 0}
                    onChange={(e) => handleFieldChange('price', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    {getSessionDurationHours(editedSession).toFixed(2)}h → {getSessionTotalPrice(editedSession).toFixed(2)}€
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">% Psic.</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={editedSession.percent_psych || 0}
                    onChange={(e) => handleFieldChange('percent_psych', parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
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
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base"
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
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-base"
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
            <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2 sm:gap-3">
              <button
                onClick={handleDeleteSession}
                disabled={isSaving}
                className="px-4 py-3 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base"
              >
                <Trash2 size={16} />
                <span className="hidden xs:inline">Eliminar</span>
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-3 text-slate-700 hover:bg-slate-200 active:bg-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50 text-sm sm:text-base"
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

export default SessionsList;
