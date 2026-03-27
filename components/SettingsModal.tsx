import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, User } from '../types';
import { getCurrentUser, updateUser, uploadAvatar, apiFetch } from '../services/authService';
import { X, Clock, Shield, LogOut, Globe, Mic, Camera, UserCheck, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import * as AuthService from '../services/authService';
import { API_URL } from '../services/config';

interface SettingsModalProps {
  settings: UserSettings;
  onSave: (settings: UserSettings) => void;
  onClose: () => void;
  onLogout?: () => void;
  onUserUpdate?: (user: User) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose, onLogout, onUserUpdate }) => {
  const [enabled, setEnabled] = useState(settings.notificationsEnabled);
    const [feedbackEnabled, setFeedbackEnabled] = useState(settings.feedbackNotificationsEnabled ?? true);
  const [time, setTime] = useState(settings.notificationTime);
  const [language, setLanguage] = useState(settings.language || 'es-ES');
  const [voice, setVoice] = useState(settings.voice || 'Kore');
  const [allowPsychologistAccess, setAllowPsychologistAccess] = useState(settings.allowPsychologistAccess ?? true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const voices = [
      { id: 'Kore', name: 'Kore (Femenina)' }, { id: 'Puck', name: 'Puck (Masculina)' },
      { id: 'Charon', name: 'Charon (Profunda)' }, { id: 'Fenrir', name: 'Fenrir (Rápida)' }, { id: 'Aoede', name: 'Aoede (Expresiva)' }
  ];
  const languages = [ { id: 'es-ES', name: 'Español (España)' }, { id: 'en-US', name: 'Inglés' }, { id: 'fr-FR', name: 'Francés' } ];

  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleCalendarMsg, setGoogleCalendarMsg] = useState('');

  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
    const [premiumUrl, setPremiumUrl] = useState<string | null>(null);
    const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    is_subscribed: boolean;
    trial_active: boolean;
    trial_days_left: number;
    stripe_status: string | null;
    monthly_price_eur: string;
    access_blocked: boolean;
    cancel_at_period_end?: boolean;
    current_period_end?: number | null;
    trial_expiry_date?: number | null;
    is_master?: boolean;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
        const u = await getCurrentUser();
        setCurrentUser(u);
        if (u?.is_psychologist && u.id) {
          try {
            // Sync with Stripe first to get latest status, then fetch local record
            await apiFetch(`${API_URL}/stripe/sync-subscription`, {
              method: 'POST',
              headers: AuthService.getAuthHeaders()
            }).catch(() => {});
            const res = await apiFetch(`${API_URL}/subscription?psychologist_user_id=${u.id}`, {
              headers: AuthService.getAuthHeaders()
            });
            if (res.ok) setSubscriptionInfo(await res.json());
          } catch (_) {}
        }
    };
    load();
    // Listen for stripe sync completion (triggered by App.tsx) to refresh subscription info
    const handleStripeSynced = () => { load(); };
    window.addEventListener('mainds:stripe-synced', handleStripeSynced);
    return () => window.removeEventListener('mainds:stripe-synced', handleStripeSynced);
  }, []);

  useEffect(() => {
    const checkGoogleCalendar = async () => {
      const u = await getCurrentUser();
      if (!u?.is_psychologist || !u.id) return;
      try {
        const res = await apiFetch(`${API_URL}/google/status?userId=${u.id}`);
        if (res.ok) {
          const data = await res.json();
          setGoogleCalendarConnected(data.connected);
        }
      } catch (_) {}
      // Check for callback result in URL
      const params = new URLSearchParams(window.location.search);
      const gcResult = params.get('google_calendar');
      if (gcResult === 'success') {
        setGoogleCalendarConnected(true);
        setGoogleCalendarMsg('¡Google Calendar conectado correctamente!');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (gcResult === 'error') {
        setGoogleCalendarMsg('Error al conectar Google Calendar. Inténtalo de nuevo.');
        window.history.replaceState({}, '', window.location.pathname);
      }
    };
    checkGoogleCalendar();
  }, []);

  const handleConnectGoogleCalendar = async () => {
    const u = await getCurrentUser();
    if (!u?.id) return;
    setGoogleCalendarLoading(true);
    setGoogleCalendarMsg('');
    try {
      const emailParam = u.email ? `&email=${encodeURIComponent(u.email)}` : '';
      const res = await apiFetch(`${API_URL}/google/auth-url?userId=${u.id}${emailParam}`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        setGoogleCalendarMsg('No se pudo iniciar la conexión. Inténtalo más tarde.');
      }
    } catch (_) {
      setGoogleCalendarMsg('Error de conexión con el servidor.');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!window.confirm('¿Desconectar Google Calendar? Las sesiones futuras no se sincronizarán.')) return;
    const u = await getCurrentUser();
    if (!u?.id) return;
    setGoogleCalendarLoading(true);
    setGoogleCalendarMsg('');
    try {
      const res = await apiFetch(`${API_URL}/google/disconnect?userId=${u.id}`, { method: 'DELETE' });
      if (res.ok) {
        setGoogleCalendarConnected(false);
        setGoogleCalendarMsg('Google Calendar desconectado.');
      }
    } catch (_) {
      setGoogleCalendarMsg('Error al desconectar.');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  const handleSave = () => {
    const newSettings: UserSettings = { notificationsEnabled: enabled, feedbackNotificationsEnabled: feedbackEnabled, notificationTime: time, language, voice, allowPsychologistAccess };
    
    // Verificar que Notification API esté disponible (no siempre en iOS)
    if ((enabled || feedbackEnabled) && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        Notification.requestPermission().then(permission => {
            const granted = permission === 'granted';
            onSave({
                ...newSettings,
                notificationsEnabled: enabled && granted,
                feedbackNotificationsEnabled: feedbackEnabled && granted
            });
            onClose();
        });
    } else {
        // Si Notification no está disponible, guardar sin notificaciones
        onSave({
            ...newSettings,
            notificationsEnabled: typeof Notification !== 'undefined' && enabled,
            feedbackNotificationsEnabled: typeof Notification !== 'undefined' && feedbackEnabled
        });
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
          try {
              // Subir avatar y obtener URL (puede ser Supabase Storage o base64)
              const avatarUrl = await uploadAvatar(currentUser.id, base64);
              
              // Actualizar usuario con la nueva URL
              const updatedUser = { ...currentUser, avatarUrl };
              await updateUser(updatedUser);
              
              // Actualizar estado local
              setCurrentUser(updatedUser);
              if (onUserUpdate) onUserUpdate(updatedUser);
          } catch (err:any) {
              console.error('Error updating avatar', err);
              alert(err?.message || 'Error guardando avatar. Comprueba la conexión con el servidor.');
          }
      };
      reader.readAsDataURL(file);
  };

  return (
    <div className="fixed top-0 left-0 w-screen h-[100dvh] bg-slate-900/50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
             <h2 className="text-xl font-bold text-slate-800">Ajustes</h2>
             <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="flex-1 p-6 overflow-y-auto">{/* Scroll container */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4">
                        <div className="flex items-center gap-4">
                            <div className="relative group cursor-pointer" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
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
                        <div className={`rounded-2xl border ${enabled ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-white'} p-5 transition-colors`}
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-800 text-base">Recordatorio diario</div>
                                    <div className="text-sm text-slate-500 mt-1">Te avisaremos para mantener tu rutina de bienestar.</div>
                                </div>
                                <button 
                                    onClick={() => setEnabled(!enabled)} 
                                    className={`shrink-0 w-14 h-7 rounded-full transition-all relative ${enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                    aria-label="Toggle recordatorio diario"
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all shadow-sm ${enabled ? 'left-8' : 'left-1'}`}></div>
                                </button>
                            </div>
                            {enabled && (
                                <div className="mt-5 grid gap-2">
                                    <label className="text-sm text-slate-600 flex items-center gap-2 font-medium"><Clock size={16} /> Hora del recordatorio</label>
                                    <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-4 text-base bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none" />
                                    <div className="text-xs text-slate-400 mt-1">Puedes cambiarla cuando quieras.</div>
                                </div>
                            )}
                        </div>
                        {!currentUser?.is_psychologist && (
                            <div className={`rounded-2xl border ${feedbackEnabled ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-white'} p-5 transition-colors`}
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-slate-800 text-base">Feedback del psicólogo</div>
                                        <div className="text-sm text-slate-500 mt-1">Te avisaremos cuando tengas nuevo feedback.</div>
                                    </div>
                                    <button 
                                        onClick={() => setFeedbackEnabled(!feedbackEnabled)} 
                                        className={`shrink-0 w-14 h-7 rounded-full transition-all relative ${feedbackEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                        aria-label="Toggle feedback del psicólogo"
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all shadow-sm ${feedbackEnabled ? 'left-8' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        )}
                        {!currentUser?.is_psychologist && (
                            <div className={`rounded-2xl border ${allowPsychologistAccess ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-100 bg-white'} p-5 transition-colors`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold text-slate-800 text-base">Acceso del psicólogo</div>
                                        <div className="text-sm text-slate-500 mt-1">Permite que tu psicólogo vea tus entradas de diario.</div>
                                    </div>
                                    <button 
                                        onClick={() => setAllowPsychologistAccess(!allowPsychologistAccess)} 
                                        className={`shrink-0 w-14 h-7 rounded-full transition-all relative ${allowPsychologistAccess ? 'bg-indigo-500' : 'bg-slate-300'}`}
                                        aria-label="Toggle acceso del psicólogo"
                                    >
                                        <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all shadow-sm ${allowPsychologistAccess ? 'left-8' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        )}
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

                        {/* PLAN / BILLING CARD */}
                        {(() => {
                            // Determine card state
                            const isMaster = subscriptionInfo?.is_master === true;
                            const isActive = subscriptionInfo?.is_subscribed && !subscriptionInfo?.cancel_at_period_end;
                            const isCancelPending = subscriptionInfo?.cancel_at_period_end && subscriptionInfo?.current_period_end && (subscriptionInfo.current_period_end * 1000) > Date.now();
                            const isCancelled = !subscriptionInfo?.is_subscribed && !subscriptionInfo?.trial_active && !isMaster;
                            const isTrial = subscriptionInfo?.trial_active && !subscriptionInfo?.is_subscribed && !isMaster;

                            // Card color
                            const cardClass = isMaster
                                ? 'border-green-300 bg-gradient-to-br from-green-600 via-green-600 to-emerald-600'
                                : isActive
                                    ? 'border-green-300 bg-gradient-to-br from-green-600 via-green-600 to-emerald-600'
                                    : isCancelPending
                                        ? 'border-yellow-300 bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500'
                                        : isCancelled
                                            ? 'border-red-300 bg-gradient-to-br from-red-600 via-red-600 to-rose-600'
                                            : 'border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600';

                            return (
                                <div className={`relative overflow-hidden rounded-2xl border text-white p-5 shadow-sm ${cardClass}`}>
                                    <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-white/10" />
                                    <div className="absolute -left-10 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
                                    <div className="relative z-10">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h4 className="text-base font-semibold">mainds — Plan Profesional</h4>
                                                <p className="mt-1 text-xs text-white/80">
                                                    {isMaster
                                                        ? 'Acceso completo sin restricciones.'
                                                        : isActive
                                                            ? 'Acceso ilimitado a pacientes.'
                                                            : isCancelPending
                                                                ? 'Tu suscripción está cancelada. Seguirás teniendo acceso hasta la fecha indicada.'
                                                                : isCancelled
                                                                    ? 'Tu acceso ha expirado. Suscríbete para seguir usando la plataforma.'
                                                                    : `Prueba gratuita de 14 días. Después, €24.99/mes — pacientes ilimitados.`}
                                                </p>
                                            </div>
                                            <div className="text-xs shrink-0">
                                                {isMaster ? (
                                                    <span className="px-2 py-1 bg-white/20 text-white rounded-full font-semibold">user_master</span>
                                                ) : isActive ? (
                                                    <span className="px-2 py-1 bg-white/20 text-white rounded-full font-semibold">Suscripción activa</span>
                                                ) : isCancelPending ? (
                                                    <span className="px-2 py-1 bg-white/20 text-white rounded-full font-semibold">Cancelada</span>
                                                ) : isCancelled ? (
                                                    <span className="px-2 py-1 bg-white/20 text-white rounded-full font-semibold">Sin acceso</span>
                                                ) : (
                                                    <span className="px-2 py-1 bg-white/10 text-white/90 rounded-full">Prueba gratuita</span>
                                                )}
                                            </div>
                                        </div>

                                        {subscriptionInfo && (
                                            <div className="mt-4 bg-white/10 rounded-xl px-4 py-3 text-xs space-y-1">
                                                {isMaster ? (
                                                    <div className="flex justify-between">
                                                        <span className="text-white/80">Estado</span>
                                                        <span className="font-semibold">Acceso permanente</span>
                                                    </div>
                                                ) : isActive && subscriptionInfo.current_period_end ? (
                                                    <>
                                                        <div className="flex justify-between">
                                                            <span className="text-white/80">Fecha de renovación</span>
                                                            <span className="font-semibold">{new Date(subscriptionInfo.current_period_end * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-white/80">Precio mensual</span>
                                                            <span className="font-semibold">€24.99/mes</span>
                                                        </div>
                                                    </>
                                                ) : isCancelPending && subscriptionInfo.current_period_end ? (
                                                    <div className="flex justify-between font-semibold">
                                                        <span className="text-yellow-100">⚠️ Perderás el acceso el</span>
                                                        <span>{new Date(subscriptionInfo.current_period_end * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                                    </div>
                                                ) : isCancelled ? (
                                                    <div className="flex justify-between font-semibold">
                                                        <span className="text-red-100">🚫 Acceso perdido el</span>
                                                        <span>{subscriptionInfo.current_period_end
                                                            ? new Date(subscriptionInfo.current_period_end * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                                                            : subscriptionInfo.trial_expiry_date
                                                                ? new Date(subscriptionInfo.trial_expiry_date * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                                                                : '—'}</span>
                                                    </div>
                                                ) : isTrial ? (
                                                    <>
                                                        <div className="flex justify-between">
                                                            <span className="text-indigo-100">La prueba termina el</span>
                                                            <span className="font-semibold">{subscriptionInfo.trial_expiry_date
                                                                ? new Date(subscriptionInfo.trial_expiry_date * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                                                                : '—'}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-indigo-100">Días restantes</span>
                                                            <span className="font-semibold">{subscriptionInfo.trial_days_left} días</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-indigo-100">Precio después de la prueba</span>
                                                            <span className="font-semibold">€24.99/mes</span>
                                                        </div>
                                                    </>
                                                ) : null}
                                                {subscriptionInfo.access_blocked && !isMaster && (
                                                    <div className="text-yellow-200 font-medium mt-1">⚠️ Acceso bloqueado por pago pendiente</div>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-4 flex flex-col gap-2">
                                            {isMaster ? null : isActive ? (
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
                                                }} disabled={premiumLoading} className="w-full py-2.5 rounded-xl bg-white text-green-700 hover:bg-green-50 font-medium disabled:opacity-60">
                                                    {premiumLoading ? 'Cargando...' : 'Gestionar suscripción'}
                                                </button>
                                            ) : (
                                                <button onClick={async () => {
                                                    setPremiumLoading(true);
                                                    setPremiumError('');
                                                    setPremiumUrl(null);
                                                    try {
                                                        const resp = await AuthService.createCheckoutSession();
                                                        if (resp?.url) {
                                                            setPremiumUrl(resp.url);
                                                            const w = window.open(resp.url, '_blank', 'noopener,noreferrer');
                                                            if (!w) setPremiumError('El navegador bloqueó la nueva pestaña. Usa el enlace que aparece abajo.');
                                                        }
                                                    } catch (err: any) {
                                                        setPremiumError(err?.message || 'Error iniciando el pago');
                                                    } finally { setPremiumLoading(false); }
                                                }} disabled={premiumLoading} className={`py-2.5 rounded-xl font-medium disabled:opacity-60 ${
                                                    isCancelPending ? 'bg-white text-amber-700 hover:bg-amber-50' :
                                                    isCancelled ? 'bg-white text-red-700 hover:bg-red-50' :
                                                    'bg-white text-indigo-700 hover:bg-indigo-50'
                                                }`}>
                                                    {premiumLoading ? 'Cargando...' : 'Suscribirse — €24.99/mes'}
                                                </button>
                                            )}
                                        </div>

                                        {premiumError && <div className="mt-3 p-2 rounded-lg text-xs bg-white/15 text-white">{premiumError}</div>}
                                        {portalUrl && <div className="mt-2 text-xs"><a className="text-white underline" href={portalUrl} target="_blank" rel="noopener noreferrer">Abrir el portal de facturación</a></div>}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* PURGE TOOL — only for specific internal accounts */}
                        {(() => {
                            const ue = (currentUser?.user_email || (currentUser as any)?.data?.email || currentUser?.email || '').toLowerCase();
                            return ['daniel.m.mendezv@gmail.com', 'garryjavi@gmail.com'].includes(ue);
                        })() && (
                            <div className="bg-white border border-red-200 rounded-2xl p-4">
                                <h4 className="text-sm font-bold text-red-700">🗑 Limpiar datos del psicólogo</h4>
                                <p className="text-xs text-slate-500 mt-1">
                                    Elimina todos los pacientes, sesiones y relaciones vinculadas a tu cuenta como psicólogo.<br />
                                    <strong>No se eliminarán</strong> tu propio usuario, garryjavi@gmail.com ni daniel.m.mendezv@gmail.com.
                                </p>
                                {purgeResult && (
                                    <div className={`mt-2 text-xs p-2 rounded-lg ${
                                        purgeResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                    }`}>{purgeResult}</div>
                                )}
                                <button
                                    disabled={purgeLoading}
                                    onClick={async () => {
                                        if (!window.confirm(
                                            '⚠️ ATENCIÓN: Esta acción eliminará permanentemente todos tus pacientes, sesiones, relaciones y datos asociados.\n\nEsta acción NO se puede deshacer.\n\n¿Estás seguro?'
                                        )) return;
                                        if (!window.confirm('Segunda confirmación: ¿Realmente quieres borrar todos estos datos de forma irreversible?')) return;
                                        setPurgeLoading(true);
                                        setPurgeResult(null);
                                        try {
                                            const resp = await apiFetch(`${API_URL}/admin/purge-psychologist-data`, {
                                                method: 'POST',
                                                headers: AuthService.getAuthHeaders()
                                            });
                                            const json = await resp.json();
                                            if (!resp.ok) {
                                                setPurgeResult(`❌ Error: ${json.error || 'Error desconocido'}`);
                                            } else {
                                                const l = json.log || {};
                                                setPurgeResult(`✅ Limpieza completada — Sesiones: ${l.sessions ?? 0}, Pacientes: ${l.users ?? 0}, Relaciones: ${l.care_relationships ?? 0}`);
                                            }
                                        } catch (err: any) {
                                            setPurgeResult(`❌ Error: ${err?.message || 'Error de red'}`);
                                        } finally {
                                            setPurgeLoading(false);
                                        }
                                    }}
                                    className="mt-3 w-full py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-60"
                                >
                                    {purgeLoading ? 'Eliminando...' : 'Eliminar todos mis datos de psicólogo'}
                                </button>
                            </div>
                        )}

                        {!currentUser?.is_psychologist && (
                            <div className="bg-white border border-slate-100 rounded-2xl p-4">
                                <h4 className="text-sm font-bold text-slate-800">¿Eres psicólogo/a?</h4>
                                <p className="text-xs text-slate-500 mt-1">Convierte tu perfil para gestionar pacientes y ver su progreso.</p>
                                <button
                                    onClick={async () => {
                                        if (!currentUser) return;
                                        if (!window.confirm('¿Quieres convertir tu perfil en psicólogo/a?')) return;
                                        try {
                                            const updated = { ...currentUser, is_psychologist: true, isPsychologist: true } as User;
                                            await updateUser(updated);
                                            setCurrentUser(updated);
                                            if (onUserUpdate) onUserUpdate(updated);
                                        } catch (err:any) {
                                            console.error('Error updating to psychologist', err);
                                            alert(err?.message || 'Error actualizando el perfil.');
                                        }
                                    }}
                                    className="mt-3 w-full py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                                >
                                    Convertirme en psicólogo/a
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Footer fijo con botones de acción - Siempre visible */}
            <div className="shrink-0 p-6 border-t border-slate-100 bg-white space-y-2">
                <button onClick={handleSave} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">Guardar Cambios</button>
                <button onClick={handleLogoutClick} className="w-full py-3 text-red-600 hover:bg-red-50 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"><LogOut size={16} /> Cerrar Sesión</button>
            </div>
        </div>
    </div>
  );
};

export default SettingsModal;