import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  RefreshCcw, Shield, Users, Search, ArrowRightLeft,
  LayoutDashboard, X, Phone, Mail, Calendar, TrendingUp,
  BadgeEuro, Activity, CreditCard, ChevronRight, UserX,
  AlertCircle, Wrench, FileText, CheckCircle2, Clock, Ban,
  Euro, BarChart2, BookOpen, Mic, Zap,
} from 'lucide-react';
import { API_URL } from '../services/config';
import { includesNormalized, isTempEmail } from '../services/textUtils';
import { apiFetch } from '../services/authService';

// ─────────────────── Types ───────────────────
interface PsychologistStat {
  id: string;
  name: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  plan: string;
  planName: string;
  planPrice: number;
  stripeStatus: string | null;
  accessBlocked: boolean;
  trialActive: boolean;
  trialDaysLeft: number;
  isSubscribed: boolean;
  isMaster: boolean;
  createdAt: number | null;
  careRelationshipsCount: number;
}

interface AdminStats {
  overview: {
    totalPsychologists: number;
    totalPatients: number;
    totalUsers: number;
    trialCount: number;
    paidCount: number;
    blockedCount: number;
    mrr: number;
    avgPatientsPerPsych: number;
  };
  weeklyRegistrations: { semana: string; psicologos: number }[];
  psychologists: PsychologistStat[];
}

interface UserDetail {
  sessions: {
    total: number;
    completed: number;
    scheduled: number;
    cancelled: number;
    revenueTotal: number;
    revenuePaid: number;
  };
  invoices: {
    total: number;
    paid: number;
    pending: number;
    revenue: number;
  };
  entries: {
    total: number;
    byType: Record<string, number>;
  };
  relationships: {
    active: number;
    inactive: number;
    total: number;
  };
  lastActivity: string | null;
}

type Tab = 'dashboard' | 'users' | 'tools';

// ─────────────────── Helpers ───────────────────
const PLAN_COLORS: Record<string, string> = {
  starter:      'bg-blue-100 text-blue-700',
  mainder:      'bg-violet-100 text-violet-700',
  supermainder: 'bg-amber-100 text-amber-700',
};

