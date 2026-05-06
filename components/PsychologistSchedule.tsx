import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, X, Users, Video, MapPin, ChevronLeft, ChevronRight, MessageCircle, Trash2, Save, Copy, Send, ExternalLink, CheckCircle, XCircle, Ticket, Receipt, Globe, ChevronDown, Mail, AlertTriangle, FileText } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser, apiFetch } from '../services/authService';
import { includesNormalized, isTempEmail } from '../services/textUtils';
import SessionDetailsModal from './SessionDetailsModal';

interface Session {
  id: string;
  patientId: string;
  patient_user_id?: string;
  patientName: string;
  patientPhone?: string;
  patientEmail?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: 'in-person' | 'online' | 'home-visit';
  status: 'scheduled' | 'completed' | 'cancelled' | 'available' | 'paid';
  notes?: string;
  meetLink?: string;
  price: number;
  paid: boolean;
  paymentMethod?: '' | 'Bizum' | 'Transferencia' | 'Efectivo';
  percent_psych: number;
  tags?: string[]; // Tags heredadas de la relación
  invoice_id?: string;
  bonus_id?: string;
  session_entry_id?: string;
  starts_on?: string;
  ends_on?: string;
  schedule_timezone?: string; // Zona horaria del psicólogo cuando se creó la sesión
  generateMeetLink?: boolean;
  google_calendar_event_id?: string;
  calendar_id?: string;
  reminder_enabled?: boolean;
  whatsapp_reminder_enabled?: boolean;
}

interface Bono {
  id: string;
  pacient_user_id: string;
  psychologist_user_id: string;
  total_sessions_amount: number;
  total_price_bono_amount: number;
  paid: boolean;
  sessions_used?: number;
  sessions_remaining?: number;
  created_at: string;
}

interface PsychologistScheduleProps {
  psychologistId: string;
  canCreate?: boolean;
  onNeedUpgrade?: () => void;
  onOpenSettings?: () => void;
}

type SessionStatusFilter = Session['status'] | 'ALL';

