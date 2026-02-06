import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, User } from '../types';
import { getCurrentUser, updateUser, uploadAvatar } from '../services/authService';
import { X, Clock, Shield, LogOut, Globe, Mic, Camera, UserCheck } from 'lucide-react';
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

  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState('');
    const [premiumUrl, setPremiumUrl] = useState<string | null>(null);
    const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
        const u = await getCurrentUser();
        setCurrentUser(u);
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
    const newSettings: UserSettings = { notificationsEnabled: enabled, feedbackNotificationsEnabled: feedbackEnabled, notificationTime: time, language, voice, allowPsychologistAccess };
    if ((enabled || feedbackEnabled) && Notification.permission !== 'granted') {
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
        <div className="p-6 overflow-y-auto">
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

                        <div className="space-y-2">
                            <button onClick={handleSave} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium">Guardar Cambios</button>
                            <button onClick={handleLogoutClick} className="w-full py-3 text-red-500 hover:bg-red-50 rounded-xl font-medium flex items-center justify-center gap-2"><LogOut size={16} /> Cerrar Sesión</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default SettingsModal;