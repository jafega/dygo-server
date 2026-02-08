import React, { useState, useEffect, useRef } from 'react';
import { ViewState, JournalEntry, Goal, UserSettings, WeeklyReport, User } from './types';
import * as StorageService from './services/storageService';
import * as AuthService from './services/authService';
import { USE_BACKEND, API_URL } from './services/config';
import { analyzeJournalEntry, analyzeGoalsProgress, generateWeeklyReport } from './services/genaiService';
import VoiceSession from './components/VoiceSession';
import PatientSessions from './components/PatientSessions';
import PatientBillingPanel from './components/PatientBillingPanel';
import CalendarView from './components/CalendarView';
import InsightsPanel from './components/InsightsPanel';
import GoalsPanel from './components/GoalsPanel';
import EntryModal from './components/EntryModal';
import WeeklyReportModal from './components/WeeklyReportModal';
import SettingsModal from './components/SettingsModal';
import PatientDashboard, { PatientDashboardHandle } from './components/PatientDashboard';
import AuthScreen from './components/AuthScreen';
import SuperAdmin from './components/SuperAdmin';
import PsychologistSidebar from './components/PsychologistSidebar';
import BillingPanel from './components/BillingPanel';
import PsychologistProfilePanel from './components/PsychologistProfilePanel';
import PatientProfilePanel from './components/PatientProfilePanel';
import PsychologistSchedule from './components/PsychologistSchedule';
import PsychologistDashboard from './components/PsychologistDashboard';
import SessionsList from './components/SessionsList';
import CentrosPanel, { CentrosPanelRef } from './components/CentrosPanel';
import ConnectionsPanel from './components/ConnectionsPanel';
import { Mic, LayoutDashboard, Calendar, Target, BookOpen, User as UserIcon, Users, Stethoscope, ArrowLeftRight, CheckSquare, Loader2, MessageCircle, Menu, X, CalendarIcon, Heart, TrendingUp, FileText, Briefcase, Link2, Plus, Clock, AlertCircle, Smile, Shield, Building2, LogOut } from 'lucide-react';

