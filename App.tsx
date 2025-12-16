import React, { useState, useEffect } from 'react';
import { ViewState, JournalEntry, Goal, UserSettings, WeeklyReport, User } from './types';
import * as StorageService from './services/storageService';
import * as AuthService from './services/authService';
import { analyzeJournalEntry, analyzeGoalsProgress, generateWeeklyReport } from './services/genaiService';
import VoiceSession from './components/VoiceSession';
import CalendarView from './components/CalendarView';
import InsightsPanel from './components/InsightsPanel';
import GoalsPanel from './components/GoalsPanel';
import EntryModal from './components/EntryModal';
import WeeklyReportModal from './components/WeeklyReportModal';
import SettingsModal from './components/SettingsModal';
import PatientDashboard from './components/PatientDashboard';
import AuthScreen from './components/AuthScreen';
import SuperAdmin from './components/SuperAdmin';
import { Mic, LayoutDashboard, Target, BookOpen, User as UserIcon, Stethoscope, ArrowLeftRight, CheckSquare, Loader2 } from 'lucide-react';

// Custom Dygo Logo Component
const DygoLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [viewState, setViewState] = useState<ViewState>(ViewState.AUTH);
  
  const [psychViewMode, setPsychViewMode] = useState<'DASHBOARD' | 'PERSONAL'>('DASHBOARD');

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [settings, setSettings] = useState<UserSettings>({ 
    notificationsEnabled: false, 
    notificationTime: '20:00',
    language: 'es-ES',
    voice: 'Kore' 
  });
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'insights' | 'goals'>('insights');
  const [showSettings, setShowSettings] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);

  useEffect(() => {
    const init = async () => {
        setIsLoadingData(true);
        await AuthService.initializeDemoData();
        const user = await AuthService.getCurrentUser();
        if (user) {
            setCurrentUser(user);
            await loadUserData(user.id);
            await checkInvitations(user.email);
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

  const checkInvitations = async (email: string) => {
      const invites = await StorageService.getPendingInvitationsForEmail(email);
      setHasPendingInvites(invites.length > 0);
  };

  const handleAuthSuccess = async () => {
      const user = await AuthService.getCurrentUser();
      if (user) {
          setCurrentUser(user);
          await loadUserData(user.id);
          await checkInvitations(user.email);
          setViewState(user.role === 'PSYCHOLOGIST' ? ViewState.PATIENTS : ViewState.CALENDAR);
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
  };

  useEffect(() => {
    if (!settings.notificationsEnabled || !currentUser) return;
    const checkTime = () => {
      const now = new Date();
      const currentHm = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      if (currentHm === settings.notificationTime && now.getSeconds() < 10) {
        if (Notification.permission === 'granted') {
           new Notification("dygo", { body: "Es momento de conectar contigo. ¿Qué tal tu día?" });
        }
      }
    };
    const interval = setInterval(checkTime, 10000);
    return () => clearInterval(interval);
  }, [settings, currentUser]);

  useEffect(() => {
      if (!currentUser) return;
      const interval = setInterval(() => {
          checkInvitations(currentUser.email);
      }, 5000);
      return () => clearInterval(interval);
  }, [currentUser]);

  const handleStartSession = () => {
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
      
      const [newEntry, updatedGoals] = await Promise.all([
        analyzeJournalEntry(transcript, today, currentUser.id),
        analyzeGoalsProgress(transcript, goals.filter(g => !g.completed))
      ]);
      
      await StorageService.saveEntry(newEntry);
      
      const updatedEntries = await StorageService.getEntriesForUser(currentUser.id);
      setEntries(updatedEntries);

      const finalGoals = goals.map(g => {
        const updated = updatedGoals.find(ug => ug.id === g.id);
        return updated ? updated : g;
      });
      setGoals(finalGoals);
      await StorageService.saveUserGoals(currentUser.id, finalGoals);
      
      setSelectedDate(today);
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
    const updated = [...goals, newGoal];
    setGoals(updated);
    await StorageService.saveUserGoals(currentUser.id, updated);
  };

  const handleToggleGoal = async (id: string) => {
    if (!currentUser) return;
    const updated = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
    setGoals(updated);
    await StorageService.saveUserGoals(currentUser.id, updated);
  };

  const handleDeleteGoal = async (id: string) => {
    if (!currentUser) return;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    await StorageService.saveUserGoals(currentUser.id, updated);
  };

  const handleDeleteEntry = async (id: string) => {
    if (!currentUser) return;
    await StorageService.deleteEntry(id);
    const updated = await StorageService.getEntriesForUser(currentUser.id);
    setEntries(updated);
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
    setSettings(newSettings);
    await StorageService.saveSettings(currentUser.id, newSettings);
  };

const safeEntries = Array.isArray(entries) ? entries : [];

const dayEntries = selectedDate
  ? safeEntries.filter(e => e.date === selectedDate)
  : [];

const safeGoals = Array.isArray(goals) ? goals : [];

const assignedGoals = safeGoals.filter(
  g => g.createdBy === 'PSYCHOLOGIST'
);

const personalGoals = safeGoals.filter(
  g => g.createdBy !== 'PSYCHOLOGIST'
);

  
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
              <div className="ml-2"><ProfileCircle onClick={() => setShowSettings(true)} /></div>
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
          <div className="min-h-screen bg-white text-slate-900 pb-20 md:pb-0 relative">
               <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
                    <header className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="w-full md:w-auto flex items-center justify-between md:justify-start">
                             <div className="flex-1">
                                 <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                                    <DygoLogo className="w-10 h-10 text-indigo-600" />
                                    <span className="font-dygo">dygo</span>
                                    <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-lg border border-purple-200 uppercase tracking-wide font-sans mt-1 flex items-center gap-1">
                                        <Stethoscope size={12} /> <span className="hidden sm:inline">Psicólogo</span>
                                    </span>
                                 </h1>
                                 <p className="text-slate-500 ml-14">Dr/a. {currentUser.name}</p>
                             </div>
                             <div className="md:hidden"><ProfileCircle onClick={() => setShowSettings(true)} /></div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto flex-wrap justify-center items-center">
                            <button 
                                onClick={() => setPsychViewMode('PERSONAL')}
                                className="w-full md:w-auto px-5 py-3 md:py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-full shadow-sm text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-indigo-100"
                            >
                                <UserIcon size={18} /> <span>Mi Diario Personal</span>
                            </button>
                            <div className="hidden md:block"><ProfileCircle onClick={() => setShowSettings(true)} /></div>
                            {/* Superadmin access */}
                            {currentUser && String(currentUser.email).toLowerCase() === 'garryjavi@gmail.com' && (
                                <button onClick={() => setViewState(ViewState.SUPERADMIN)} className="px-4 py-2 bg-amber-50 text-amber-800 rounded-full text-sm ml-2">Superadmin</button>
                            )}
                        </div>
                    </header>

                    <PatientDashboard />

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
      {isProcessing && (
        <div className="fixed inset-0 bg-white/80 z-[60] flex flex-col items-center justify-center backdrop-blur-sm">
           <div className="w-16 h-16 relative flex items-center justify-center mb-4">
              <DygoLogo className="w-16 h-16 text-indigo-600 animate-pulse" />
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full animate-ping opacity-20"></div>
           </div>
           <h2 className="text-xl font-semibold text-indigo-900">Procesando...</h2>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="w-full md:w-auto flex items-center justify-between md:justify-start">
             <div className="flex-1">
                 <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                    <DygoLogo className="w-10 h-10 text-indigo-600" />
                    <span className="font-dygo">dygo</span>
                    {currentUser?.role === 'PSYCHOLOGIST' && <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-lg border border-indigo-200 uppercase tracking-wide font-sans mt-1">Modo Personal</span>}
                 </h1>
                 <p className="text-slate-500 ml-14">Hola, {currentUser?.name}</p>
             </div>
             <div className="md:hidden"><ProfileCircle onClick={() => setShowSettings(true)} /></div>
          </div>
          <div className="flex gap-3 w-full md:w-auto flex-wrap justify-center items-center">
             {currentUser?.role === 'PSYCHOLOGIST' && (
                <button onClick={() => setPsychViewMode('DASHBOARD')} className="px-4 py-3 md:py-2 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-full shadow-sm text-sm font-medium transition-colors flex items-center gap-2 border border-purple-200 flex-1 md:flex-none justify-center">
                    <ArrowLeftRight size={16} /> <span>Volver a Pacientes</span>
                </button>
             )}
            <button onClick={handleStartSession} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-medium flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/30 flex-1 md:flex-none">
               <Mic size={20} /> <span className="hidden md:inline">Grabar entrada</span><span className="md:hidden">Grabar</span>
            </button>
             <div className="hidden md:block"><ProfileCircle onClick={() => setShowSettings(true)} /></div>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-8">
               <CalendarView entries={entries} onSelectDate={setSelectedDate} />
               {assignedGoals.length > 0 && (
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
            </div>
            <div className="md:col-span-1 flex flex-col gap-6">
               <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex overflow-x-auto">
                  <button onClick={() => setActiveTab('insights')} className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'insights' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
                    <LayoutDashboard size={16} /> Resumen
                  </button>
                  <button onClick={() => setActiveTab('goals')} className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'goals' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Target size={16} /> Metas
                  </button>
               </div>
               {activeTab === 'insights' ? (
                 <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <InsightsPanel entries={entries} />
                    <button onClick={handleGenerateReport} className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-2xl shadow-md hover:shadow-lg transition-all font-semibold flex items-center justify-center gap-2">
                      <BookOpen size={20} /> Ver Reporte Semanal
                    </button>
                 </div>
               ) : (
                 <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <GoalsPanel goals={personalGoals} onAddGoal={handleAddGoal} onToggleGoal={handleToggleGoal} onDeleteGoal={handleDeleteGoal} />
                 </div>
               )}
            </div>
        </div>
      </div>

      {viewState === ViewState.VOICE_SESSION && <VoiceSession key={Date.now()} onSessionEnd={handleSessionEnd} onCancel={() => setViewState(ViewState.CALENDAR)} settings={settings} />}
      {selectedDate && <EntryModal entries={dayEntries} dateStr={selectedDate} onClose={() => setSelectedDate(null)} onStartSession={handleStartSession} onDeleteEntry={handleDeleteEntry} onUpdateEntry={handleUpdateEntry} />}
      {weeklyReport && <WeeklyReportModal report={weeklyReport} onClose={() => setWeeklyReport(null)} />}
      {showSettings && currentUser && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => { setShowSettings(false); if(currentUser) checkInvitations(currentUser.email); }} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />}
    </div>
  );
};

export default App;