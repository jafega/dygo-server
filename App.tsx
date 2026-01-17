import React, { useState, useEffect } from 'react';
import { ViewState, JournalEntry, Goal, UserSettings, WeeklyReport, User } from './types';
import * as StorageService from './services/storageService';
import * as AuthService from './services/authService';
import { USE_BACKEND } from './services/config';
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
import PatientDashboard from './components/PatientDashboard';
import AuthScreen from './components/AuthScreen';
import SuperAdmin from './components/SuperAdmin';
import PsychologistSidebar from './components/PsychologistSidebar';
import BillingPanel from './components/BillingPanel';
import PsychologistProfilePanel from './components/PsychologistProfilePanel';
import PsychologistCalendar from './components/PsychologistCalendar';
import { Mic, LayoutDashboard, Calendar, Target, BookOpen, User as UserIcon, Stethoscope, ArrowLeftRight, CheckSquare, Loader2, MessageCircle, Menu, X, CalendarIcon, Heart, TrendingUp, FileText, Briefcase } from 'lucide-react';

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
  const [psychPanelView, setPsychPanelView] = useState<'patients' | 'billing' | 'profile' | 'calendar'>('patients');
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const [activeTab, setActiveTab] = useState<'insights' | 'feedback' | 'sessions' | 'calendar' | 'billing'>('insights');
  const [showSettings, setShowSettings] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);

  const getFeedbackText = (entry: JournalEntry) => {
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
    const attHas = typeof entry.psychologistFeedback === 'object' && 
                   entry.psychologistFeedback?.attachments && 
                   Array.isArray(entry.psychologistFeedback.attachments) && 
                   entry.psychologistFeedback.attachments.length > 0;
    return Boolean(textHas || attHas);
  };

  useEffect(() => {
    const init = async () => {
        setIsLoadingData(true);
        await AuthService.initializeDemoData();
        const user = await AuthService.getCurrentUser();
        if (user) {
            setCurrentUser(user);
        const hasValidRole = user.role === 'PATIENT' || user.role === 'PSYCHOLOGIST';
        if (!hasValidRole) {
          setShowRolePrompt(true);
          setIsLoadingData(false);
          return;
        }
            // If backend is available, try to migrate any local data for this user
            if (USE_BACKEND) {
                try { await StorageService.migrateLocalToBackend(user.id); } catch (e) { console.warn('Migration skipped', e); }
            }
            await refreshUserData(user.id);
            setViewState(user.role === 'PSYCHOLOGIST' ? ViewState.PATIENTS : ViewState.CALENDAR);
        } else {
            setViewState(ViewState.AUTH);
        }
        setIsLoadingData(false);
    };
    init();
  }, []);

  const loadUserData = async (userId: string) => {
    const [e, g, s] = await Promise.all([
        StorageService.getEntriesForUser(userId),
        StorageService.getGoalsForUser(userId),
        StorageService.getSettings(userId)
    ]);
    setEntries(e);
    setGoals(g);
    setSettings(s);
  };

  const refreshUserData = async (userId: string) => {
    try {
      const refreshed = await AuthService.getUserById(userId);
      if (refreshed) setCurrentUser(refreshed);
      await loadUserData(userId);
      if (refreshed?.email) await checkInvitations(refreshed.email);
    } catch (e) {
      console.warn('No se pudo refrescar el perfil desde el servidor.', e);
    }
  };

  const checkInvitations = async (email: string) => {
      const invites = await StorageService.getPendingInvitationsForEmail(email);
      setHasPendingInvites(invites.length > 0);
  };

  const handleAuthSuccess = async () => {
      const user = await AuthService.getCurrentUser();
      if (user) {
          setCurrentUser(user);
        const hasValidRole = user.role === 'PATIENT' || user.role === 'PSYCHOLOGIST';
        if (!hasValidRole) {
          setShowRolePrompt(true);
          return;
        }
          await refreshUserData(user.id);
          setViewState(user.role === 'PSYCHOLOGIST' ? ViewState.PATIENTS : ViewState.INSIGHTS);
          setPsychViewMode('DASHBOARD'); 
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

  const handleUserUpdate = (updatedUser: User) => {
      setCurrentUser(updatedUser);
      if (updatedUser.role === 'PSYCHOLOGIST') {
        setViewState(ViewState.PATIENTS);
        setPsychViewMode('DASHBOARD');
      } else if (updatedUser.role === 'PATIENT') {
        setViewState(ViewState.CALENDAR);
      }
  };

  const handleOpenSettings = async () => {
      if (currentUser) {
          await refreshUserData(currentUser.id);
      }
      setShowSettings(true);
  };

    const handleConfirmRole = async () => {
      if (!currentUser || !pendingRole) return;
      const updated = { ...currentUser, role: pendingRole } as User;
      try {
        await AuthService.updateUser(updated);
        setCurrentUser(updated);
        setShowRolePrompt(false);
        setPendingRole(null);
        await loadUserData(updated.id);
        await checkInvitations(updated.email);
        setViewState(updated.role === 'PSYCHOLOGIST' ? ViewState.PATIENTS : ViewState.CALENDAR);
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
    if (!currentUser || currentUser.role !== 'PATIENT') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('start') !== 'voice') return;
    setSelectedDate(null);
    setActiveTab('insights');
    setViewState(ViewState.VOICE_SESSION);
    const url = new URL(window.location.href);
    url.searchParams.delete('start');
    window.history.replaceState({}, '', url.toString());
  }, [currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const interval = setInterval(() => {
          checkInvitations(currentUser.email);
      }, 5000);
      return () => clearInterval(interval);
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
    if (!currentUser || currentUser.role !== 'PATIENT') return;
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
    if (!currentUser || currentUser.role !== 'PATIENT') return;
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
    if (!currentUser) return;
    if (!transcript || !transcript.trim()) {
        setViewState(ViewState.CALENDAR);
        setTimeout(() => {
            alert("No se detectó audio en la grabación.");
        }, 100);
        return;
    }

    setViewState(ViewState.CALENDAR); 
    setIsProcessing(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const targetDate = sessionDate || today;
      
      const [newEntry, updatedGoals] = await Promise.all([
        analyzeJournalEntry(transcript, targetDate, currentUser.id),
        analyzeGoalsProgress(transcript, goals.filter(g => !g.completed))
      ]);
      
      try {
        await StorageService.saveEntry(newEntry);
      } catch (err:any) {
        console.error('Error saving entry', err);
        alert(err?.message || 'Error guardando la entrada. Comprueba la conexión con el servidor.');
        setIsProcessing(false);
        return;
      }
      
      const updatedEntries = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updatedEntries);

      const finalGoals = goals.map(g => {
        const updated = updatedGoals.find(ug => ug.id === g.id);
        return updated ? updated : g;
      });
      setGoals(finalGoals);
      try {
        await StorageService.saveUserGoals(currentUser.id, finalGoals);
      } catch (err:any) {
        console.error('Error saving goals after session', err);
        alert(err?.message || 'Error guardando las metas. Comprueba la conexión con el servidor.');
      }
      
      setSelectedDate(targetDate);
      setSessionDate(null);
    } catch (error) {
      console.error(error);
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
      aiFeedback: '¡Empieza hoy mismo!',
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
  .filter(e => hasFeedbackContent(e) || e.psychologistEntryType === 'FEEDBACK')
  .sort((a, b) => b.timestamp - a.timestamp);

const isSessionEntry = (entry: JournalEntry) => {
  if (entry.psychologistEntryType === 'SESSION') return true;
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

  if (viewState === ViewState.AUTH) {
      return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (isLoadingData) {
      return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-indigo-600"><Loader2 className="animate-spin w-10 h-10" /></div>;
  }

  // Superadmin view
  if (currentUser && viewState === ViewState.SUPERADMIN) {
    return (
      <div className="min-h-screen bg-white text-slate-900 pb-20 md:pb-0 relative">
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Superadmin</h1>
            <div className="flex items-center gap-2">
              <button onClick={() => setViewState(ViewState.CALENDAR)} className="px-3 py-2 bg-slate-100 rounded">Volver</button>
              <div className="ml-2"><ProfileCircle onClick={handleOpenSettings} /></div>
            </div>
          </header>

          <SuperAdmin />

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

  // Psychologist View
  if (currentUser?.role === 'PSYCHOLOGIST' && psychViewMode === 'DASHBOARD') {
      return (
          <div className="h-screen bg-slate-50 text-slate-900 flex overflow-hidden">
               {/* Sidebar */}
               <PsychologistSidebar 
                  activeView={psychPanelView}
                  onViewChange={setPsychPanelView}
                  isOpen={sidebarOpen}
                  onToggle={() => setSidebarOpen(!sidebarOpen)}
                  userName={currentUser.name}
                  userEmail={currentUser.email}
                  onSwitchToPersonal={() => setPsychViewMode('PERSONAL')}
                  onOpenSettings={handleOpenSettings}
                  isSuperAdmin={String(currentUser.email).toLowerCase() === 'garryjavi@gmail.com'}
                  onSuperAdminClick={() => setViewState(ViewState.SUPERADMIN)}
               />
               
               {/* Main Content */}
               <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
                    {psychPanelView === 'patients' && <PatientDashboard />}
                    {psychPanelView === 'billing' && <BillingPanel psychologistId={currentUser.id} />}
                    {psychPanelView === 'profile' && <PsychologistProfilePanel userId={currentUser.id} />}
                    {psychPanelView === 'calendar' && <PsychologistCalendar psychologistId={currentUser.id} />}

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
        {/* Mobile Toggle Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-slate-200 hover:bg-slate-50"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar tipo Notion */}
        <aside className={`
          fixed md:sticky top-0 left-0 h-screen
          w-64 bg-white border-r border-slate-200 z-40
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col overflow-hidden
        `}>
          <div className="p-4 flex items-center border-b border-slate-200">
            <div className="flex items-center gap-2">
              <DygoLogo className="w-8 h-8 text-indigo-600" />
              <span className="font-dygo text-xl font-bold text-slate-900">dygo</span>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
              onClick={() => { setActiveTab('calendar'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'calendar'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Calendar size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Calendario</span>
            </button>

            <button
              onClick={() => { setActiveTab('sessions'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'sessions'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Stethoscope size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline`}>Sesiones</span>
            </button>

            <button
              onClick={() => { setActiveTab('feedback'); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                activeTab === 'feedback'
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <MessageCircle size={18} />
              <span className={`${sidebarOpen ? 'inline' : 'hidden'} md:inline flex-1 text-left`}>Feedback</span>
              {unreadFeedbackCount > 0 && (
                <span className={`${sidebarOpen ? 'inline-flex' : 'hidden'} md:inline-flex min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold items-center justify-center`}>
                  {unreadFeedbackCount > 99 ? '99+' : unreadFeedbackCount}
                </span>
              )}
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
          </nav>

          <div className={`${sidebarOpen ? 'block' : 'hidden'} md:block p-3 border-t border-slate-200 space-y-2`}>
            <button
              onClick={handleOpenSettings}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-700 font-semibold text-sm">
                  {currentUser?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-900 truncate">{currentUser?.name}</p>
                <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
              </div>
            </button>
            {currentUser?.role === 'PSYCHOLOGIST' && (
              <button
                onClick={() => setPsychViewMode('DASHBOARD')}
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
          <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
            {/* Mobile Header */}
            <header className="md:hidden flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="w-10"></div>
              <div className="flex items-center gap-2">
                <DygoLogo className="w-8 h-8 text-indigo-600" />
                <span className="font-dygo text-xl font-bold text-slate-900">dygo</span>
              </div>
              <button
                onClick={handleOpenSettings}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <UserIcon size={24} />
              </button>
            </header>

            {/* Desktop Header */}
            <header className="hidden md:flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  {activeTab === 'insights' && 'Resumen'}
                  {activeTab === 'feedback' && 'Feedback del Psicólogo'}
                  {activeTab === 'sessions' && 'Mis Sesiones'}
                  {activeTab === 'calendar' && 'Calendario'}
                  {activeTab === 'billing' && 'Facturación'}
                  {currentUser?.role === 'PSYCHOLOGIST' && (
                    <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-lg border border-indigo-200 uppercase tracking-wide font-sans">
                      Modo Personal
                    </span>
                  )}
                </h1>
                <p className="text-slate-500 mt-1">
                  {activeTab === 'insights' && 'Vista general de tu progreso'}
                  {activeTab === 'feedback' && 'Comentarios y recomendaciones de tu psicólogo'}
                  {activeTab === 'sessions' && 'Gestiona tus citas con el psicólogo'}
                  {activeTab === 'calendar' && 'Visualiza tus entradas y actividades'}
                  {activeTab === 'billing' && 'Consulta y descarga tus facturas'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleStartSession()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/30"
                >
                  <Mic size={18} />
                  Grabar entrada
                </button>
              </div>
            </header>

            {/* Mobile Action Button */}
            <div className="md:hidden fixed bottom-6 right-6 z-50">
              <button
                onClick={() => handleStartSession()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all"
              >
                <Mic size={24} />
              </button>
            </div>

            {activeTab === 'insights' && assignedGoals.length > 0 && (
              <div className="bg-purple-50 rounded-2xl border border-purple-100 p-1">
                <div className="px-4 py-3 flex items-center gap-2 border-b border-purple-100/50">
                  <CheckSquare className="text-purple-600" size={18} />
                  <h3 className="font-bold text-purple-800 text-sm uppercase tracking-wide">Plan</h3>
                </div>
                <div className="p-2">
                  <GoalsPanel 
                    title="" goals={assignedGoals} onAddGoal={() => {}} onToggleGoal={handleToggleGoal} onDeleteGoal={() => {}} 
                    readOnly={true} showAdd={false}
                  />
                </div>
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="space-y-6 animate-in fade-in">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Entradas</div>
                    <div className="text-2xl font-bold text-slate-800 mt-2">{totalEntriesCount}</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Ánimo medio</div>
                    <div className="text-2xl font-bold text-slate-800 mt-2">
                      {averageSentiment !== null ? averageSentiment.toFixed(1) : '—'}
                      {averageSentiment !== null && <span className="text-sm text-slate-400 ml-1">/10</span>}
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Sesiones</div>
                    <div className="text-2xl font-bold text-slate-800 mt-2">{totalSessionsCount}</div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Feedback pendiente</div>
                    <div className="text-2xl font-bold text-slate-800 mt-2">{unreadFeedbackCount}</div>
                  </div>
                </div>
                {!hasTodayEntry && (
                  <button
                    onClick={() => handleStartSession()}
                    className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-semibold text-sm md:text-base shadow-md hover:bg-indigo-700 transition-colors"
                  >
                    ¿Qué tal estás hoy?
                  </button>
                )}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm">
                  <GoalsPanel goals={personalGoals} onAddGoal={handleAddGoal} onToggleGoal={handleToggleGoal} onDeleteGoal={handleDeleteGoal} />
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
                      <Calendar size={16} className="text-indigo-500" /> Última entrada del diario
                    </h3>
                    {latestDiaryEntry && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        {new Date(latestDiaryEntry.timestamp).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {latestDiaryEntry ? (
                    <div className="space-y-3">
                      <div className="text-xs text-slate-500">
                        {new Date(latestDiaryEntry.timestamp).toLocaleString()}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">
                        {latestDiaryEntry.summary}
                      </p>
                      {latestDiaryEntry.emotions?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {latestDiaryEntry.emotions.slice(0, 6).map(em => (
                            <span key={em} className="text-[10px] px-2 py-0.5 bg-slate-50 text-slate-600 rounded-full border border-slate-200 font-semibold">
                              {em}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">Aún no hay entradas de diario.</div>
                  )}
                </div>

                {latestSessionEntry && (
                  <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <Stethoscope size={16} className="text-purple-500" /> Última sesión clínica
                      </h3>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        {new Date(latestSessionEntry.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="text-xs text-slate-500">
                        {new Date(latestSessionEntry.timestamp).toLocaleString()}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">
                        {latestSessionEntry.summary}
                      </p>
                      <button
                        onClick={() => { setSelectedDate(latestSessionEntry.date); setSelectedEntryId(latestSessionEntry.id); setSelectedEntryMode('single'); }}
                        className="text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-full hover:bg-purple-100 transition-colors w-fit"
                      >
                        Ver detalle
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-slate-100 p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <LayoutDashboard size={18} className="text-indigo-500" /> Resumen personal
                      </h2>
                      <p className="text-xs text-slate-500">Tu evolución y recomendaciones</p>
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">Últimos 14 días</span>
                  </div>
                  <InsightsPanel entries={entries} />
                </div>

                <button onClick={handleGenerateReport} className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl shadow-md hover:shadow-lg transition-all font-semibold flex items-center justify-center gap-2">
                  <BookOpen size={20} /> Ver Reporte Semanal
                </button>

              </div>
            )}

            {activeTab === 'feedback' && (
              <div className="animate-in fade-in">
                <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-3">Feedback</h3>
                  {feedbackEntries.length === 0 ? (
                    <p className="text-sm text-slate-500">Aún no hay feedback.</p>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto">
                      {feedbackEntries.map(entry => {
                        const feedbackText = getFeedbackText(entry) || (entry.psychologistEntryType === 'FEEDBACK' ? 'Feedback del especialista.' : '');
                        const timeLabel = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        const hasDiaryRef = entry.transcript && entry.transcript.trim().length > 0;
                        const isUnread = isFeedbackUnread(entry);
                        return (
                          <div key={entry.id} className="p-3 rounded-xl border border-indigo-100 bg-indigo-50/40">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                    Feedback
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
                                className="text-[11px] font-semibold text-indigo-700 bg-white border border-indigo-100 px-2 py-0.5 rounded-full hover:bg-indigo-50"
                              >
                                Ver detalle
                              </button>
                            </div>
                            {hasDiaryRef && (
                              <div className="text-[10px] text-slate-500 mb-2">Referencia: entrada de diario</div>
                            )}
                            <p className="text-sm text-slate-800 leading-relaxed">{feedbackText}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                        const sessionFeedbackText = typeof entry.psychologistFeedback === 'string'
                          ? entry.psychologistFeedback
                          : entry.psychologistFeedback?.text || '';
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

            {/* Vista de Sesiones */}
            {activeTab === 'sessions' && (
              <div className="animate-in fade-in">
                <PatientSessions />
              </div>
            )}

            {/* Vista de Calendario */}
            {activeTab === 'calendar' && (
              <div className="animate-in fade-in">
                <CalendarView
                  entries={entries}
                  selectedDate={selectedDate}
                  onDateSelect={(date) => { setSelectedDate(date); setSelectedEntryMode('day'); }}
                />
              </div>
            )}

            {/* Vista de Facturación */}
            {activeTab === 'billing' && (
              <div className="animate-in fade-in">
                <PatientBillingPanel />
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
        />
      )}
      {weeklyReport && <WeeklyReportModal report={weeklyReport} onClose={() => setWeeklyReport(null)} />}
      {showSettings && currentUser && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
    </div>
  );
};

export default App;