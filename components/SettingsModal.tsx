import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, Invitation, User } from '../types';
import { getPendingInvitationsForEmail, acceptInvitation, rejectInvitation, getPsychologistsForPatient, revokeAccess, getAllPsychologists, linkPatientToPsychologist, getSentInvitationsForPsychologist, getPatientsForPsychologist } from '../services/storageService';
import { getCurrentUser, updateUser } from '../services/authService';
import { X, Clock, Shield, UserCheck, Trash2, LogOut, Globe, Mic, Camera, Search, UserPlus } from 'lucide-react';
import * as AuthService from '../services/authService';

interface SettingsModalProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
  onLogout?: () => void;
  onUserUpdate?: (user: User) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose, onLogout, onUserUpdate }) => {
  const [enabled, setEnabled] = useState(settings.notificationsEnabled);
  const [time, setTime] = useState(settings.notificationTime);
  const [language, setLanguage] = useState(settings.language || 'es-ES');
  const [voice, setVoice] = useState(settings.voice || 'Kore');
  const [activeTab, setActiveTab] = useState<'general' | 'privacy'>('general');
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Invitation[]>([]);
  const [myPsychologists, setMyPsychologists] = useState<User[]>([]);
  const [myPatients, setMyPatients] = useState<any[]>([]);
  const [showPsychSearch, setShowPsychSearch] = useState(false);
  const [psychSearchTerm, setPsychSearchTerm] = useState('');
  const [allPsychologists, setAllPsychologists] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const voices = [
      { id: 'Kore', name: 'Kore (Femenina)' }, { id: 'Puck', name: 'Puck (Masculina)' },
      { id: 'Charon', name: 'Charon (Profunda)' }, { id: 'Fenrir', name: 'Fenrir (Rápida)' }, { id: 'Aoede', name: 'Aoede (Expresiva)' }
  ];
  const languages = [ { id: 'es-ES', name: 'Español (España)' }, { id: 'en-US', name: 'Inglés' }, { id: 'fr-FR', name: 'Francés' } ];

  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
    const [premiumUrl, setPremiumUrl] = useState<string | null>(null);
    const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
        const u = await getCurrentUser();
        setCurrentUser(u);
        if (!u) return;

        if (u.role === 'PATIENT') {
            setInvitations(await getPendingInvitationsForEmail(u.email));
            setMyPsychologists(await getPsychologistsForPatient(u.id));
        } else if (u.role === 'PSYCHOLOGIST') {
            // For psychologists, load patients and sent invitations
            setSentInvitations(await getSentInvitationsForPsychologist(u.id));
            setMyPatients(await getPatientsForPsychologist(u.id));
        }
    };
    load();
    // If user returns from Checkout (hosted Checkout), refresh current user to pick updated premium status
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'success') {
        (async () => {
            const refreshed = await getCurrentUser();
            setCurrentUser(refreshed);
            // Remove query param to avoid repeated refreshes
            try { const url = new URL(window.location.href); url.searchParams.delete('session'); window.history.replaceState({}, '', url.toString()); } catch(e) {}
        })();
    }
  }, []);

  const handleSave = () => {
    const newSettings: UserSettings = { notificationsEnabled: enabled, notificationTime: time, language, voice };
    if (enabled && Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
            onSave({ ...newSettings, notificationsEnabled: permission === 'granted' });
            onClose();
        });
    } else {
        onSave(newSettings);
        onClose();
    }
  };

  const handleLogoutClick = () => {
      if(window.confirm('¿Cerrar sesión?')) {
          onLogout ? onLogout() : window.location.reload();
          onClose();
      }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentUser) return;
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64 = reader.result as string;
          const updatedUser = { ...currentUser, avatarUrl: base64 };
          try {
              await updateUser(updatedUser);
              setCurrentUser(updatedUser);
              if (onUserUpdate) onUserUpdate(updatedUser);
          } catch (err:any) {
              console.error('Error updating avatar', err);
              alert(err?.message || 'Error guardando avatar. Comprueba la conexión con el servidor.');
          }
      };
      reader.readAsDataURL(file);
  };

  const handleAcceptInv = async (invId: string) => {
      if (!currentUser) return;
      try {
          await acceptInvitation(invId, currentUser.id);
          setInvitations(prev => prev.filter(i => i.id !== invId));
          setMyPsychologists(await getPsychologistsForPatient(currentUser.id));
      } catch (err:any) {
          console.error('Error accepting invitation', err);
          alert(err?.message || 'Error aceptando invitación. Comprueba la conexión con el servidor.');
      }
  };

  const handleRejectInv = async (invId: string) => {
      try {
          await rejectInvitation(invId);
          setInvitations(prev => prev.filter(i => i.id !== invId));
      } catch (err:any) {
          console.error('Error rejecting invitation', err);
          alert(err?.message || 'Error rechazando invitación. Comprueba la conexión con el servidor.');
      }
  };  

  const handleRevoke = async (psychId: string) => {
      if (!currentUser) return;
      if (!window.confirm('¿Revocar acceso?')) return;
      try {
          await revokeAccess(currentUser.id, psychId);
          setMyPsychologists(prev => prev.filter(u => u.id !== psychId));
      } catch (err:any) {
          console.error('Error revoking access', err);
          alert(err?.message || 'Error revocando acceso. Comprueba la conexión con el servidor.');
          try { setMyPsychologists(await getPsychologistsForPatient(currentUser.id)); } catch(e){}
      }
  }; 

  const togglePsychSearch = async () => {
      if (!showPsychSearch) {
          setAllPsychologists(await getAllPsychologists());
          setPsychSearchTerm('');
      }
      setShowPsychSearch(!showPsychSearch);
  };

  const handleConnectPsych = async (psychId: string) => {
      if (!currentUser) return;
      // Defensive: check if already connected
      if (myPsychologists.some(mp => mp.id === psychId)) {
          alert('Ya tienes a este especialista conectado.');
          return;
      }
      try {
          await linkPatientToPsychologist(currentUser.id, psychId);
          setMyPsychologists(await getPsychologistsForPatient(currentUser.id));
          setInvitations(prev => prev.filter(i => i.fromPsychologistId !== psychId));
          alert("Conexión establecida.");
      } catch (err:any) {
          console.error('Error connecting to psychologist', err);
          alert(err?.message || 'Error conectando con el especialista. Comprueba la conexión con el servidor.');
      }
  };

  const availablePsychs = allPsychologists.filter(p => {
      const isConnected = myPsychologists.some(mp => mp.id === p.id);
      const isSelf = p.id === currentUser?.id;
      const matches = p.name.toLowerCase().includes(psychSearchTerm.toLowerCase()) || p.email.toLowerCase().includes(psychSearchTerm.toLowerCase());
      return !isConnected && !isSelf && matches;
  });

  return (
    <div className="fixed top-0 left-0 w-screen h-[100dvh] bg-slate-900/50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
             <h2 className="text-xl font-bold text-slate-800">Perfil y Ajustes</h2>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        {/* Show tabs for all roles (Patient and Psychologist) */}
        <div className="flex border-b border-slate-100 shrink-0">
            <button onClick={() => setActiveTab('general')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'general' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>General</button>
            <button onClick={() => setActiveTab('privacy')} className={`flex-1 py-3 text-sm font-medium ${activeTab === 'privacy' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}>Privacidad</button>
        </div>
        <div className="p-6 overflow-y-auto">
            {activeTab === 'general' ? (
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden shadow-sm">
                                    {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-3xl">{currentUser?.name?.charAt(0).toUpperCase()}</div>}
                                </div>
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="text-white w-6 h-6" /></div>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-slate-800 truncate">{currentUser?.name}</h3>
                                <p className="text-sm text-slate-500 truncate">{currentUser?.email}</p>
                                <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/70 border border-slate-200 px-3 py-1 text-xs text-slate-600">
                                    <Shield size={12} /> Acceso gestionado por Google
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase text-slate-400">Configuración de IA</h3>
                        <div className="grid gap-3">
                            <div className="space-y-2">
                                <label className="block text-sm text-slate-700 flex items-center gap-2"><Globe size={16} /> Idioma</label>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl">{languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm text-slate-700 flex items-center gap-2"><Mic size={16} /> Voz</label>
                                <select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl">{voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-2">
                        <h3 className="text-xs font-bold uppercase text-slate-400">Notificaciones</h3>
                        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
                            <div>
                                <div className="font-medium text-slate-700">Recordatorio diario</div>
                                <div className="text-xs text-slate-500">Recibe un aviso para escribir tu diario.</div>
                            </div>
                            <button onClick={() => setEnabled(!enabled)} className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${enabled ? 'left-7' : 'left-1'}`}></div></button>
                        </div>
                        {enabled && <div className="space-y-2"><label className="block text-sm text-slate-500 flex items-center gap-2"><Clock size={14} /> Hora</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" /></div>}
                    </div>

                    <div className="pt-4 border-t border-slate-100 space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-100">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Shield size={18} /></div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-800">Seguridad de la cuenta</h4>
                                    <p className="text-xs text-slate-500">El acceso está vinculado a Google. La gestión de contraseña se realiza desde tu cuenta de Google.</p>
                                </div>
                            </div>
                        </div>

                        {/* PREMIUM CARD */}
                        <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white p-5 shadow-sm">
                            <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-white/10" />
                            <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                            <div className="relative z-10">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-base font-semibold">DYGO Premium</h4>
                                            <span className="text-xs px-2 py-0.5 bg-white/15 rounded-full">€9,99 / mes</span>
                                        </div>
                                        <p className="mt-1 text-xs text-indigo-100">Potencia tu crecimiento con análisis avanzados y reportes automáticos.</p>
                                    </div>
                                    <div className="text-xs">
                                        {currentUser?.isPremium || (currentUser?.premiumUntil && Number(currentUser.premiumUntil) > Date.now()) ? (
                                            <span className="px-2 py-1 bg-white/20 text-white rounded-full">Activo</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-white/10 text-white/90 rounded-full">No activo</span>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-2 text-xs text-indigo-100">
                                    <div className="flex items-center gap-2"><UserCheck size={14} className="text-white" /> Análisis de entradas por voz con IA</div>
                                    <div className="flex items-center gap-2"><UserCheck size={14} className="text-white" /> Reporte semanal automático</div>
                                    <div className="flex items-center gap-2"><UserCheck size={14} className="text-white" /> Acceso prioritario a nuevas funciones</div>
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    {!(currentUser?.isPremium || (currentUser?.premiumUntil && Number(currentUser.premiumUntil) > Date.now())) ? (
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button onClick={async () => {
                                                setPremiumLoading(true);
                                                setPremiumError('');
                                                setPremiumUrl(null);
                                                try {
                                                    const resp = await AuthService.createCheckoutSession();
                                                    if (resp?.url) {
                                                        setPremiumUrl(resp.url);
                                                        const w = window.open(resp.url, '_blank', 'noopener,noreferrer');
                                                        if (!w) {
                                                            setPremiumError('El navegador bloqueó la nueva pestaña. Usa el enlace que aparece abajo.');
                                                        } else {
                                                            setPremiumError('Se abrió Stripe en otra pestaña. Vuelve y pulsa "Actualizar" para refrescar tu estado.');
                                                        }
                                                    }
                                                } catch (err:any) {
                                                    console.error(err);
                                                    setPremiumError(err?.message || 'Error al iniciar pago');
                                                } finally { setPremiumLoading(false); }
                                            }} className={`flex-1 py-2.5 rounded-xl font-medium text-indigo-700 bg-white hover:bg-indigo-50 ${premiumLoading ? 'opacity-70 cursor-not-allowed' : ''}`} disabled={premiumLoading}>
                                                {premiumLoading ? 'Redirigiendo…' : 'Activar Premium'}
                                            </button>
                                            <button onClick={async () => { const refreshed = await getCurrentUser(); setCurrentUser(refreshed || null); }} className="px-3 py-2.5 rounded-xl border border-white/40 text-white hover:bg-white/10">Actualizar</button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <button onClick={async () => {
                                                setPremiumLoading(true);
                                                setPremiumError('');
                                                setPortalUrl(null);
                                                try {
                                                    const resp = await AuthService.createBillingPortalSession();
                                                    if (resp?.url) {
                                                        setPortalUrl(resp.url);
                                                        const w = window.open(resp.url, '_blank', 'noopener,noreferrer');
                                                        if (!w) setPremiumError('El navegador bloqueó la nueva pestaña para el portal. Usa el enlace que aparece abajo.');
                                                    }
                                                } catch (err:any) {
                                                    setPremiumError(err?.message || 'Error abriendo portal');
                                                } finally { setPremiumLoading(false); }
                                            }} className="flex-1 py-2.5 rounded-xl bg-white text-indigo-700 hover:bg-indigo-50">Administrar suscripción</button>
                                            <button onClick={async () => { const refreshed = await getCurrentUser(); setCurrentUser(refreshed || null); }} className="px-3 py-2.5 rounded-xl border border-white/40 text-white hover:bg-white/10">Actualizar</button>
                                        </div>
                                    )}

                                    {currentUser?.premiumUntil && (
                                        <div className="text-xs text-indigo-100">Válido hasta: {new Date(Number(currentUser.premiumUntil)).toLocaleDateString()}</div>
                                    )}
                                </div>

                                {premiumError && <div className="mt-3 p-2 rounded-lg text-xs bg-white/15 text-white">{premiumError}</div>}
                                {premiumUrl && <div className="mt-2 text-xs"><a className="text-white underline" href={premiumUrl} target="_blank" rel="noopener noreferrer">Si la pestaña no se abrió, haz clic aquí para completar el pago</a></div>}
                                {portalUrl && <div className="mt-2 text-xs"><a className="text-white underline" href={portalUrl} target="_blank" rel="noopener noreferrer">Abrir el portal de facturación</a></div>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <button onClick={handleSave} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">Guardar Cambios</button>
                            <button onClick={handleLogoutClick} className="w-full py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium flex items-center justify-center gap-2"><LogOut size={16} /> Cerrar Sesión</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                     <div className="bg-indigo-50 p-4 rounded-xl text-sm text-indigo-800 border border-indigo-100"><p className="flex items-start gap-2"><Shield className="w-4 h-4 mt-0.5 shrink-0" /> Gestiona tus conexiones.</p></div>
                     {!showPsychSearch && <button onClick={togglePsychSearch} className="w-full py-2.5 bg-white border border-indigo-200 text-indigo-700 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-indigo-50"><Search size={16} /> Buscar Especialista</button>}
                     {showPsychSearch && (
                         <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                             <div className="flex justify-between items-center mb-1"><h4 className="text-sm font-bold text-slate-700">Directorio</h4><button onClick={togglePsychSearch} className="text-slate-400 hover:text-slate-600"><X size={16} /></button></div>
                             <input type="text" placeholder="Buscar..." value={psychSearchTerm} onChange={(e) => setPsychSearchTerm(e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg" />
                             <div className="max-h-40 overflow-y-auto space-y-2 mt-2">{availablePsychs.length === 0 ? <p className="text-xs text-slate-400 text-center py-2 italic">Sin resultados.</p> : availablePsychs.map(psych => {
                                     const isConnected = myPsychologists.some(mp => mp.id === psych.id);
                                     const isSelf = psych.id === currentUser?.id;
                                     return (
                                         <div key={psych.id} className="bg-white p-2 rounded-lg border flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-slate-800">{psych.name}</span>
                                                <span className="text-xs text-slate-400">{psych.email}</span>
                                            </div>
                                            {isConnected || isSelf ? (
                                                <button disabled className="bg-slate-200 text-slate-400 p-1 rounded opacity-70 cursor-not-allowed">{isConnected ? 'Conectado' : 'Tú'}</button>
                                            ) : (
                                                <button onClick={() => handleConnectPsych(psych.id)} className="bg-indigo-600 text-white p-1 rounded" aria-label={`Conectar con ${psych.name}`}><UserPlus size={14}/></button>
                                            )}
                                         </div>
                                     );
                                 })}</div>
                         </div>
                     )}
                     {currentUser?.role === 'PATIENT' ? (
                         <>
                           {invitations.length > 0 && <div><h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Pendientes</h3><div className="space-y-2">{invitations.map(inv => (<div key={inv.id} className="bg-white border p-3 rounded-lg"><p className="text-sm mb-2">{inv.fromPsychologistName}</p><div className="flex gap-2"><button onClick={() => handleAcceptInv(inv.id)} className="flex-1 bg-indigo-600 text-white text-xs py-1 rounded">Aceptar</button><button onClick={() => handleRejectInv(inv.id)} className="flex-1 bg-slate-100 text-slate-600 text-xs py-1 rounded">Rechazar</button></div></div>))}</div></div>}
                           <div><h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Con Acceso</h3>{myPsychologists.length === 0 ? <p className="text-sm text-slate-400 italic">Nadie tiene acceso.</p> : <div className="space-y-2">{myPsychologists.map(psych => (<div key={psych.id} className="flex justify-between p-3 bg-slate-50 rounded-lg border"><div className="flex items-center gap-3"><UserCheck size={16} className="text-green-500" /><div className="flex flex-col"><span className="text-sm font-medium text-slate-800">{psych.name}</span><span className="text-xs text-slate-400">{psych.email}</span></div></div><button onClick={() => handleRevoke(psych.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div>))}</div>}</div>
                         </>
                     ) : (
                         <>
                             {sentInvitations.length > 0 && (
                                 <div>
                                     <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Solicitudes Enviadas</h3>
                                     <div className="space-y-2">
                                         {sentInvitations.map(inv => (
                                             <div key={inv.id} className="bg-white border p-3 rounded-lg flex items-center justify-between">
                                                 <div>
                                                     <p className="text-sm font-medium">{inv.toUserEmail}</p>
                                                     <p className="text-xs text-slate-400">{new Date(inv.timestamp).toLocaleString()}</p>
                                                 </div>
                                                 <span className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded">{inv.status}</span>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             )}

                             <div>
                                 <h3 className="text-xs font-bold uppercase text-slate-400 mb-3">Pacientes</h3>
                                 {myPatients.length === 0 ? <p className="text-sm text-slate-400 italic">No tienes pacientes asignados.</p> : <div className="space-y-2">{myPatients.map((p:any) => (<div key={p.id} className="flex justify-between p-3 bg-slate-50 rounded-lg border"><div className="flex items-center gap-3"><UserCheck size={16} className="text-green-500" /><div className="flex flex-col"><span className="text-sm font-medium text-slate-800">{p.name}</span><span className="text-xs text-slate-400">{p.email}</span></div></div><button onClick={async () => { if(confirm('¿Revocar acceso a este paciente?')) { await revokeAccess(p.id, currentUser!.id); setMyPatients(await getPatientsForPsychologist(currentUser!.id)); } }} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div>))}</div>}
                             </div>
                         </>
                     )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;