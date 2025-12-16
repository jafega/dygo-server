import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, Invitation, User } from '../types';
import { getPendingInvitationsForEmail, acceptInvitation, rejectInvitation, getPsychologistsForPatient, revokeAccess, getAllPsychologists, linkPatientToPsychologist, getSentInvitationsForPsychologist, getPatientsForPsychologist } from '../services/storageService';
import { getCurrentUser, updateUser } from '../services/authService';
import { X, Bell, Clock, Shield, UserCheck, Trash2, LogOut, Globe, Mic, Camera, Search, UserPlus, Eye, EyeOff } from 'lucide-react';
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

  // Password change state
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changePasswordStatus, setChangePasswordStatus] = useState<'idle'|'success'|'error'>('idle');
  const [changePasswordMsg, setChangePasswordMsg] = useState('');

  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
    const [premiumUrl, setPremiumUrl] = useState<string | null>(null);
    const [portalUrl, setPortalUrl] = useState<string | null>(null);

  // UX states for password inputs
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const computeStrength = (pw: string) => {
    let score = 0;
    if (!pw) return { score: 0, color: 'bg-transparent', label: 'Introduce una contraseña' };
    if (pw.length >= 8) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    let color = 'bg-red-400';
    let label = 'Muy débil';
    if (score <= 1) { color = 'bg-red-400'; label = 'Muy débil'; }
    else if (score === 2) { color = 'bg-orange-400'; label = 'Débil'; }
    else if (score === 3) { color = 'bg-yellow-400'; label = 'Fuerte'; }
    else { color = 'bg-green-400'; label = 'Muy fuerte'; }
    return { score, color, label };
  };

  const { score: strengthScore, color: strengthColor, label: strengthLabel } = computeStrength(newPasswordInput);

  const canSubmit = () => {
    if (isChangingPassword) return false;
    if (newPasswordInput.length < 8) return false;
    if (newPasswordInput !== confirmPasswordInput) return false;
    if (currentUser?.password && !currentPasswordInput) return false;
    return true;
  };

  const handleChangePassword = async () => {
    setChangePasswordStatus('idle');
    setChangePasswordMsg('');
    setIsChangingPassword(true);
    try {
      await AuthService.changePassword(currentPasswordInput, newPasswordInput);
      setChangePasswordStatus('success');
      setChangePasswordMsg('Contraseña actualizada.');
      setCurrentPasswordInput(''); setNewPasswordInput(''); setConfirmPasswordInput('');
      // auto-hide success
      setTimeout(() => { setChangePasswordStatus('idle'); setChangePasswordMsg(''); }, 3000);
    } catch (err: any) {
      setChangePasswordStatus('error');
      setChangePasswordMsg(err?.message || 'Error actualizando contraseña.');
    } finally {
      setIsChangingPassword(false);
    }
  };

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
          await updateUser(updatedUser);
          setCurrentUser(updatedUser);
          if (onUserUpdate) onUserUpdate(updatedUser);
      };
      reader.readAsDataURL(file);
  };

  const handleAcceptInv = async (invId: string) => {
      if (currentUser) {
          await acceptInvitation(invId, currentUser.id);
          setInvitations(prev => prev.filter(i => i.id !== invId));
          setMyPsychologists(await getPsychologistsForPatient(currentUser.id));
      }
  };

  const handleRejectInv = async (invId: string) => {
      await rejectInvitation(invId);
      setInvitations(prev => prev.filter(i => i.id !== invId));
  };

  const handleRevoke = async (psychId: string) => {
      if (currentUser && window.confirm('¿Revocar acceso?')) {
          await revokeAccess(currentUser.id, psychId);
          setMyPsychologists(prev => prev.filter(u => u.id !== psychId));
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
      await linkPatientToPsychologist(currentUser.id, psychId);
      setMyPsychologists(await getPsychologistsForPatient(currentUser.id));
      setInvitations(prev => prev.filter(i => i.fromPsychologistId !== psychId));
      alert("Conexión establecida.");
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
                    <div className="flex flex-col items-center">
                        <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                            <div className="w-24 h-24 rounded-full border-4 border-indigo-50 overflow-hidden shadow-sm">
                                {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-4xl">{currentUser?.name.charAt(0).toUpperCase()}</div>}
                            </div>
                            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="text-white w-8 h-8" /></div>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                        </div>
                        <h3 className="mt-3 text-lg font-bold text-slate-800">{currentUser?.name}</h3>
                        <p className="text-sm text-slate-500">{currentUser?.email}</p>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold uppercase text-slate-400">Configuración de IA</h3>
                        <div className="space-y-2"><label className="block text-sm text-slate-700 flex items-center gap-2"><Globe size={16} /> Idioma</label><select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl">{languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                        <div className="space-y-2"><label className="block text-sm text-slate-700 flex items-center gap-2"><Mic size={16} /> Voz</label><select value={voice} onChange={(e) => setVoice(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl">{voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                    </div>
                    <div className="space-y-4 pt-2">
                        <h3 className="text-xs font-bold uppercase text-slate-400">Notificaciones</h3>
                        <div className="flex items-center justify-between"><label className="font-medium text-slate-700">Recordatorio diario</label><button onClick={() => setEnabled(!enabled)} className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}><div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${enabled ? 'left-7' : 'left-1'}`}></div></button></div>
                        {enabled && <div className="space-y-2"><label className="block text-sm text-slate-500 flex items-center gap-2"><Clock size={14} /> Hora</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" /></div>}
                    </div>
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                        <div className="bg-white p-4 rounded-xl border">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="text-sm font-bold">Cambiar contraseña</h4>
                                    <p className="text-xs text-slate-500">Introduce tu contraseña actual y la nueva.</p>
                                </div>
                            </div>

                            <div className="mt-3 space-y-3">
                                <div className="grid grid-cols-1 gap-3">
                                    {/* Current password */}
                                    <div className="relative">
                                        <input
                                            type={showCurrent ? 'text' : 'password'}
                                            placeholder="Contraseña actual"
                                            value={currentPasswordInput}
                                            onChange={(e) => setCurrentPasswordInput(e.target.value)}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm pr-10"
                                            aria-label="Contraseña actual"
                                        />
                                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowCurrent(!showCurrent)} aria-label="Mostrar contraseña actual">
                                            {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>

                                    {/* New password */}
                                    <div className="relative">
                                        <input
                                            type={showNew ? 'text' : 'password'}
                                            placeholder="Nueva contraseña"
                                            value={newPasswordInput}
                                            onChange={(e) => setNewPasswordInput(e.target.value)}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm pr-10"
                                            aria-label="Nueva contraseña"
                                        />
                                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowNew(!showNew)} aria-label="Mostrar nueva contraseña">
                                            {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>

                                        {/* Strength meter */}
                                        <div className="mt-2">
                                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div className={`${strengthColor} h-2 rounded-full`} style={{ width: `${(strengthScore / 4) * 100}%` }} />
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">{strengthLabel}</p>
                                        </div>
                                    </div>

                                    {/* Confirm new password */}
                                    <div className="relative">
                                        <input
                                            type={showConfirm ? 'text' : 'password'}
                                            placeholder="Confirmar nueva"
                                            value={confirmPasswordInput}
                                            onChange={(e) => setConfirmPasswordInput(e.target.value)}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm pr-10"
                                            aria-label="Confirmar nueva contraseña"
                                        />
                                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowConfirm(!showConfirm)} aria-label="Mostrar confirmar contraseña">
                                            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>

                                    {/* Feedback message */}
                                    {changePasswordStatus !== 'idle' && (
                                        <div className={`mt-1 p-2 rounded text-sm ${changePasswordStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{changePasswordMsg}</div>
                                    )}

                                    {/* Submit button */}
                                    <div>
                                        <button
                                            onClick={handleChangePassword}
                                            disabled={!canSubmit() || isChangingPassword}
                                            className={`w-full py-3 rounded-xl font-medium text-white ${!canSubmit() || isChangingPassword ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                        >
                                            {isChangingPassword ? <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</span> : 'Cambiar contraseña'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PREMIUM CARD */}
                        <div className="bg-white p-4 rounded-xl border">
                            <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h4 className="text-sm font-bold">DYGO Premium</h4>
                                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">$4.99 / mes</span>
                                        </div>
                                        <p className="text-xs text-slate-500">Suscripción mensual. Obtén acceso a funciones premium como análisis de entradas por voz y generación de reporte semanal. (En este demo la suscripción sólo marca tu cuenta como premium).</p>
                                        <ul className="mt-2 text-xs text-slate-500 list-disc ml-4">
                                            <li>Análisis de entradas por voz con IA</li>
                                            <li>Generación de reporte semanal</li>
                                            <li>Acceso prioritario a nuevas funciones</li>
                                        </ul>
                                    </div>
                                <div className="text-sm">
                                    {currentUser?.isPremium || (currentUser?.premiumUntil && Number(currentUser.premiumUntil) > Date.now()) ? (
                                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs">Activo</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs">No activo</span>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    {!(currentUser?.isPremium || (currentUser?.premiumUntil && Number(currentUser.premiumUntil) > Date.now())) ? (
                                        <div className="flex gap-2">
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
                                                          setPremiumError('Se abrió Stripe en una nueva pestaña. Vuelve y pulsa "Actualizar" para refrescar tu estado.');
                                                      }
                                                  }
                                              } catch (err:any) {
                                                  console.error(err);
                                                  setPremiumError(err?.message || 'Error al iniciar pago');
                                              } finally { setPremiumLoading(false); }
                                          }} className={`flex-1 py-3 rounded-xl font-medium text-white ${premiumLoading ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`} disabled={premiumLoading}>
                                              {premiumLoading ? 'Redirigiendo...' : 'Activar Premium'}
                                          </button>
                                          <button onClick={async () => { const refreshed = await getCurrentUser(); setCurrentUser(refreshed || null); }} className="px-3 py-2 rounded-xl bg-white border">Actualizar</button>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex gap-2">
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
                                            }} className="flex-1 py-3 rounded-xl bg-white border hover:bg-slate-50">Administrar suscripción</button>
                                            <button onClick={async () => { const refreshed = await getCurrentUser(); setCurrentUser(refreshed || null); }} className="px-3 py-2 rounded-xl border">Actualizar</button>
                                            <div className="text-xs text-slate-500 mt-2">Válido hasta: {currentUser?.premiumUntil ? new Date(Number(currentUser.premiumUntil)).toLocaleDateString() : '—'}</div>
                                        </div>
                                    )}
                                </div>

                                {premiumError && <div className="mt-1 p-2 rounded text-sm bg-red-50 text-red-800">{premiumError}</div>}
                                {premiumUrl && <div className="mt-2 text-sm"><a className="text-indigo-600 underline" href={premiumUrl} target="_blank" rel="noopener noreferrer">Si la pestaña no se abrió, haz clic aquí para completar el pago</a></div>}
                                {portalUrl && <div className="mt-2 text-sm"><a className="text-indigo-600 underline" href={portalUrl} target="_blank" rel="noopener noreferrer">Abrir el portal de facturación</a></div>}
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