const PsychologistSchedule: React.FC<PsychologistScheduleProps> = ({ psychologistId, canCreate = true, onNeedUpgrade, onOpenSettings }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [careRelationships, setCareRelationships] = useState<any[]>([]);
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showNewAvailability, setShowNewAvailability] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [editedSession, setEditedSession] = useState<Session | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingReminderEmail, setIsSendingReminderEmail] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsAppModalData, setWhatsAppModalData] = useState<{ waUrl: string; sessionId: string; patientName: string } | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const isCreatingSessionRef = useRef(false); // ref-based guard: updated synchronously, not subject to React batching
  const [isLoading, setIsLoading] = useState(false);
  const [showAssignPatient, setShowAssignPatient] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Session | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(['scheduled', 'completed']);
  const [paymentFilter, setPaymentFilter] = useState<string>('all'); // 'all', 'paid', 'unpaid'
  const [filterTags, setFilterTags] = useState<string[]>([]); // tags seleccionadas para filtrar
  const [resizingSession, setResizingSession] = useState<{ id: string, edge: 'top' | 'bottom', date: string } | null>(null);
  const [tempSessionTimes, setTempSessionTimes] = useState<{ startTime: string, endTime: string } | null>(null);
  const [creatingSession, setCreatingSession] = useState<{ date: string, startY: number, currentY: number } | null>(null);
  const [draggingSession, setDraggingSession] = useState<{ id: string, startY: number, clickOffsetY: number, originalDate: string, originalStartTime: string, originalEndTime: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ date: string, startTime: string, endTime: string } | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [assignPatientSearchQuery, setAssignPatientSearchQuery] = useState('');
  const [showAssignPatientDropdown, setShowAssignPatientDropdown] = useState(false);

  // Comprobar si Google Calendar está conectado
  useEffect(() => {
    const checkGoogleCalendar = async () => {
      try {
        const u = await getCurrentUser();
        if (!u?.id) return;
        const res = await apiFetch(`${API_URL}/google/status?userId=${u.id}`);
        if (res.ok) {
          const data = await res.json();
          setGoogleCalendarConnected(data.connected);
        }
      } catch (_) {}
    };
    checkGoogleCalendar();
  }, []);

  // Zona horaria del navegador – detectada una sola vez al montar, representa la ubicación real del psicólogo
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  // Zona horaria seleccionada: por defecto = ubicación del navegador; se puede cambiar con el dropdown
  const [selectedTimezone, setSelectedTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [showTimezoneDropdown, setShowTimezoneDropdown] = useState(false);
  const [timezoneLoadedFromProfile, setTimezoneLoadedFromProfile] = useState(false);
  const [psychEmailRemindersEnabled, setPsychEmailRemindersEnabled] = useState(false);
  const [psychWhatsappRemindersEnabled, setPsychWhatsappRemindersEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Estados para bonos
  const [availableBonos, setAvailableBonos] = useState<Bono[]>([]);
  const [assignedBono, setAssignedBono] = useState<Bono | null>(null);
  const [isLoadingBonos, setIsLoadingBonos] = useState(false);
  const [isAssigningBono, setIsAssigningBono] = useState(false);

  // Estados para notas de sesión desde el modal de edición
  const [scheduleSessionDetailsOpen, setScheduleSessionDetailsOpen] = useState(false);
  const [scheduleEntryStatus, setScheduleEntryStatus] = useState<'none' | 'pending' | 'done'>('none');
  
  // Estados para bonos en nueva sesión
  const [newSessionBonos, setNewSessionBonos] = useState<Bono[]>([]);
  const [isLoadingNewSessionBonos, setIsLoadingNewSessionBonos] = useState(false);
  
  const [newSession, setNewSession] = useState({
    patientId: '',
    date: '',
    startTime: '',
    endTime: '',
    type: 'online' as 'in-person' | 'online' | 'home-visit',
    notes: '',
    generateMeetLink: false,
    manualMeetLink: '',
    price: 0,
    paid: false,
    percent_psych: 100,
    bonus_id: undefined as string | undefined,
    paymentMethod: '' as string,
    recurrence: 'none' as 'none' | 'daily' | 'weekly' | 'custom_weekly' | 'monthly',
    recurrenceWeeks: 2,
    recurrenceEndDate: '',
    reminder_enabled: false,
    whatsapp_reminder_enabled: false
  });

  const [newAvailability, setNewAvailability] = useState({
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    duration: 60, // duration in minutes for each slot
    daysOfWeek: [1, 2, 3, 4, 5], // Monday to Friday by default
    type: 'online' as 'in-person' | 'online' | 'home-visit'
  });

  // Helper para convertir Date a formato YYYY-MM-DD en zona horaria local
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper para parsear una fecha en formato YYYY-MM-DD como fecha local (no UTC)
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  useEffect(() => {
    loadSessions();
    loadPatients();
    loadCareRelationships();
    loadScheduleTimezone();
  }, [psychologistId]);
  
  // Recargar sesiones cuando cambia el rango de fechas
  useEffect(() => {
    if (psychologistId) {
      loadSessions();
    }
  }, [currentDate]);

  // Cargar el estado de la entrada de sesión cuando se selecciona una sesión para editar
  useEffect(() => {
    if (!selectedSession) {
      setScheduleEntryStatus('none');
      return;
    }
    if (!selectedSession.session_entry_id) {
      setScheduleEntryStatus('none');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/session-entries/${selectedSession.session_entry_id}`);
        if (res.ok) {
          const entry = await res.json();
          setScheduleEntryStatus(entry.data?.status || entry.status || 'pending');
        } else {
          setScheduleEntryStatus('pending');
        }
      } catch {
        setScheduleEntryStatus('pending');
      }
    })();
  }, [selectedSession?.id, selectedSession?.session_entry_id]);

  // Auto-guardar la zona horaria en el perfil cuando cambia (pero no en la carga inicial)
  useEffect(() => {
    if (!timezoneLoadedFromProfile) return; // aún no terminó de cargar
    saveScheduleTimezone(selectedTimezone);
  }, [selectedTimezone]);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.patient-search-dropdown')) {
        setShowPatientDropdown(false);
        setShowAssignPatientDropdown(false);
      }
      if (!target.closest('.timezone-dropdown-container')) {
        setShowTimezoneDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Actualizar hora actual cada minuto para el indicador de hora
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Scroll hasta las 7:00 al montar el componente
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 7 * 48; // 7 horas × 48px/hora
    }
  }, []);

  // Prevent text selection during drag / resize
  useEffect(() => {
    if (draggingSession || resizingSession) {
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.userSelect = '';
    }
    return () => { document.body.style.userSelect = ''; };
  }, [draggingSession, resizingSession]);

  // Handle resize mouse events
  useEffect(() => {
    if (!resizingSession) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scrollableContainer = scrollContainerRef.current;
      if (!scrollableContainer) return;

      const containerRect = scrollableContainer.getBoundingClientRect();
      const scrollTop = scrollableContainer.scrollTop;
      
      // Calculate Y position relative to the scrollable content
      const y = e.clientY - containerRect.top + scrollTop;
      
      // Convert Y to time (48px per hour)
      const totalMinutes = Math.max(0, Math.floor((y / 48) * 60));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.floor((totalMinutes % 60) / 15) * 15; // Round to 15 min
      
      const newTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      // Encontrar la sesión actual
      const currentSession = sessions.find(s => s.id === resizingSession.id);
      if (!currentSession) return;
      
      // Usar los tiempos mostrados (en timezone seleccionado) para el borde fijo,
      // no los tiempos crudos almacenados (que pueden estar en UTC y diferir 1h)
      const displayTimes = sessionDisplayTimes.get(currentSession.id);
      const displayStartTime = displayTimes?.startTime ?? currentSession.startTime;
      const displayEndTime = displayTimes?.endTime ?? currentSession.endTime;

      let newStartTime = displayStartTime;
      let newEndTime = displayEndTime;
      
      if (resizingSession.edge === 'top') {
        // Al mover el borde superior, el endTime se mantiene fijo
        newStartTime = newTime;
        newEndTime = displayEndTime;
      } else {
        // Al mover el borde inferior, el startTime se mantiene fijo
        newStartTime = displayStartTime;
        newEndTime = newTime;
      }
      
      // Validar duración mínima de 15 minutos
      const startMinutes = parseInt(newStartTime.split(':')[0]) * 60 + parseInt(newStartTime.split(':')[1]);
      const endMinutes = parseInt(newEndTime.split(':')[0]) * 60 + parseInt(newEndTime.split(':')[1]);
      
      // Si la duración es válida, actualizar el preview
      if (endMinutes > startMinutes && (endMinutes - startMinutes) >= 15) {
        setTempSessionTimes({ 
          startTime: newStartTime, 
          endTime: newEndTime 
        });
      }
    };

    const handleMouseUp = () => {
      if (resizingSession && tempSessionTimes) {
        // Validate that end time is after start time (minimum 15 minutes)
        const startMinutes = parseInt(tempSessionTimes.startTime.split(':')[0]) * 60 + parseInt(tempSessionTimes.startTime.split(':')[1]);
        const endMinutes = parseInt(tempSessionTimes.endTime.split(':')[0]) * 60 + parseInt(tempSessionTimes.endTime.split(':')[1]);
        
        // Requerir al menos 15 minutos de duración
        if (endMinutes > startMinutes && (endMinutes - startMinutes) >= 15) {
          handleUpdateSessionTime(resizingSession.id, tempSessionTimes.startTime, tempSessionTimes.endTime);
        }
      }
      setResizingSession(null);
      setTempSessionTimes(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingSession, tempSessionTimes, sessions]);

  // Handle creating session by dragging
  useEffect(() => {
    if (!creatingSession) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scrollableContainer = scrollContainerRef.current;
      if (!scrollableContainer) return;

      const containerRect = scrollableContainer.getBoundingClientRect();
      const scrollTop = scrollableContainer.scrollTop;
      const y = e.clientY - containerRect.top + scrollTop;
      
      setCreatingSession(prev => prev ? { ...prev, currentY: y } : null);
    };

    const handleMouseUp = () => {
      if (creatingSession) {
        const dragDistance = Math.abs(creatingSession.currentY - creatingSession.startY);
        const isClick = dragDistance < 10;

        const startY = isClick ? creatingSession.startY : Math.min(creatingSession.startY, creatingSession.currentY);
        const endY = isClick ? creatingSession.startY : Math.max(creatingSession.startY, creatingSession.currentY);
        
        // Convert Y positions to times (48px per hour)
        const startMinutes = Math.floor((startY / 48) * 60);
        const startHours = Math.floor(startMinutes / 60);
        const startMins = Math.floor((startMinutes % 60) / 15) * 15;
        
        const startTime = `${startHours.toString().padStart(2, '0')}:${startMins.toString().padStart(2, '0')}`;
        let endTime: string;

        if (isClick) {
          // Click sin arrastrar → sesión de 1 hora por defecto
          const endTotalMinutes = startHours * 60 + startMins + 60;
          const endH = Math.floor(endTotalMinutes / 60);
          const endM = endTotalMinutes % 60;
          endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
        } else {
          const endMinutes = Math.floor((endY / 48) * 60);
          const endHours = Math.floor(endMinutes / 60);
          const endMins = Math.floor((endMinutes % 60) / 15) * 15;
          endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

          // Ensure minimum 15 minutes duration
          if (endMinutes - startMinutes < 15) {
            const minEndMinutes = startMinutes + 15;
            const minEndHours = Math.floor(minEndMinutes / 60);
            const minEndMins = minEndMinutes % 60;
            endTime = `${minEndHours.toString().padStart(2, '0')}:${minEndMins.toString().padStart(2, '0')}`;
          }
        }
        
        // Open modal with pre-filled times
        if (!canCreate) { onNeedUpgrade?.(); setCreatingSession(null); return; }
        setNewSession({
          ...newSession,
          date: creatingSession.date,
          startTime: startTime,
          endTime: endTime
        });
        setShowNewSession(true);
      }
      setCreatingSession(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [creatingSession]);

  // Handle dragging session
  useEffect(() => {
    if (!draggingSession) return;

    const handleMouseMove = (e: MouseEvent) => {
      const weekDaysElements = document.querySelectorAll('[data-week-day]');
      let targetDate = draggingSession.originalDate;
      let targetElement: Element | null = null;

      // Find which day column the mouse is over
      weekDaysElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          targetDate = el.getAttribute('data-week-day') || draggingSession.originalDate;
          targetElement = el;
        }
      });

      // If mouse is outside all columns, keep dragging within the original/last known column
      if (!targetElement) {
        if (!dragPreview) return; // Haven't started a preview yet, do nothing
        targetDate = dragPreview.date; // Stay in current column
      }

      const scrollableContainer = scrollContainerRef.current;
      if (!scrollableContainer) return;

      const containerRect = scrollableContainer.getBoundingClientRect();
      const scrollTop = scrollableContainer.scrollTop;
      const y = e.clientY - containerRect.top + scrollTop;

      // Subtract the click offset so the session doesn't jump when you grab it mid-block
      const adjustedY = Math.max(0, y - draggingSession.clickOffsetY);

      // Convert Y to time (48px per hour)
      const totalMinutes = Math.floor((adjustedY / 48) * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.floor((totalMinutes % 60) / 15) * 15; // Round to 15 min

      const newStartTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      
      // Calculate duration and new end time
      const originalStartMinutes = parseInt(draggingSession.originalStartTime.split(':')[0]) * 60 + parseInt(draggingSession.originalStartTime.split(':')[1]);
      const originalEndMinutes = parseInt(draggingSession.originalEndTime.split(':')[0]) * 60 + parseInt(draggingSession.originalEndTime.split(':')[1]);
      const duration = originalEndMinutes - originalStartMinutes;
      
      const newEndMinutes = totalMinutes + duration;
      const endHours = Math.floor(newEndMinutes / 60);
      const endMins = Math.floor((newEndMinutes % 60) / 15) * 15;
      const newEndTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

      setDragPreview({
        date: targetDate,
        startTime: newStartTime,
        endTime: newEndTime
      });
    };

    const handleMouseUp = async () => {
      if (draggingSession && dragPreview) {
        const sessionId = draggingSession.id;
        const newDate = dragPreview.date;
        const newStartTime = dragPreview.startTime;
        const newEndTime = dragPreview.endTime;
        
        // Optimistic update: actualizar UI inmediatamente
        // Limpiar starts_on/ends_on para que convertSessionToTz use los valores locales actualizados
        setSessions(prevSessions => 
          prevSessions.map(s => 
            s.id === sessionId
              ? { ...s, date: newDate, startTime: newStartTime, endTime: newEndTime, starts_on: undefined, ends_on: undefined }
              : s
          )
        );
        
        // Limpiar estado de drag inmediatamente para UI fluida
        setDraggingSession(null);
        setDragPreview(null);
        
        // Actualizar en backend en segundo plano
        try {
          const currentUser = await getCurrentUser();
          if (!currentUser) {
            // Revertir cambio si falla auth
            await loadSessions();
            alert('Error: Usuario no autenticado');
            return;
          }

          const response = await apiFetch(`${API_URL}/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'x-user-id': currentUser.id
            },
            body: JSON.stringify({
              date: newDate,
              startTime: newStartTime,
              endTime: newEndTime,
              starts_on: localTzToUTCISO(newDate, newStartTime, selectedTimezone),
              ends_on:   localTzToUTCISO(newDate, newEndTime,   selectedTimezone),
            })
          });

          if (!response.ok) {
            const error = await response.json();
            // Revertir cambio si falla
            await loadSessions();
            alert('Error al mover la sesión: ' + (error.error || 'Error desconocido'));
          }
        } catch (error) {
          console.error('Error moving session:', error);
          // Revertir cambio si falla
          await loadSessions();
          alert('Error al mover la sesión');
        }
        return;
      }
      setDraggingSession(null);
      setDragPreview(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingSession, dragPreview]);

  const loadScheduleTimezone = async () => {
    if (!psychologistId) return;
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (response.ok) {
        const profile = await response.json();
        // Si el perfil no tiene TZ guardada, guardamos la TZ detectada del navegador
        // para que el backend la use al normalizar sesiones.
        // NUNCA sobreescribimos selectedTimezone: el default siempre es la ubicación real del navegador.
        if (!profile?.schedule_timezone) {
          await saveScheduleTimezone(browserTimezone);
        }
        // Cargar preferencia de recordatorios email del psicólogo
        const remindersEnabled = profile?.email_reminders_enabled ?? false;
        setPsychEmailRemindersEnabled(remindersEnabled);
        setNewSession(prev => ({ ...prev, reminder_enabled: remindersEnabled }));
        const waRemindersEnabled = profile?.whatsapp_reminders_enabled ?? false;
        setPsychWhatsappRemindersEnabled(waRemindersEnabled);
        setNewSession(prev => ({ ...prev, whatsapp_reminder_enabled: waRemindersEnabled }));
      }
    } catch (err) {
      console.warn('Could not load schedule timezone from profile:', err);
    } finally {
      setTimezoneLoadedFromProfile(true);
    }
  };

  const saveScheduleTimezone = async (tz: string) => {
    if (!psychologistId) return;
    try {
      const profileResponse = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      const currentProfile = profileResponse.ok ? await profileResponse.json() : {};
      await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...currentProfile, schedule_timezone: tz })
      });
    } catch (err) {
      console.warn('Could not save schedule timezone to profile:', err);
    }
  };

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      // Cargar la semana actual más 2 semanas antes y después
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 14);
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()) + 14);
      
      const startDate = formatLocalDate(weekStart);
      const endDate = formatLocalDate(weekEnd);
      
      const params = new URLSearchParams({ psychologistId });
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      
      const response = await apiFetch(`${API_URL}/sessions?${params.toString()}`);
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
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/patients`);
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

  const loadCareRelationships = async () => {
    try {
      const response = await apiFetch(`${API_URL}/relationships?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCareRelationships(data);
      }
    } catch (error) {
      console.error('Error loading care relationships:', error);
    }
  };

  const getSessionsForDate = (date: string) => {
    const dateSessions = sessions
      .filter(s => (sessionDisplayTimes.get(s.id)?.date ?? s.date) === date)
      .sort((a, b) => {
        const aT = sessionDisplayTimes.get(a.id)?.startTime ?? a.startTime;
        const bT = sessionDisplayTimes.get(b.id)?.startTime ?? b.startTime;
        return aT.localeCompare(bT);
      });
    return getFilteredSessionsByStatus(dateSessions);
  };

  const handlePreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const handleNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const handleCreateSession = async () => {
    if (isCreatingSessionRef.current) return; // ref guard is synchronous — no race window between click and React state update
    if (isCreatingSession) return; // Prevent double submission
    if (!newSession.patientId || !newSession.date || !newSession.startTime || !newSession.endTime || newSession.price <= 0) {
      alert('Por favor completa todos los campos requeridos (incluido el precio)');
      return;
    }

    if (newSession.recurrence !== 'none' && !newSession.recurrenceEndDate) {
      alert('Por favor selecciona la fecha de fin de repetición');
      return;
    }

    if (newSession.recurrenceEndDate && newSession.recurrenceEndDate < newSession.date) {
      alert('La fecha de fin de repetición debe ser posterior a la fecha de inicio');
      return;
    }

    const patient = patients.find(p => p.id === newSession.patientId);
    if (!patient) return;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      alert('Error: Usuario no autenticado');
      return;
    }

    // Build the list of dates to create sessions for
    const sessionDates: string[] = [newSession.date];
    if (newSession.recurrence !== 'none' && newSession.recurrenceEndDate) {
      const endDate = parseLocalDate(newSession.recurrenceEndDate);
      let current = parseLocalDate(newSession.date);

      while (true) {
        if (newSession.recurrence === 'daily') {
          current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
        } else if (newSession.recurrence === 'weekly') {
          current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
        } else if (newSession.recurrence === 'custom_weekly') {
          const weeks = Math.max(1, Number(newSession.recurrenceWeeks) || 2);
          current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7 * weeks);
        } else if (newSession.recurrence === 'monthly') {
          current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate());
        }
        if (current > endDate) break;
        sessionDates.push(formatLocalDate(current));
      }
    }

    // Lock here — all validation has passed and we are about to start API calls
    isCreatingSessionRef.current = true;
    setIsCreatingSession(true);
    let successCount = 0;
    let firstError = '';

    try {
    for (const date of sessionDates) {
      // Si se solicitó generar Meet link, el backend lo creará via Google Calendar API
      // No generar links falsos en el frontend
      let meetLink = newSession.manualMeetLink?.trim() || '';

      // Calcular starts_on/ends_on con la zona horaria del psicólogo
      const starts_on = localTzToUTCISO(date, newSession.startTime, selectedTimezone);
      const ends_on   = localTzToUTCISO(date, newSession.endTime,   selectedTimezone);

      const session: Session = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        patientId: newSession.patientId,
        patientName: patient.name,
        patientPhone: patient.phone || '',
        patientEmail: patient.email || '',
        date,
        startTime: newSession.startTime,
        endTime: newSession.endTime,
        type: newSession.type,
        status: 'scheduled',
        notes: newSession.notes,
        meetLink: meetLink || undefined,
        generateMeetLink: googleCalendarConnected && newSession.type === 'online',
        price: newSession.price,
        paid: newSession.paid,
        percent_psych: Math.min(newSession.percent_psych, 100),
        bonus_id: newSession.bonus_id,
        paymentMethod: newSession.paymentMethod || undefined,
        starts_on,
        ends_on,
        schedule_timezone: selectedTimezone,
        reminder_enabled: newSession.reminder_enabled ?? false,
        whatsapp_reminder_enabled: newSession.whatsapp_reminder_enabled ?? false,
      };

      try {
        const response = await apiFetch(`${API_URL}/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify({ ...session, psychologistId })
        });

        if (response.ok) {
          successCount++;
        } else {
          const error = await response.json();
          if (!firstError) firstError = error.error || 'Error desconocido';
          // Stop on first conflict/error to avoid flooding
          if (response.status === 409) break;
        }
      } catch (error) {
        console.error('Error creating session:', error);
        if (!firstError) firstError = 'Error de red';
        break;
      }
    }

    } finally {
      isCreatingSessionRef.current = false;
      setIsCreatingSession(false);
    }

    await loadSessions();
    setShowNewSession(false);
    resetNewSession();

    if (successCount === 0) {
      alert(`Error al crear la sesión: ${firstError}`);
    } else if (successCount < sessionDates.length) {
      alert(`Se crearon ${successCount} de ${sessionDates.length} sesiones. Algunas no se pudieron crear (${firstError}).`);
    }
    // If all succeed, close silently (no alert needed for single session or when all recurring sessions are created)
  };

  const handleUpdateSessionTime = async (sessionId: string, newStartTime: string, newEndTime: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Optimistic update: actualizar UI inmediatamente
    // Limpiar starts_on/ends_on para que convertSessionToTz use startTime/endTime actualizados
    setSessions(prevSessions => 
      prevSessions.map(s => 
        s.id === sessionId
          ? { ...s, startTime: newStartTime, endTime: newEndTime, starts_on: undefined, ends_on: undefined }
          : s
      )
    );

    // Actualizar en backend en segundo plano
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        // Revertir cambio si falla auth
        await loadSessions();
        alert('Error: Usuario no autenticado');
        return;
      }

      // Calcular starts_on y ends_on con la zona horaria del psicólogo
      const date = session.date;
      const starts_on = date && newStartTime ? localTzToUTCISO(date, newStartTime, selectedTimezone) : undefined;
      const ends_on   = date && newEndTime   ? localTzToUTCISO(date, newEndTime,   selectedTimezone) : undefined;

      // Asegurar que todos los campos requeridos estén presentes
      const updatedSession = {
        ...session,
        date: date, // Asegurar que se envía la fecha
        startTime: newStartTime,
        endTime: newEndTime,
        starts_on, // Agregar campo calculado para Supabase
        ends_on,   // Agregar campo calculado para Supabase
        // Asegurar campos requeridos por la DB
        price: session.price ?? 0,
        paid: session.paid ?? false,
        percent_psych: session.percent_psych ?? 100
      };

      const response = await apiFetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(updatedSession)
      });

      if (!response.ok) {
        const error = await response.json();
        // Revertir cambio si falla
        await loadSessions();
        alert('Error al actualizar la sesión: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error updating session:', error);
      // Revertir cambio si falla
      await loadSessions();
      alert('Error al actualizar la sesión');
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
      
      const dateStr = formatLocalDate(date);
      
      // Generate multiple slots for this day based on duration
      const [startHour, startMin] = newAvailability.startTime.split(':').map(Number);
      const [endHour, endMin] = newAvailability.endTime.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const duration = newAvailability.duration;
      
      let currentMinutes = startMinutes;
      
      while (currentMinutes < endMinutes) {
        const slotEndMinutes = currentMinutes + duration;
        if (slotEndMinutes > endMinutes) break;
        
        const currentHour = Math.floor(currentMinutes / 60);
        const currentMin = currentMinutes % 60;
        const endHour = Math.floor(slotEndMinutes / 60);
        const endMin = slotEndMinutes % 60;
        
        allSlots.push({
          id: `${Date.now()}-${allSlots.length}`,
          patientId: '',
          patientName: 'Disponible',
          date: dateStr,
          startTime: `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`,
          endTime: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
          type: newAvailability.type,
          status: 'available',
          price: 0,
          paid: false,
          percent_psych: 100
        });
        
        currentMinutes = slotEndMinutes;
      }
    }

    if (allSlots.length === 0) {
      alert('No se generaron espacios disponibles. Verifica las fechas y días seleccionados.');
      return;
    }

    console.log('Creating availability with slots:', allSlots);

    try {
      // Obtener el usuario actual para enviar el header de autenticación
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/sessions/availability`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
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

  // Calcular ganancias del psicólogo
  const getPsychologistEarnings = (session: Session): number => {
    const totalPrice = getSessionTotalPrice(session);
    const percent = session.percent_psych || 70;
    return (totalPrice * percent) / 100;
  };

  const handleOpenSession = async (session: Session) => {
    // Convertir los tiempos al timezone seleccionado del psicólogo para evitar
    // que cada apertura+guardado desplace la hora (el backend extrae date/startTime
    // directamente del ISO UTC, no en hora local).
    const tzTimes = convertSessionToTz(session, selectedTimezone);
    const sessionWithTzTimes = { ...session, ...tzTimes, schedule_timezone: selectedTimezone };
    setSelectedSession(sessionWithTzTimes);
    setEditedSession(sessionWithTzTimes);
    loadAvailableBonos(session.patient_user_id || session.patientId);
    
    // Cargar información del bono asignado si existe
    if (session.bonus_id) {
      await loadAssignedBono(session.bonus_id);
    } else {
      setAssignedBono(null);
    }
  };

  const handleCloseModal = () => {
    setSelectedSession(null);
    setEditedSession(null);
  };

  const handleQuickCompleteSession = async () => {
    if (!editedSession) return;
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    try {
      const response = await apiFetch(`${API_URL}/session-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({
          session_id: editedSession.id,
          creator_user_id: currentUser.id,
          target_user_id: editedSession.patient_user_id || editedSession.patientId,
          transcript: '',
          summary: '',
          status: 'done',
          entry_type: 'session_note'
        })
      });
      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Error al completar la sesión');
        return;
      }
      const savedEntry = await response.json();
      if (editedSession.status !== 'completed') {
        await apiFetch(`${API_URL}/sessions/${editedSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
          body: JSON.stringify({ status: 'completed' })
        });
      }
      setEditedSession(prev => prev ? { ...prev, session_entry_id: savedEntry.id, status: 'completed' } : prev);
      setScheduleEntryStatus('done');
      await loadSessions();
    } catch (error) {
      console.error('Error al completar sesión rápida:', error);
      alert('Error al completar la sesión');
    }
  };
  
  const loadAssignedBono = async (bonoId: string) => {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      const response = await apiFetch(
        `${API_URL}/bonos/${bonoId}`
      );
      
      if (response.ok) {
        const bono = await response.json();
        // Normalizar campos
        const normalizedBono = {
          ...bono,
          total_sessions: bono.total_sessions_amount || bono.total_sessions || 0,
          used_sessions: bono.sessions_used || 0,
          total_price: bono.total_price_bono_amount || bono.total_price || 0,
          purchase_date: bono.created_at || bono.purchase_date
        };
        setAssignedBono(normalizedBono);
      }
    } catch (error) {
      console.error('Error loading assigned bono:', error);
    }
  };
  
  const loadAvailableBonos = async (patientUserId: string) => {
    if (!patientUserId) return;
    
    setIsLoadingBonos(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      const response = await apiFetch(
        `${API_URL}/bonos/available/${patientUserId}?psychologist_user_id=${currentUser.id}`
      );
      
      if (response.ok) {
        const bonos = await response.json();
        // Normalizar campos para compatibilidad
        const normalizedBonos = bonos.map((bono: any) => ({
          ...bono,
          total_sessions: bono.total_sessions_amount || bono.total_sessions || 0,
          used_sessions: bono.sessions_used || 0,
          total_price: bono.total_price_bono_amount || bono.total_price || 0,
          purchase_date: bono.created_at || bono.purchase_date
        }));
        setAvailableBonos(normalizedBonos);
      }
    } catch (error) {
      console.error('Error loading available bonos:', error);
    } finally {
      setIsLoadingBonos(false);
    }
  };
  
  const loadNewSessionBonos = async (patientUserId: string) => {
    if (!patientUserId) return;
    
    setIsLoadingNewSessionBonos(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return;
      
      const response = await apiFetch(
        `${API_URL}/bonos/available/${patientUserId}?psychologist_user_id=${currentUser.id}`
      );
      
      if (response.ok) {
        const bonos = await response.json();
        // Normalizar campos para compatibilidad
        const normalizedBonos = bonos.map((bono: any) => ({
          ...bono,
          total_sessions: bono.total_sessions_amount || bono.total_sessions || 0,
          used_sessions: bono.sessions_used || 0,
          total_price: bono.total_price_bono_amount || bono.total_price || 0,
          purchase_date: bono.created_at || bono.purchase_date
        }));
        setNewSessionBonos(normalizedBonos);
      }
    } catch (error) {
      console.error('Error loading new session bonos:', error);
    } finally {
      setIsLoadingNewSessionBonos(false);
    }
  };
  
  const handleAssignBono = async (bonoId: string) => {
    if (!editedSession) return;
    
    setIsAssigningBono(true);
    try {
      const response = await apiFetch(`${API_URL}/sessions/${editedSession.id}/assign-bonus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ bonus_id: bonoId })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert('Sesión asignada al bono correctamente (precio y estado de pago actualizados)');
        
        // Usar la sesión actualizada devuelta por el backend (ya guardada en Supabase)
        if (result.session) {
          // Normalizar los campos de la sesión
          const normalizedSession = {
            ...editedSession,
            ...result.session,
            bonus_id: result.session.bonus_id,
            price: result.session.price,
            paid: result.session.paid,
            patient_user_id: result.session.patient_user_id || editedSession.patient_user_id,
            patientId: result.session.patient_user_id || editedSession.patientId
          };
          setEditedSession(normalizedSession);
        }
        
        await loadAssignedBono(bonoId);
        await loadAvailableBonos(editedSession.patient_user_id || editedSession.patientId);
        await loadSessions();
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
      const response = await apiFetch(`${API_URL}/sessions/${editedSession.id}/assign-bonus`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const result = await response.json();
        alert('Sesión desasignada del bono correctamente');
        
        // Usar la sesión actualizada devuelta por el backend (ya guardada en Supabase)
        if (result.session) {
          const normalizedSession = {
            ...editedSession,
            ...result.session,
            bonus_id: undefined,
            patient_user_id: result.session.patient_user_id || editedSession.patient_user_id,
            patientId: result.session.patient_user_id || editedSession.patientId
          };
          setEditedSession(normalizedSession);
        } else {
          setEditedSession({ ...editedSession, bonus_id: undefined });
        }
        
        setAssignedBono(null);
        await loadAvailableBonos(editedSession.patient_user_id || editedSession.patientId);
        await loadSessions();
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

      const response = await apiFetch(`${API_URL}/sessions/${editedSession.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        await loadSessions();
        handleCloseModal();
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

  const handleFieldChange = (field: keyof Session, value: any) => {
    if (!editedSession) return;
    // Si se desmarca 'paid', limpiar el método de pago
    if (field === 'paid' && !value) {
      setEditedSession({ ...editedSession, [field]: value, paymentMethod: '' });
    } else {
      setEditedSession({ ...editedSession, [field]: value });
    }
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

      // Solo enviar los campos que pueden ser actualizados
      const updatePayload: any = {
        type: editedSession.type,
        status: editedSession.status,
        price: editedSession.price ?? 0,
        paid: editedSession.paid ?? false,
        paymentMethod: editedSession.paymentMethod || '',
        percent_psych: editedSession.percent_psych ?? 70,
        notes: editedSession.notes,
        meetLink: editedSession.meetLink,
        reminder_enabled: editedSession.reminder_enabled ?? false,
        whatsapp_reminder_enabled: (editedSession as any).whatsapp_reminder_enabled ?? false
      };

      // Siempre incluir la zona horaria (del psicólogo actual)
      updatePayload.schedule_timezone = selectedTimezone;

      // Siempre recalcular starts_on/ends_on con la zona horaria activa.
      // Esto corrige timestamps incorrectos de sesiones antiguas cuando el psicólogo guarda.
      updatePayload.starts_on = localTzToUTCISO(editedSession.date, editedSession.startTime, selectedTimezone);
      updatePayload.ends_on   = localTzToUTCISO(editedSession.date, editedSession.endTime,   selectedTimezone);

      // Siempre incluir date/startTime/endTime para mantener el JSONB sincronizado
      // con starts_on/ends_on (los valores aquí ya están en selectedTimezone por handleOpenSession)
      updatePayload.date      = editedSession.date;
      updatePayload.startTime = editedSession.startTime;
      updatePayload.endTime   = editedSession.endTime;

      const response = await apiFetch(`${API_URL}/sessions/${editedSession.id}`, {
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

  const handleUpdateSessionStatus = async (sessionId: string, status: Session['status']) => {
    try {
      // Si se está cancelando, preguntar si crear disponibilidad
      if (status === 'cancelled') {
        const session = sessions.find(s => s.id === sessionId);
        if (session && session.status === 'scheduled') {
          const createAvailability = window.confirm(
            `¿Deseas crear un espacio disponible para ${session.date} de ${session.startTime} a ${session.endTime}?`
          );
          
          if (createAvailability) {
            // Obtener el usuario actual para autenticación
            const currentUser = await getCurrentUser();
            if (!currentUser) {
              alert('Error: Usuario no autenticado');
              return;
            }

            // Crear nueva sesión disponible con los mismos datos
            const newAvailableSlot = {
              id: `${Date.now()}`,
              patientId: '',
              patientName: 'Disponible',
              date: session.date,
              startTime: session.startTime,
              endTime: session.endTime,
              type: session.type,
              status: 'available' as const,
              psychologistId
            };
            
            // Crear la disponibilidad
            const availabilityResponse = await apiFetch(`${API_URL}/sessions/availability`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-user-id': currentUser.id
              },
              body: JSON.stringify({ slots: [newAvailableSlot], psychologistId })
            });

            if (!availabilityResponse.ok) {
              const error = await availabilityResponse.json();
              console.warn('No se pudo recrear la disponibilidad para la sesión cancelada:', error);
              alert('No se pudo crear la disponibilidad: ' + (error.error || 'Error desconocido'));
            }
          }
        }
      }
      
      const response = await apiFetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        await loadSessions();
        setSelectedSession(null);
        if (status === 'cancelled') {
          alert('Sesión cancelada correctamente');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Error updating session status:', errorData);
        alert('Error al actualizar la sesión: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error updating session:', error);
      alert('Error al actualizar la sesión');
    }
  };

  const handleDeleteAvailability = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'available') return;

    try {
      const response = await apiFetch(`${API_URL}/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadSessions();
        if (selectedSlot?.id === sessionId) setSelectedSlot(null);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'No se pudo eliminar la disponibilidad');
      }
    } catch (error) {
      console.error('Error deleting availability:', error);
      alert('Error al eliminar la disponibilidad');
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
      generateMeetLink: false,
      manualMeetLink: '',
      price: 0,
      paid: false,
      percent_psych: 100,
      bonus_id: undefined,
      paymentMethod: '',
      recurrence: 'none',
      recurrenceEndDate: '',
      reminder_enabled: psychEmailRemindersEnabled,
      whatsapp_reminder_enabled: psychWhatsappRemindersEnabled
    });
    setNewSessionBonos([])
    setPatientSearchQuery('');
  };

  const resetNewAvailability = () => {
    setNewAvailability({
      startDate: '',
      endDate: '',
      startTime: '',
      endTime: '',
      duration: 60,
      daysOfWeek: [1, 2, 3, 4, 5],
      type: 'online'
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

      // Si hay Google Calendar conectado, el backend generará el Meet link real automáticamente
      // Si no, usar el link manual que introdujo el usuario
      let finalMeetLink = meetLink.trim();
      const generateMeetLink = googleCalendarConnected && selectedSlot?.type === 'online';

      // Obtener el usuario actual para autenticación
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      // Si el slot viene de la tabla dispo, borrar de dispo y crear una nueva sesión
      if ((selectedSlot as any).isFromDispo) {
        console.log('🔄 Converting dispo slot to session:', selectedSlot.id);
        
        // Crear nueva sesión y pasar el deleteDispoId para que se borre de dispo
        const newSession = {
          id: Date.now().toString(),
          patientId: patient.id,
          patientName: patient.name,
          patientPhone: patient.phone || '',
          patientEmail: patient.email || '',
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          type: selectedSlot.type,
          status: 'scheduled',
          meetLink: finalMeetLink || undefined,
          generateMeetLink,
          percent_psych: 100,
          price: 0,
          paid: false,
          deleteDispoId: selectedSlot.id // Indicar que se debe borrar este ID de dispo
        };

        const response = await apiFetch(`${API_URL}/sessions`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify({ ...newSession, psychologistId })
        });

        if (!response.ok) {
          const error = await response.json();
          alert('Error al crear la sesión: ' + (error.error || 'Error desconocido'));
          return;
        }
      } else {
        // Lógica anterior: actualizar sesión existente
        const updateResponse = await apiFetch(`${API_URL}/sessions/${selectedSlot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'scheduled',
            patientId: patient.id,
            patientName: patient.name,
            patientPhone: patient.phone || '',
            patientEmail: patient.email || '',
            meetLink: finalMeetLink || undefined,
            generateMeetLink
          })
        });

        if (!updateResponse.ok) {
          alert('Error al asignar el paciente');
          return;
        }
      }

      alert('¡Paciente asignado exitosamente!');
      await loadSessions();
      setShowAssignPatient(false);
      setSelectedSlot(null);
      setSelectedPatientId('');
      setMeetLink('');
      setSelectedSession(null);
    } catch (error) {
      console.error('Error assigning patient:', error);
      alert('Error al asignar el paciente');
    }
  };

  const commonTimezones = useMemo(() => {
    const base = [
      { label: 'Madrid', value: 'Europe/Madrid' },
      { label: 'London', value: 'Europe/London' },
      { label: 'París', value: 'Europe/Paris' },
      { label: 'Berlín', value: 'Europe/Berlin' },
      { label: 'Roma', value: 'Europe/Rome' },
      { label: 'Lisboa', value: 'Europe/Lisbon' },
      { label: 'Helsinki', value: 'Europe/Helsinki' },
      { label: 'Moscú', value: 'Europe/Moscow' },
      { label: 'Nueva York', value: 'America/New_York' },
      { label: 'Chicago', value: 'America/Chicago' },
      { label: 'Denver', value: 'America/Denver' },
      { label: 'Los Ángeles', value: 'America/Los_Angeles' },
      { label: 'México', value: 'America/Mexico_City' },
      { label: 'Bogotá', value: 'America/Bogota' },
      { label: 'Lima', value: 'America/Lima' },
      { label: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
      { label: 'Santiago', value: 'America/Santiago' },
      { label: 'São Paulo', value: 'America/Sao_Paulo' },
      { label: 'Dubai', value: 'Asia/Dubai' },
      { label: 'Tokio', value: 'Asia/Tokyo' },
      { label: 'Sídney', value: 'Australia/Sydney' },
    ];
    // Si la TZ del navegador no está en la lista, añadirla al principio para que siempre esté disponible y seleccionada
    const inList = base.some(t => t.value === browserTimezone);
    if (inList) return base;
    const label = browserTimezone.split('/').pop()?.replace(/_/g, ' ') ?? browserTimezone;
    return [{ label: `📍 ${label}`, value: browserTimezone }, ...base];
  }, [browserTimezone]);

  // Fecha de hoy en la zona horaria seleccionada, en formato YYYY-MM-DD
  const getTodayInTimezone = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: selectedTimezone,
    }).format(currentTime);
  };

  // Posición px de la hora actual en el timeline (48px por hora)
  const getCurrentTimePx = (): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: selectedTimezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(currentTime);
    const hours = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
    const minutes = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
    return ((hours * 60 + minutes) / 60) * 48;
  };

  // Nombre corto de la zona horaria (ej: "CET", "GMT+1")
  const getTimezoneShortName = (tz: string): string => {
    try {
      const parts = new Intl.DateTimeFormat('es-ES', {
        timeZone: tz,
        timeZoneName: 'short',
      }).formatToParts(new Date());
      return parts.find(p => p.type === 'timeZoneName')?.value ?? tz;
    } catch {
      return tz;
    }
  };

  // Etiqueta amigable para la zona horaria
  const getTimezoneLabel = (tz: string): string => {
    const found = commonTimezones.find(t => t.value === tz);
    if (found) return found.label;
    return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
  };

  // Convierte date+time en el timezone `tz` a un ISO UTC string
  const localTzToUTCISO = (dateStr: string, timeStr: string, tz: string): string => {
    // Tratar el input como UTC como punto de partida
    const guess = new Date(`${dateStr}T${timeStr}:00Z`);
    // Formatear en el TZ de destino para ver qué hora muestra
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(guess);
    const h = parts.find(p => p.type === 'hour')?.value ?? '00';
    const tzYear  = parseInt(parts.find(p => p.type === 'year')?.value  ?? '2000');
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value ?? '1') - 1;
    const tzDay   = parseInt(parts.find(p => p.type === 'day')?.value   ?? '1');
    const tzHour  = h === '24' ? 0 : parseInt(h);
    const tzMin   = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');
    // offset = TZ_mostrado_como_UTC - guess_UTC
    const tzDisplayedAsUTC = Date.UTC(tzYear, tzMonth, tzDay, tzHour, tzMin, 0);
    const offsetMs = tzDisplayedAsUTC - guess.getTime();
    // UTC_real = guess - offset
    return new Date(guess.getTime() - offsetMs).toISOString();
  };

  // Convierte una sesión al timezone seleccionado usando starts_on/ends_on (UTC)
  const convertSessionToTz = (session: Session, tz: string): { date: string; startTime: string; endTime: string } => {
    const toTimeParts = (d: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const h = parts.find(p => p.type === 'hour')?.value ?? '00';
      const m = parts.find(p => p.type === 'minute')?.value ?? '00';
      return `${h === '24' ? '00' : h}:${m}`;
    };
    // Si tenemos el timestamp UTC exacto, usarlo directamente
    if (session.starts_on) {
      const startDate = new Date(session.starts_on);
      const endDate   = session.ends_on ? new Date(session.ends_on) : new Date(session.starts_on);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(startDate);
      return { date, startTime: toTimeParts(startDate), endTime: toTimeParts(endDate) };
    }
    // Fallback: interpretar date+startTime en el timezone de la sesión (schedule_timezone),
    // o en el timezone activo si no hay info almacenada. NUNCA usar hora local del navegador.
    const sessionTz = session.schedule_timezone || tz;
    const startUTC = new Date(localTzToUTCISO(session.date, session.startTime || '00:00', sessionTz));
    const endUTC   = new Date(localTzToUTCISO(session.date, session.endTime   || '01:00', sessionTz));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(startUTC);
    return { date, startTime: toTimeParts(startUTC), endTime: toTimeParts(endUTC) };
  };

  // Mapa id → {date, startTime, endTime} en el timezone activo
  const sessionDisplayTimes = useMemo(() => {
    const map = new Map<string, { date: string; startTime: string; endTime: string }>();
    sessions.forEach(s => map.set(s.id, convertSessionToTz(s, selectedTimezone)));
    return map;
  }, [sessions, selectedTimezone]);

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Get week days for week view (Monday to Sunday)
  const getWeekDays = () => {
    const dayOfWeek = currentDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - daysFromMonday);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // Tags únicas de todas las relaciones del psicólogo
  const allPsychologistTags = useMemo(() => {
    const tagSet = new Set<string>();
    careRelationships.forEach((rel: any) => {
      const tags = rel.tags || rel.data?.tags || [];
      if (Array.isArray(tags)) tags.forEach((t: string) => tagSet.add(t));
    });
    return Array.from(tagSet).sort();
  }, [careRelationships]);

  // Filtrar sesiones por estado, pago y tags
  const getFilteredSessionsByStatus = (sessionsToFilter: Session[]) => {
    return sessionsToFilter.filter(session => {
      // Filtro por estado
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(session.status);
      
      // Filtro por pago
      const isPaid = session.paid;
      const matchesPayment = paymentFilter === 'all' || 
        (paymentFilter === 'paid' && isPaid) || 
        (paymentFilter === 'unpaid' && !isPaid);

      // Filtro por tags (la sesión debe tener al menos una de las tags seleccionadas)
      const matchesTags = filterTags.length === 0 ||
        filterTags.some(tag => (session.tags || []).includes(tag));
      
      return matchesStatus && matchesPayment && matchesTags;
    });
  };

  const statusFilterOptions: { label: string; value: string }[] = [
    { label: 'Programadas', value: 'scheduled' },
    { label: 'Completadas', value: 'completed' },
    { label: 'Canceladas', value: 'cancelled' },
    { label: 'Disponibles', value: 'available' }
  ];

  const paymentFilterOptions: { label: string; value: string }[] = [
    { label: 'Todas', value: 'all' },
    { label: 'Pagadas', value: 'paid' },
    { label: 'No Pagadas', value: 'unpaid' }
  ];

  const resetFilters = () => {
    setStatusFilter(['scheduled', 'completed']);
    setPaymentFilter('all');
    setFilterTags([]);
  };

  return (
    <div className="space-y-6" data-calendar-component ref={(el) => {
      if (el) {
        (el as any).openNewAvailability = () => setShowNewAvailability(true);
        (el as any).openNewSession = () => setShowNewSession(true);
      }
    }}>
      {/* Header - Only visible on mobile */}
      <div className="flex flex-col items-stretch gap-2 lg:hidden">
        <button
          onClick={() => { if (!canCreate) { onNeedUpgrade?.(); return; } setShowNewAvailability(true); }}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-md font-medium"
        >
          <Clock size={18} />
          <span>Añadir Disponibilidad</span>
        </button>
        <button
          onClick={() => { if (!canCreate) { onNeedUpgrade?.(); return; } setShowNewSession(true); }}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md font-medium"
        >
          <Plus size={18} />
          <span>Nueva Sesión</span>
        </button>
      </div>

      {/* Filtro de estado y pago */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-2.5">
        {/* Desktop: single compact row */}
        <div className="hidden lg:flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase shrink-0">Estado:</span>
          <div className="flex flex-wrap gap-1.5">
            {statusFilterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  if (statusFilter.includes(option.value)) {
                    setStatusFilter(statusFilter.filter(s => s !== option.value));
                  } else {
                    setStatusFilter([...statusFilter, option.value]);
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  statusFilter.includes(option.value)
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-slate-200 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 uppercase shrink-0">Pago:</span>
          <div className="flex flex-wrap gap-1.5">
            {paymentFilterOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setPaymentFilter(option.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  paymentFilter === option.value
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {allPsychologistTags.length > 0 && (
            <>
              <div className="w-px h-4 bg-slate-200 shrink-0" />
              <span className="text-xs font-semibold text-slate-500 uppercase shrink-0">Etiquetas:</span>
              <div className="flex flex-wrap gap-1.5">
                {allPsychologistTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      if (filterTags.includes(tag)) {
                        setFilterTags(filterTags.filter(t => t !== tag));
                      } else {
                        setFilterTags([...filterTags, tag]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      filterTags.includes(tag)
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🏷️ {tag}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-900 shrink-0"
          >
            Limpiar
          </button>
        </div>

        {/* Mobile: stacked layout */}
        <div className="flex flex-col gap-4 lg:hidden">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2">Filtrar por Estado</label>
            <div className="flex flex-wrap gap-2">
              {statusFilterOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (statusFilter.includes(option.value)) {
                      setStatusFilter(statusFilter.filter(s => s !== option.value));
                    } else {
                      setStatusFilter([...statusFilter, option.value]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter.includes(option.value)
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2">Estado de Pago</label>
            <div className="flex flex-wrap gap-2">
              {paymentFilterOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setPaymentFilter(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    paymentFilter === option.value
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {allPsychologistTags.length > 0 && (
            <div className="flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-2">Etiquetas</label>
              <div className="flex flex-wrap gap-2">
                {allPsychologistTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      if (filterTags.includes(tag)) {
                        setFilterTags(filterTags.filter(t => t !== tag));
                      } else {
                        setFilterTags([...filterTags, tag]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterTags.includes(tag)
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    🏷️ {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Navigation */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePreviousWeek}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors flex-shrink-0"
            >
              <ChevronLeft size={20} />
            </button>
            <h3 className="text-sm sm:text-base md:text-lg font-semibold text-slate-900 capitalize text-center mx-2 min-w-0">
              {(() => {
                const days = getWeekDays();
                const first = days[0];
                const last = days[6];
                const sameMonth = first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
                if (sameMonth) {
                  return `Semana del ${first.getDate()} al ${last.getDate()} de ${first.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;
                }
                const sameYear = first.getFullYear() === last.getFullYear();
                const firstStr = first.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
                const lastStr = last.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
                return `Semana del ${firstStr} al ${lastStr}`;
              })()}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Selector de zona horaria — solo desktop */}
              <div className="hidden sm:block relative timezone-dropdown-container">
              <button
                onClick={() => setShowTimezoneDropdown(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-xs text-slate-600 shadow-sm"
              >
                <Globe size={12} className="text-indigo-500" />
                {selectedTimezone === browserTimezone && <span className="text-[10px]">📍</span>}
                <span className="font-semibold">{getTimezoneLabel(selectedTimezone)}</span>
                <span className="text-slate-400 hidden sm:inline">{getTimezoneShortName(selectedTimezone)}</span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${showTimezoneDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showTimezoneDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-[220px] max-h-72 overflow-y-auto">
                  <div className="p-1">
                    {/* Entrada especial: ubicación detectada del navegador */}
                    <button
                      onClick={() => { setSelectedTimezone(browserTimezone); setShowTimezoneDropdown(false); }}
                      className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        selectedTimezone === browserTimezone
                          ? 'bg-indigo-50 text-indigo-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>📍 Mi ubicación actual</span>
                      <span className="text-slate-400 ml-2">{getTimezoneShortName(browserTimezone)}</span>
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    {commonTimezones.map(tz => (
                      <button
                        key={tz.value}
                        onClick={() => { setSelectedTimezone(tz.value); setShowTimezoneDropdown(false); }}
                        className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded-lg text-xs hover:bg-slate-50 transition-colors ${
                          selectedTimezone === tz.value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                        }`}
                      >
                        <span>{tz.label}</span>
                        <span className="text-slate-400 ml-2">{getTimezoneShortName(tz.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleNextWeek}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
          {/* Selector de zona horaria — solo móvil */}
          <div className="sm:hidden flex justify-center">
            <div className="relative timezone-dropdown-container">
              <button
                onClick={() => setShowTimezoneDropdown(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-xs text-slate-600 shadow-sm"
              >
                <Globe size={12} className="text-indigo-500" />
                {selectedTimezone === browserTimezone && <span className="text-[10px]">📍</span>}
                <span className="font-semibold">{getTimezoneLabel(selectedTimezone)}</span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${showTimezoneDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showTimezoneDropdown && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-[220px] max-h-72 overflow-y-auto">
                  <div className="p-1">
                    <button
                      onClick={() => { setSelectedTimezone(browserTimezone); setShowTimezoneDropdown(false); }}
                      className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        selectedTimezone === browserTimezone
                          ? 'bg-indigo-50 text-indigo-700 font-bold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>📍 Mi ubicación actual</span>
                      <span className="text-slate-400 ml-2">{getTimezoneShortName(browserTimezone)}</span>
                    </button>
                    <div className="border-t border-slate-100 my-1" />
                    {commonTimezones.map(tz => (
                      <button
                        key={tz.value}
                        onClick={() => { setSelectedTimezone(tz.value); setShowTimezoneDropdown(false); }}
                        className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded-lg text-xs hover:bg-slate-50 transition-colors ${
                          selectedTimezone === tz.value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700'
                        }`}
                      >
                        <span>{tz.label}</span>
                        <span className="text-slate-400 ml-2">{getTimezoneShortName(tz.value)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Week View */}
        <div className="p-4">
          {/* Mobile: Horizontal list */}
          <div className="md:hidden space-y-3">
            {getWeekDays().map(date => {
              const dateStr = formatLocalDate(date);
              const daySessions = getSessionsForDate(dateStr);
              const isToday = getTodayInTimezone() === dateStr;
              
              return (
                <div
                  key={dateStr}
                  className={`
                    relative w-full flex flex-row items-stretch rounded-xl border transition-all min-h-[100px]
                    ${isToday ? 'border-indigo-400 ring-1 ring-indigo-400 bg-indigo-50/20' : 'border-slate-200 bg-white'}
                  `}
                >
                  {/* Left: Date Column */}
                  <div className={`w-20 shrink-0 flex flex-col items-center justify-center border-r p-2 ${isToday ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/50'}`}>
                    <span className={`text-xs font-bold uppercase tracking-wide mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {weekDays[date.getDay()]}
                    </span>
                    <span className={`text-2xl font-bold ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {date.getDate()}
                    </span>
                    {daySessions.length > 0 && (
                      <div className="mt-2 text-xs font-semibold text-slate-500">
                        {daySessions.length} sesión{daySessions.length !== 1 ? 'es' : ''}
                      </div>
                    )}
                  </div>

                  {/* Right: Sessions Content */}
                  <div className="flex-1 p-3 flex flex-col justify-center">
                    {daySessions.length === 0 ? (
                      <div className="h-full flex items-center text-slate-300 text-sm italic">
                        Sin sesiones
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {daySessions.map(session => (
                          <div
                            key={session.id}
                            className={`group px-3 py-2 rounded-lg cursor-pointer transition-all hover:shadow-md border relative ${
                              session.status === 'available'
                                ? 'bg-purple-50 border-purple-200 hover:bg-purple-100'
                                : session.status === 'scheduled'
                                ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
                                : session.status === 'completed'
                                ? 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                : session.status === 'paid'
                                ? 'bg-green-50 border-green-200 hover:bg-green-100'
                                : 'bg-red-50 border-red-200 hover:bg-red-100'
                            }`}
                            onClick={() => {
                              if (session.status === 'available') {
                                setSelectedSlot(session);
                                setShowAssignPatient(true);
                              } else {
                                handleOpenSession(session);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                <span className={`text-xs font-semibold ${
                                  session.status === 'available' ? 'text-purple-700' :
                                  session.status === 'scheduled' ? 'text-blue-700' :
                                  session.status === 'completed' ? 'text-green-700' :
                                  session.status === 'paid' ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {sessionDisplayTimes.get(session.id)?.startTime ?? session.startTime} - {sessionDisplayTimes.get(session.id)?.endTime ?? session.endTime}
                                </span>
                                {session.type === 'online' ? (
                                  <Video size={14} className="text-indigo-500" />
                                ) : session.type === 'home-visit' ? (
                                  <MapPin size={14} className="text-green-500" />
                                ) : (
                                  <MapPin size={14} className="text-purple-500" />
                                )}
                                {session.paid && (
                                  <span className="text-sm">💵</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  session.status === 'available' ? 'bg-purple-100 text-purple-700' :
                                  session.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                  session.status === 'completed' ? 'bg-green-100 text-green-700' :
                                  session.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {session.status === 'available' ? 'Disponible' :
                                   session.status === 'scheduled' ? 'Programada' :
                                   session.status === 'completed' ? 'Completada' :
                                   session.status === 'paid' ? 'Pagada' : 'Cancelada'}
                                </span>
                                {session.status === 'available' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm('¿Eliminar esta disponibilidad?')) {
                                        handleDeleteAvailability(session.id);
                                      }
                                    }}
                                    className="p-1 hover:bg-red-100 rounded transition-all text-red-600 hover:text-red-700"
                                    title="Eliminar disponibilidad"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                            {session.patientName && (
                              <div className="text-xs text-slate-700 mt-1 font-medium">{session.patientName}</div>
                            )}
                            {session.tags && session.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {session.tags.slice(0, 2).map((tag, idx) => (
                                  <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">🏷️ {tag}</span>
                                ))}
                                {session.tags.length > 2 && (
                                  <span className="text-[9px] text-slate-400">+{session.tags.length - 2}</span>
                                )}
                              </div>
                            )}
                            {session.notes && (
                              <div className="text-xs text-slate-500 mt-1 line-clamp-1">{session.notes}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: Vertical columns grid with hourly timeline */}
          <div className="hidden md:block">
            <div className="flex gap-2 max-w-full">
              {/* Time labels column - fixed */}
              <div className="w-14 flex-shrink-0">
                <div className="h-14 sticky top-0 bg-white z-20"></div> {/* Header spacer */}
              </div>
              
              {/* Days headers - sticky */}
              <div className="flex-1 grid grid-cols-7 gap-2 sticky top-0 bg-white z-10 pb-2">
                {getWeekDays().map(date => {
                  const dateStr = formatLocalDate(date);
                  const daySessions = getSessionsForDate(dateStr);
                  const isToday = getTodayInTimezone() === dateStr;
                  
                  return (
                    <div
                      key={dateStr}
                      className={`flex flex-col items-center justify-center p-2 border rounded-lg h-14 ${isToday ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {weekDays[date.getDay()]}
                      </span>
                      <span className={`text-lg font-bold ${isToday ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {date.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Scrollable content area */}
            <div ref={scrollContainerRef} className="h-[600px] lg:h-[calc(100vh-290px)] overflow-y-auto mt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex gap-2">
                {/* Time labels column */}
                <div className="w-14 flex-shrink-0">
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="h-12 flex items-start justify-end pr-2 text-[10px] text-slate-400 font-medium pt-0.5">
                      {`${i.toString().padStart(2, '0')}:00`}
                    </div>
                  ))}
                </div>
                
                {/* Days columns */}
                <div className="flex-1 grid grid-cols-7 gap-2">
                  {getWeekDays().map(date => {
                    const dateStr = formatLocalDate(date);
                    const daySessions = getSessionsForDate(dateStr);
                    const isToday = getTodayInTimezone() === dateStr;
                    
                    // Helper to convert time string (HH:MM) to minutes from midnight
                    const timeToMinutes = (time: string) => {
                      const [hours, minutes] = time.split(':').map(Number);
                      return hours * 60 + minutes;
                    };
                    
                    return (
                      <div
                        key={dateStr}
                        data-week-day={dateStr}
                        className={`
                          relative rounded-lg border cursor-pointer
                          ${isToday ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200 bg-white'}
                        `}
                        style={{ height: `${24 * 48}px` }}
                        onMouseDown={(e) => {
                          // Only trigger if clicking on the background, not on a session
                          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('hour-slot')) {
                            const scrollableContainer = scrollContainerRef.current;
                            if (!scrollableContainer) return;

                            const containerRect = scrollableContainer.getBoundingClientRect();
                            const scrollTop = scrollableContainer.scrollTop;
                            const y = e.clientY - containerRect.top + scrollTop;
                            
                            setCreatingSession({
                              date: dateStr,
                              startY: y,
                              currentY: y
                            });
                          }
                        }}
                      >
                        {/* Hour grid lines */}
                        {Array.from({ length: 24 }, (_, i) => (
                          <div
                            key={i}
                            className="hour-slot absolute w-full h-12 border-b border-slate-100 hover:bg-indigo-50/30 transition-colors pointer-events-none"
                            style={{ top: `${i * 48}px` }}
                          />
                        ))}

                        {/* Indicador de hora actual */}
                        {getTodayInTimezone() === dateStr && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: `${getCurrentTimePx()}px` }}
                          >
                            <div className="flex items-center">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 flex-shrink-0 shadow-sm"></div>
                              <div className="flex-1 h-0.5 bg-red-400"></div>
                            </div>
                          </div>
                        )}
                        
                        {/* Preview of new session being created */}
                        {creatingSession && creatingSession.date === dateStr && (
                          <div
                            className="absolute left-1 right-1 rounded-md border-2 border-indigo-500 bg-indigo-200/50 pointer-events-none z-20"
                            style={{
                              top: `${Math.min(creatingSession.startY, creatingSession.currentY)}px`,
                              height: `${Math.max(Math.abs(creatingSession.currentY - creatingSession.startY), 12)}px`
                            }}
                          >
                            <div className="p-1 text-[9px] font-bold text-indigo-900">
                              Nueva sesión
                            </div>
                          </div>
                        )}
                        
                        {/* Preview of session being dragged */}
                        {dragPreview && dragPreview.date === dateStr && draggingSession && (() => {
                          const startMins = timeToMinutes(dragPreview.startTime);
                          let endMins = timeToMinutes(dragPreview.endTime);
                          if (endMins < startMins) endMins = 24 * 60;
                          const durationMins = endMins - startMins;
                          return (
                            <div
                              className="absolute left-1 right-1 rounded-md border-2 border-blue-500 bg-blue-200/50 pointer-events-none z-30"
                              style={{
                                top: `${(startMins / 60) * 48}px`,
                                height: `${(durationMins / 60) * 48}px`
                              }}
                            >
                              <div className="p-1 text-[9px] font-bold text-blue-900">
                                {dragPreview.startTime} - {dragPreview.endTime}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Preview of session being resized */}
                        {resizingSession && resizingSession.date === dateStr && tempSessionTimes && (() => {
                          const startMins = timeToMinutes(tempSessionTimes.startTime);
                          let endMins = timeToMinutes(tempSessionTimes.endTime);
                          if (endMins < startMins) endMins = 24 * 60;
                          const durationMins = endMins - startMins;
                          return (
                            <div
                              className="absolute left-1 right-1 rounded-md border-2 border-green-500 bg-green-200/50 pointer-events-none z-30"
                              style={{
                                top: `${(startMins / 60) * 48}px`,
                                height: `${(durationMins / 60) * 48}px`
                              }}
                            >
                              <div className="p-1 text-[9px] font-bold text-green-900">
                                {tempSessionTimes.startTime} - {tempSessionTimes.endTime}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Sessions positioned absolutely */}
                        {(() => {
                          // Compute overlap layout for sessions in this day column
                          const overlapLayout = new Map<string, { col: number; totalCols: number; isOverlapping: boolean }>();
                          const sorted = [...daySessions].sort((a, b) => {
                            const aS = timeToMinutes(sessionDisplayTimes.get(a.id)?.startTime ?? a.startTime);
                            const bS = timeToMinutes(sessionDisplayTimes.get(b.id)?.startTime ?? b.startTime);
                            return aS - bS;
                          });
                          // Build overlap clusters
                          const clusters: (typeof sorted)[] = [];
                          for (const s of sorted) {
                            const sStart = timeToMinutes(sessionDisplayTimes.get(s.id)?.startTime ?? s.startTime);
                            let sEnd = timeToMinutes(sessionDisplayTimes.get(s.id)?.endTime ?? s.endTime);
                            if (sEnd <= sStart) sEnd = 24 * 60;
                            let placed = false;
                            for (const cluster of clusters) {
                              const clMaxEnd = Math.max(...cluster.map(c => {
                                let cEnd = timeToMinutes(sessionDisplayTimes.get(c.id)?.endTime ?? c.endTime);
                                const cStart = timeToMinutes(sessionDisplayTimes.get(c.id)?.startTime ?? c.startTime);
                                if (cEnd <= cStart) cEnd = 24 * 60;
                                return cEnd;
                              }));
                              if (sStart < clMaxEnd) { cluster.push(s); placed = true; break; }
                            }
                            if (!placed) clusters.push([s]);
                          }
                          // Assign columns within each cluster
                          for (const cluster of clusters) {
                            const isOverlapping = cluster.length > 1;
                            const colEnds: number[] = [];
                            for (const s of cluster) {
                              const sStart = timeToMinutes(sessionDisplayTimes.get(s.id)?.startTime ?? s.startTime);
                              let sEnd = timeToMinutes(sessionDisplayTimes.get(s.id)?.endTime ?? s.endTime);
                              if (sEnd <= sStart) sEnd = 24 * 60;
                              let col = 0;
                              while (col < colEnds.length && colEnds[col] > sStart) col++;
                              colEnds[col] = sEnd;
                              overlapLayout.set(s.id, { col, totalCols: cluster.length, isOverlapping });
                            }
                            const maxCols = colEnds.length;
                            for (const s of cluster) {
                              const ex = overlapLayout.get(s.id)!;
                              overlapLayout.set(s.id, { ...ex, totalCols: maxCols });
                            }
                          }
                          return daySessions.map(session => {
                          const tzTimes = sessionDisplayTimes.get(session.id);
                          const dispStart = tzTimes?.startTime ?? session.startTime;
                          const dispEnd = tzTimes?.endTime ?? session.endTime;
                          const startMinutes = timeToMinutes(dispStart);
                          let endMinutes = timeToMinutes(dispEnd);
                          
                          // Si endTime es menor que startTime, la sesión cruza medianoche
                          // En ese caso, mostrar solo hasta las 24:00 (1440 minutos)
                          if (endMinutes < startMinutes) {
                            endMinutes = 24 * 60; // 24:00 = 1440 minutos
                          }
                          
                          const durationMinutes = endMinutes - startMinutes;
                          
                          // Calculate position and height (48px per hour = 0.8px per minute)
                          const topPx = (startMinutes / 60) * 48;
                          const heightPx = (durationMinutes / 60) * 48;

                          // Overlap layout positioning
                          const layout = overlapLayout.get(session.id) ?? { col: 0, totalCols: 1, isOverlapping: false };
                          const GAP = 2; // px gap between overlapping sessions
                          const colWidthPct = 100 / layout.totalCols;
                          const leftPct = layout.col * colWidthPct;
                          
                          return (
                            <div
                              key={session.id}
                              className={`group absolute rounded-md cursor-${session.status === 'scheduled' ? 'move' : 'pointer'} transition-all hover:shadow-lg border hover:z-10 overflow-visible ${
                                draggingSession?.id === session.id ? 'opacity-30' : ''
                              } ${
                                resizingSession?.id === session.id ? 'opacity-40' : ''
                              } ${
                                layout.isOverlapping ? 'ring-1 ring-orange-400 ring-offset-0' : ''
                              } ${
                                session.status === 'available'
                                  ? 'bg-purple-100 border-purple-300 hover:bg-purple-200'
                                  : session.status === 'scheduled'
                                  ? 'bg-indigo-100 border-indigo-300 hover:bg-indigo-200'
                                  : session.status === 'completed'
                                  ? 'bg-slate-100 border-slate-300 hover:bg-slate-200'
                                  : session.status === 'paid'
                                  ? 'bg-green-100 border-green-300 hover:bg-green-200'
                                  : 'bg-red-100 border-red-300 hover:bg-red-200'
                              }`}
                              style={{
                                top: `${topPx}px`,
                                height: `${Math.max(heightPx, 24)}px`,
                                left: `calc(${leftPct}% + ${layout.col > 0 ? GAP : 4}px)`,
                                width: `calc(${colWidthPct}% - ${layout.totalCols > 1 ? GAP * 2 : 8}px)`,
                              }}
                              onMouseDown={(e) => {
                                // Only allow dragging for scheduled sessions
                                if (session.status !== 'scheduled') return;
                                
                                // Don't start drag if clicking on resize handles or buttons
                                if ((e.target as HTMLElement).classList.contains('resize-handle') ||
                                    (e.target as HTMLElement).tagName === 'BUTTON') {
                                  return;
                                }
                                
                                e.stopPropagation();
                                const scrollableContainer = scrollContainerRef.current;
                                if (!scrollableContainer) return;

                                const containerRect = scrollableContainer.getBoundingClientRect();
                                const scrollTop = scrollableContainer.scrollTop;
                                const y = e.clientY - containerRect.top + scrollTop;

                                // Calculate how far from the session's top edge the user clicked
                                const dispStart = sessionDisplayTimes.get(session.id)?.startTime ?? session.startTime;
                                const [sh, sm] = dispStart.split(':').map(Number);
                                const sessionTopPx = ((sh * 60 + sm) / 60) * 48;
                                const clickOffsetY = y - sessionTopPx;
                                
                                setDraggingSession({
                                  id: session.id,
                                  startY: y,
                                  clickOffsetY,
                                  originalDate: dateStr,
                                  originalStartTime: session.startTime,
                                  originalEndTime: session.endTime
                                });
                              }}
                              onClick={(e) => {
                                // Don't trigger if clicking on resize handles
                                if ((e.target as HTMLElement).classList.contains('resize-handle')) {
                                  return;
                                }
                                // Don't open modal if we just finished dragging
                                if (draggingSession) return;
                                
                                if (session.status === 'available') {
                                  setSelectedSlot(session);
                                  setShowAssignPatient(true);
                                } else {
                                  handleOpenSession(session);
                                }
                              }}
                            >
                              {/* Top resize handle */}
                              {session.status === 'scheduled' && (
                                <div
                                  className="resize-handle absolute top-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-all z-20"
                                  style={{ marginTop: '-4px' }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setResizingSession({ id: session.id, edge: 'top', date: dateStr });
                                    const dt = sessionDisplayTimes.get(session.id);
                                    setTempSessionTimes({ startTime: dt?.startTime ?? session.startTime, endTime: dt?.endTime ?? session.endTime });
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.backgroundColor = '';
                                  }}
                                >
                                  <div className="w-full h-0.5 bg-blue-500 mt-1.5"></div>
                                </div>
                              )}
                              
                              <div className="p-1 h-full flex flex-col justify-between pointer-events-none">
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-0.5">
                                    <span className={`text-[9px] font-bold leading-tight ${
                                      session.status === 'available' ? 'text-purple-800' :
                                      session.status === 'scheduled' ? 'text-blue-800' :
                                      session.status === 'completed' ? 'text-green-800' :
                                      session.status === 'paid' ? 'text-green-800' : 'text-red-800'
                                    }`}>
                                      {sessionDisplayTimes.get(session.id)?.startTime ?? session.startTime}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                      {session.status === 'scheduled' && (
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto" title="Arrastra para mover">
                                          <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" className="text-blue-600">
                                            <circle cx="2" cy="2" r="1"/>
                                            <circle cx="7" cy="2" r="1"/>
                                            <circle cx="2" cy="7" r="1"/>
                                            <circle cx="7" cy="7" r="1"/>
                                          </svg>
                                        </div>
                                      )}
                                      {session.type === 'online' ? (
                                        <Video size={9} className="text-indigo-600" />
                                      ) : session.type === 'home-visit' ? (
                                        <MapPin size={9} className="text-green-600" />
                                      ) : (
                                        <MapPin size={9} className="text-purple-600" />
                                      )}
                                      {session.paid && (
                                        <span className="text-[9px]">💵</span>
                                      )}
                                      {layout.isOverlapping && (
                                        <span title="Sesión solapada" className="text-orange-500 font-bold text-[9px]">⚡</span>
                                      )}
                                    </div>
                                  </div>
                                  {session.patientName && (
                                    <div className="text-[9px] text-slate-800 font-semibold line-clamp-2 leading-tight">{session.patientName}</div>
                                  )}
                                  {session.tags && session.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                                      {session.tags.slice(0, 1).map((tag, idx) => (
                                        <span key={idx} className="text-[7px] px-1 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium leading-none truncate max-w-[50px]">{tag}</span>
                                      ))}
                                      {session.tags.length > 1 && (
                                        <span className="text-[7px] text-slate-400">+{session.tags.length - 1}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {session.status === 'available' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm('¿Eliminar esta disponibilidad?')) {
                                        handleDeleteAvailability(session.id);
                                      }
                                    }}
                                    className="opacity-0 group-hover:opacity-100 absolute top-0.5 right-0.5 p-0.5 hover:bg-red-200 rounded transition-all text-red-700 hover:text-red-900 pointer-events-auto"
                                    title="Eliminar disponibilidad"
                                  >
                                    <Trash2 size={9} />
                                  </button>
                                )}
                              </div>
                              
                              {/* Bottom resize handle */}
                              {session.status === 'scheduled' && (
                                <div
                                  className="resize-handle absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize opacity-0 group-hover:opacity-100 transition-all z-20"
                                  style={{ marginBottom: '-4px' }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setResizingSession({ id: session.id, edge: 'bottom', date: dateStr });
                                    const dt = sessionDisplayTimes.get(session.id);
                                    setTempSessionTimes({ startTime: dt?.startTime ?? session.startTime, endTime: dt?.endTime ?? session.endTime });
                                  }}
                                  onMouseEnter={(e) => {
                                    (e.target as HTMLElement).style.backgroundColor = 'rgba(59, 130, 246, 0.5)';
                                  }}
                                  onMouseLeave={(e) => {
                                    (e.target as HTMLElement).style.backgroundColor = '';
                                  }}
                                >
                                  <div className="w-full h-0.5 bg-blue-500 mb-1.5"></div>
                                </div>
                              )}
                            </div>
                          );
                        });
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Day Sessions Detail Modal */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedDate('')}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  {parseLocalDate(selectedDate).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
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
                        <div className="flex items-center gap-2">
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
                        {session.status === 'available' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteAvailability(session.id);
                            }}
                            className="flex items-center gap-1 text-xs font-semibold text-rose-600 px-2 py-1 border border-rose-200 rounded-full hover:bg-rose-50"
                          >
                            <Trash2 size={12} />
                            Eliminar
                          </button>
                        )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Session Modal */}
      {selectedSession && editedSession && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-2xl w-full h-full sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-bold text-slate-800">Editar Sesión</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-lg transition-colors touch-manipulation"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
              {/* Patient Name (Read-only) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Paciente</label>
                <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                  {editedSession.patientName || 'Paciente no disponible'}
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Fecha</label>
                <input
                  type="date"
                  value={editedSession.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
                />
              </div>

              {/* Tomar notas de sesión */}
              {(editedSession.status === 'scheduled' || editedSession.status === 'completed') && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Tomar notas</label>
                  <div className="flex items-center gap-1.5">
                    {(!editedSession.session_entry_id || scheduleEntryStatus !== 'done') && (
                      <button
                        type="button"
                        onClick={handleQuickCompleteSession}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-emerald-400 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-600 text-emerald-600 transition-all flex-shrink-0"
                        title="Marcar sesión como completada (sin notas)"
                      >
                        <CheckCircle size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setScheduleSessionDetailsOpen(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border-2 transition-all text-sm font-semibold ${
                        !editedSession.session_entry_id
                          ? 'border-red-300 bg-red-50 hover:border-red-500 hover:bg-red-100 text-red-600'
                          : scheduleEntryStatus === 'done'
                          ? 'border-green-500 bg-green-50 hover:bg-green-100 text-green-700'
                          : 'border-orange-400 bg-orange-50 hover:border-orange-500 hover:bg-orange-100 text-orange-600'
                      }`}
                    >
                      {!editedSession.session_entry_id ? (
                        <><FileText size={14} className="text-red-500 flex-shrink-0" /><span>Completar sesión</span></>
                      ) : scheduleEntryStatus === 'done' ? (
                        <><CheckCircle size={14} className="text-green-600 flex-shrink-0" /><span>Sesión completada</span></>
                      ) : (
                        <><FileText size={14} className="text-orange-500 flex-shrink-0" /><span>Completar sesión</span></>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Zona horaria de la sesión */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Zona horaria</label>
                <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm flex items-center gap-2">
                  <Globe size={15} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold">{editedSession.schedule_timezone || selectedTimezone}</span>
                    <span className="ml-2 text-blue-500 text-xs">{getTimezoneShortName(editedSession.schedule_timezone || selectedTimezone)}</span>
                  </div>
                  {editedSession.schedule_timezone && editedSession.schedule_timezone !== selectedTimezone && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 flex-shrink-0">
                      Tu TZ actual: {getTimezoneShortName(selectedTimezone)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">Las horas se muestran e interpretan en esta zona horaria</p>
              </div>

              {/* Time Range */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora inicio <span className="text-xs font-normal text-blue-500">({getTimezoneShortName(editedSession.schedule_timezone || selectedTimezone)})</span></label>
                  <input
                    type="time"
                    value={editedSession.startTime}
                    onChange={(e) => handleFieldChange('startTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Hora fin <span className="text-xs font-normal text-blue-500">({getTimezoneShortName(editedSession.schedule_timezone || selectedTimezone)})</span></label>
                  <input
                    type="time"
                    value={editedSession.endTime}
                    onChange={(e) => handleFieldChange('endTime', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
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
                </select>
              </div>

              {/* Paid Checkbox */}
              <div>
                <label className={`flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg transition-colors ${
                  editedSession.bonus_id ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-green-100'
                }`}>
                  <input
                    type="checkbox"
                    checked={editedSession.paid || false}
                    onChange={(e) => handleFieldChange('paid', e.target.checked)}
                    disabled={!!editedSession.bonus_id}
                    className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <div>
                    <div className="font-semibold text-green-700">Sesión pagada</div>
                    <div className="text-xs text-green-600">
                      {editedSession.bonus_id 
                        ? 'Estado heredado del bono asignado'
                        : 'Marcar como pagada independientemente del estado'
                      }
                    </div>
                  </div>
                </label>
              </div>

              {/* Payment Method */}
              {editedSession.paid && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Método de pago</label>
                  <select
                    value={editedSession.paymentMethod || ''}
                    onChange={(e) => handleFieldChange('paymentMethod', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-base bg-white"
                  >
                    <option value="">-- Seleccionar --</option>
                    <option value="Bizum">Bizum</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Efectivo">Efectivo</option>
                  </select>
                </div>
              )}

              {/* Price and Percent */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Precio por hora (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedSession.price === 0 ? '' : editedSession.price || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permitir vacío, números y decimales
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        handleFieldChange('price', value === '' ? 0 : parseFloat(value) || 0);
                      }
                    }}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Duración: {getSessionDurationHours(editedSession).toFixed(2)}h → Total: {getSessionTotalPrice(editedSession).toFixed(2)}€
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">% Psicólogo</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedSession.percent_psych === 0 ? '' : editedSession.percent_psych || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        const numValue = value === '' ? 0 : parseFloat(value) || 0;
                        handleFieldChange('percent_psych', Math.min(numValue, 100));
                      }
                    }}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Meet Link */}
              {editedSession.type === 'online' && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Enlace de reunión</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={editedSession.meetLink || ''}
                      onChange={(e) => handleFieldChange('meetLink', e.target.value)}
                      placeholder="https://meet.google.com/..."
                      className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base bg-white"
                    />
                    {googleCalendarConnected && !editedSession.meetLink && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const u = await getCurrentUser();
                            if (!u?.id) return;
                            const res = await apiFetch(`${API_URL}/sessions/${editedSession.id}/generate-meet`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'x-user-id': u.id }
                            });
                            if (res.ok) {
                              const data = await res.json();
                              if (data.meetLink) {
                                handleFieldChange('meetLink', data.meetLink);
                              }
                            } else {
                              alert('No se pudo generar el enlace de Meet');
                            }
                          } catch (_) {
                            alert('Error al conectar con el servidor');
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center justify-center gap-1.5"
                      >
                        <Video size={16} />
                        Crear Meet
                      </button>
                    )}
                  </div>
                  {editedSession.meetLink && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={editedSession.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        <ExternalLink size={16} />
                        Conectar como psicólogo
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(editedSession.meetLink || '');
                          alert('Enlace copiado al portapapeles');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        <Copy size={16} />
                        Copiar enlace
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bonos Section */}
              {editedSession.patient_user_id && !editedSession.invoice_id && (
                <div className="border border-purple-200 rounded-xl bg-purple-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Ticket size={18} className="text-purple-600" />
                    <h4 className="font-semibold text-purple-900">Bonos del Paciente</h4>
                  </div>
                  
                  {/* Currently Assigned Bonus */}
                  {editedSession.bonus_id && assignedBono && (
                    <div className="mb-4 p-4 bg-white rounded-lg border-2 border-purple-400 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Receipt size={18} className="text-purple-600" />
                          <span className="text-base font-bold text-purple-900">Bono Asignado</span>
                        </div>
                        {assignedBono.paid && (
                          <span className="text-xs bg-green-500 text-white px-2.5 py-1 rounded-full font-bold">
                            PAGADO
                          </span>
                        )}
                      </div>
                      <div className="space-y-1.5 mb-3">
                        <div className="text-sm text-purple-800">
                          <span className="font-semibold">{assignedBono.total_sessions} sesiones</span> · Precio total: {assignedBono.total_price}€
                        </div>
                        <div className="text-sm text-purple-700">
                          Precio por sesión: <span className="font-bold">{(assignedBono.total_price / assignedBono.total_sessions).toFixed(2)}€</span>
                        </div>
                        <div className="text-xs text-purple-600">
                          Sesiones usadas: {assignedBono.used_sessions || 0} / {assignedBono.total_sessions}
                        </div>
                        <div className="text-xs text-purple-600">
                          Fecha: {new Date(assignedBono.purchase_date).toLocaleDateString('es-ES')}
                        </div>
                      </div>
                      <button
                        onClick={handleUnassignBono}
                        disabled={isAssigningBono}
                        className="w-full px-3 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
                      >
                        <XCircle size={16} />
                        Desasignar de este bono
                      </button>
                    </div>
                  )}

                  {/* Currently Assigned Bonus (sin datos del bono) */}
                  {editedSession.bonus_id && !assignedBono && (
                    <div className="mb-4 p-3 bg-white rounded-lg border border-purple-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Receipt size={16} className="text-purple-600" />
                          <span className="text-sm font-medium text-purple-900">Asignado a bono</span>
                        </div>
                        <button
                          onClick={handleUnassignBono}
                          disabled={isAssigningBono}
                          className="px-3 py-1.5 text-xs bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <XCircle size={14} />
                          Desasignar
                        </button>
                      </div>
                    </div>
                  )}                  {/* Available Bonuses List */}
                  {isLoadingBonos ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                      <span className="ml-2 text-sm text-purple-600">Cargando bonos...</span>
                    </div>
                  ) : availableBonos.length === 0 ? (
                    <div className="text-sm text-purple-700 bg-purple-100 rounded-lg p-3 border border-purple-200">
                      No hay bonos disponibles para este paciente
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-purple-700 mb-2">
                        Bonos disponibles ({availableBonos.length})
                      </div>
                      {availableBonos.map(bono => (
                        <div
                          key={bono.id}
                          className="p-3 bg-white rounded-lg border border-purple-200 hover:border-purple-400 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Ticket size={16} className="text-purple-600" />
                              <span className="text-sm font-medium text-purple-900">
                                {bono.total_sessions} sesiones
                              </span>
                              {bono.paid && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                  Pagado
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-purple-600 font-semibold">
                              {bono.total_sessions - bono.used_sessions} restantes
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs text-purple-700">
                                Total: {bono.total_price}€ → {(bono.total_price / bono.total_sessions).toFixed(2)}€/sesión
                              </div>
                              <div className="text-xs text-purple-600">
                                Fecha: {new Date(bono.purchase_date).toLocaleDateString('es-ES')}
                              </div>
                            </div>
                            <button
                              onClick={() => handleAssignBono(bono.id)}
                              disabled={isAssigningBono || !!editedSession.bonus_id}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                              <CheckCircle size={14} />
                              Asignar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

              {/* Comunicar */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Comunicar</label>
                <div className="flex flex-col gap-2">
                  {(() => {
                    // Obtener datos siempre frescos desde el array de pacientes cargados
                    // Usar también los campos enriquecidos de la sesión como fallback (producción/Supabase)
                    const patientRecord = patients.find(p => p.id === (editedSession.patient_user_id || editedSession.patientId));
                    const rawPhone = (patientRecord?.phone || editedSession.patientPhone || '').replace(/\s/g, '');
                    const hasPhone = rawPhone.length > 0;
                    const phone = rawPhone.replace(/[^0-9+]/g, '');
                    const email = (patientRecord?.email || editedSession.patientEmail || '').trim();
                    const hasEmail = email.length > 0;
                    const patientName = editedSession.patientName?.split(' ')[0] || 'paciente';
                    const sessionDate = new Date(editedSession.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

                    const isOnlineWithLink = editedSession.type === 'online' && !!editedSession.meetLink;
                    const whatsappMessage = isOnlineWithLink
                      ? `¡Hola ${patientName}! 😊 Te escribo para recordarte nuestra sesión del ${sessionDate} a las ${editedSession.startTime}h. Aquí tienes el enlace para conectarte: ${editedSession.meetLink} ¡Hasta pronto!`
                      : `¡Hola ${patientName}! 😊 Te escribo para recordarte nuestra sesión del ${sessionDate} a las ${editedSession.startTime}h. ¡Hasta pronto!`;
                    const whatsappUrl = `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(whatsappMessage)}`;

                    const hasRealEmail = hasEmail && !email.includes('@noemail.mainds.local');
                    const reminderDisabledReason = !hasRealEmail
                      ? (hasEmail ? 'El paciente no tiene un email real registrado' : 'El paciente no tiene email registrado')
                      : null;

                    return (
                      <>
                        <div className="flex items-center gap-3">
                        {/* WhatsApp */}
                        <button
                          onClick={() => {
                            if (!hasPhone) return;
                            setWhatsAppModalData({ waUrl: whatsappUrl, sessionId: editedSession!.id, patientName: editedSession!.patientName || patientName });
                            setShowWhatsAppModal(true);
                          }}
                          disabled={!hasPhone}
                          title={hasPhone ? `WhatsApp a ${editedSession.patientName}` : 'El paciente no tiene número registrado'}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors text-sm font-medium ${
                            hasPhone
                              ? 'bg-[#25D366] border-[#25D366] text-white hover:bg-[#1ebe5d] cursor-pointer'
                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                          WhatsApp
                        </button>
                        {/* Email */}
                        <button
                          onClick={async () => {
                            if (!hasRealEmail || isSendingReminderEmail) return;
                            setIsSendingReminderEmail(true);
                            try {
                              const res = await apiFetch(`${API_URL}/sessions/${editedSession!.id}/send-reminder`, {
                                method: 'POST'
                              });
                              if (res.ok) {
                                alert(`Recordatorio enviado a ${email}`);
                              } else {
                                const err = await res.json().catch(() => ({}));
                                alert(`Error al enviar: ${err.error || res.statusText}`);
                              }
                            } catch {
                              alert('No se pudo enviar el email. Comprueba la conexión.');
                            } finally {
                              setIsSendingReminderEmail(false);
                            }
                          }}
                          disabled={!hasRealEmail || isSendingReminderEmail}
                          title={hasRealEmail ? `Enviar recordatorio a ${email}` : (hasEmail ? 'El paciente no tiene un email real' : 'El paciente no tiene email registrado')}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors text-sm font-medium ${
                            hasRealEmail && !isSendingReminderEmail
                              ? 'bg-blue-500 border-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                              : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <Mail size={16} />
                          {isSendingReminderEmail ? 'Enviando…' : 'Email'}
                        </button>
                        </div>

                        {/* Reminder toggles */}
                        <label className={`flex items-center gap-3 px-4 py-3 border rounded-lg transition-colors ${
                          hasRealEmail
                            ? 'bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100'
                            : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                        }`}>
                          <input
                            type="checkbox"
                            checked={hasRealEmail ? (editedSession.reminder_enabled ?? false) : false}
                            onChange={(e) => handleFieldChange('reminder_enabled', e.target.checked)}
                            disabled={!hasRealEmail}
                            className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
                          />
                          <div>
                            <div className={`font-semibold text-sm ${hasRealEmail ? 'text-blue-700' : 'text-slate-500'}`}>Recordatorio automático por email</div>
                            <div className={`text-xs ${hasRealEmail ? 'text-blue-600' : 'text-slate-400'}`}>
                              {reminderDisabledReason ?? 'Se enviará el recordatorio el día anterior y el día de la sesión'}
                            </div>
                          </div>
                        </label>
                        {(() => {
                          const patientRecord = patients.find(p => p.id === (editedSession.patient_user_id || editedSession.patientId));
                          const rawPhone = (patientRecord?.phone || editedSession.patientPhone || '').replace(/\s/g, '');
                          const hasPhone = rawPhone.length > 0;
                          return (
                            <label className={`flex items-center gap-3 px-4 py-3 border rounded-lg transition-colors ${
                              hasPhone
                                ? 'bg-green-50 border-green-200 cursor-pointer hover:bg-green-100'
                                : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                            }`}>
                              <input
                                type="checkbox"
                                checked={hasPhone ? ((editedSession as any).whatsapp_reminder_enabled ?? false) : false}
                                onChange={(e) => handleFieldChange('whatsapp_reminder_enabled' as any, e.target.checked)}
                                disabled={!hasPhone}
                                className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed"
                              />
                              <div>
                                <div className={`font-semibold text-sm ${hasPhone ? 'text-green-700' : 'text-slate-500'}`}>Recordatorio automático por WhatsApp</div>
                                <div className={`text-xs ${hasPhone ? 'text-green-600' : 'text-slate-400'}`}>
                                  {hasPhone ? 'Se enviará el recordatorio el día anterior y el día de la sesión' : 'El paciente no tiene teléfono registrado'}
                                </div>
                              </div>
                            </label>
                          );
                        })()}
                      </>
                    );
                  })()}
                </div>
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
            <div className="flex-shrink-0 bg-slate-50 border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-2 sm:gap-3">
              <button
                onClick={handleDeleteSession}
                disabled={isSaving}
                className="px-4 py-3 bg-red-600 text-white hover:bg-red-700 active:bg-red-800 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base touch-manipulation"
              >
                <Trash2 size={16} />
                <span className="hidden xs:inline">Eliminar</span>
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleCloseModal}
                  disabled={isSaving}
                  className="px-4 py-3 text-slate-700 hover:bg-slate-200 active:bg-slate-300 rounded-xl font-medium transition-colors disabled:opacity-50 text-sm sm:text-base touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSession}
                  disabled={isSaving}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 active:bg-purple-800 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm sm:text-base touch-manipulation"
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

      {/* New Session Modal */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={() => setShowNewSession(false)}>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-white p-3 sm:p-6 border-b border-slate-200 rounded-t-xl sm:rounded-t-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Nueva Sesión</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Programa una sesión con un paciente</p>
            </div>
            
            <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
              <div className="relative patient-search-dropdown">
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Paciente *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearchQuery || patients.find(p => p.id === newSession.patientId)?.name || ''}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value);
                      setShowPatientDropdown(true);
                      if (!e.target.value) {
                        setNewSession({ ...newSession, patientId: '' });
                      }
                    }}
                    onFocus={() => setShowPatientDropdown(true)}
                    placeholder="Buscar paciente por nombre..."
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                  />
                  {showPatientDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {patients
                        .filter(patient => {
                          // Solo mostrar pacientes con relación activa
                          const hasActiveRelationship = careRelationships.some(
                            rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                   (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                   rel.active !== false
                          );
                          // Filtrar por nombre solamente
                          const matchesSearch = includesNormalized(patient.name, patientSearchQuery);
                          return hasActiveRelationship && matchesSearch;
                        })
                        .map(patient => (
                          <div
                            key={patient.id}
                            onClick={() => {
                              const patientId = patient.id;
                              const relationship = careRelationships.find(
                                rel => (rel.patient_user_id || rel.patientId) === patientId && 
                                       (rel.psychologist_user_id || rel.psychologistId) === psychologistId
                              );
                              const defaultPrice = relationship?.default_session_price || 0;
                              const defaultPercent = relationship?.default_psych_percent || 100;
                              
                              setNewSession({ 
                                ...newSession, 
                                patientId,
                                price: defaultPrice,
                                percent_psych: defaultPercent,
                                bonus_id: undefined
                              });
                              setPatientSearchQuery(patient.name);
                              setShowPatientDropdown(false);
                              
                              // Cargar bonos disponibles del paciente
                              loadNewSessionBonos(patientId);
                            }}
                            className="px-3 sm:px-4 py-2 hover:bg-slate-100 cursor-pointer"
                          >
                            <div className="font-medium text-slate-900 text-xs sm:text-sm">{patient.name}</div>
                            {patient.email && !isTempEmail(patient.email) && (
                              <div className="text-xs text-slate-500">{patient.email}</div>
                            )}
                          </div>
                        ))}
                      {patients.filter(patient => {
                        const hasActiveRelationship = careRelationships.some(
                          rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                 (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                 rel.active !== false
                        );
                        const matchesSearch = patient.name.toLowerCase().includes(patientSearchQuery.toLowerCase());
                        return hasActiveRelationship && matchesSearch;
                      }).length === 0 && (
                        <div className="px-3 sm:px-4 py-2 text-slate-500 text-xs sm:text-sm">No se encontraron pacientes con relación activa</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Fecha *</label>
                <input
                  type="date"
                  value={newSession.date}
                  onChange={(e) => setNewSession({ ...newSession, date: e.target.value })}
                  className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                  placeholder="dd/mm/yyyy"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Hora Inicio *</label>
                  <input
                    type="time"
                    value={newSession.startTime}
                    onChange={(e) => setNewSession({ ...newSession, startTime: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                    step="900"
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="HH:MM"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Hora Fin *</label>
                  <input
                    type="time"
                    value={newSession.endTime}
                    onChange={(e) => setNewSession({ ...newSession, endTime: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                    step="900"
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              {/* Recurrence section */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 sm:p-4 space-y-3">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">🔁 Repetir</label>
                  <div className="flex flex-wrap gap-1.5">
                    {([
                      { value: 'none', label: 'Sin repetición' },
                      { value: 'daily', label: 'Diariamente' },
                      { value: 'weekly', label: 'Semanalmente' },
                      { value: 'custom_weekly', label: 'Cada X semanas' },
                      { value: 'monthly', label: 'Mensualmente' }
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewSession({ ...newSession, recurrence: opt.value, recurrenceEndDate: '' })}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation ${
                          newSession.recurrence === opt.value
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {newSession.recurrence === 'custom_weekly' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">
                      Repetir cada
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={52}
                        value={newSession.recurrenceWeeks}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setNewSession({ ...newSession, recurrenceWeeks: Number.isFinite(v) && v > 0 ? v : 1 });
                        }}
                        className="w-20 px-2 sm:px-3 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation bg-white"
                      />
                      <span className="text-xs sm:text-sm text-slate-700">
                        {newSession.recurrenceWeeks === 1 ? 'semana' : 'semanas'}
                      </span>
                    </div>
                  </div>
                )}

                {newSession.recurrence !== 'none' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">
                      Repetir hasta *
                    </label>
                    <input
                      type="date"
                      value={newSession.recurrenceEndDate}
                      min={newSession.date || undefined}
                      onChange={(e) => setNewSession({ ...newSession, recurrenceEndDate: e.target.value })}
                      className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation bg-white"
                      placeholder="dd/mm/yyyy"
                    />
                    {newSession.date && newSession.recurrenceEndDate && newSession.recurrenceEndDate >= newSession.date && (() => {
                      // Calculate number of sessions for preview
                      let count = 1;
                      let current = parseLocalDate(newSession.date);
                      const endDate = parseLocalDate(newSession.recurrenceEndDate);
                      while (true) {
                        if (newSession.recurrence === 'daily') current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
                        else if (newSession.recurrence === 'weekly') current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
                        else if (newSession.recurrence === 'custom_weekly') {
                          const weeks = Math.max(1, Number(newSession.recurrenceWeeks) || 2);
                          current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7 * weeks);
                        }
                        else if (newSession.recurrence === 'monthly') current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate());
                        if (current > endDate) break;
                        count++;
                      }
                      return (
                        <p className="text-xs text-indigo-600 mt-1.5 font-medium">
                          Se crearán {count} sesión{count !== 1 ? 'es' : ''} en total
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Tipo de sesión *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSession({ ...newSession, type: 'online' })}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-lg font-medium text-xs sm:text-sm transition-all touch-manipulation ${
                      newSession.type === 'online'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    <Video size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                    <span>Online</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSession({ ...newSession, type: 'in-person' })}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-lg font-medium text-xs sm:text-sm transition-all touch-manipulation ${
                      newSession.type === 'in-person'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                    }`}
                  >
                    <MapPin size={14} className="sm:w-4 sm:h-4 flex-shrink-0" />
                    <span>Presencial</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2 sm:space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Precio/hora (€) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newSession.price === 0 ? '' : newSession.price}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Permitir vacío, números y decimales
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setNewSession({ ...newSession, price: value === '' ? 0 : parseFloat(value) || 0 });
                        }
                      }}
                      className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                      placeholder="0.00"
                    />
                    {newSession.startTime && newSession.endTime && (
                      <p className="text-[10px] sm:text-xs text-slate-500 mt-1">
                        Total: {getSessionTotalPrice(newSession as any).toFixed(2)}€
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">% Psicólogo *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={newSession.percent_psych === 0 ? '' : newSession.percent_psych}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          const numValue = value === '' ? 0 : parseFloat(value) || 0;
                          setNewSession({ ...newSession, percent_psych: Math.min(numValue, 100) });
                        }
                      }}
                      className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                {/* Bonos disponibles */}
                {newSession.patientId && newSessionBonos.length > 0 && (
                  <div className="col-span-2">
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">Asignar a bono</label>
                    <div className="space-y-2">
                      {/* Opción: Sin bono */}
                      <div
                        onClick={() => {
                          setNewSession({ ...newSession, bonus_id: undefined, paid: false });
                        }}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          !newSession.bonus_id
                            ? 'border-purple-600 bg-purple-50'
                            : 'border-slate-200 bg-white hover:border-purple-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            !newSession.bonus_id ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                          }`}>
                            {!newSession.bonus_id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <span className="text-sm font-medium text-slate-900">Sin bono (pago individual)</span>
                        </div>
                      </div>
                      
                      {/* Lista de bonos */}
                      {newSessionBonos.map(bono => {
                        const pricePerSession = bono.total_price / bono.total_sessions;
                        return (
                          <div
                            key={bono.id}
                            onClick={() => {
                              setNewSession({ 
                                ...newSession, 
                                bonus_id: bono.id,
                                price: pricePerSession,
                                paid: bono.paid
                              });
                            }}
                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              newSession.bonus_id === bono.id
                                ? 'border-purple-600 bg-purple-50'
                                : 'border-slate-200 bg-white hover:border-purple-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                                newSession.bonus_id === bono.id ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                              }`}>
                                {newSession.bonus_id === bono.id && <div className="w-2 h-2 bg-white rounded-full"></div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-semibold text-purple-900">
                                    {bono.total_sessions} sesiones
                                  </span>
                                  {bono.paid && (
                                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                                      PAGADO
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-purple-700 mt-1">
                                  {pricePerSession.toFixed(2)}€/sesión · {bono.total_sessions - bono.used_sessions} restantes
                                </div>
                                <div className="text-xs text-purple-600">
                                  Comprado: {new Date(bono.purchase_date).toLocaleDateString('es-ES')}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                    <input
                      type="checkbox"
                      checked={newSession.paid}
                      onChange={(e) => setNewSession({ ...newSession, paid: e.target.checked })}
                      disabled={!!newSession.bonus_id}
                      className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs sm:text-sm font-medium text-slate-700">
                      {newSession.bonus_id ? 'Estado heredado del bono' : 'Marcar como pagada'}
                    </span>
                  </label>
                </div>

                {/* Reminder toggle for new session */}
                {(() => {
                  const selectedPatient = patients.find(p => p.id === newSession.patientId);
                  const email = (selectedPatient?.email || '').trim();
                  const hasRealEmail = email.length > 0 && !email.includes('@noemail.mainds.local');
                  return (
                    <div className="flex items-center col-span-2">
                      <div className="flex flex-col gap-2 w-full">
                        <label className={`flex items-center gap-2 touch-manipulation ${hasRealEmail ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                          <input
                            type="checkbox"
                            checked={hasRealEmail ? (newSession.reminder_enabled ?? false) : false}
                            onChange={(e) => setNewSession({ ...newSession, reminder_enabled: e.target.checked })}
                            disabled={!hasRealEmail}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                          />
                          <span className="text-xs sm:text-sm font-medium text-slate-700">
                            {hasRealEmail
                              ? 'Enviar recordatorio por email al paciente'
                              : (email.length > 0 ? 'Recordatorio no disponible (email no válido)' : 'Recordatorio no disponible (paciente sin email)')}
                          </span>
                        </label>
                        {(() => {
                          const selPat = patients.find(p => p.id === newSession.patientId);
                          const phone = (selPat?.phone || '').replace(/\s/g, '');
                          const hasPhone = phone.length > 0;
                          return (
                            <label className={`flex items-center gap-2 touch-manipulation ${hasPhone ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                              <input
                                type="checkbox"
                                checked={hasPhone ? (newSession.whatsapp_reminder_enabled ?? false) : false}
                                onChange={(e) => setNewSession({ ...newSession, whatsapp_reminder_enabled: e.target.checked })}
                                disabled={!hasPhone}
                                className="w-4 h-4 rounded border-green-300 text-green-600 focus:ring-green-500 disabled:cursor-not-allowed"
                              />
                              <span className="text-xs sm:text-sm font-medium text-slate-700">
                                {hasPhone
                                  ? 'Enviar recordatorio por WhatsApp al paciente'
                                  : 'Recordatorio WhatsApp no disponible (paciente sin teléfono)'}
                              </span>
                            </label>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}
                
                {/* Método de pago */}
                {newSession.paid && !newSession.bonus_id && (
                  <div className="col-span-2">
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">Método de pago</label>
                    <select
                      value={newSession.paymentMethod || ''}
                      onChange={(e) => setNewSession({ ...newSession, paymentMethod: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                      <option value="">-- Seleccionar --</option>
                      <option value="Bizum">Bizum</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Efectivo">Efectivo</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Earnings Preview */}
              {newSession.price > 0 && newSession.percent_psych > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
                  <div className="text-xs sm:text-sm font-semibold text-green-700 mb-1">Tu ganancia estimada</div>
                  <div className="text-xl sm:text-2xl font-bold text-green-900">
                    {(getSessionTotalPrice(newSession as any) * newSession.percent_psych / 100).toFixed(2)} €
                  </div>
                  <div className="text-[10px] sm:text-xs text-green-600 mt-1">
                    {newSession.percent_psych.toFixed(0)}% de {getSessionTotalPrice(newSession as any).toFixed(2)}€ ({newSession.price.toFixed(2)}€/h × {getSessionDurationHours(newSession as any).toFixed(2)}h)
                  </div>
                </div>
              )}

              {newSession.type === 'online' && (
                <div className="space-y-2.5">
                  {!googleCalendarConnected && (
                    <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-amber-800">
                          No tienes Google Calendar conectado
                        </p>
                        <p className="text-[10px] sm:text-xs text-amber-700 mt-0.5">
                          No se generará automáticamente el enlace de la videollamada.{' '}
                          {onOpenSettings ? (
                            <button
                              type="button"
                              onClick={() => { setShowNewSession(false); resetNewSession(); onOpenSettings(); }}
                              className="font-semibold underline hover:text-amber-900 transition-colors"
                            >
                              Haz click aquí para activar Google Calendar
                            </button>
                          ) : (
                            <span className="font-semibold">Actívalo en Ajustes.</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5">
                      <Video size={14} className="inline-block mr-1 flex-shrink-0" />
                      Enlace de videollamada (opcional)
                    </label>
                    <input
                      type="url"
                      value={newSession.manualMeetLink}
                      onChange={(e) => setNewSession({ ...newSession, manualMeetLink: e.target.value })}
                      placeholder={googleCalendarConnected ? 'Se generará automáticamente, o pega uno manual' : 'Pega aquí un enlace de Meet, Zoom, etc.'}
                      className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Notas</label>
                <textarea
                  value={newSession.notes}
                  onChange={(e) => setNewSession({ ...newSession, notes: e.target.value })}
                  rows={3}
                  className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                  placeholder="Notas adicionales sobre la sesión..."
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white p-3 sm:p-6 border-t border-slate-200 flex gap-2 sm:gap-3 rounded-b-xl sm:rounded-b-2xl">
              <button
                onClick={() => {
                  setShowNewSession(false);
                  resetNewSession();
                }}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium touch-manipulation"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateSession}
                disabled={isCreatingSession}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md touch-manipulation disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isCreatingSession ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creando...
                  </>
                ) : 'Crear Sesión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Availability Modal */}
      {showNewAvailability && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={() => setShowNewAvailability(false)}>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-white p-3 sm:p-6 border-b border-slate-200 rounded-t-xl sm:rounded-t-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Añadir Disponibilidad</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Crea espacios libres para que tus pacientes reserven</p>
            </div>
            
            <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Fecha Inicio *</label>
                  <input
                    type="date"
                    value={newAvailability.startDate}
                    onChange={(e) => setNewAvailability({ ...newAvailability, startDate: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-manipulation"
                    placeholder="dd/mm/yyyy"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Fecha Fin *</label>
                  <input
                    type="date"
                    value={newAvailability.endDate}
                    onChange={(e) => setNewAvailability({ ...newAvailability, endDate: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-manipulation"
                    placeholder="dd/mm/yyyy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Días de la semana *</label>
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {[
                    { value: 1, label: 'L', fullLabel: 'Lun' },
                    { value: 2, label: 'M', fullLabel: 'Mar' },
                    { value: 3, label: 'X', fullLabel: 'Mié' },
                    { value: 4, label: 'J', fullLabel: 'Jue' },
                    { value: 5, label: 'V', fullLabel: 'Vie' },
                    { value: 6, label: 'S', fullLabel: 'Sáb' },
                    { value: 0, label: 'D', fullLabel: 'Dom' }
                  ].map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDayOfWeek(day.value)}
                      className={`w-full aspect-square flex items-center justify-center rounded-lg font-bold text-xs sm:text-sm transition-all touch-manipulation ${
                        newAvailability.daysOfWeek.includes(day.value)
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={day.fullLabel}
                    >
                      <span className="sm:hidden">{day.label}</span>
                      <span className="hidden sm:inline">{day.fullLabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Desde *</label>
                  <input
                    type="time"
                    value={newAvailability.startTime}
                    onChange={(e) => setNewAvailability({ ...newAvailability, startTime: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-manipulation"
                    step="900"
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="HH:MM"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Hasta *</label>
                  <input
                    type="time"
                    value={newAvailability.endTime}
                    onChange={(e) => setNewAvailability({ ...newAvailability, endTime: e.target.value })}
                    className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-manipulation"
                    step="900"
                    pattern="[0-9]{2}:[0-9]{2}"
                    placeholder="HH:MM"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Duración de cada sesión *</label>
                <select
                  value={newAvailability.duration}
                  onChange={(e) => setNewAvailability({ ...newAvailability, duration: parseInt(e.target.value) })}
                  className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent touch-manipulation"
                >
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos</option>
                  <option value="90">90 minutos</option>
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Tipo de sesión *</label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setNewAvailability({ ...newAvailability, type: 'online' })}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg font-medium text-[10px] sm:text-sm transition-all touch-manipulation ${
                      newAvailability.type === 'online'
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Video size={14} className="sm:w-4 sm:h-4" />
                    <span>Online</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAvailability({ ...newAvailability, type: 'in-person' })}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg font-medium text-[10px] sm:text-sm transition-all touch-manipulation ${
                      newAvailability.type === 'in-person'
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <MapPin size={14} className="sm:w-4 sm:h-4" />
                    <span>Consulta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAvailability({ ...newAvailability, type: 'home-visit' })}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg font-medium text-[10px] sm:text-sm transition-all touch-manipulation ${
                      newAvailability.type === 'home-visit'
                        ? 'bg-green-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <MapPin size={14} className="sm:w-4 sm:h-4" />
                    <span>Domicilio</span>
                  </button>
                </div>
              </div>

              <div className="p-2.5 sm:p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-[10px] sm:text-xs text-purple-700 font-medium">
                  Se crearán múltiples espacios de {newAvailability.duration} minutos en los días seleccionados entre las fechas y horas indicadas
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white p-3 sm:p-6 border-t border-slate-200 flex gap-2 sm:gap-3 rounded-b-xl sm:rounded-b-2xl">
              <button
                onClick={() => {
                  setShowNewAvailability(false);
                  resetNewAvailability();
                }}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium touch-manipulation"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateAvailability}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium shadow-md touch-manipulation"
              >
                Crear Disponibilidad
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Patient to Available Slot Modal */}
      {showAssignPatient && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowAssignPatient(false); setSelectedSlot(null); setSelectedPatientId(''); setMeetLink(''); setAssignPatientSearchQuery(''); setShowAssignPatientDropdown(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Asignar Paciente</h3>
                <button
                  onClick={() => {
                    setShowAssignPatient(false);
                    setSelectedSlot(null);
                    setSelectedPatientId('');
                    setMeetLink('');
                    setAssignPatientSearchQuery('');
                    setShowAssignPatientDropdown(false);
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
                  {parseLocalDate(selectedSlot.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {selectedSlot.startTime} - {selectedSlot.endTime}
                </div>
              </div>

              <div className="relative patient-search-dropdown">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Seleccionar Paciente *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={assignPatientSearchQuery || patients.find(p => p.id === selectedPatientId)?.name || ''}
                    onChange={(e) => {
                      setAssignPatientSearchQuery(e.target.value);
                      setShowAssignPatientDropdown(true);
                      if (!e.target.value) {
                        setSelectedPatientId('');
                      }
                    }}
                    onFocus={() => setShowAssignPatientDropdown(true)}
                    placeholder="Buscar paciente por nombre..."
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  {showAssignPatientDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {patients
                        .filter(patient => {
                          // Solo mostrar pacientes con relación activa
                          const hasActiveRelationship = careRelationships.some(
                            rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                   (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                   rel.active !== false
                          );
                          // Filtrar por nombre solamente
                          const matchesSearch = includesNormalized(patient.name, assignPatientSearchQuery);
                          return hasActiveRelationship && matchesSearch;
                        })
                        .map(patient => (
                          <div
                            key={patient.id}
                            onClick={() => {
                              setSelectedPatientId(patient.id);
                              setAssignPatientSearchQuery(patient.name);
                              setShowAssignPatientDropdown(false);
                            }}
                            className="px-4 py-2 hover:bg-slate-100 cursor-pointer"
                          >
                            <div className="font-medium text-slate-900">{patient.name}</div>
                            {patient.email && !isTempEmail(patient.email) && (
                              <div className="text-sm text-slate-500">{patient.email}</div>
                            )}
                          </div>
                        ))}
                      {patients.filter(patient => {
                        const hasActiveRelationship = careRelationships.some(
                          rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                 (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                 rel.active !== false
                        );
                        const matchesSearch = patient.name.toLowerCase().includes(assignPatientSearchQuery.toLowerCase());
                        return hasActiveRelationship && matchesSearch;
                      }).length === 0 && (
                        <div className="px-4 py-2 text-slate-500 text-sm">No se encontraron pacientes con relación activa</div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {patients.filter(patient => 
                    careRelationships.some(
                      rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                             (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                             rel.active !== false
                    )
                  ).length === 0 
                    ? 'No tienes pacientes con relación activa' 
                    : `${patients.filter(patient => 
                        careRelationships.some(
                          rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                 (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                 rel.active !== false
                        )
                      ).length} paciente${patients.filter(patient => 
                        careRelationships.some(
                          rel => (rel.patient_user_id || rel.patientId) === patient.id && 
                                 (rel.psychologist_user_id || rel.psychologistId) === psychologistId &&
                                 rel.active !== false
                        )
                      ).length !== 1 ? 's' : ''} con relación activa`
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  <Video className="inline-block mr-1" size={16} />
                  Link de videollamada (Opcional)
                </label>
                <input
                  type="text"
                  value={meetLink}
                  onChange={(e) => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {googleCalendarConnected
                    ? 'Google Calendar creará el enlace de Meet automáticamente'
                    : 'Pega aquí un enlace de Meet, Zoom, etc. Conecta Google Calendar en Ajustes para generarlo automáticamente'
                  }
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
                  setAssignPatientSearchQuery('');
                  setShowAssignPatientDropdown(false);
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

      {/* WhatsApp send modal */}
      {showWhatsAppModal && whatsAppModalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4" onClick={() => setShowWhatsAppModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Enviar WhatsApp a {whatsAppModalData.patientName}</h3>
            <p className="text-sm text-slate-500 mb-5">¿Cómo quieres enviar el mensaje?</p>

            <div className="space-y-3">
              {/* Opción 1: WhatsApp personal */}
              <button
                onClick={() => {
                  window.open(whatsAppModalData.waUrl, '_blank');
                  setShowWhatsAppModal(false);
                }}
                className="w-full flex items-center gap-4 px-4 py-4 border-2 border-[#25D366] rounded-xl hover:bg-green-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Desde mi WhatsApp</div>
                  <div className="text-xs text-slate-500">Abre WhatsApp con un mensaje ya escrito</div>
                </div>
              </button>

              {/* Opción 2: Plantilla Twilio */}
              <button
                disabled={isSendingWhatsApp}
                onClick={async () => {
                  setIsSendingWhatsApp(true);
                  try {
                    const res = await apiFetch(`${API_URL}/sessions/${whatsAppModalData.sessionId}/send-whatsapp`, { method: 'POST' });
                    if (res.ok) {
                      setShowWhatsAppModal(false);
                      alert(`WhatsApp enviado a ${whatsAppModalData.patientName}`);
                    } else {
                      const err = await res.json().catch(() => ({}));
                      alert(`Error al enviar: ${err.error || res.statusText}`);
                    }
                  } catch {
                    alert('No se pudo enviar el WhatsApp. Comprueba la conexión.');
                  } finally {
                    setIsSendingWhatsApp(false);
                  }
                }}
                className="w-full flex items-center gap-4 px-4 py-4 border-2 border-purple-400 rounded-xl hover:bg-purple-50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{isSendingWhatsApp ? 'Enviando…' : 'Enviar Recordatorio'}</div>
                  <div className="text-xs text-slate-500">Envía la plantilla aprobada a través de mainds</div>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowWhatsAppModal(false)}
              className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Session Notes Modal (from schedule edit modal) */}
      {scheduleSessionDetailsOpen && selectedSession && (
        <SessionDetailsModal
          session={selectedSession}
          onClose={() => setScheduleSessionDetailsOpen(false)}
          onSave={async () => {
            setScheduleSessionDetailsOpen(false);
            await loadSessions();
            // Refresh selectedSession and editedSession with updated data
            try {
              const res = await apiFetch(`${API_URL}/sessions/${selectedSession.id}`);
              if (res.ok) {
                const freshSession = await res.json();
                setSelectedSession(freshSession);
                setEditedSession(freshSession);
                if (freshSession.session_entry_id) {
                  const eRes = await apiFetch(`${API_URL}/session-entries/${freshSession.session_entry_id}`);
                  if (eRes.ok) {
                    const entry = await eRes.json();
                    setScheduleEntryStatus(entry.data?.status || entry.status || 'pending');
                  }
                } else {
                  setScheduleEntryStatus('none');
                }
              }
            } catch (error) {
              console.error('Error refreshing session after notes save:', error);
            }
          }}
        />
      )}
    </div>
  );
};

export default PsychologistSchedule;
