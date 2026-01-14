import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import * as AuthService from '../services/authService';
import { Mail, Lock, User, ArrowRight, Loader2, Server, WifiOff, CheckCircle } from 'lucide-react';
import { GOOGLE_CLIENT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/config';
import { API_URL } from '../services/config';
import { createClient } from '@supabase/supabase-js';

// Custom Dygo Logo Component for Auth
const DygoLogoAuth: React.FC = () => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 text-white">
    {/* Continuous stroke 'd' / delta design */}
    <path 
        d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" 
        stroke="currentColor" 
        strokeWidth="10" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
    />
  </svg>
);

interface AuthScreenProps {
  onAuthSuccess: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('PATIENT');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // Forgot password demo UI
  const [showForgotDemo, setShowForgotDemo] = useState(false);
  const [forgotEmailInput, setForgotEmailInput] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotSecret, setForgotSecret] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle'|'success'|'error'>('idle');
  const [forgotMsg, setForgotMsg] = useState('');



  // Check server health on mount
  useEffect(() => {
    const checkServer = async () => {
        try {
            // Simple ping to users endpoint to check connectivity
            const res = await fetch(`${API_URL}/users`, { method: 'HEAD' });
            setServerStatus('online');
        } catch (e) {
            console.warn("Server check failed:", e);
            setServerStatus('offline');
        }
    };
    checkServer();



    // Initialize Supabase client if configured and handle redirect callback
    const supabaseClient = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

    // If we detect a Supabase OAuth redirect with an access_token in the hash, extract it and send to backend
    const handleSupabaseCallback = async () => {
        try {
            const hash = window.location.hash || '';
            if (!hash) return;
            // Supabase returns tokens in the hash fragment: e.g. #access_token=...
            const params = new URLSearchParams(hash.replace('#', '?'));
            const accessToken = params.get('access_token');
            if (!accessToken) return;

            setIsLoading(true);
            // Use AuthService helper to exchange token and get/create local user
            try {
                await AuthService.signInWithSupabase(accessToken);
            } catch (err:any) {
                throw err;
            }
            // Clean up URL (remove hash)
            history.replaceState(null, '', window.location.pathname + window.location.search);
            onAuthSuccess();
        } catch (err: any) {
            setError(err?.message || 'Error con Supabase Sign-In');
        } finally {
            setIsLoading(false);
        }
    };

    // Run the callback handler on mount
    handleSupabaseCallback();

    // If older Google flow is still desired, keep GIS conditional rendering
    const googleClient = (window as any)._dygo_google_client_initialized;
    const clientId = GOOGLE_CLIENT_ID || null;
    if (!googleClient && clientId) {
        // Load the GIS script dynamically
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
            const google = (window as any).google;
            if (!google) return;
            google.accounts.id.initialize({
                client_id: clientId,
                callback: async (response: any) => {
                    // response.credential is the ID token
                    try {
                        setIsLoading(true);
                        await AuthService.signInWithGoogle(response.credential);
                        onAuthSuccess();
                    } catch (err: any) {
                        setError(err?.message || 'Error con Google Sign-In');
                    } finally {
                        setIsLoading(false);
                    }
                }
            });
            // Render a button into the container
            google.accounts.id.renderButton(document.getElementById('gsi-button'), { theme: 'outline', size: 'large' });
            (window as any)._dygo_google_client_initialized = true;
        };
        document.head.appendChild(script);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await AuthService.login(email, password);
      } else {
        if (!name || !email || !password) {
            throw new Error("Todos los campos son obligatorios");
        }
        await AuthService.register(name, email, password, role);
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || "Error de autenticación");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4 relative">
      
      {/* Server Status Indicator (Helpful for debugging) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-white/80 backdrop-blur rounded-full text-xs font-medium shadow-sm border border-slate-100">
          {serverStatus === 'checking' && <><Loader2 size={12} className="animate-spin text-slate-400"/> <span className="text-slate-500">Buscando servidor...</span></>}
          {serverStatus === 'online' && <><CheckCircle size={12} className="text-green-500"/> <span className="text-green-700">Servidor Conectado</span></>}
          {serverStatus === 'offline' && <><WifiOff size={12} className="text-red-500"/> <span className="text-red-600">Servidor Desconectado</span></>}
      </div>

      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-center flex flex-col items-center relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                 <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white rounded-full blur-3xl"></div>
                 <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-indigo-300 rounded-full blur-2xl"></div>
            </div>

            <div className="mb-4 relative z-10">
                <DygoLogoAuth />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-1 font-dygo relative z-10">dygo</h1>
            <p className="text-indigo-200 text-sm relative z-10">Tu espacio de crecimiento personal</p>
        </div>

        {/* Form */}
        <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">
                {isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
            </h2>

            {serverStatus === 'offline' && (
                <div className="mb-6 p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200 flex items-start gap-2">
                    <Server size={16} className="shrink-0 mt-0.5" />
                    <div>
                        <strong>Aviso:</strong> El servidor backend no responde. 
                        Asegúrate de tener una terminal abierta con el comando <code>node server.js</code>.
                    </div>
                </div>
            )}

            {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 animate-in fade-in slide-in-from-top-1">
                    {error}
                </div>
            )}

            {/* Supabase OAuth button (preferred) */}
            {SUPABASE_URL && SUPABASE_ANON_KEY && (
                <div className="mb-4 flex justify-center">
                    <button onClick={async () => {
                        try {
                            setIsLoading(true);
                            const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                            const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/?supabase_auth=1` } });
                            if (error) throw error;
                            // Some flows return a URL to redirect to
                            if (data?.url) window.location.href = data.url;
                        } catch (err: any) {
                            setError(err?.message || 'Error iniciando OAuth');
                        } finally {
                            setIsLoading(false);
                        }
                    }} className="w-full max-w-xs bg-white text-slate-700 rounded-xl px-4 py-3 shadow-sm hover:shadow-md flex items-center justify-center gap-3">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M7.5 12a4.5 4.5 0 0 1 9 0" stroke="#064e3b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span className="text-sm font-medium">Iniciar con Google (Supabase)</span>
                    </button>
                </div>
            )}

            {/* Google Sign-In (renders if VITE_GOOGLE_CLIENT_ID is set) */}
            {GOOGLE_CLIENT_ID && (
                <div className="mb-4 flex justify-center">
                    <div id="gsi-button" />
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

                {/* Forgot password (demo) toggle */}
                {isLogin && (
                    <div className="text-right mt-2 mb-2">
                        <button onClick={() => { setShowForgotDemo(!showForgotDemo); setForgotStatus('idle'); setForgotMsg(''); }} className="text-sm text-indigo-600 hover:underline">¿Olvidaste tu contraseña?</button>
                    </div>
                )}

                {/* Forgot Password Demo Form */}
                {showForgotDemo && (
                    <div className="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-sm text-amber-800 mb-2">Introduce tu correo y una nueva contraseña para restablecerla (demo).</p>
                        <div className="flex flex-col gap-2">
                            <input type="email" placeholder="Correo electrónico" value={forgotEmailInput} onChange={(e) => setForgotEmailInput(e.target.value)} className="w-full px-3 py-2 rounded border bg-white text-sm" />
                            <input type="password" placeholder="Nueva contraseña" value={forgotNewPassword} onChange={(e) => setForgotNewPassword(e.target.value)} className="w-full px-3 py-2 rounded border bg-white text-sm" />
                            <input type="password" placeholder="Confirmar nueva contraseña" value={forgotConfirmPassword} onChange={(e) => setForgotConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded border bg-white text-sm" />
                            {process.env.NODE_ENV === 'production' && (
                                <input type="password" placeholder="Secreto (producción)" value={forgotSecret} onChange={(e) => setForgotSecret(e.target.value)} className="w-full px-3 py-2 rounded border bg-white text-sm" />
                            )}
                            <div className="flex gap-2 items-center">
                                <button type="button" onClick={async () => {
                                    setForgotStatus('idle'); setForgotMsg('');
                                    if (!forgotEmailInput || !forgotNewPassword || !forgotConfirmPassword) { setForgotStatus('error'); setForgotMsg('Rellena todos los campos.'); return; }
                                    if (forgotNewPassword.length < 6) { setForgotStatus('error'); setForgotMsg('La contraseña debe tener al menos 6 caracteres.'); return; }
                                    if (forgotNewPassword !== forgotConfirmPassword) { setForgotStatus('error'); setForgotMsg('Las contraseñas no coinciden.'); return; }
                                    try {
                                        await AuthService.resetPasswordDemo(forgotEmailInput, forgotNewPassword, forgotSecret || undefined);
                                        setForgotStatus('success'); setForgotMsg('Contraseña restablecida. Ahora puedes iniciar sesión.');
                                        setShowForgotDemo(false);
                                        setEmail(forgotEmailInput); setPassword(forgotNewPassword);
                                    } catch (err: any) {
                                        setForgotStatus('error'); setForgotMsg(err?.message || 'Error restableciendo contraseña');
                                    }
                                }} className="px-4 py-2 rounded bg-amber-600 text-white text-sm">Restablecer</button>
                                <div className={`text-sm ${forgotStatus === 'success' ? 'text-green-700' : 'text-red-700'}`}>{forgotMsg}</div>
                            </div>
                        </div>
                    </div>
                )}

                {!isLogin && (
                    <div className="relative">
                        <User className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                        <input 
                            type="text" 
                            placeholder="Nombre completo"
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                )}
                
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                    <input 
                        type="email" 
                        placeholder="Correo electrónico"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                    />
                </div>

                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                    <input 
                        type="password" 
                        placeholder="Contraseña"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 transition-all"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                    />
                </div>





                {!isLogin && (
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setRole('PATIENT')}
                            className={`py-2 text-sm font-medium rounded-lg transition-all ${role === 'PATIENT' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}
                        >
                            Soy Persona
                        </button>
                        <button
                            type="button"
                            onClick={() => setRole('PSYCHOLOGIST')}
                            className={`py-2 text-sm font-medium rounded-lg transition-all ${role === 'PSYCHOLOGIST' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-500'}`}
                        >
                            Soy Psicólogo
                        </button>
                    </div>
                )}

                <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 mt-4"
                >
                    {isLoading ? (
                        <><Loader2 className="animate-spin" size={20} /> Procesando...</>
                    ) : (
                        <>{isLogin ? 'Entrar en dygo' : 'Unirse a dygo'} <ArrowRight size={18} /></>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <p className="text-slate-500 text-sm">
                    {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
                    <button 
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="ml-2 text-indigo-600 font-semibold hover:underline"
                    >
                        {isLogin ? 'Regístrate' : 'Inicia Sesión'}
                    </button>
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;