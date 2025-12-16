import React, { useState } from 'react';
import { UserRole } from '../types';
import * as AuthService from '../services/authService';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (isLogin) {
        AuthService.login(email, password);
      } else {
        if (!name || !email || !password) {
            setError("Todos los campos son obligatorios");
            return;
        }
        AuthService.register(name, email, password, role);
      }
      onAuthSuccess();
    } catch (err: any) {
      setError(err.message || "Error de autenticación");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="bg-indigo-600 p-8 text-center flex flex-col items-center">
            <div className="mb-4">
                <DygoLogoAuth />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight mb-1 font-dygo">dygo</h1>
            <p className="text-indigo-200 text-sm">Tu espacio de crecimiento personal</p>
        </div>

        {/* Form */}
        <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">
                {isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
            </h2>

            {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                    <div className="relative">
                        <User className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                        <input 
                            type="text" 
                            placeholder="Nombre completo"
                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                )}
                
                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                    <input 
                        type="email" 
                        placeholder="Correo electrónico"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-slate-400 w-5 h-5" />
                    <input 
                        type="password" 
                        placeholder="Contraseña"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 mt-4"
                >
                    {isLogin ? 'Entrar en dygo' : 'Unirse a dygo'} <ArrowRight size={18} />
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