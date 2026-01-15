import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import * as AuthService from '../services/authService';
import { Mail, Lock, User, ArrowRight, Loader2, Server, WifiOff, CheckCircle } from 'lucide-react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../services/config';
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
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');



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

    // If we detect a Supabase OAuth redirect with code or access_token, extract it and send to backend
    const handleSupabaseCallback = async () => {
        try {
            if (!supabaseClient) return;
            const url = new URL(window.location.href);
            const hash = window.location.hash || '';
            const hasCode = url.searchParams.get('code');
            const hasSupabaseAuth = url.searchParams.get('supabase_auth');
            const hasHashToken = hash.includes('access_token=');

            if (!hasCode && !hasSupabaseAuth && !hasHashToken) return;

            let accessToken: string | null = null;

            if (hasCode) {
                const { data, error } = await supabaseClient.auth.exchangeCodeForSession(window.location.href);
                if (error) throw error;
                accessToken = data?.session?.access_token || null;
            } else if (hasHashToken) {
                const params = new URLSearchParams(hash.replace('#', '?'));
                accessToken = params.get('access_token');
            }

            if (!accessToken) return;

            setIsLoading(true);
            // Use AuthService helper to exchange token and get/create local user
            try {
                await AuthService.signInWithSupabase(accessToken);
            } catch (err:any) {
                throw err;
            }
            // Clean up URL (remove hash and auth params)
            url.searchParams.delete('code');
            url.searchParams.delete('supabase_auth');
            history.replaceState(null, '', url.pathname + url.search);
            onAuthSuccess();
        } catch (err: any) {
            setError(err?.message || 'Error con Supabase Sign-In');
        } finally {
            setIsLoading(false);
        }
    };

    // Run the callback handler on mount
    handleSupabaseCallback();

  }, []);

    const handleSupabaseGoogle = async () => {
        try {
            setIsLoading(true);
            const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: `${window.location.origin}/?supabase_auth=1` }
            });
            if (error) throw error;
            if (data?.url) window.location.href = data.url;
        } catch (err: any) {
            setError(err?.message || 'Error iniciando OAuth');
        } finally {
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
                Inicia sesión con Google
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
                                        {/* Supabase OAuth button (Google) */}
                                        {SUPABASE_URL && SUPABASE_ANON_KEY && (
                                            <div className="mb-2 flex justify-center">
                                                <button
                                                    onClick={handleSupabaseGoogle}
                                                    disabled={isLoading}
                                                    className="w-full max-w-xs bg-white text-slate-700 rounded-xl px-4 py-3 shadow-sm hover:shadow-md flex items-center justify-center gap-3 border border-slate-200 disabled:opacity-60"
                                                >
                                                    <svg className="w-5 h-5" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                                        <path fill="#EA4335" d="M24 9.5c3.09 0 5.84 1.19 7.99 3.15l5.95-5.95C34.5 3.6 29.6 1.5 24 1.5 14.64 1.5 6.54 6.8 2.74 14.4l6.94 5.39C11.46 13.4 17.2 9.5 24 9.5z"/>
                                                        <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.21-.43-4.74H24v9.02h12.62c-.54 2.92-2.19 5.4-4.66 7.08l7.19 5.55C43.53 37.7 46.5 31.6 46.5 24.5z"/>
                                                        <path fill="#FBBC05" d="M9.68 28.79a14.96 14.96 0 0 1-.78-4.79c0-1.66.29-3.26.78-4.79l-6.94-5.39A23.97 23.97 0 0 0 0 24c0 3.86.93 7.51 2.74 10.58l6.94-5.79z"/>
                                                        <path fill="#34A853" d="M24 46.5c5.6 0 10.5-1.85 14.0-5.02l-7.19-5.55c-2.0 1.35-4.55 2.14-6.81 2.14-6.8 0-12.54-3.9-15.32-9.57l-6.94 5.79C6.54 41.2 14.64 46.5 24 46.5z"/>
                                                    </svg>
                                                    <span className="text-sm font-medium">Continuar con Google</span>
                                                </button>
                                            </div>
                                        )}

                                        {!SUPABASE_URL || !SUPABASE_ANON_KEY ? (
                                            <p className="text-xs text-red-600 text-center">Falta configurar Supabase en el frontend.</p>
                                        ) : null}