const StatusBadge: React.FC<{ p: PsychologistStat }> = ({ p }) => {
  if (p.isMaster)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Master</span>;
  if (p.isSubscribed)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700"><Activity size={10} />Activo</span>;
  if (p.trialActive)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-700"><Calendar size={10} />Prueba · {p.trialDaysLeft}d</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600"><AlertCircle size={10} />Inactivo</span>;
};

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  from: string;
  to: string;
  border: string;
  textMain: string;
  textLabel: string;
}
const KpiCard: React.FC<KpiCardProps> = ({ label, value, sub, icon, from, to, border, textMain, textLabel }) => (
  <div className={`bg-gradient-to-br ${from} ${to} ${border} border rounded-2xl p-5 shadow-sm`}>
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wide ${textLabel}`}>{label}</p>
        <p className={`text-3xl font-bold ${textMain} mt-1`}>{value}</p>
        {sub && <p className={`text-xs mt-0.5 ${textLabel} opacity-80`}>{sub}</p>}
      </div>
      <div className="bg-white/70 p-3 rounded-xl shadow-sm">{icon}</div>
    </div>
  </div>
);

// Panel de administración integrado como pestaña
const SuperAdmin: React.FC = () => {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [migrateStatus, setMigrateStatus] = useState<{ running: boolean; result?: string }>({ running: false });
  const [selectedPsych, setSelectedPsych] = useState<PsychologistStat | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'psychologist' | 'patient'>('all');

  useEffect(() => {
    loadStats();
    loadUsers();
  }, []);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error('Error loading stats:', e);
    }
    setStatsLoading(false);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const us = await AuthService.getUsers();
      setUsers(us || []);
    } catch (e) {
      console.error('Error loading users:', e);
    }
    setLoading(false);
  };

  const handleRefresh = () => { loadStats(); loadUsers(); };

  const filtered = users.filter(u => {
    const matchesQuery = !query ||
      (u.name ? includesNormalized(u.name, query) : false) ||
      (u.email ? includesNormalized(u.email, query) : false);
    const matchesType = userTypeFilter === 'all' ||
      (userTypeFilter === 'psychologist' && u.is_psychologist === true) ||
      (userTypeFilter === 'patient' && u.is_psychologist !== true);
    return matchesQuery && matchesType;
  });

  const getPsychStat = (id: string) => stats?.psychologists.find(p => p.id === id);

  const openPsychDrawer = async (p: PsychologistStat) => {
    setSelectedPsych(p);
    setUserDetail(null);
    setUserDetailLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/user-detail/${p.id}`);
      if (res.ok) setUserDetail(await res.json());
    } catch (e) {
      console.error('Error loading user detail:', e);
    }
    setUserDetailLoading(false);
  };

  const handleMigrateNames = async () => {
    if (!window.confirm('Esto migrará nombre y apellido para todos los usuarios que solo tienen nombre completo. ¿Continuar?')) return;
    setMigrateStatus({ running: true });
    try {
      const res = await apiFetch(`${API_URL}/admin/migrate-names`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMigrateStatus({ running: false, result: `✅ ${data.updated} actualizados, ${data.skipped} omitidos${data.errors?.length ? `, ${data.errors.length} errores` : ''}` });
      } else {
        setMigrateStatus({ running: false, result: `❌ Error: ${data.error}` });
      }
    } catch (err: any) {
      setMigrateStatus({ running: false, result: `❌ ${err?.message || 'Error desconocido'}` });
    }
  };

  // ── Tabs ──────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
    { id: 'users',     label: 'Usuarios',  icon: <Users size={16} /> },
    { id: 'tools',     label: 'Herramientas', icon: <Wrench size={16} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
        <button
          onClick={handleRefresh}
          disabled={statsLoading || loading}
          className="ml-2 px-3 py-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white transition-all"
          title="Refrescar todo"
        >
          <RefreshCcw size={15} className={(statsLoading || loading) ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── DASHBOARD TAB ─────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="py-16 text-center">
              <RefreshCcw className="animate-spin mx-auto text-indigo-400 mb-3" size={32} />
              <p className="text-slate-400">Cargando métricas…</p>
            </div>
          ) : stats ? (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <KpiCard
                  label="Psicólogos activos"
                  value={stats.overview.totalPsychologists}
                  from="from-indigo-50" to="to-indigo-100" border="border-indigo-200"
                  textMain="text-indigo-900" textLabel="text-indigo-600"
                  icon={<Shield size={22} className="text-indigo-600" />}
                />
                <KpiCard
                  label="En periodo de prueba"
                  value={stats.overview.trialCount}
                  sub={`de ${stats.overview.totalPsychologists} psicólogos`}
                  from="from-sky-50" to="to-sky-100" border="border-sky-200"
                  textMain="text-sky-900" textLabel="text-sky-600"
                  icon={<Calendar size={22} className="text-sky-600" />}
                />
                <KpiCard
                  label="Con plan contratado"
                  value={stats.overview.paidCount}
                  sub={`${stats.overview.blockedCount} bloqueados`}
                  from="from-emerald-50" to="to-emerald-100" border="border-emerald-200"
                  textMain="text-emerald-900" textLabel="text-emerald-600"
                  icon={<CreditCard size={22} className="text-emerald-600" />}
                />
                <KpiCard
                  label="MRR estimado"
                  value={`€${stats.overview.mrr.toFixed(2)}`}
                  sub="ingresos mensuales recurrentes"
                  from="from-amber-50" to="to-amber-100" border="border-amber-200"
                  textMain="text-amber-900" textLabel="text-amber-600"
                  icon={<BadgeEuro size={22} className="text-amber-600" />}
                />
                <KpiCard
                  label="Total pacientes"
                  value={stats.overview.totalPatients}
                  from="from-purple-50" to="to-purple-100" border="border-purple-200"
                  textMain="text-purple-900" textLabel="text-purple-600"
                  icon={<Users size={22} className="text-purple-600" />}
                />
                <KpiCard
                  label="Media pacientes/psicólogo"
                  value={stats.overview.avgPatientsPerPsych}
                  sub="sólo psicólogos con pacientes"
                  from="from-rose-50" to="to-rose-100" border="border-rose-200"
                  textMain="text-rose-900" textLabel="text-rose-600"
                  icon={<TrendingUp size={22} className="text-rose-600" />}
                />
                <KpiCard
                  label="Total usuarios"
                  value={stats.overview.totalUsers}
                  from="from-slate-50" to="to-slate-100" border="border-slate-200"
                  textMain="text-slate-900" textLabel="text-slate-500"
                  icon={<Activity size={22} className="text-slate-500" />}
                />
              </div>

              {/* Weekly registrations chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">
                  Nuevos psicólogos por semana · últimas 8 semanas
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats.weeklyRegistrations} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [v, 'Psicólogos']}
                    />
                    <Bar dataKey="psicologos" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Plan breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Distribución por plan · psicólogos de pago
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {(['starter', 'mainder', 'supermainder'] as const).map(planId => {
                    const planNames: Record<string, string> = { starter: 'Starter', mainder: 'Mainder', supermainder: 'Supermainder' };
                    const planPrices: Record<string, string> = { starter: '€9.99', mainder: '€19.99', supermainder: '€29.99' };
                    const count = stats.psychologists.filter(p => p.plan === planId && (p.isSubscribed || p.isMaster)).length;
                    const base = stats.overview.paidCount;
                    const pct = base > 0 ? Math.round((count / base) * 100) : 0;
                    return (
                      <div key={planId} className="px-6 py-3 flex items-center gap-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold w-28 text-center ${PLAN_COLORS[planId]}`}>
                          {planNames[planId]}
                        </span>
                        <span className="text-xs text-slate-400 w-16">{planPrices[planId]}/mes</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${planId === 'starter' ? 'bg-blue-400' : planId === 'mainder' ? 'bg-violet-400' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center">
              <AlertCircle className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-slate-400">No se pudieron cargar las métricas</p>
            </div>
          )}
        </div>
      )}

      {/* ── USUARIOS TAB ─────────────────────────── */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Search + filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="flex-1 relative w-full">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o email…"
                  className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm"
                />
              </div>
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0">
                {(['all', 'psychologist', 'patient'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setUserTypeFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      userTypeFilter === f ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {f === 'all' ? 'Todos' : f === 'psychologist' ? 'Psicólogos' : 'Pacientes'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <RefreshCcw className="animate-spin mx-auto text-indigo-600 mb-3" size={28} />
                <p className="text-slate-400 text-sm">Cargando usuarios…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <UserX className="mx-auto text-slate-300 mb-3" size={40} />
                <p className="text-slate-400 text-sm">No se encontraron usuarios</p>
              </div>
            ) : (
              <>
                {/* Header row */}
                <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1.5fr_1.5fr_1fr_28px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>Nombre</span>
                  <span>Email</span>
                  <span>Tipo</span>
                  <span>Plan</span>
                  <span>Estado</span>
                  <span>Relaciones</span>
                  <span />
                </div>
                <div className="divide-y divide-slate-100">
                  {filtered.map(u => {
                    const isPsych = u.is_psychologist === true;
                    const pStat = isPsych ? getPsychStat(u.id) : undefined;
                    return (
                      <div
                        key={u.id}
                        className={`grid grid-cols-1 lg:grid-cols-[2fr_2fr_1fr_1.5fr_1.5fr_1fr_28px] gap-3 items-center px-5 py-3 hover:bg-slate-50 transition-colors ${isPsych && pStat ? 'cursor-pointer' : ''}`}
                        onClick={() => isPsych && pStat && openPsychDrawer(pStat)}
                      >
                        {/* Name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                            {u.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <span className="text-sm font-medium text-slate-800 truncate">{u.name || 'Sin nombre'}</span>
                        </div>

                        {/* Email */}
                        <span className="text-sm text-slate-500 truncate">
                          {!isTempEmail(u.email) ? u.email : <span className="italic text-slate-300">Sin email</span>}
                        </span>

                        {/* Role */}
                        <div>
                          {isPsych ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                              <Shield size={10} /> Psicólogo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                              Paciente
                            </span>
                          )}
                        </div>

                        {/* Plan */}
                        <div>
                          {isPsych && pStat ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${PLAN_COLORS[pStat.plan] || 'bg-slate-100 text-slate-600'}`}>
                              {pStat.planName}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* Status */}
                        <div>
                          {isPsych && pStat ? (
                            <StatusBadge p={pStat} />
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* Care relationships */}
                        <div>
                          {isPsych ? (
                            <span className="text-sm font-semibold text-indigo-700">
                              {pStat?.careRelationshipsCount ?? (statsLoading ? '…' : '—')}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>

                        {/* Arrow */}
                        <div>
                          {isPsych && pStat && <ChevronRight size={15} className="text-slate-300" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── HERRAMIENTAS TAB ──────────────────────── */}
      {tab === 'tools' && (
        <div className="space-y-4 max-w-xl">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
              <ArrowRightLeft size={16} className="text-amber-600" /> Migrar nombres
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              Divide el nombre completo en firstName y lastName para los usuarios que sólo tienen nombre completo.
            </p>
            <button
              className="px-5 py-2.5 bg-amber-600 text-white rounded-xl flex items-center gap-2 shadow-sm hover:bg-amber-700 transition-colors disabled:opacity-50 text-sm font-medium"
              onClick={handleMigrateNames}
              disabled={migrateStatus.running}
            >
              <ArrowRightLeft size={15} className={migrateStatus.running ? 'animate-spin' : ''} />
              {migrateStatus.running ? 'Migrando…' : 'Migrar nombres'}
            </button>
            {migrateStatus.result && (
              <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-2.5">{migrateStatus.result}</p>
            )}
          </div>
        </div>
      )}

      {/* ── PSYCH DETAIL DRAWER ───────────────────── */}
      {selectedPsych && (
        <div
          className="fixed inset-0 bg-black/40 flex justify-end z-50"
          onClick={() => setSelectedPsych(null)}
        >
          <div
            className="bg-white w-full max-w-sm h-full overflow-y-auto shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Detalle psicólogo</h3>
              <button
                onClick={() => setSelectedPsych(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-6 space-y-6">
              {/* Avatar + name */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md">
                  {selectedPsych.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg leading-tight">{selectedPsych.name}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedPsych.id.slice(0, 12)}…</p>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Contacto</p>
                <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Mail size={15} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700 break-all">
                      {!isTempEmail(selectedPsych.email) ? selectedPsych.email : <span className="italic text-slate-400">Sin email</span>}
                    </span>
                  </div>
                  {selectedPsych.phone ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Phone size={15} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700">{selectedPsych.phone}</span>
                    </div>
                  ) : null}
                  {selectedPsych.createdAt ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Calendar size={15} className="text-slate-400 flex-shrink-0" />
                      <span className="text-sm text-slate-700">
                        Miembro desde {new Date(selectedPsych.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Subscription */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Suscripción</p>
                <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-500">Plan</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${PLAN_COLORS[selectedPsych.plan] || 'bg-slate-100 text-slate-600'}`}>
                      {selectedPsych.planName} · €{selectedPsych.planPrice}/mes
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-500">Estado</span>
                    <StatusBadge p={selectedPsych} />
                  </div>
                  {selectedPsych.stripeStatus ? (
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-slate-500">Stripe status</span>
                      <span className="text-xs font-mono text-slate-500">{selectedPsych.stripeStatus}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Patients */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pacientes</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-indigo-800">{selectedPsych.careRelationshipsCount}</p>
                    <p className="text-xs text-indigo-500 mt-0.5">Activos</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-slate-600">{userDetail?.relationships.inactive ?? '…'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Anteriores</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-slate-600">{userDetail?.relationships.total ?? '…'}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Total</p>
                  </div>
                </div>
              </div>

              {/* Usage metrics */}
              {userDetailLoading ? (
                <div className="py-8 text-center">
                  <RefreshCcw className="animate-spin mx-auto text-indigo-400 mb-2" size={22} />
                  <p className="text-xs text-slate-400">Cargando métricas de uso…</p>
                </div>
              ) : userDetail ? (
                <>
                  {/* Last activity */}
                  {userDetail.lastActivity && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                      <Zap size={14} className="text-amber-500 flex-shrink-0" />
                      <span className="text-xs text-amber-700">
                        Última actividad: <strong>{new Date(userDetail.lastActivity).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      </span>
                    </div>
                  )}

                  {/* Sessions */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sesiones</p>
                    <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" />Completadas</span>
                        <span className="font-semibold text-slate-800">{userDetail.sessions.completed}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><Clock size={14} className="text-sky-500" />Programadas</span>
                        <span className="font-semibold text-slate-800">{userDetail.sessions.scheduled}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><Ban size={14} className="text-red-400" />Canceladas</span>
                        <span className="font-semibold text-slate-800">{userDetail.sessions.cancelled}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><Euro size={14} className="text-emerald-600" />Facturado (sesiones)</span>
                        <span className="font-semibold text-slate-800">€{userDetail.sessions.revenueTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Invoices */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Facturas</p>
                    <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><FileText size={14} className="text-slate-400" />Emitidas</span>
                        <span className="font-semibold text-slate-800">{userDetail.invoices.total}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" />Cobradas</span>
                        <span className="font-semibold text-slate-800">{userDetail.invoices.paid}</span>
                      </div>
                      {userDetail.invoices.pending > 0 && (
                        <div className="flex items-center justify-between px-4 py-2.5">
                          <span className="flex items-center gap-2 text-sm text-slate-500"><Clock size={14} className="text-amber-500" />Pendientes</span>
                          <span className="font-semibold text-amber-600">{userDetail.invoices.pending}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><BadgeEuro size={14} className="text-emerald-600" />Ingresos cobrados</span>
                        <span className="font-semibold text-emerald-700">€{userDetail.invoices.revenue.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Entries */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Registros clínicos</p>
                    <div className="bg-slate-50 rounded-xl divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="flex items-center gap-2 text-sm text-slate-500"><BarChart2 size={14} className="text-slate-400" />Total entradas</span>
                        <span className="font-semibold text-slate-800">{userDetail.entries.total}</span>
                      </div>
                      {Object.entries(userDetail.entries.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                        const icon = type === 'VOICE' ? <Mic size={13} className="text-purple-400" /> : type === 'NOTE' ? <BookOpen size={13} className="text-blue-400" /> : <FileText size={13} className="text-slate-400" />;
                        return (
                          <div key={type} className="flex items-center justify-between px-4 py-2">
                            <span className="flex items-center gap-2 text-xs text-slate-400">{icon}{type}</span>
                            <span className="text-xs font-semibold text-slate-500">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;