// Custom Dygo Logo Component
const DygoLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewState, setViewState] = useState<ViewState>(ViewState.AUTH);
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const [pendingRole, setPendingRole] = useState<'PATIENT' | 'PSYCHOLOGIST' | null>(null);
  
  const [psychViewMode, setPsychViewMode] = useState<'DASHBOARD' | 'PERSONAL'>('DASHBOARD');
  const [psychPanelView, setPsychPanelView] = useState<'patients' | 'billing' | 'profile' | 'dashboard' | 'sessions' | 'schedule' | 'centros'>('schedule');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Ref para controlar PatientDashboard
  const patientDashboardRef = useRef<PatientDashboardHandle>(null);
  const centrosPanelRef = useRef<CentrosPanelRef>(null);
  
  // State for draggable menu button position (unified across personal/professional)
  const [menuButtonPos, setMenuButtonPos] = useState(() => {
    const saved = localStorage.getItem('dygoMenuButtonPos');
    if (saved) return JSON.parse(saved);
    // Default position: bottom-left (16px from edges)
    const defaultTop = typeof window !== 'undefined' ? window.innerHeight - 64 : 700;
    return { top: defaultTop, left: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Save menu button position to localStorage
  useEffect(() => {
    localStorage.setItem('dygoMenuButtonPos', JSON.stringify(menuButtonPos));
  }, [menuButtonPos]);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ 
    notificationsEnabled: false, 
    feedbackNotificationsEnabled: true,
    notificationTime: '20:00',
    language: 'es-ES',
    voice: 'Kore' 
  });
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedEntryMode, setSelectedEntryMode] = useState<'day' | 'single'>('day');
  const [sessionDate, setSessionDate] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'sessions' | 'appointments' | 'calendar' | 'billing' | 'profile' | 'admin'>('calendar');
  const [showSettings, setShowSettings] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
  const [error, setError] = useState('');

  const getFeedbackText = (entry: JournalEntry) => {
    // Nuevo formato: entryType: 'feedback' con content
    if (entry.entryType === 'feedback' && entry.content) {
      return entry.content;
    }
    // Formato antiguo
    if (typeof entry.psychologistFeedback === 'string') return entry.psychologistFeedback;
    if (entry.psychologistFeedback?.text) return entry.psychologistFeedback.text;
    if (entry.psychologistEntryType === 'FEEDBACK') {
      const summaryText = (entry.summary || '').trim();
      if (summaryText) return summaryText;
    }
    return '';
  };

  const isFeedbackUnread = (entry: JournalEntry) => {
    if (!entry.psychologistFeedbackUpdatedAt) return false;
    const readAt = entry.psychologistFeedbackReadAt || 0;
    return readAt < entry.psychologistFeedbackUpdatedAt;
  };

  const hasFeedbackContent = (entry: JournalEntry) => {
    const textHas = getFeedbackText(entry).trim().length > 0;
    // Nuevo formato: entryType: 'feedback' con attachments
    const newFormatAttHas = entry.entryType === 'feedback' && entry.attachments && Array.isArray(entry.attachments) && entry.attachments.length > 0;
    // Formato antiguo
    const attHas = typeof entry.psychologistFeedback === 'object' && 
                   entry.psychologistFeedback?.attachments && 
                   Array.isArray(entry.psychologistFeedback.attachments) && 
                   entry.psychologistFeedback.attachments.length > 0;
    return Boolean(textHas || attHas || newFormatAttHas);
  };

  useEffect(() => {
    const init = async () => {
        setIsLoadingData(true);
        await AuthService.initializeDemoData();
        
        try {
          const user = await AuthService.getCurrentUser();
          if (user) {
              // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
              if (user.is_psychologist === undefined || user.is_psychologist === null) {
                  user.is_psychologist = false;
                  user.isPsychologist = false;
              }
              
              setCurrentUser(user);
              // If backend is available, try to migrate any local data for this user
              if (USE_BACKEND) {
                  try { await StorageService.migrateLocalToBackend(user.id); } catch (e) { console.warn('Migration skipped', e); }
              }
              await refreshUserData(user.id);
              // Solo permitir vista de psicólogo si is_psychologist es true
              const canAccessPsychologistView = user.is_psychologist === true;
              setViewState(canAccessPsychologistView ? ViewState.PATIENTS : ViewState.CALENDAR);
          } else {
              setViewState(ViewState.AUTH);
          }
        } catch (error) {
          console.error('Error inicializando usuario:', error);
          // Don't force logout on initialization errors - might be temporary network issue
          // Only redirect to auth if there's no user data at all
          if (!currentUser) {
            setViewState(ViewState.AUTH);
          }
        }
        
        setIsLoadingData(false);
    };
    init();
  }, []);

  // Removed: Aggressive periodic connection check that was logging users out unnecessarily
  // Connection issues are now handled gracefully at the operation level

  // Efecto para forzar vista de paciente si is_psychologist es false
  useEffect(() => {
    if (currentUser) {
      console.log('🔍 [App] Estado del usuario:', {
        email: currentUser.email,
        is_psychologist: currentUser.is_psychologist,
        isPsychologist: currentUser.isPsychologist,
        psychViewMode,
        viewState
      });
      
      if (currentUser.is_psychologist === false && psychViewMode === 'DASHBOARD') {
        console.log('⚠️ is_psychologist es false, forzando vista de paciente');
        setPsychViewMode('PERSONAL');
        setViewState(ViewState.CALENDAR);
      }
    }
  }, [currentUser?.is_psychologist, psychViewMode]);
  
  // Refrescar usuario cada vez que cambia de pantalla (psychViewMode)
  useEffect(() => {
    const refreshOnViewChange = async () => {
      if (currentUser?.id) {
        try {
          const freshUser = await AuthService.getUserById(currentUser.id);
          if (freshUser) {
            setCurrentUser(freshUser);
            console.log('🔄 Usuario refrescado al cambiar de vista:', {
              email: freshUser.email,
              is_psychologist: freshUser.is_psychologist,
              psychViewMode
            });
          }
        } catch (err) {
          console.warn('Error refrescando usuario al cambiar vista:', err);
        }
      }
    };
    
    refreshOnViewChange();
  }, [psychViewMode]);

  const loadUserData = async (userId: string) => {
    try {
      // Optimización: Solo cargar últimas 50 entradas por defecto
      const [e, g, s] = await Promise.all([
          StorageService.getEntriesForUser(userId, undefined, { limit: 50 }),
          StorageService.getGoalsForUser(userId),
          StorageService.getSettings(userId)
      ]);
      setEntries(e);
      setGoals(g);
      setSettings(s);
    } catch (error) {
      console.error('❌ Error cargando datos del usuario:', error);
      // Establecer valores por defecto para evitar pantalla en blanco
      setEntries([]);
      setGoals([]);
      setSettings({ 
        notificationsEnabled: false, 
        feedbackNotificationsEnabled: true,
        notificationTime: '20:00',
        language: 'es-ES',
        voice: 'Kore' 
      });
    }
  };

  const refreshUserData = async (userId: string) => {
    try {
      const refreshed = await AuthService.getUserById(userId);
      if (refreshed) {
        // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
        if (refreshed.is_psychologist === undefined || refreshed.is_psychologist === null) {
          refreshed.is_psychologist = false;
          refreshed.isPsychologist = false;
        }
        setCurrentUser(refreshed);
      }
      await loadUserData(userId);
      if (refreshed?.email) await checkInvitations(refreshed.email, refreshed.id);
      // Check profile for both psychologists and patients
      await checkProfileComplete(userId);
    } catch (e) {
      console.error('❌ Error refrescando datos del usuario:', e);
      // Don't logout on refresh errors - user can continue with cached data
      // Intentar cargar datos localmente como fallback
      try {
        await loadUserData(userId);
      } catch (loadError) {
        console.error('❌ Error cargando datos localmente:', loadError);
      }
    }
  };

  const checkInvitations = async (email: string, userId?: string) => {
      const invites = await StorageService.getPendingInvitationsForEmail(email, userId);
      setHasPendingInvites(invites.length > 0);
  };

  const checkProfileComplete = async (userId: string, user?: User) => {
    const userToCheck = user || currentUser;
    
    if (!userToCheck) {
      setIsProfileIncomplete(false);
      return;
    }

    try {
      const endpoint = userToCheck.is_psychologist === true
        ? `${API_URL}/psychologist/${userId}/profile`
        : `${API_URL}/patient/${userId}/profile`;
      
      const response = await fetch(endpoint);
      if (response.ok) {
        const profile = await response.json();
        
        // Campos esenciales según el rol
        const requiredFields = userToCheck.is_psychologist === true 
          ? [
              profile.name,
              profile.phone,
              profile.email,
              profile.businessName,
              profile.taxId,
              profile.iban
            ]
          : [
              profile.name,
              profile.phone,
              profile.email
            ];
        
        const isIncomplete = requiredFields.some(field => !field || String(field).trim() === '');
        setIsProfileIncomplete(isIncomplete);
      }
    } catch (error) {
      console.error('Error checking profile completeness:', error);
    }
  };

  const handleAuthSuccess = async (providedUser?: User) => {
      console.log('📍 handleAuthSuccess llamado con:', providedUser ? 'usuario proporcionado' : 'sin usuario');
      
      // Mostrar indicador de carga mientras se obtiene y cargan los datos del usuario
      setIsLoadingData(true);
      
      try {
          // Si ya tenemos el usuario (ej: desde signInWithSupabase), usarlo directamente
          let user = providedUser;
          
          if (!user) {
              user = await AuthService.getCurrentUser();
          }
          
          if (!user) {
              console.error('❌ No se pudo obtener el usuario después de autenticación');
              setCurrentUser(null);
              setViewState(ViewState.AUTH);
              setError('Error al cargar usuario. Por favor, intenta de nuevo.');
              setIsLoadingData(false);
              return;
          }
          
          // BUGFIX: Asegurar que is_psychologist siempre tenga un valor booleano
          if (user.is_psychologist === undefined || user.is_psychologist === null) {
              user.is_psychologist = false;
              user.isPsychologist = false;
          }
          
          console.log('✅ Usuario obtenido:', user.email || user.id, '| is_psychologist:', user.is_psychologist);
          setCurrentUser(user);
          
          // Cargar datos del usuario ANTES de cambiar la vista
          await refreshUserData(user.id);
          
          // Solo permitir vista de psicólogo si is_psychologist es true
          const canAccessPsychologistView = user.is_psychologist === true;
          setViewState(canAccessPsychologistView ? ViewState.PATIENTS : ViewState.CALENDAR);
          setPsychViewMode(canAccessPsychologistView ? 'DASHBOARD' : 'PERSONAL');
          
          // Establecer tab por defecto según el rol
          setActiveTab(canAccessPsychologistView ? 'dashboard' : 'calendar');
      } catch (err) {
          console.error('❌ Error en handleAuthSuccess:', err);
          setError('Error al cargar datos del usuario. Por favor, intenta de nuevo.');
          setViewState(ViewState.AUTH);
      } finally {
          setIsLoadingData(false);
      }
  };

  const handleLogout = () => {
      AuthService.logout();
      setCurrentUser(null);
      setEntries([]);
      setGoals([]);
      setPsychViewMode('DASHBOARD');
      setSelectedDate(null);
      setHasPendingInvites(false);
      setViewState(ViewState.AUTH);
  };

  const handleUserUpdate = async (updatedUser: User) => {
      setCurrentUser(updatedUser);
      
      // Refrescar datos del usuario desde el servidor
      if (updatedUser.id) {
        try {
          const freshUser = await AuthService.getUserById(updatedUser.id);
          if (freshUser) {
            setCurrentUser(freshUser);
            console.log('🔄 Usuario refrescado desde servidor:', {
              email: freshUser.email,
              is_psychologist: freshUser.is_psychologist
            });
            updatedUser = freshUser;
          }
        } catch (err) {
          console.warn('No se pudo refrescar usuario:', err);
        }
      }
      
      // Solo permitir acceso a vista de psicólogo si is_psychologist es true
      if (updatedUser.is_psychologist === true) {
        setViewState(ViewState.PATIENTS);
        setPsychViewMode('DASHBOARD');
      } else {
        // Si is_psychologist es false O es un paciente, forzar vista de paciente
        setViewState(ViewState.CALENDAR);
        setPsychViewMode('PERSONAL');
      }
  };

    const handleOpenSettings = () => {
      // Abrimos rápido y refrescamos datos en segundo plano para evitar bloqueo de la UI
      setShowSettings(true);
      if (currentUser) {
        refreshUserData(currentUser.id).catch(err => console.warn('No se pudo refrescar antes de ajustes', err));
      }
    };

    const handleConfirmRole = async () => {
      if (!currentUser || !pendingRole) return;
      const updated = { ...currentUser, is_psychologist: pendingRole === 'PSYCHOLOGIST', isPsychologist: pendingRole === 'PSYCHOLOGIST' } as User;
      try {
        await AuthService.updateUser(updated);
        setCurrentUser(updated);
        setShowRolePrompt(false);
        setPendingRole(null);
        await loadUserData(updated.id);
        await checkInvitations(updated.email);
        setViewState(updated.is_psychologist === true ? ViewState.PATIENTS : ViewState.CALENDAR);
      } catch (err:any) {
        console.error('Error updating role', err);
        alert(err?.message || 'Error guardando el rol.');
      }
    };

  useEffect(() => {
    if (!settings.notificationsEnabled || !currentUser) return;
    const checkTime = async () => {
      const now = new Date();
      const currentHm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentHm === settings.notificationTime && now.getSeconds() < 10) {
        if (Notification.permission === 'granted') {
           const targetUrl = `${window.location.origin}/?start=voice`;
           if ('serviceWorker' in navigator) {
             const reg = await navigator.serviceWorker.getRegistration();
             if (reg) {
               reg.showNotification('dygo', {
                 body: 'Es momento de conectar contigo. ¿Qué tal tu día?',
                 data: { url: targetUrl }
               });
               return;
             }
           }
           const n = new Notification('dygo', { body: 'Es momento de conectar contigo. ¿Qué tal tu día?', data: { url: targetUrl } as any });
           n.onclick = () => {
             window.location.href = targetUrl;
           };
        }
      }
    };
    const interval = setInterval(checkTime, 10000);
    return () => clearInterval(interval);
  }, [settings, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('start') !== 'voice') return;
    setSelectedDate(null);
    setActiveTab('insights');
    setViewState(ViewState.VOICE_SESSION);
    const url = new URL(window.location.href);
    url.searchParams.delete('start');
    window.history.replaceState({}, '', url.toString());
  }, [currentUser]);

  const markFeedbackAsRead = async (entriesToMark: JournalEntry[]) => {
    if (entriesToMark.length === 0) return;
    const now = Date.now();
    const ids = new Set(entriesToMark.map(e => e.id));
    setEntries(prev => prev.map(e => ids.has(e.id) ? { ...e, psychologistFeedbackReadAt: now } : e));
    try {
      await Promise.all(entriesToMark.map(e => StorageService.updateEntry({ ...e, psychologistFeedbackReadAt: now })));
    } catch (err) {
      console.warn('No se pudo marcar feedback como leído.', err);
    }
  };

  // Note: feedback is marked as read when the user opens the entry detail.

  useEffect(() => {
    if (!currentUser) return;
    if (!settings.feedbackNotificationsEnabled) return;
    if (Notification.permission !== 'granted') return;

    const storageKey = `dygo_feedback_notified_${currentUser.id}`;
    const raw = localStorage.getItem(storageKey);
    const notifiedMap = raw ? JSON.parse(raw) as Record<string, number> : {};

    const newlyUpdated = entries
      .filter(hasFeedbackContent)
      .filter(entry => {
        const updatedAt = entry.psychologistFeedbackUpdatedAt || 0;
        if (!updatedAt) return false;
        const lastNotified = notifiedMap[entry.id] || 0;
        return updatedAt > lastNotified && isFeedbackUnread(entry);
      });

    if (newlyUpdated.length === 0) return;

    newlyUpdated.forEach(entry => {
      new Notification('Nuevo feedback del psicólogo', { body: 'Tienes un nuevo feedback disponible.' });
      if (entry.psychologistFeedbackUpdatedAt) {
        notifiedMap[entry.id] = entry.psychologistFeedbackUpdatedAt;
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(notifiedMap));
  }, [currentUser, settings.feedbackNotificationsEnabled, entries]);

  useEffect(() => {
    if (!currentUser) return;
    if (!selectedEntryId) return;
    const entry = entries.find(e => e.id === selectedEntryId);
    if (!entry) return;
    const hasFeedback = hasFeedbackContent(entry);
    if (!hasFeedback) return;
    if (!isFeedbackUnread(entry)) return;
    markFeedbackAsRead([entry]);
  }, [selectedEntryId, entries, currentUser]);

  const handleStartSession = (dateStr?: string | React.MouseEvent) => {
    const safeDate = typeof dateStr === 'string' ? dateStr : null;
    setSessionDate(safeDate);
    setSelectedDate(null);
    setViewState(ViewState.VOICE_SESSION);
  };

  const handleSessionEnd = async (transcript: string) => {
    console.log('[App] 📥 handleSessionEnd called with transcript length:', transcript?.length);
    console.log('[App] 📄 Transcript preview:', transcript?.substring(0, 200));
    
    if (!currentUser) return;
    
    console.log('[App] 📝 Received transcript length:', transcript?.length || 0);
    console.log('[App] 📝 Transcript preview:', transcript?.substring(0, 200) || '(empty)');
    console.log('[App] 📝 Full transcript:', transcript);
    
    // Verificar con umbral más bajo (5 caracteres en lugar de vacío)
    if (!transcript || transcript.trim().length < 5) {
        console.error('[App] ❌ Transcript too short or empty, cancelling save');
        console.error('[App] Transcript received:', transcript);
        console.error('[App] Possible causes: microphone not working, permissions denied, or transcription failed');
        setViewState(ViewState.CALENDAR);
        setTimeout(() => {
            alert("No se detectó suficiente audio en la grabación.\n\nPosibles causas:\n• Permisos de micrófono no otorgados\n• Micrófono no funcionando\n• Problema con el reconocimiento de voz\n• La sesión fue muy corta\n\nPor favor, revisa los permisos del navegador e intenta de nuevo.");
        }, 100);
        return;
    }
    
    console.log('[App] ✅ Transcript valid, proceeding to save...');

    setViewState(ViewState.CALENDAR); 
    setIsProcessing(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const targetDate = sessionDate || today;
      
      console.log('[App] 🧠 Analyzing transcript with date:', targetDate);
      const newEntry = await analyzeJournalEntry(transcript, targetDate, currentUser.id);
      console.log('[App] ✅ Analysis complete, entry created:', newEntry.id);
      
      try {
        console.log('[App] 💾 Saving entry to storage...');
        await StorageService.saveEntry(newEntry);
        console.log('[App] ✅ Entry saved successfully');
      } catch (err:any) {
        console.error('[App] ❌ Error saving entry', err);
        alert(err?.message || 'Error guardando la entrada. Comprueba la conexión con el servidor.');
        setIsProcessing(false);
        return;
      }
      
      const updatedEntries = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updatedEntries);
      
      setSelectedDate(targetDate);
      setSessionDate(null);
    } catch (error) {
      console.error('[App] ❌ Error in handleSessionEnd:', error);
      alert("Hubo un error guardando tu diario.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddGoal = async (desc: string) => {
    if (!currentUser) return;
    const newGoal: Goal = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      description: desc,
      createdAt: Date.now(),
      completed: false,
      createdBy: 'USER'
    };
    const prev = goals;
    const updated = [...prev, newGoal];
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error saving goals', err);
      setGoals(prev);
      alert(err?.message || 'Error guardando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleToggleGoal = async (id: string) => {
    if (!currentUser) return;
    const prev = goals;
    const updated = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error toggling goal', err);
      setGoals(prev);
      alert(err?.message || 'Error actualizando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleDeleteGoal = async (id: string) => {
    if (!currentUser) return;
    const prev = goals;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    try {
      await StorageService.saveUserGoals(currentUser.id, updated);
    } catch (err: any) {
      console.error('Error deleting goal', err);
      setGoals(prev);
      alert(err?.message || 'Error eliminando la meta. Comprueba la conexión con el servidor.');
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!currentUser) return;
    try {
      await StorageService.deleteEntry(id);
      const updated = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updated);
    } catch (err:any) {
      console.error('Error deleting entry', err);
      alert(err?.message || 'No se pudo eliminar la entrada.');
    }
  };

  const handleUpdateEntry = async (entry: JournalEntry) => {
    if (!currentUser) return;
    await StorageService.updateEntry(entry);
    const updated = await StorageService.getEntriesForUser(currentUser.id);
    setEntries(updated);
  };

  const handleGenerateReport = async () => {
    if (!currentUser) return;
    setIsProcessing(true);
    try {
      const last7Days = await StorageService.getLastDaysEntries(currentUser.id, 7);
      if (last7Days.length < 2) {
        alert("Necesitas al menos 2 entradas recientes.");
        return;
      }
      const report = await generateWeeklyReport(last7Days);
      setWeeklyReport(report);
    } catch (e) {
      alert("Error generando el reporte.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSettings = async (newSettings: UserSettings) => {
    if (!currentUser) return;
    const prev = settings;
    setSettings(newSettings);
    try {
      await StorageService.saveSettings(currentUser.id, newSettings);
    } catch (err:any) {
      console.error('Error saving settings', err);
      setSettings(prev);
      alert(err?.message || 'Error guardando ajustes. Comprueba la conexión con el servidor.');
      throw err;
    }
  };

const safeEntries = Array.isArray(entries) ? entries : [];

const dayEntries = selectedDate
  ? safeEntries.filter(e => e.date === selectedDate)
      .filter(e => {
        // Mostrar entradas del usuario (diario)
        if (e.createdBy !== 'PSYCHOLOGIST') return true;
        // Mostrar sesiones y feedback del psicólogo (formatos antiguo y nuevo)
        if (e.psychologistEntryType === 'SESSION' || e.psychologistEntryType === 'FEEDBACK') return true;
        if (e.entryType === 'feedback') return true;
        // NO mostrar notas internas
        return false;
      })
  : [];

const entriesForModal = selectedEntryMode === 'single' && selectedEntryId
  ? (safeEntries.find(e => e.id === selectedEntryId) ? [safeEntries.find(e => e.id === selectedEntryId)!] : [])
  : dayEntries;

const safeGoals = Array.isArray(goals) ? goals : [];

const assignedGoals = safeGoals.filter(
  g => g.createdBy === 'PSYCHOLOGIST'
);

const personalGoals = safeGoals.filter(
  g => g.createdBy !== 'PSYCHOLOGIST'
);

const feedbackEntries = [...safeEntries]
  .filter(e => hasFeedbackContent(e) || e.psychologistEntryType === 'FEEDBACK' || e.entryType === 'feedback')
  .sort((a, b) => b.timestamp - a.timestamp);

const isSessionEntry = (entry: JournalEntry) => {
  if (entry.psychologistEntryType === 'SESSION') return true;
  // Incluir entradas de feedback creadas por el psicólogo
  if (entry.entryType === 'feedback' && entry.createdBy === 'PSYCHOLOGIST') return true;
  if (entry.createdBy === 'PSYCHOLOGIST') {
    return Boolean(entry.transcript && entry.transcript.trim().length > 0);
  }
  return false;
};

const sessionEntries = [...safeEntries]
  .filter(isSessionEntry)
  .sort((a, b) => b.timestamp - a.timestamp);

const latestDiaryEntry = [...safeEntries]
  .filter(e => e.createdBy !== 'PSYCHOLOGIST')
  .filter(e => e.transcript && e.transcript.trim().length > 0)
  .sort((a, b) => b.timestamp - a.timestamp)[0];

const latestSessionEntry = [...safeEntries]
  .filter(e => e.createdBy === 'PSYCHOLOGIST')
  .filter(e => e.psychologistEntryType === 'SESSION')
  .sort((a, b) => b.timestamp - a.timestamp)[0];

const todayStr = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

const hasTodayEntry = safeEntries.some(e => e.createdBy !== 'PSYCHOLOGIST' && e.date === todayStr);

  const unreadFeedbackCount = feedbackEntries.filter(isFeedbackUnread).length;

  const diaryEntries = safeEntries.filter(e => e.createdBy !== 'PSYCHOLOGIST' && typeof e.sentimentScore === 'number');
  const averageSentiment = diaryEntries.length > 0
    ? (diaryEntries.reduce((acc, curr) => acc + (curr.sentimentScore || 0), 0) / diaryEntries.length)
    : null;
  const totalEntriesCount = diaryEntries.length;
  const totalSessionsCount = sessionEntries.length;

  
  const ProfileCircle = ({ onClick, className }: { onClick: () => void, className?: string }) => (
    <button onClick={onClick} className={`relative rounded-full overflow-hidden transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${className}`}>
        {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="Perfil" className="w-10 h-10 object-cover" />
        ) : (
            <div className="w-10 h-10 bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                {currentUser?.name?.charAt(0).toUpperCase()}
            </div>
        )}
        {hasPendingInvites && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
    </button>
  );

  // Psychologist View - Solo accesible si is_psychologist es true
  if (currentUser?.is_psychologist === true && psychViewMode === 'DASHBOARD') {
      console.log('✅ [App] Mostrando vista de psicólogo - is_psychologist:', currentUser.is_psychologist);
      
      // Handler para cambio de vista con cierre de modal si estamos en pacientes
      const handleViewChange = (newView: typeof psychPanelView) => {
        // Si estamos cambiando a 'patients' y ya estamos en 'patients', cerrar modal
        if (newView === 'patients' && psychPanelView === 'patients') {
          patientDashboardRef.current?.closeModal();
        }
        setPsychPanelView(newView);
      };
      
      return (
          <div className="h-screen bg-slate-50 text-slate-900 flex overflow-hidden">
               {/* Sidebar */}
               <PsychologistSidebar 
                  activeView={psychPanelView}
                  onViewChange={handleViewChange}
                  isOpen={sidebarOpen}
                  onToggle={() => setSidebarOpen(!sidebarOpen)}
                  userName={currentUser.name}
                  userEmail={currentUser.email}
                  avatarUrl={currentUser.avatarUrl}
                  onSwitchToPersonal={() => setPsychViewMode('PERSONAL')}
                  onOpenSettings={handleOpenSettings}
                  isProfileIncomplete={isProfileIncomplete}
               />
               
               {/* Main Content */}
               <div className="flex-1 overflow-y-auto px-4 md:px-8 py-2 md:py-3">
                    {/* Mobile Header with page titles, icon and description */}
                    <header className="lg:hidden mb-3">
                      <div className="flex items-center gap-3 mb-2">
                        {psychPanelView === 'dashboard' && <LayoutDashboard className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'patients' && <Users className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'billing' && <FileText className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'profile' && <UserIcon className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'schedule' && <CalendarIcon className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'connections' && <Link2 className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'sessions' && <FileText className="w-6 h-6 text-indigo-600" />}
                        {psychPanelView === 'centros' && <Building2 className="w-6 h-6 text-indigo-600" />}
                        <h1 className="text-2xl font-bold text-slate-900">
                          {psychPanelView === 'dashboard' && 'Métricas'}
                          {psychPanelView === 'patients' && 'Pacientes'}
                          {psychPanelView === 'billing' && 'Facturación'}
                          {psychPanelView === 'profile' && 'Mi Perfil'}
                          {psychPanelView === 'schedule' && 'Agenda'}
                          {psychPanelView === 'connections' && 'Conexiones'}
                          {psychPanelView === 'sessions' && 'Sesiones'}
                          {psychPanelView === 'centros' && 'Centros'}
                        </h1>
                      </div>
                      <p className="text-sm text-slate-500">
                        {psychPanelView === 'dashboard' && 'Métricas y resumen de actividad'}
                        {psychPanelView === 'patients' && 'Gestiona tu lista de pacientes'}
                        {psychPanelView === 'billing' && 'Gestiona facturas y pagos'}
                        {psychPanelView === 'profile' && 'Información personal y datos de facturación'}
                        {psychPanelView === 'schedule' && 'Vista semanal de tu agenda'}
                        {psychPanelView === 'connections' && 'Gestiona quién puede verte y a quién acompañas'}
                        {psychPanelView === 'sessions' && 'Gestión de sesiones'}
                        {psychPanelView === 'centros' && 'Gestiona tus centros de trabajo'}
                      </p>
                    </header>

                    {/* Desktop Header */}
                    <header className="hidden lg:flex justify-between items-center mb-3">
                      <div>
                        <h1 className="text-3xl font-bold text-slate-900">
                          {psychPanelView === 'dashboard' && 'Dashboard'}
                          {psychPanelView === 'patients' && 'Pacientes'}
                          {psychPanelView === 'billing' && 'Facturación'}
                          {psychPanelView === 'profile' && 'Mi Perfil Profesional'}
                          {psychPanelView === 'schedule' && 'Agenda'}
                          {psychPanelView === 'connections' && 'Conexiones'}
                          {psychPanelView === 'sessions' && 'Sesiones'}
                          {psychPanelView === 'centros' && 'Centros'}
                        </h1>
                        <p className="text-slate-500 mt-1">
                          {psychPanelView === 'dashboard' && 'Resumen completo de tu actividad profesional'}
                          {psychPanelView === 'patients' && 'Gestiona tu lista de pacientes y su progreso'}
                          {psychPanelView === 'billing' && 'Gestiona facturas y pagos de tus servicios'}
                          {psychPanelView === 'profile' && 'Información personal y datos de facturación'}
                          {psychPanelView === 'schedule' && 'Vista semanal de tu agenda con filtros'}
                          {psychPanelView === 'connections' && 'Gestiona quién puede verte y a quién acompañas'}
                          {psychPanelView === 'sessions' && 'Gestión completa de sesiones con métricas'}
                          {psychPanelView === 'centros' && 'Gestiona los centros donde ofreces tus servicios'}
                        </p>
                      </div>
                      {/* Action Buttons */}
                      <div className="flex gap-3">
                        {psychPanelView === 'schedule' && (
                          <>
                            <button
                              onClick={() => {
                                const calendar = document.querySelector('[data-calendar-component]') as any;
                                if (calendar && calendar.openNewAvailability) calendar.openNewAvailability();
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
                            >
                              <Clock size={18} />
                              Añadir Disponibilidad
                            </button>
                            <button
                              onClick={() => {
                                const calendar = document.querySelector('[data-calendar-component]') as any;
                                if (calendar && calendar.openNewSession) calendar.openNewSession();
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                            >
                              <Plus size={18} />
                              Nueva Sesión
                            </button>
                          </>
                        )}
                        {psychPanelView === 'centros' && (
                          <button
                            onClick={() => {
                              centrosPanelRef.current?.openNewCenter();
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
                          >
                            <Plus size={18} />
                            Nuevo Centro
                          </button>
                        )}
                      </div>
                    </header>

                    {psychPanelView === 'dashboard' && <PsychologistDashboard psychologistId={currentUser.id} />}
                    {psychPanelView === 'patients' && <PatientDashboard ref={patientDashboardRef} />}
                    {psychPanelView === 'sessions' && <SessionsList psychologistId={currentUser.id} />}
                    {psychPanelView === 'billing' && <BillingPanel psychologistId={currentUser.id} />}
                    {psychPanelView === 'centros' && <CentrosPanel ref={centrosPanelRef} psychologistId={currentUser.id} />}
                    {psychPanelView === 'profile' && <PsychologistProfilePanel userId={currentUser.id} userEmail={currentUser.email} />}
                    {psychPanelView === 'schedule' && <PsychologistSchedule psychologistId={currentUser.id} />}
                    {psychPanelView === 'connections' && <ConnectionsPanel currentUser={currentUser} />}

                    {showSettings && (
                         <SettingsModal 
                             settings={settings} 
                             onSave={handleSaveSettings} 
                             onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} 
                             onLogout={handleLogout}
                             onUserUpdate={handleUserUpdate}
                         />
                    )}
               </div>
          </div>
      );
  }

  if (viewState === ViewState.AUTH) {
      return (
        <>
          <AuthScreen onAuthSuccess={handleAuthSuccess} />
          {error && (
            <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg max-w-md">
              {error}
            </div>
          )}
        </>
      );
  }

  if (isLoadingData) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-indigo-600"><Loader2 className="animate-spin w-10 h-10" /></div>;
  }

  // Patient View
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-0">
      {showRolePrompt && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-bold text-slate-800">Elige tu perfil</h2>
            <p className="text-sm text-slate-500 mt-1">Necesitamos saber cómo usarás dygo.</p>

            <div className="mt-4 grid gap-3">
              <button
                onClick={() => setPendingRole('PATIENT')}
                className={`w-full text-left p-4 rounded-xl border transition ${pendingRole === 'PATIENT' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
              >
                <div className="font-semibold text-slate-800">Soy cliente</div>
                <div className="text-xs text-slate-500">Quiero escribir mi diario y seguir mis metas.</div>
              </button>
              <button
                onClick={() => setPendingRole('PSYCHOLOGIST')}
                className={`w-full text-left p-4 rounded-xl border transition ${pendingRole === 'PSYCHOLOGIST' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
              >
                <div className="font-semibold text-slate-800">Soy psicólogo/a</div>
                <div className="text-xs text-slate-500">Quiero gestionar pacientes y ver su progreso.</div>
              </button>
            </div>

            <button
              onClick={handleConfirmRole}
              disabled={!pendingRole}
              className={`mt-4 w-full py-3 rounded-xl font-medium ${pendingRole ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}
            >
              Continuar
            </button>
          </div>
        </div>
      )}
      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 z-[60] flex flex-col items-center justify-center backdrop-blur-sm">
           <div className="w-16 h-16 relative flex items-center justify-center mb-4">
              <DygoLogo className="w-16 h-16 text-indigo-600 animate-pulse" />
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full animate-ping opacity-20"></div>
           </div>
           <h2 className="text-xl font-semibold text-indigo-900">Procesando...</h2>
        </div>
      )}

      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* Mobile Toggle Button - Draggable */}
        {!sidebarOpen && (
          <button
            onTouchStart={(e) => {
              const touch = e.touches[0];
              const rect = e.currentTarget.getBoundingClientRect();
              setDragOffset({
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
              });
              setIsDragging(true);
            }}
            onTouchMove={(e) => {
              if (!isDragging) return;
              e.preventDefault();
              const touch = e.touches[0];
              const newTop = touch.clientY - dragOffset.y;
              const newLeft = touch.clientX - dragOffset.x;
              
              // Keep within bounds
              const maxTop = window.innerHeight - 48;
              const maxLeft = window.innerWidth - 48;
              
              setMenuButtonPos({
                top: Math.max(16, Math.min(newTop, maxTop)),
                left: Math.max(16, Math.min(newLeft, maxLeft)),
                right: undefined
              });
            }}
            onTouchEnd={() => {
              if (isDragging) {
                setIsDragging(false);
              } else {
                setSidebarOpen(true);
              }
            }}
            onClick={(e) => {
              if (!isDragging) {
                setSidebarOpen(true);
              }
            }}
            style={{
              top: `${menuButtonPos.top}px`,
              right: menuButtonPos.right !== undefined ? `${menuButtonPos.right}px` : undefined,
              left: menuButtonPos.left !== undefined ? `${menuButtonPos.left}px` : undefined,
              touchAction: 'none',
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'all 0.3s'
            }}
            className="md:hidden fixed z-50 w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-blue-700 flex items-center justify-center transition-all"
          >
            <DygoLogo className="w-7 h-7 text-white" />
          </button>
        )}

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar tipo Notion */}
        <aside className={`
          fixed md:sticky top-0 left-0 h-screen bg-white border-r border-slate-200 z-40
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col overflow-hidden
          w-64
        `}>
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <DygoLogo className="w-6 h-6 text-white" />
                </div>
                <span className="font-dygo text-xl font-bold text-slate-900">dygo</span>
              </div>
              {/* Close button for mobile - inside the menu */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            <button
              onClick={() => { setActiveTab('calendar'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'calendar'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Smile size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Historia</span>
            </button>

            <button
              onClick={() => { setActiveTab('insights'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'insights'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Resumen</span>
            </button>

            <button
              onClick={() => { setActiveTab('appointments'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'appointments'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <CalendarIcon size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Citas</span>
            </button>

            <button
              onClick={() => { setActiveTab('billing'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'billing'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <FileText size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Facturación</span>
            </button>

            <button
              onClick={() => { setActiveTab('profile'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium relative ${
                activeTab === 'profile'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <UserIcon size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline flex-1 text-left`}>Mi Perfil</span>
              {isProfileIncomplete && (
                <AlertCircle size={18} className="text-amber-500 animate-pulse" title="Perfil incompleto" />
              )}
            </button>
          </nav>

          <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block p-3 border-t border-slate-200 space-y-2`}>
            {/* Admin tab - solo para garryjavi@gmail.com */}
            {currentUser?.email?.toLowerCase() === 'garryjavi@gmail.com' && (
              <button
                onClick={() => { setActiveTab('admin'); if (window.innerWidth < 768) setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium mb-2 ${
                  activeTab === 'admin'
                    ? 'bg-red-50 text-red-700 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Shield size={18} />
                <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Admin</span>
              </button>
            )}
            
            <button
              onClick={handleOpenSettings}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-indigo-700 font-semibold text-sm">
                    {currentUser?.name?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-900 truncate">{currentUser?.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
              </div>
            </button>
            
            {/* Botón de Cerrar Sesión - Visible directamente en el sidebar */}
            <button
              onClick={() => {
                if (window.confirm('¿Cerrar sesión?')) {
                  handleLogout();
                }
              }}
              className="w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors text-left flex items-center gap-2"
            >
              <LogOut size={16} />
              <span>Cerrar Sesión</span>
            </button>
            
            {currentUser?.is_psychologist === true && (
              <button
                onClick={() => {
                  // Doble verificación antes de cambiar a vista profesional
                  if (currentUser?.is_psychologist === true) {
                    setPsychViewMode('DASHBOARD');
                  }
                }}
                className="w-full px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors text-left flex items-center gap-2 border border-purple-100"
              >
                <Briefcase size={16} />
                <span>Panel Pro</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="w-full px-4 md:px-8 py-4 md:py-8 space-y-6">
            {/* Mobile Header - Now visible with page title */}
            <header className="md:hidden mb-6">
              <div className="flex items-center gap-3 mb-2">
                {activeTab === 'insights' && <LayoutDashboard className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'calendar' && <Smile className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'appointments' && <CalendarIcon className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'sessions' && <Stethoscope className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'billing' && <FileText className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'connections' && <Link2 className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'profile' && <UserIcon className="w-6 h-6 text-indigo-600" />}
                {activeTab === 'admin' && <Shield className="w-6 h-6 text-red-600" />}
                <h1 className="text-2xl font-bold text-slate-900">
                  {activeTab === 'insights' && 'Resumen'}
                  {activeTab === 'calendar' && 'Historia'}
                  {activeTab === 'appointments' && 'Citas'}
                  {activeTab === 'sessions' && 'Sesiones'}
                  {activeTab === 'billing' && 'Facturación'}
                  {activeTab === 'profile' && 'Mi Perfil'}
                  {activeTab === 'admin' && 'Administración'}
                </h1>
              </div>
              <p className="text-sm text-slate-500">
                {activeTab === 'insights' && 'Vista general de tu progreso'}
                {activeTab === 'calendar' && 'Visualiza tus entradas y actividades'}
                {activeTab === 'appointments' && 'Gestiona tus citas con el psicólogo'}
                {activeTab === 'sessions' && 'Sesiones clínicas con tu psicólogo'}
                {activeTab === 'billing' && 'Consulta y descarga tus facturas'}
                {activeTab === 'profile' && 'Información personal y preferencias'}
                {activeTab === 'admin' && 'Panel de administración del sistema'}
              </p>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  {activeTab === 'insights' && 'Resumen'}
                  {activeTab === 'calendar' && 'Mi Historia'}
                  {activeTab === 'appointments' && 'Mis Citas'}
                  {activeTab === 'sessions' && 'Sesiones Clínicas'}
                  {activeTab === 'billing' && 'Facturación'}
                  {activeTab === 'profile' && 'Mi Perfil'}
                  {activeTab === 'admin' && 'Administración del Sistema'}
                </h1>
                <p className="text-slate-500 mt-1">
                  {activeTab === 'insights' && 'Vista general de tu progreso'}
                  {activeTab === 'calendar' && 'Visualiza tus entradas y actividades del día a día'}
                  {activeTab === 'appointments' && 'Gestiona y reserva citas con tu psicólogo'}
                  {activeTab === 'sessions' && 'Sesiones clínicas con tu psicólogo'}
                  {activeTab === 'billing' && 'Consulta y descarga tus facturas'}
                  {activeTab === 'profile' && 'Información personal y configuración de tu cuenta'}
                  {activeTab === 'admin' && 'Gestión de usuarios del sistema'}
                </p>
              </div>
              {activeTab === 'calendar' && (
                <button
                  onClick={() => handleStartSession()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/30"
                >
                  <Mic size={20} />
                  Hablar con IA
                </button>
              )}
            </header>

            {/* Mobile Action Button - Circular Floating Button */}
            <button
              onClick={() => handleStartSession()}
              className="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all flex items-center justify-center"
              aria-label="Grabar entrada"
            >
              <Mic size={24} />
            </button>

            {activeTab === 'insights' && assignedGoals.length > 0 && (
              <div className="bg-purple-50 rounded-2xl border border-purple-100">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-purple-100/50">
                  <CheckSquare className="text-purple-600" size={18} />
                  <h3 className="font-bold text-purple-800 text-sm uppercase tracking-wide">Plan</h3>
                </div>
                <GoalsPanel 
                  title="" goals={assignedGoals} onAddGoal={() => {}} onToggleGoal={handleToggleGoal} onDeleteGoal={() => {}} 
                  readOnly={true} showAdd={false}
                />
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="space-y-4 md:space-y-6 animate-in fade-in">
                {/* Stats Cards - Solo 2 cards principales */}
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl md:rounded-3xl border border-indigo-100 p-4 md:p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
                      </div>
                      <div className="text-xs md:text-sm font-semibold text-indigo-900">Entradas</div>
                    </div>
                    <div className="text-3xl md:text-4xl font-bold text-indigo-900">{totalEntriesCount}</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl md:rounded-3xl border border-green-100 p-4 md:p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <Smile className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                      </div>
                      <div className="text-xs md:text-sm font-semibold text-green-900">Ánimo</div>
                    </div>
                    <div className="text-3xl md:text-4xl font-bold text-green-900">
                      {averageSentiment !== null ? averageSentiment.toFixed(1) : '—'}
                      {averageSentiment !== null && <span className="text-lg md:text-xl text-green-600 ml-1">/10</span>}
                    </div>
                  </div>
                </div>

                {/* CTA Principal */}
                {!hasTodayEntry && (
                  <button
                    onClick={() => handleStartSession()}
                    className="w-full py-4 md:py-5 rounded-2xl md:rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-base md:text-lg shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Mic className="w-5 h-5 md:w-6 md:h-6" />
                    ¿Qué tal estás hoy?
                  </button>
                )}

                {/* Goals Panel */}
                <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                      <Target className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                      Mis Objetivos
                    </h3>
                  </div>
                  <div className="p-4 md:p-6">
                    <GoalsPanel goals={personalGoals} onAddGoal={handleAddGoal} onToggleGoal={handleToggleGoal} onDeleteGoal={handleDeleteGoal} />
                  </div>
                </div>

                {/* Última Sesión */}
                {latestSessionEntry && (
                  <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                        <Stethoscope className="w-4 h-4 md:w-5 md:h-5 text-purple-600" />
                        Última sesión
                      </h3>
                      <span className="text-xs font-medium text-slate-600">
                        {new Date(latestSessionEntry.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                    <div className="p-4 md:p-6 space-y-3">
                      <p className="text-sm md:text-base text-slate-700 leading-relaxed line-clamp-3">
                        {latestSessionEntry.summary}
                      </p>
                      <button
                        onClick={() => { setSelectedDate(latestSessionEntry.date); setSelectedEntryId(latestSessionEntry.id); setSelectedEntryMode('single'); }}
                        className="text-xs md:text-sm font-semibold text-purple-700 bg-purple-50 px-4 py-2 rounded-full hover:bg-purple-100 transition-colors"
                      >
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                )}

                {/* Insights Panel */}
                <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-4 md:px-6 py-3 md:py-4 border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm md:text-base">
                      <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-indigo-600" />
                      Tu progreso
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">Últimos 14 días</p>
                  </div>
                  <div className="p-4 md:p-6">
                    <InsightsPanel entries={entries} />
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'sessions' && (
              <div className="animate-in fade-in">
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Sesiones clínicas</h3>
                  {sessionEntries.length === 0 ? (
                    <p className="text-sm text-slate-500">Aún no hay sesiones clínicas.</p>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto">
                      {sessionEntries.map(entry => {
                        const timeLabel = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        const sessionFeedbackText = getFeedbackText(entry);
                        const summaryText = (entry.summary || '').trim();
                        const emotions = Array.isArray(entry.emotions) ? entry.emotions : [];
                        const sentimentScore = typeof entry.sentimentScore === 'number' ? entry.sentimentScore : null;
                        const hasTranscript = Boolean(entry.transcript && entry.transcript.trim().length > 0);
                        const hasFeedback = sessionFeedbackText.trim().length > 0;
                        const hasAdvice = Boolean(entry.advice && entry.advice.trim().length > 0);
                        const isUnread = isFeedbackUnread(entry);
                        return (
                          <div key={entry.id} className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                                    Sesión clínica
                                  </span>
                                  {isUnread && (
                                    <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                      No leído
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">{entry.date}{timeLabel ? ` • ${timeLabel}` : ''}</div>
                              </div>
                              <button
                                onClick={() => {
                                  if (isFeedbackUnread(entry)) {
                                    markFeedbackAsRead([entry]);
                                  }
                                  setSelectedDate(entry.date);
                                  setSelectedEntryId(entry.id);
                                  setSelectedEntryMode('single');
                                }}
                                className="text-[11px] font-semibold text-purple-700 bg-white border border-purple-100 px-2 py-0.5 rounded-full hover:bg-purple-50"
                              >
                                Ver detalle
                              </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mb-3">
                              {sentimentScore !== null && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sentimentScore >= 7 ? 'bg-green-50 text-green-700 border-green-200' : sentimentScore >= 4 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                  {sentimentScore}/10
                                </span>
                              )}
                              {hasTranscript && (
                                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                  Transcript
                                </span>
                              )}
                              {emotions.slice(0, 6).map((em, idx) => (
                                <span key={`${em}-${idx}`} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-semibold">
                                  {em}
                                </span>
                              ))}
                            </div>
                            {summaryText && (
                              <div className="bg-white/80 border border-slate-100 rounded-xl p-3 mb-3">
                                <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Resumen de la sesión</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{summaryText}</p>
                              </div>
                            )}
                            {hasFeedback && (
                              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3">
                                <h4 className="text-[10px] font-bold uppercase text-indigo-700 mb-1">Feedback del psicólogo</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{sessionFeedbackText}</p>
                              </div>
                            )}
                            {hasAdvice && (
                              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                                <h4 className="text-[10px] font-bold uppercase text-purple-700 mb-1">Meta terapéutica</h4>
                                <p className="text-sm text-slate-800 leading-relaxed">{entry.advice}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Vista de Citas */}
            {activeTab === 'appointments' && (
              <div className="animate-in fade-in">
                <PatientSessions />
              </div>
            )}

            {/* Vista de Calendario */}
            {activeTab === 'calendar' && (
              <div className="animate-in fade-in">
                <CalendarView
                  entries={entries}
                  onSelectDate={(date) => { setSelectedDate(date); setSelectedEntryMode('day'); }}
                  currentUserId={currentUser?.id}
                />
              </div>
            )}

            {/* Vista de Facturación */}
            {activeTab === 'billing' && (
              <div className="animate-in fade-in">
                <PatientBillingPanel />
              </div>
            )}

            {activeTab === 'profile' && currentUser && (
              <div className="animate-in fade-in">
                <PatientProfilePanel userId={currentUser.id} />
              </div>
            )}

            {activeTab === 'admin' && currentUser?.email?.toLowerCase() === 'garryjavi@gmail.com' && (
              <div className="animate-in fade-in">
                <SuperAdmin />
              </div>
            )}
          </div>
        </main>
      </div>

      {viewState === ViewState.VOICE_SESSION && <VoiceSession key={Date.now()} onSessionEnd={handleSessionEnd} onCancel={() => setViewState(ViewState.CALENDAR)} settings={settings} />}
      {selectedDate && (
        <EntryModal 
          entries={entriesForModal} 
          dateStr={selectedDate} 
          onClose={() => { setSelectedDate(null); setSelectedEntryId(null); setSelectedEntryMode('day'); }}
          onStartSession={(dateStr) => handleStartSession(dateStr)} 
          onDeleteEntry={handleDeleteEntry} 
          onUpdateEntry={handleUpdateEntry}
          currentUserId={currentUser?.id}
        />
      )}
      {weeklyReport && <WeeklyReportModal report={weeklyReport} onClose={() => setWeeklyReport(null)} />}
      {showSettings && currentUser && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
    </div>
  );
};

export default App;