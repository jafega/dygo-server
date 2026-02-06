import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, X, Users, Video, MapPin, ChevronLeft, ChevronRight, MessageCircle, Trash2, Save, Copy, Send, ExternalLink } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';

interface Session {
  id: string;
  patientId: string;
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
  tags?: string[]; // Tags heredadas de la relación
}

interface PsychologistScheduleProps {
  psychologistId: string;
}

type SessionStatusFilter = Session['status'] | 'ALL';

const PsychologistSchedule: React.FC<PsychologistScheduleProps> = ({ psychologistId }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [careRelationships, setCareRelationships] = useState<any[]>([]);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showNewAvailability, setShowNewAvailability] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [editedSession, setEditedSession] = useState<Session | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAssignPatient, setShowAssignPatient] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Session | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>(['scheduled', 'completed']);
  const [paymentFilter, setPaymentFilter] = useState<string>('all'); // 'all', 'paid', 'unpaid'
  const [resizingSession, setResizingSession] = useState<{ id: string, edge: 'top' | 'bottom', date: string } | null>(null);
  const [tempSessionTimes, setTempSessionTimes] = useState<{ startTime: string, endTime: string } | null>(null);
  const [creatingSession, setCreatingSession] = useState<{ date: string, startY: number, currentY: number } | null>(null);
  const [draggingSession, setDraggingSession] = useState<{ id: string, startY: number, originalDate: string, originalStartTime: string, originalEndTime: string } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ date: string, startTime: string, endTime: string } | null>(null);
  
  const [newSession, setNewSession] = useState({
    patientId: '',
    date: '',
    startTime: '',
    endTime: '',
    type: 'online' as 'in-person' | 'online' | 'home-visit',
    notes: '',
    generateMeetLink: false,
    price: 0,
    paid: false,
    percent_psych: 100
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
  }, [psychologistId]);
  
  // Recargar sesiones cuando cambia el rango de fechas
  useEffect(() => {
    if (psychologistId) {
      loadSessions();
    }
  }, [currentDate]);

  // Handle resize mouse events
  useEffect(() => {
    if (!resizingSession) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scrollableContainer = document.querySelector('.h-\\[600px\\].overflow-y-auto');
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
      
      let newStartTime = currentSession.startTime;
      let newEndTime = currentSession.endTime;
      
      if (resizingSession.edge === 'top') {
        // Al mover el borde superior, el endTime se mantiene fijo
        newStartTime = newTime;
        newEndTime = currentSession.endTime;
      } else {
        // Al mover el borde inferior, el startTime se mantiene fijo
        newStartTime = currentSession.startTime;
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
      const scrollableContainer = document.querySelector('.h-\\[600px\\].overflow-y-auto');
      if (!scrollableContainer) return;

      const containerRect = scrollableContainer.getBoundingClientRect();
      const scrollTop = scrollableContainer.scrollTop;
      const y = e.clientY - containerRect.top + scrollTop;
      
      setCreatingSession(prev => prev ? { ...prev, currentY: y } : null);
    };

    const handleMouseUp = () => {
      if (creatingSession) {
        const startY = Math.min(creatingSession.startY, creatingSession.currentY);
        const endY = Math.max(creatingSession.startY, creatingSession.currentY);
        
        // Convert Y positions to times (48px per hour)
        const startMinutes = Math.floor((startY / 48) * 60);
        const endMinutes = Math.floor((endY / 48) * 60);
        
        const startHours = Math.floor(startMinutes / 60);
        const startMins = Math.floor((startMinutes % 60) / 15) * 15;
        const endHours = Math.floor(endMinutes / 60);
        const endMins = Math.floor((endMinutes % 60) / 15) * 15;
        
        const startTime = `${startHours.toString().padStart(2, '0')}:${startMins.toString().padStart(2, '0')}`;
        let endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
        
        // Ensure minimum 15 minutes duration
        if (endMinutes - startMinutes < 15) {
          const minEndMinutes = startMinutes + 15;
          const minEndHours = Math.floor(minEndMinutes / 60);
          const minEndMins = minEndMinutes % 60;
          endTime = `${minEndHours.toString().padStart(2, '0')}:${minEndMins.toString().padStart(2, '0')}`;
        }
        
        // Open modal with pre-filled times
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

      if (!targetElement) return;

      const scrollableContainer = document.querySelector('.h-\\[600px\\].overflow-y-auto');
      if (!scrollableContainer) return;

      const containerRect = scrollableContainer.getBoundingClientRect();
      const scrollTop = scrollableContainer.scrollTop;
      const y = e.clientY - containerRect.top + scrollTop;

      // Convert Y to time (48px per hour)
      const totalMinutes = Math.floor((y / 48) * 60);
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
        setSessions(prevSessions => 
          prevSessions.map(s => 
            s.id === sessionId
              ? { ...s, date: newDate, startTime: newStartTime, endTime: newEndTime }
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

          const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'x-user-id': currentUser.id
            },
            body: JSON.stringify({
              date: newDate,
              startTime: newStartTime,
              endTime: newEndTime
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
      
      const response = await fetch(`${API_URL}/sessions?${params.toString()}`);
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

  const loadCareRelationships = async () => {
    try {
      const response = await fetch(`${API_URL}/relationships?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCareRelationships(data);
      }
    } catch (error) {
      console.error('Error loading care relationships:', error);
    }
  };

  const getSessionsForDate = (date: string) => {
    const dateSessions = sessions.filter(s => s.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
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
    if (!newSession.patientId || !newSession.date || !newSession.startTime || !newSession.endTime || newSession.price <= 0) {
      alert('Por favor completa todos los campos requeridos (incluido el precio)');
      return;
    }

    const patient = patients.find(p => p.id === newSession.patientId);
    if (!patient) return;

    // Obtener el usuario actual para enviar el header de autenticación
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      alert('Error: Usuario no autenticado');
      return;
    }

    // Generate Google Meet link if requested
    let meetLink = '';
    if (newSession.generateMeetLink && newSession.type === 'online') {
      meetLink = `https://meet.google.com/${Math.random().toString(36).substring(2, 15)}`;
    }

    const session: Session = {
      id: Date.now().toString(),
      patientId: newSession.patientId,
      patientName: patient.name,
      patientPhone: patient.phone || '',
      date: newSession.date,
      startTime: newSession.startTime,
      endTime: newSession.endTime,
      type: newSession.type,
      status: 'scheduled',
      notes: newSession.notes,
      meetLink: meetLink || undefined,
      price: newSession.price,
      paid: newSession.paid,
      percent_psych: Math.min(newSession.percent_psych, 100)
    };

    try {
      const response = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ ...session, psychologistId })
      });

      if (response.ok) {
        await loadSessions();
        setShowNewSession(false);
        resetNewSession();
      } else {
        const error = await response.json();
        alert('Error al crear la sesión: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Error al crear la sesión');
    }
  };

  const handleUpdateSessionTime = async (sessionId: string, newStartTime: string, newEndTime: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Optimistic update: actualizar UI inmediatamente
    setSessions(prevSessions => 
      prevSessions.map(s => 
        s.id === sessionId
          ? { ...s, startTime: newStartTime, endTime: newEndTime }
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

      // Calcular starts_on y ends_on para Supabase
      const date = session.date;
      const starts_on = date && newStartTime ? `${date}T${newStartTime}:00` : undefined;
      const ends_on = date && newEndTime ? `${date}T${newEndTime}:00` : undefined;

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

      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
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

      const response = await fetch(`${API_URL}/sessions/availability`, {
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

  const handleOpenSession = (session: Session) => {
    setSelectedSession(session);
    setEditedSession({ ...session });
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

      // Solo enviar los campos que pueden ser actualizados
      const updatePayload: any = {
        type: editedSession.type,
        status: editedSession.status,
        price: editedSession.price ?? 0,
        paid: editedSession.paid ?? false,
        percent_psych: editedSession.percent_psych ?? 70,
        notes: editedSession.notes,
        meetLink: editedSession.meetLink
      };

      // Solo incluir fecha y hora si fueron modificadas
      if (editedSession.date !== selectedSession.date) {
        updatePayload.date = editedSession.date;
      }
      if (editedSession.startTime !== selectedSession.startTime) {
        updatePayload.startTime = editedSession.startTime;
      }
      if (editedSession.endTime !== selectedSession.endTime) {
        updatePayload.endTime = editedSession.endTime;
      }

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
            const availabilityResponse = await fetch(`${API_URL}/sessions/availability`, {
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
      
      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
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
      const response = await fetch(`${API_URL}/sessions/${sessionId}`, {
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
      price: 0,
      paid: false,
      percent_psych: 100
    });
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

      // Generate Google Meet link if empty
      let finalMeetLink = meetLink.trim();
      if (!finalMeetLink) {
        const randomId = Math.random().toString(36).substring(2, 15);
        finalMeetLink = `https://meet.google.com/${randomId}`;
      }

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
          date: selectedSlot.date,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          type: selectedSlot.type,
          status: 'scheduled',
          meetLink: finalMeetLink,
          percent_psych: 100,
          price: 0,
          paid: false,
          deleteDispoId: selectedSlot.id // Indicar que se debe borrar este ID de dispo
        };

        const response = await fetch(`${API_URL}/sessions`, {
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
        const updateResponse = await fetch(`${API_URL}/sessions/${selectedSlot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'scheduled',
            patientId: patient.id,
            patientName: patient.name,
            patientPhone: patient.phone || '',
            meetLink: finalMeetLink
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

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  // Get week days for week view
  const getWeekDays = () => {
    const dayOfWeek = currentDate.getDay();
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // Filtrar sesiones por estado y pago
  const getFilteredSessionsByStatus = (sessionsToFilter: Session[]) => {
    return sessionsToFilter.filter(session => {
      // Filtro por estado
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(session.status);
      
      // Filtro por pago
      const isPaid = session.paid;
      const matchesPayment = paymentFilter === 'all' || 
        (paymentFilter === 'paid' && isPaid) || 
        (paymentFilter === 'unpaid' && !isPaid);
      
      return matchesStatus && matchesPayment;
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
          onClick={() => setShowNewAvailability(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors shadow-md font-medium"
        >
          <Clock size={18} />
          <span>Añadir Disponibilidad</span>
        </button>
        <button
          onClick={() => setShowNewSession(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-md font-medium"
        >
          <Plus size={18} />
          <span>Nueva Sesión</span>
        </button>
      </div>

      {/* Filtro de estado y pago */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-col gap-4">
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
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
          <button
            onClick={handlePreviousWeek}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900 capitalize">
              Semana del {getWeekDays()[0].getDate()} al {getWeekDays()[6].getDate()} de {currentDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </h3>
          </div>
          <button
            onClick={handleNextWeek}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Week View */}
        <div className="p-4">
          {/* Mobile: Horizontal list */}
          <div className="md:hidden space-y-3">
            {getWeekDays().map(date => {
              const dateStr = formatLocalDate(date);
              const daySessions = getSessionsForDate(dateStr);
              const isToday = new Date().toDateString() === date.toDateString();
              
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
                                  {session.startTime} - {session.endTime}
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
                  const isToday = new Date().toDateString() === date.toDateString();
                  
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
            <div className="h-[600px] overflow-y-auto mt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                    const isToday = new Date().toDateString() === date.toDateString();
                    
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
                            const scrollableContainer = document.querySelector('.h-\\[600px\\].overflow-y-auto');
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
                        {daySessions.map(session => {
                          const startMinutes = timeToMinutes(session.startTime);
                          let endMinutes = timeToMinutes(session.endTime);
                          
                          // Si endTime es menor que startTime, la sesión cruza medianoche
                          // En ese caso, mostrar solo hasta las 24:00 (1440 minutos)
                          if (endMinutes < startMinutes) {
                            endMinutes = 24 * 60; // 24:00 = 1440 minutos
                          }
                          
                          const durationMinutes = endMinutes - startMinutes;
                          
                          // Calculate position and height (48px per hour = 0.8px per minute)
                          const topPx = (startMinutes / 60) * 48;
                          const heightPx = (durationMinutes / 60) * 48;
                          
                          return (
                            <div
                              key={session.id}
                              className={`group absolute left-1 right-1 rounded-md cursor-${session.status === 'scheduled' ? 'move' : 'pointer'} transition-all hover:shadow-lg border hover:z-10 overflow-visible ${
                                draggingSession?.id === session.id ? 'opacity-30' : ''
                              } ${
                                resizingSession?.id === session.id ? 'opacity-40' : ''
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
                                height: `${Math.max(heightPx, 24)}px`
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
                                const scrollableContainer = document.querySelector('.h-\\[600px\\].overflow-y-auto');
                                if (!scrollableContainer) return;

                                const containerRect = scrollableContainer.getBoundingClientRect();
                                const scrollTop = scrollableContainer.scrollTop;
                                const y = e.clientY - containerRect.top + scrollTop;
                                
                                setDraggingSession({
                                  id: session.id,
                                  startY: y,
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
                                    setTempSessionTimes({ startTime: session.startTime, endTime: session.endTime });
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
                                      {session.startTime}
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
                                    </div>
                                  </div>
                                  {session.patientName && (
                                    <div className="text-[9px] text-slate-800 font-semibold line-clamp-2 leading-tight">{session.patientName}</div>
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
                                    setTempSessionTimes({ startTime: session.startTime, endTime: session.endTime });
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
                        })}
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Editar Sesión</h3>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
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
                      <button
                        onClick={() => {
                          const patientName = editedSession.patientName || 'Paciente';
                          const sessionDate = new Date(editedSession.date).toLocaleDateString('es-ES', { 
                            weekday: 'long', 
                            day: 'numeric', 
                            month: 'long' 
                          });
                          const message = `Hola ${patientName}, aquí está el enlace para nuestra sesión del ${sessionDate} a las ${editedSession.startTime}: ${editedSession.meetLink}`;
                          const phone = editedSession.patientPhone?.replace(/[^0-9]/g, '') || '';
                          const whatsappUrl = phone 
                            ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
                            : `https://wa.me/?text=${encodeURIComponent(message)}`;
                          window.open(whatsappUrl, '_blank');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                      >
                        <Send size={16} />
                        Enviar por WhatsApp
                      </button>
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
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
              <button
                onClick={handleDeleteSession}
                disabled={isSaving}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Eliminar
              </button>
              <div className="flex items-center gap-3">
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
        </div>
      )}

      {/* New Session Modal */}
      {showNewSession && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={() => setShowNewSession(false)}>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white p-3 sm:p-6 border-b border-slate-200 rounded-t-xl sm:rounded-t-2xl">
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">Nueva Sesión</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">Programa una sesión con un paciente</p>
            </div>
            
            <div className="p-3 sm:p-6 space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1 sm:mb-2">Paciente *</label>
                <select
                  value={newSession.patientId}
                  onChange={(e) => {
                    const patientId = e.target.value;
                    // Buscar la relación de este paciente para obtener el precio y porcentaje por defecto
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
                      percent_psych: defaultPercent
                    });
                  }}
                  className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                >
                  <option value="">Selecciona un paciente</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>{patient.name}</option>
                  ))}
                </select>
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
                      type="number"
                      value={newSession.price}
                      onChange={(e) => setNewSession({ ...newSession, price: parseFloat(e.target.value) || 0 })}
                      min="0"
                      step="0.01"
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
                      type="number"
                      value={newSession.percent_psych}
                      onChange={(e) => setNewSession({ ...newSession, percent_psych: Math.min(parseFloat(e.target.value) || 0, 100) })}
                      min="0"
                      max="100"
                      step="1"
                      className="w-full px-2 sm:px-4 py-2 sm:py-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
                      placeholder="70"
                    />
                  </div>
                </div>
                
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                    <input
                      type="checkbox"
                      checked={newSession.paid}
                      onChange={(e) => setNewSession({ ...newSession, paid: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-xs sm:text-sm font-medium text-slate-700">Marcar como pagada</span>
                  </label>
                </div>
              </div>

              {/* Earnings Preview */}
              {newSession.price > 0 && newSession.percent_psych > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
                  <div className="text-xs sm:text-sm font-semibold text-green-700 mb-1">Tu ganancia estimada</div>
                  <div className="text-xl sm:text-2xl font-bold text-green-900">
                    {((newSession.price * newSession.percent_psych) / 100).toFixed(2)} €
                  </div>
                  <div className="text-[10px] sm:text-xs text-green-600 mt-1">
                    {newSession.percent_psych.toFixed(0)}% de {newSession.price.toFixed(2)}€
                  </div>
                </div>
              )}

              {newSession.type === 'online' && (
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="generateMeetLink"
                    checked={newSession.generateMeetLink}
                    onChange={(e) => setNewSession({ ...newSession, generateMeetLink: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 touch-manipulation flex-shrink-0"
                  />
                  <label htmlFor="generateMeetLink" className="text-xs sm:text-sm font-medium text-indigo-900 cursor-pointer flex items-center gap-1.5 sm:gap-2 touch-manipulation">
                    <Video size={14} className="flex-shrink-0" />
                    Generar enlace de Google Meet
                  </label>
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
                className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md touch-manipulation"
              >
                Crear Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Availability Modal */}
      {showNewAvailability && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={() => setShowNewAvailability(false)}>
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white p-3 sm:p-6 border-b border-slate-200 rounded-t-xl sm:rounded-t-2xl">
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => { setShowAssignPatient(false); setSelectedSlot(null); setSelectedPatientId(''); setMeetLink(''); }}>
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

export default PsychologistSchedule;
