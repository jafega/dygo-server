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
  price?: number;
}

interface Invoice {
  id: string;
  patientId: string;
  psychologistId: string;
  amount: number;
  status: string;
  date: string;
  created_at: string;
}

interface PsychologistDashboardProps {
  psychologistId: string;
}

const PsychologistDashboard: React.FC<PsychologistDashboardProps> = ({ psychologistId }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTotalBilling, setShowTotalBilling] = useState(true); // Toggle para mostrar total vs solo cobrado
  
  // Date range state - default to last 30 days
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  });

  useEffect(() => {
    loadData();
  }, [psychologistId, dateRange]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Optimización: Solo cargar sesiones e invoices del rango de fechas visible
      const params = new URLSearchParams({
        psychologistId,
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      
      // Load sessions
      const sessionsResponse = await fetch(`${API_URL}/sessions?${params.toString()}`);
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        setSessions(sessionsData);
      }

      // Load patients (siempre necesarios para el conteo)
      const patientsResponse = await fetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPatients(patientsData);
      }

      // Load invoices con filtro de fecha
      const invoicesParams = new URLSearchParams({
        psychologistId,
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      const invoicesResponse = await fetch(`${API_URL}/invoices?${invoicesParams.toString()}`);
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
    setIsLoading(false);
  };

  // Calculate metrics
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter sessions by date range
  const rangeStart = new Date(dateRange.start);
  const rangeEnd = new Date(dateRange.end);
  rangeEnd.setHours(23, 59, 59, 999);

  const sessionsInRange = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= rangeStart && sessionDate <= rangeEnd;
  });

  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const thisMonthSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate.getMonth() === currentMonth && sessionDate.getFullYear() === currentYear;
  });

  const futureSessions = sessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate >= today && s.status !== 'available' && s.status !== 'cancelled';
  });

  // Total sessions excluding available and cancelled
  const totalRealSessions = sessions.filter(s => s.status !== 'available' && s.status !== 'cancelled').length;

  const scheduledSessions = sessions.filter(s => s.status === 'scheduled');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const cancelledSessions = sessions.filter(s => s.status === 'cancelled');
  const availableSessions = sessions.filter(s => s.status === 'available');

  // Stats for selected date range
  const rangeScheduled = sessionsInRange.filter(s => s.status === 'scheduled').length;
  const rangeCompleted = sessionsInRange.filter(s => s.status === 'completed').length;
  const rangeCancelled = sessionsInRange.filter(s => s.status === 'cancelled').length;

  const thisMonthScheduled = thisMonthSessions.filter(s => s.status === 'scheduled').length;
  const thisMonthCompleted = thisMonthSessions.filter(s => s.status === 'completed').length;
  const thisMonthCancelled = thisMonthSessions.filter(s => s.status === 'cancelled').length;

  // Calculate completion rate for range
  const rangeTotalFinished = rangeCompleted + rangeCancelled;
  const rangeCompletionRate = rangeTotalFinished > 0 ? Math.round((rangeCompleted / rangeTotalFinished) * 100) : 0;

  // Calculate completion rate for month
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

  // Financial metrics
  console.log('[PsychologistDashboard] All invoices:', invoices.map(inv => ({ id: inv.id, status: inv.status, total: inv.total, date: inv.date })));
  const paidInvoices = invoices.filter(inv => inv.status === 'paid');
  const pendingInvoices = invoices.filter(inv => inv.status === 'pending');
  console.log('[PsychologistDashboard] Filtered paid:', paidInvoices.length, 'pending:', pendingInvoices.length);
  const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0);
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0);
  const totalBilling = totalRevenue + totalPending; // Total incluye pagadas + pendientes
  
  // Monthly revenue breakdown - last 12 months
  const monthlyRevenue: { [key: string]: number } = {};
  const monthlyPending: { [key: string]: number } = {};
  const last12Months: string[] = [];
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getFullYear()).slice(-2)}`;
    last12Months.push(label);
    monthlyRevenue[key] = 0;
    monthlyPending[key] = 0;
  }
  
  paidInvoices.forEach(invoice => {
    const invoiceDate = new Date(invoice.date || invoice.created_at);
    const key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyRevenue.hasOwnProperty(key)) {
      monthlyRevenue[key] += (invoice.total || invoice.amount || 0);
    }
  });
  
  pendingInvoices.forEach(invoice => {
    const invoiceDate = new Date(invoice.date || invoice.created_at);
    const key = `${invoiceDate.getFullYear()}-${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyPending.hasOwnProperty(key)) {
      monthlyPending[key] += (invoice.total || invoice.amount || 0);
    }
  });
  
  console.log('[PsychologistDashboard] Total invoices:', invoices.length);
  console.log('[PsychologistDashboard] Paid invoices:', paidInvoices.length, 'Total:', totalRevenue);
  console.log('[PsychologistDashboard] Pending invoices:', pendingInvoices.length, 'Total:', totalPending);
  console.log('[PsychologistDashboard] Monthly pending data:', monthlyPending);
  console.log('[PsychologistDashboard] Monthly revenue data:', monthlyRevenue);

  const revenueValues = Object.keys(monthlyRevenue).map(key => monthlyRevenue[key] + monthlyPending[key]);
  const maxRevenue = Math.max(...revenueValues, 1); // Use highest value as max for auto-scaling
  
  // Revenue in selected date range - incluye pagadas + pendientes
  const revenueInRange = invoices
    .filter(inv => {
      const invDate = new Date(inv.date || inv.created_at);
      return invDate >= rangeStart && invDate <= rangeEnd && (inv.status === 'paid' || inv.status === 'pending');
    })
    .reduce((sum, inv) => sum + (inv.total || inv.amount || 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">

      {/* Date Range Selector */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="text-slate-600" size={18} />
            <span className="text-xs sm:text-sm font-semibold text-slate-700">Rango de fechas:</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <span className="text-slate-500 text-center sm:text-left">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <button
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                setDateRange({
                  start: start.toISOString().split('T')[0],
                  end: end.toISOString().split('T')[0]
                });
              }}
              className="w-full sm:w-auto px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap"
            >
              Últimos 30 días
            </button>
          </div>
        </div>
      </div>

      {/* Financial Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Revenue */}
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 sm:p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-1.5">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <DollarSign size={20} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
              Total
            </span>
          </div>
          <div className="text-2xl sm:text-2xl font-bold mb-1">{totalBilling.toFixed(2)}€</div>
          <div className="text-xs text-green-100">Facturación Total</div>
          {totalPending > 0 && (
            <div className="text-[10px] text-green-200 mt-1">
              ({totalRevenue.toFixed(2)}€ cobrado + {totalPending.toFixed(2)}€ pendiente)
            </div>
          )}
        </div>

        {/* Revenue in Range */}
        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 sm:p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-1.5">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <TrendingUp size={20} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
              Rango
            </span>
          </div>
          <div className="text-2xl sm:text-2xl font-bold mb-1">{revenueInRange.toFixed(2)}€</div>
          <div className="text-xs text-blue-100">Facturado en Período</div>
        </div>

        {/* Paid Invoices */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-4 sm:p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-1.5">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <CheckCircle size={20} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
              Pagadas
            </span>
          </div>
          <div className="text-2xl sm:text-2xl font-bold mb-1">{totalRevenue.toFixed(2)}€</div>
          <div className="text-xs text-purple-100">Cobrado ({paidInvoices.length} facturas)</div>
        </div>

        {/* Pending Invoices */}
        <div className="bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl p-4 sm:p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2 sm:mb-1.5">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Clock size={20} className="sm:w-5 sm:h-5" />
            </div>
            <span className="text-xs font-semibold bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
              Pendientes
            </span>
          </div>
          <div className="text-2xl sm:text-2xl font-bold mb-1">{totalPending.toFixed(2)}€</div>
          <div className="text-xs text-amber-100">Por Cobrar ({pendingInvoices.length} facturas)</div>
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <BarChart3 className="text-green-600" size={16} />
            </div>
            <h2 className="text-sm sm:text-lg font-bold text-slate-900">Facturación Mensual (12 Meses)</h2>
          </div>
          
          {/* Toggle para cambiar vista */}
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setShowTotalBilling(true)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md transition-all ${
                showTotalBilling 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Total
            </button>
            <button
              onClick={() => setShowTotalBilling(false)}
              className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-semibold rounded-md transition-all ${
                !showTotalBilling 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Solo Cobrado
            </button>
          </div>
        </div>
        
        {/* Vertical Bar Chart */}
        <div className="relative h-48 sm:h-72 px-2">
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="border-t border-slate-100" />
            ))}
          </div>
          
          {/* Bars container */}
          <div className="relative h-full flex items-end justify-between gap-0.5 sm:gap-1 pb-8">
            {last12Months.map((month, idx) => {
              const key = Object.keys(monthlyRevenue)[idx];
              const paidValue = monthlyRevenue[key];
              const pendingValue = showTotalBilling ? monthlyPending[key] : 0; // Solo mostrar pendientes si el toggle está activo
              const totalValue = paidValue + pendingValue;
              
              const paidPercentage = maxRevenue > 0 ? (paidValue / maxRevenue) * 100 : 0;
              const pendingPercentage = maxRevenue > 0 ? (pendingValue / maxRevenue) * 100 : 0;
              const totalPercentage = paidPercentage + pendingPercentage;
                            // Debug log para ver valores
              if (idx === 0 || totalValue > 0) {
                console.log(`[Chart] ${month} (${key}): paid=${paidValue}€, pending=${pendingValue}€, total=${totalValue}€, showTotal=${showTotalBilling}`);
              }
                            return (
                <div key={key} className="flex-1 flex flex-col items-center justify-end group relative min-w-0">
                  {/* Bar */}
                  <div className="w-full h-full flex flex-col items-center justify-end">
                    {/* Value label on top of bar */}
                    {totalValue > 0 && (
                      <div className="absolute bg-slate-800 text-white text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded whitespace-nowrap z-10 font-semibold shadow-lg" 
                           style={{ bottom: `calc(${Math.max(totalPercentage, 12)}% + 4px)` }}>
                        {totalValue >= 1000 ? `${(totalValue/1000).toFixed(1)}k€` : `${totalValue.toFixed(0)}€`}
                      </div>
                    )}
                    
                    {/* Stacked bars - Paid (bottom) + Pending (top) */}
                    <div className="w-full flex flex-col-reverse" style={{ 
                      height: `${Math.max(totalPercentage, totalValue > 0 ? 18 : 0)}%`,
                      minHeight: totalValue > 0 ? '24px' : '0'
                    }}>
                      {/* Paid portion (green) */}
                      {paidValue > 0 && (
                        <div 
                          className="w-full bg-gradient-to-t from-green-600 via-green-500 to-green-400 transition-all duration-500 hover:opacity-90 cursor-pointer shadow-sm"
                          style={{ 
                            height: totalPercentage > 0 ? `${(paidPercentage / totalPercentage) * 100}%` : '100%',
                            borderRadius: pendingValue > 0 ? '0' : '0.5rem 0.5rem 0 0',
                            minHeight: '12px'
                          }}
                          title={`Cobrado: ${paidValue.toFixed(2)}€`}
                        />
                      )}
                      {/* Pending portion (orange/amber) */}
                      {pendingValue > 0 && (
                        <div 
                          className="w-full bg-gradient-to-t from-amber-500 via-amber-400 to-yellow-400 transition-all duration-500 hover:opacity-90 cursor-pointer shadow-sm rounded-t"
                          style={{ 
                            height: totalPercentage > 0 ? `${(pendingPercentage / totalPercentage) * 100}%` : '100%',
                            minHeight: '12px'
                          }}
                          title={`Pendiente: ${pendingValue.toFixed(2)}€`}
                        />
                      )}
                    </div>
                  </div>
                  
                  {/* Month label */}
                  <div className="absolute -bottom-6 w-full flex justify-center">
                    <span className="text-[8px] sm:text-[9px] font-medium text-slate-600 whitespace-nowrap">
                      {month}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Y-axis line */}
          <div className="absolute left-0 bottom-8 top-0 border-l-2 border-slate-200" />
          {/* X-axis line */}
          <div className="absolute left-0 right-0 bottom-8 border-b-2 border-slate-200" />
        </div>
        
        {/* Legend/Summary */}
        <div className="mt-6 sm:mt-8 pt-3 sm:pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-gradient-to-t from-green-600 to-green-400"></div>
              <span className="text-slate-600">Cobrado</span>
            </div>
            {showTotalBilling && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-gradient-to-t from-amber-500 to-yellow-400"></div>
                <span className="text-slate-600">Pendiente</span>
              </div>
            )}
          </div>
          <div className="text-slate-500">
            {showTotalBilling ? `Total: ${totalBilling.toFixed(2)}€` : `Cobrado: ${totalRevenue.toFixed(2)}€`}
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        {/* Total Patients */}
        <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="p-1 sm:p-2 bg-blue-100 rounded-lg">
              <Users className="text-blue-600" size={16} />
            </div>
            <span className="text-[9px] sm:text-xs font-semibold text-green-600 bg-green-100 px-1 sm:px-2 py-0.5 rounded-full leading-none">
              {activePatients}
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-slate-900">{patients.length}</div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Pacientes</div>
        </div>

        {/* Scheduled Sessions */}
        <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="p-1 sm:p-2 bg-green-100 rounded-lg">
              <Calendar className="text-green-600" size={16} />
            </div>
            <span className="text-[9px] sm:text-xs font-semibold text-blue-600 bg-blue-100 px-1 sm:px-2 py-0.5 rounded-full leading-none">
              +{sessionsNext7Days.length}
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-slate-900">{scheduledSessions.length}</div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Programadas</div>
        </div>

        {/* Available Slots */}
        <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="p-1 sm:p-2 bg-purple-100 rounded-lg">
              <Clock className="text-purple-600" size={16} />
            </div>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-slate-900">{availableSessions.length}</div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Disponibles</div>
        </div>

        {/* Completion Rate */}
        <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-4 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="p-1 sm:p-2 bg-amber-100 rounded-lg">
              <Target className="text-amber-600" size={16} />
            </div>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-slate-900">{completionRate}%</div>
          <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5">Asistencia</div>
        </div>
      </div>

      {/* This Month Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-2 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-3 sm:mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Activity className="text-indigo-600" size={18} />
            </div>
            <h2 className="text-base sm:text-xl font-bold text-slate-900">Estadísticas del Período</h2>
          </div>
          <span className="text-xs sm:text-sm text-slate-500">
            ({new Date(dateRange.start).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })})
          </span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 sm:gap-6">
          <div className="text-center p-2 sm:p-4 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="text-green-600 mx-auto mb-1 sm:mb-2" size={24} />
            <div className="text-xl sm:text-3xl font-bold text-green-700">{rangeCompleted}</div>
            <div className="text-[10px] sm:text-sm text-green-600 font-medium mt-0.5 sm:mt-1">Completadas</div>
          </div>

          <div className="text-center p-2 sm:p-4 bg-blue-50 rounded-xl border border-blue-200">
            <Activity className="text-blue-600 mx-auto mb-1 sm:mb-2" size={24} />
            <div className="text-xl sm:text-3xl font-bold text-blue-700">{rangeScheduled}</div>
            <div className="text-[10px] sm:text-sm text-blue-600 font-medium mt-0.5 sm:mt-1">Programadas</div>
          </div>

          <div className="text-center p-2 sm:p-4 bg-red-50 rounded-xl border border-red-200">
            <XCircle className="text-red-600 mx-auto mb-1 sm:mb-2" size={24} />
            <div className="text-xl sm:text-3xl font-bold text-red-700">{rangeCancelled}</div>
            <div className="text-[10px] sm:text-sm text-red-600 font-medium mt-0.5 sm:mt-1">Canceladas</div>
          </div>
        </div>
        
        {/* Completion Rate for Range */}
        <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Tasa de Asistencia en Período</span>
            <span className="text-2xl font-bold text-purple-700">{rangeCompletionRate}%</span>
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
              <span className="text-lg font-bold text-slate-900">{totalRealSessions}</span>
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
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-3 sm:p-6">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
            <Award className="text-green-600" size={20} />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">Rendimiento</h3>
            <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Métricas de tu desempeño profesional</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mt-3 sm:mt-4">
          <div className="text-center">
            <div className="text-lg sm:text-2xl font-bold text-green-700">{rangeCompletionRate}%</div>
            <div className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">Asistencia</div>
          </div>
          <div className="text-center">
            <div className="text-lg sm:text-2xl font-bold text-blue-700">{activePatients}</div>
            <div className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">Activos</div>
          </div>
          <div className="text-center">
            <div className="text-lg sm:text-2xl font-bold text-purple-700">{sessionsInRange.length}</div>
            <div className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">En Período</div>
          </div>
          <div className="text-center">
            <div className="text-lg sm:text-2xl font-bold text-amber-700">{sessionsNext7Days.length}</div>
            <div className="text-[10px] sm:text-xs text-slate-600 mt-0.5 sm:mt-1">7 Días</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PsychologistDashboard;
