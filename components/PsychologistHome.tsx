import React, { useState, useEffect } from 'react';
import { 
  Users, Calendar, FileText, CheckCircle, Circle, ArrowRight, 
  Clock, DollarSign, TrendingUp, UserPlus, CalendarPlus, 
  ClipboardList, Zap
} from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

interface SubscriptionInfo {
  is_subscribed: boolean;
  trial_active: boolean;
  trial_days_left: number;
  stripe_status: string | null;
  access_blocked: boolean;
  is_master?: boolean;
  plan_name?: string;
  active_relations?: number;
  trial_expiry_date?: number | null;
}

interface PsychologistHomeProps {
  psychologistId: string;
  userName: string;
  subscriptionInfo: SubscriptionInfo | null;
  isProfileIncomplete: boolean;
  onNavigate: (view: string) => void;
  onNeedUpgrade: () => void;
}

interface Session {
  id: string;
  patientId: string;
  patientName?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price?: number;
}

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  done: boolean;
  action: () => void;
  actionLabel: string;
}

const ONBOARDING_DISMISS_KEY = 'mainds_onboarding_dismissed';

const PsychologistHome: React.FC<PsychologistHomeProps> = ({
  psychologistId,
  userName,
  subscriptionInfo,
  isProfileIncomplete,
  onNavigate,
  onNeedUpgrade
}) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => 
    localStorage.getItem(ONBOARDING_DISMISS_KEY) === 'true'
  );

  useEffect(() => {
    loadData();
  }, [psychologistId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [sessionsRes, patientsRes, invoicesRes] = await Promise.all([
        apiFetch(`${API_URL}/sessions?psychologistId=${psychologistId}`),
        apiFetch(`${API_URL}/psychologist/${psychologistId}/patients`),
        apiFetch(`${API_URL}/invoices?psychologist_user_id=${psychologistId}`)
      ]);

      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (patientsRes.ok) setPatients(await patientsRes.json());
      if (invoicesRes.ok) setInvoices(await invoicesRes.json());
    } catch (error) {
      console.error('Error loading home data:', error);
    }
    setIsLoading(false);
  };

  // --- Derived data ---
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingSessions = sessions
    .filter(s => new Date(s.date) >= today && s.status === 'scheduled')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const thisMonthSessions = sessions.filter(s => {
    const d = new Date(s.date);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && s.status !== 'available';
  });

  const paidInvoices = invoices.filter((inv: any) => inv.status === 'paid' && !inv.is_rectificativa);
  const pendingInvoices = invoices.filter((inv: any) => (inv.status === 'pending' || inv.status === 'overdue') && !inv.is_rectificativa);
  const totalRevenue = paidInvoices.reduce((sum: number, inv: any) => sum + Math.max(0, inv.total ?? inv.amount ?? 0), 0);
  const totalPending = pendingInvoices.reduce((sum: number, inv: any) => sum + Math.max(0, inv.total ?? inv.amount ?? 0), 0);

  // This month revenue
  const thisMonthRevenue = paidInvoices
    .filter((inv: any) => {
      const d = new Date(inv.invoice_date || inv.date || inv.created_at);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    })
    .reduce((sum: number, inv: any) => sum + Math.max(0, inv.total ?? inv.amount ?? 0), 0);

  const hasAvailability = sessions.some(s => s.status === 'available');

  // --- Onboarding checklist ---
  const onboardingSteps: OnboardingStep[] = [
    {
      id: 'profile',
      label: 'Completa tu perfil profesional',
      description: 'Añade tus datos fiscales, teléfono e IBAN para poder facturar',
      done: !isProfileIncomplete,
      action: () => onNavigate('profile'),
      actionLabel: 'Ir al perfil'
    },
    {
      id: 'patient',
      label: 'Añade tu primer paciente',
      description: 'Registra un paciente para empezar a gestionar tus sesiones',
      done: patients.length > 0,
      action: () => onNavigate('patients'),
      actionLabel: 'Añadir paciente'
    },
    {
      id: 'availability',
      label: 'Configura tu disponibilidad',
      description: 'Define tus horarios de consulta para que los pacientes puedan reservar',
      done: hasAvailability,
      action: () => onNavigate('schedule'),
      actionLabel: 'Ir a la agenda'
    },
    {
      id: 'session',
      label: 'Crea tu primera sesión',
      description: 'Programa una sesión con un paciente',
      done: sessions.some(s => s.status === 'scheduled' || s.status === 'completed'),
      action: () => onNavigate('schedule'),
      actionLabel: 'Crear sesión'
    },
    {
      id: 'invoice',
      label: 'Emite tu primera factura',
      description: 'Genera una factura desde una sesión completada',
      done: invoices.length > 0,
      action: () => onNavigate('billing'),
      actionLabel: 'Facturación'
    }
  ];

  const completedSteps = onboardingSteps.filter(s => s.done).length;
  const allDone = completedSteps === onboardingSteps.length;
  const showOnboarding = !onboardingDismissed && !allDone;
  const progressPercent = Math.round((completedSteps / onboardingSteps.length) * 100);

  const handleDismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_DISMISS_KEY, 'true');
    setOnboardingDismissed(true);
  };

  const firstName = userName?.split(' ')[0] || '';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const formatSessionDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const isToday = d.toDateString() === new Date().toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    if (isToday) return 'Hoy';
    if (isTomorrow) return 'Mañana';
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      {/* Welcome header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-5 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1">{greeting}, {firstName} 👋</h1>
        <p className="text-indigo-100 text-sm sm:text-base">
          {upcomingSessions.length > 0 
            ? `Tienes ${upcomingSessions.length} ${upcomingSessions.length === 1 ? 'sesión programada' : 'sesiones programadas'} próximamente`
            : 'No tienes sesiones programadas próximamente'}
        </p>
        {subscriptionInfo?.trial_active && (
          <div className="mt-3 inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm">
            <Clock size={14} />
            <span>
              Te quedan <span className="font-semibold">{subscriptionInfo.trial_days_left} días</span> de prueba gratuita
            </span>
            <button onClick={onNeedUpgrade} className="ml-2 underline font-semibold hover:text-white/90">
              Ver planes
            </button>
          </div>
        )}
      </div>

      {/* Onboarding Checklist */}
      {showOnboarding && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <ClipboardList className="text-indigo-600" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Primeros pasos</h2>
                <p className="text-sm text-slate-500">Configura tu consulta en pocos minutos</p>
              </div>
            </div>
            <button 
              onClick={handleDismissOnboarding}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Ocultar
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>{completedSteps} de {onboardingSteps.length} completados</span>
              <span className="font-semibold text-indigo-600">{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-700"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {onboardingSteps.map((step) => (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  step.done ? 'bg-green-50' : 'bg-slate-50 hover:bg-indigo-50'
                }`}
              >
                {step.done ? (
                  <CheckCircle className="text-green-500 shrink-0" size={20} />
                ) : (
                  <Circle className="text-slate-300 shrink-0" size={20} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.done ? 'text-green-700 line-through' : 'text-slate-800'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{step.description}</p>
                </div>
                {!step.done && (
                  <button 
                    onClick={step.action}
                    className="shrink-0 flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {step.actionLabel}
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button 
          onClick={() => onNavigate('patients')} 
          className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-blue-200 transition-all text-left group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <Users className="text-blue-600" size={18} />
            </div>
            <ArrowRight className="text-slate-300 group-hover:text-blue-400 transition-colors" size={14} />
          </div>
          <div className="text-2xl font-bold text-slate-900">{patients.length}</div>
          <div className="text-xs text-slate-500">Pacientes</div>
        </button>

        <button 
          onClick={() => onNavigate('sessions')} 
          className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-green-200 transition-all text-left group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
              <Calendar className="text-green-600" size={18} />
            </div>
            <ArrowRight className="text-slate-300 group-hover:text-green-400 transition-colors" size={14} />
          </div>
          <div className="text-2xl font-bold text-slate-900">{thisMonthSessions.length}</div>
          <div className="text-xs text-slate-500">Sesiones este mes</div>
        </button>

        <button 
          onClick={() => onNavigate('billing')} 
          className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-emerald-200 transition-all text-left group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
              <DollarSign className="text-emerald-600" size={18} />
            </div>
            <ArrowRight className="text-slate-300 group-hover:text-emerald-400 transition-colors" size={14} />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalRevenue.toFixed(0)}€</div>
          <div className="text-xs text-slate-500">Total cobrado</div>
        </button>

        <button 
          onClick={() => onNavigate('billing')} 
          className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-amber-200 transition-all text-left group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
              <Clock className="text-amber-600" size={18} />
            </div>
            <ArrowRight className="text-slate-300 group-hover:text-amber-400 transition-colors" size={14} />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalPending.toFixed(0)}€</div>
          <div className="text-xs text-slate-500">Pendiente de cobro</div>
        </button>
      </div>

      {/* Two column layout: Upcoming Sessions + Quick Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Sessions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 rounded-lg">
                <Calendar className="text-indigo-600" size={16} />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Próximas sesiones</h2>
            </div>
            <button 
              onClick={() => onNavigate('schedule')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Ver agenda →
            </button>
          </div>

          {upcomingSessions.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="text-slate-300 mx-auto mb-2" size={32} />
              <p className="text-sm text-slate-500">No hay sesiones programadas</p>
              <button 
                onClick={() => onNavigate('schedule')}
                className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mx-auto"
              >
                <CalendarPlus size={14} />
                Crear sesión
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingSessions.map(session => (
                <div key={session.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-indigo-50 transition-colors">
                  <div className="shrink-0 w-12 text-center">
                    <div className="text-xs font-semibold text-indigo-600">
                      {formatSessionDate(session.date)}
                    </div>
                    <div className="text-[10px] text-slate-500">{session.startTime}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {session.patientName || 'Paciente'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {session.startTime} - {session.endTime} · {session.type === 'online' ? '🎥 Online' : session.type === 'home-visit' ? '🏠 Domicilio' : '🏥 Consulta'}
                    </p>
                  </div>
                  {session.price != null && (
                    <span className="text-xs font-semibold text-slate-600">{session.price}€</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-100 rounded-lg">
                <TrendingUp className="text-purple-600" size={16} />
              </div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Resumen de actividad</h2>
            </div>
            <button 
              onClick={() => onNavigate('dashboard')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Ver métricas →
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Sesiones completadas</span>
              <span className="text-lg font-bold text-green-600">{completedSessions.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Sesiones programadas</span>
              <span className="text-lg font-bold text-blue-600">{sessions.filter(s => s.status === 'scheduled').length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Facturado este mes</span>
              <span className="text-lg font-bold text-emerald-600">{thisMonthRevenue.toFixed(0)}€</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm text-slate-600">Facturas pendientes</span>
              <span className="text-lg font-bold text-amber-600">{pendingInvoices.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => onNavigate('patients')}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
          >
            <UserPlus size={20} />
            <span className="text-xs font-medium">Nuevo paciente</span>
          </button>
          <button
            onClick={() => onNavigate('schedule')}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
          >
            <CalendarPlus size={20} />
            <span className="text-xs font-medium">Nueva sesión</span>
          </button>
          <button
            onClick={() => onNavigate('billing')}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
          >
            <FileText size={20} />
            <span className="text-xs font-medium">Nueva factura</span>
          </button>
          <button
            onClick={() => onNavigate('ai-assistant')}
            className="flex flex-col items-center gap-2 p-3 rounded-lg bg-violet-50 hover:bg-violet-100 text-violet-700 transition-colors"
          >
            <Zap size={20} />
            <span className="text-xs font-medium">Asistente IA</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PsychologistHome;
