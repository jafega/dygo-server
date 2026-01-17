import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Users, Calendar, Clock, CheckCircle, XCircle, 
  AlertCircle, DollarSign, Activity, BarChart3, Target, Award 
} from 'lucide-react';
import { API_URL } from '../services/config';

interface Session {
  id: string;
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'available';
  type: 'in-person' | 'online' | 'home-visit';
}

interface PsychologistDashboardProps {
  psychologistId: string;
}

const PsychologistDashboard: React.FC<PsychologistDashboardProps> = ({ psychologistId }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [psychologistId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load sessions
      const sessionsResponse = await fetch(`${API_URL}/sessions?psychologistId=${psychologistId}`);
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        setSessions(sessionsData);
      }

      // Load patients
      const patientsResponse = await fetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPatients(patientsData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
    setIsLoading(false);
  };

  // Calculate metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const thisMonthSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate.getMonth() === currentMonth && sessionDate.getFullYear() === currentYear;
  });

  const futureSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= today;
  });

  const scheduledSessions = sessions.filter(s => s.status === 'scheduled');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled');
  const availableSessions = sessions.filter(s => s.status === 'available');

  const thisMonthScheduled = thisMonthSessions.filter(s => s.status === 'scheduled').length;
  const thisMonthCompleted = thisMonthSessions.filter(s => s.status === 'completed').length;
  const thisMonthCancelled = thisMonthSessions.filter(s => s.status === 'cancelled').length;

  // Calculate completion rate
  const totalFinished = thisMonthCompleted + thisMonthCancelled;
  const completionRate = totalFinished > 0 ? Math.round((thisMonthCompleted / totalFinished) * 100) : 0;

  // Sessions by type
  const onlineSessions = sessions.filter(s => s.type === 'online' && s.status === 'scheduled').length;
  const inPersonSessions = sessions.filter(s => s.type === 'in-person' && s.status === 'scheduled').length;
  const homeVisitSessions = sessions.filter(s => s.type === 'home-visit' && s.status === 'scheduled').length;

  // Next 7 days
  const next7Days = new Date(today);
  next7Days.setDate(next7Days.getDate() + 7);
  const sessionsNext7Days = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= today && sessionDate <= next7Days && s.status === 'scheduled';
  });

  // Active patients (those with scheduled or completed sessions)
  const activePatientsSet = new Set(
    sessions
      .filter(s => s.status === 'scheduled' || s.status === 'completed')
      .map(s => s.patientId)
  );
  const activePatients = activePatientsSet.size;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Dashboard Profesional</h1>
        <p className="text-purple-100">Resumen completo de tu actividad</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Patients */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="text-blue-600" size={24} />
            </div>
            <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
              {activePatients} activos
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{patients.length}</div>
          <div className="text-sm text-slate-500 mt-1">Pacientes Totales</div>
        </div>

        {/* Scheduled Sessions */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <Calendar className="text-green-600" size={24} />
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              +{sessionsNext7Days.length} próximos 7d
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{scheduledSessions.length}</div>
          <div className="text-sm text-slate-500 mt-1">Sesiones Programadas</div>
        </div>

        {/* Available Slots */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Clock className="text-purple-600" size={24} />
            </div>
            <span className="text-xs font-semibold text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
              Disponibles
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{availableSessions.length}</div>
          <div className="text-sm text-slate-500 mt-1">Espacios Libres</div>
        </div>

        {/* Completion Rate */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Target className="text-amber-600" size={24} />
            </div>
            <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
              Este mes
            </span>
          </div>
          <div className="text-3xl font-bold text-slate-900">{completionRate}%</div>
          <div className="text-sm text-slate-500 mt-1">Tasa de Asistencia</div>
        </div>
      </div>

      {/* This Month Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <BarChart3 className="text-indigo-600" size={20} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Estadísticas del Mes</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="text-green-600 mx-auto mb-2" size={32} />
            <div className="text-3xl font-bold text-green-700">{thisMonthCompleted}</div>
            <div className="text-sm text-green-600 font-medium mt-1">Completadas</div>
          </div>

          <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
            <Activity className="text-blue-600 mx-auto mb-2" size={32} />
            <div className="text-3xl font-bold text-blue-700">{thisMonthScheduled}</div>
            <div className="text-sm text-blue-600 font-medium mt-1">Programadas</div>
          </div>

          <div className="text-center p-4 bg-red-50 rounded-xl border border-red-200">
            <XCircle className="text-red-600 mx-auto mb-2" size={32} />
            <div className="text-3xl font-bold text-red-700">{thisMonthCancelled}</div>
            <div className="text-sm text-red-600 font-medium mt-1">Canceladas</div>
          </div>
        </div>
      </div>

      {/* Session Types Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Activity className="text-purple-600" size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Distribución por Tipo</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">🎥 Online</span>
                <span className="text-sm font-bold text-slate-900">{onlineSessions}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${scheduledSessions.length > 0 ? (onlineSessions / scheduledSessions.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">🏥 Consulta</span>
                <span className="text-sm font-bold text-slate-900">{inPersonSessions}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${scheduledSessions.length > 0 ? (inPersonSessions / scheduledSessions.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">🏠 Domicilio</span>
                <span className="text-sm font-bold text-slate-900">{homeVisitSessions}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${scheduledSessions.length > 0 ? (homeVisitSessions / scheduledSessions.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="text-green-600" size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Resumen Global</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-700">Total Sesiones</span>
              <span className="text-lg font-bold text-slate-900">{sessions.length}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-700">Próximas Sesiones</span>
              <span className="text-lg font-bold text-blue-600">{futureSessions.length}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-700">Sesiones Completadas</span>
              <span className="text-lg font-bold text-green-600">{completedSessions.length}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm font-medium text-slate-700">Sesiones Canceladas</span>
              <span className="text-lg font-bold text-red-600">{cancelledSessions.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Indicator */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <Award className="text-green-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Rendimiento</h3>
            <p className="text-sm text-slate-600">Métricas de tu desempeño profesional</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-700">{completionRate}%</div>
            <div className="text-xs text-slate-600 mt-1">Asistencia</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-700">{activePatients}</div>
            <div className="text-xs text-slate-600 mt-1">Pacientes Activos</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-700">{thisMonthSessions.length}</div>
            <div className="text-xs text-slate-600 mt-1">Sesiones Este Mes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-700">{sessionsNext7Days.length}</div>
            <div className="text-xs text-slate-600 mt-1">Próximos 7 Días</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PsychologistDashboard;
