import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import {
  RefreshCcw, Shield, Users, Search, ArrowRightLeft,
  LayoutDashboard, X, Phone, Mail, Calendar, TrendingUp,
  BadgeEuro, Activity, CreditCard, ChevronRight, UserX,
  AlertCircle, FileText, CheckCircle2, Clock, Ban,
  Euro, BarChart2, BookOpen, Mic, Zap,
} from 'lucide-react';
import { API_URL } from '../services/config';
import { includesNormalized, isTempEmail } from '../services/textUtils';
import { apiFetch } from '../services/authService';

const SalesPipeline = React.lazy(() => import('./sales/SalesPipeline'));
const TemplatesPanel = React.lazy(() => import('./sales/TemplatesPanel'));
const EmailInbox = React.lazy(() => import('./EmailInbox'));

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
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number | null;
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
  weeklyPaidPsychs: { semana: string; pagantes: number }[];
  weeklyActivePaidPsychs?: { semana: string; pagantes: number }[];
  monthlyMrr: { mes: string; mrr: number; expected?: boolean }[];
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

type Tab = 'dashboard' | 'funnel' | 'users' | 'sales' | 'agents' | 'templates' | 'email';

// ─────────────────── Equipo de ventas automatizado ───────────────────
interface AgentConfig {
  enabled: boolean;
  autonomia: 'borrador' | 'autonomo';
  cupo_diario: number;
}
interface AgentDraft {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  body_html: string;
  lead_id: string | null;
  lead_name: string | null;
  created_at: string;
  metadata: { agent?: string; variant?: string; motivo_borrador?: string };
}
interface AgentAction {
  id: number;
  agent: string;
  action: string;
  email: string | null;
  variant: string | null;
  created_at: string;
}
interface AgentOptout {
  email: string;
  reason: string | null;
  source: string | null;
  created_at: string;
}
interface AgentsData {
  config: AgentConfig;
  enviados_hoy: number;
  token_configurado: boolean;
  webhook_firmado: boolean;
  borradores: AgentDraft[];
  acciones: AgentAction[];
  bajas_recientes: AgentOptout[];
}

// ─────────────────── Embudo de activacion ───────────────────
// Los datos salen de product_events via GET /api/admin/funnel.
interface FunnelStep {
  event: string;
  label: string;
  total: number;
  fromPrevious: number | null;  // % respecto al paso anterior
  fromSignup: number | null;    // % respecto al registro
}
interface FunnelAtRisk {
  userId: string;
  email: string;
  signupAt: string;
  daysLeft: number;
  stuck: string;
}
interface ComercialStep {
  key: string;
  label: string;
  total: number;
  fromPrevious: number | null;
  fromLeads: number | null;
}
interface Cartera {
  total: number;
  vivos: number;
  nuevos_en_ventana: number;
  sin_contactar: number;
  perdidos: number;
  de_baja: number;
}
interface FunnelData {
  days: number;
  comercial: ComercialStep[];
  cartera: Cartera;
  funnel: FunnelStep[];
  series: Record<string, number | string>[];
  activeTrials: number;
  atRisk: FunnelAtRisk[];
  generatedAt: string;
}

// ─────────────────── Helpers ───────────────────
const PLAN_COLORS: Record<string, string> = {
  starter:      'bg-blue-100 text-blue-700',
  mainder:      'bg-violet-100 text-violet-700',
  supermainder: 'bg-amber-100 text-amber-700',
};

const getPlanDisplay = (p: PsychologistStat): { label: string; className: string } => {
  if (p.isMaster) return { label: 'Master', className: 'bg-indigo-100 text-indigo-700' };
  if (p.isSubscribed) return { label: p.planName, className: PLAN_COLORS[p.plan] || 'bg-slate-100 text-slate-600' };
  if (p.trialActive) return { label: 'Prueba', className: 'bg-sky-100 text-sky-700' };
  return { label: 'Inactivo', className: 'bg-red-100 text-red-600' };
};

const StatusBadge: React.FC<{ p: PsychologistStat }> = ({ p }) => {
  if (p.isMaster)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Master</span>;
  if (p.isSubscribed && p.cancelAtPeriodEnd)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><Clock size={10} />Offboarding</span>;
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
  <div className={`bg-gradient-to-br ${from} ${to} ${border} border rounded-2xl p-3 sm:p-5 shadow-sm overflow-hidden`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide ${textLabel} truncate`}>{label}</p>
        <p className={`text-xl sm:text-3xl font-bold ${textMain} mt-1 truncate`}>{value}</p>
        {sub && <p className={`text-[10px] sm:text-xs mt-0.5 ${textLabel} opacity-80 truncate`}>{sub}</p>}
      </div>
      <div className="bg-white/70 p-2 sm:p-3 rounded-xl shadow-sm flex-shrink-0">{icon}</div>
    </div>
  </div>
);

// Panel de administración integrado como pestaña
const SuperAdmin: React.FC<{ tab: Tab }> = ({ tab }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedPsych, setSelectedPsych] = useState<PsychologistStat | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'psychologist' | 'patient'>('all');
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelDays, setFunnelDays] = useState(30);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentBusy, setAgentBusy] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
    loadUsers();
  }, []);

  useEffect(() => {
    if (tab === 'funnel' && !funnel && !funnelLoading) loadFunnel();
    if (tab === 'agents' && !agents && !agentsLoading) loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadAgents = async () => {
    setAgentsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/agents`);
      if (res.ok) setAgents(await res.json());
    } catch (e) {
      console.error('Error loading agents:', e);
    }
    setAgentsLoading(false);
  };

  const patchAgentConfig = async (cambios: Partial<AgentConfig>) => {
    setAgentBusy('config');
    try {
      const res = await apiFetch(`${API_URL}/admin/agents/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      if (res.ok) {
        const { config } = await res.json();
        setAgents(a => (a ? { ...a, config } : a));
      }
    } catch (e) {
      console.error('Error updating agent config:', e);
    }
    setAgentBusy(null);
  };

  const resolveDraft = async (id: string, accion: 'approve' | 'discard') => {
    setAgentBusy(id);
    try {
      const res = await apiFetch(`${API_URL}/admin/agents/drafts/${id}/${accion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setDraftOpen(null);
        await loadAgents();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.motivo === 'dado_de_baja'
          ? 'No se envía: este contacto se dio de baja después de redactarse el borrador.'
          : `No se pudo completar: ${err.motivo || err.error || 'error desconocido'}`);
      }
    } catch (e) {
      console.error('Error resolving draft:', e);
    }
    setAgentBusy(null);
  };

  const loadFunnel = async (days = funnelDays) => {
    setFunnelLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/funnel?days=${days}`);
      if (res.ok) setFunnel(await res.json());
    } catch (e) {
      console.error('Error loading funnel:', e);
    }
    setFunnelLoading(false);
  };

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

  const isLoading = statsLoading || loading;

  const getPsychStat = (id: string) => stats?.psychologists.find(p => p.id === id);

  const filtered = users
    .filter(u => {
      const matchesQuery = !query ||
        (u.name ? includesNormalized(u.name, query) : false) ||
        (u.email ? includesNormalized(u.email, query) : false);
      const matchesType = userTypeFilter === 'all' ||
        (userTypeFilter === 'psychologist' && u.is_psychologist === true) ||
        (userTypeFilter === 'patient' && u.is_psychologist !== true);
      return matchesQuery && matchesType;
    })
    .sort((a, b) => {
      const aStat = getPsychStat(a.id);
      const bStat = getPsychStat(b.id);
      // Status priority: Activo (0) > Offboarding (1) > Prueba (2) > Inactivo (3) > no-psych (4)
      const statusRank = (s?: PsychologistStat) => {
        if (!s) return 4;
        if (s.isMaster) return 0;
        if (s.isSubscribed && s.cancelAtPeriodEnd) return 1;
        if (s.isSubscribed) return 0;
        if (s.trialActive) return 2;
        return 3;
      };
      const rA = statusRank(aStat);
      const rB = statusRank(bStat);
      if (rA !== rB) return rA - rB;
      const aDate = aStat?.createdAt ?? null;
      const bDate = bStat?.createdAt ?? null;
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return bDate - aDate;
    });

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

  return (
    <div className="space-y-5 overflow-x-hidden">
      {/* Refresh button — hidden on email tab (has its own) */}
      {tab !== 'email' && (
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all text-xs font-medium"
          title="Refrescar todo"
        >
          <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} />
          Refrescar
        </button>
      </div>
      )}

      {/* ── AGENTES TAB ───────────────────────────── */}
      {tab === 'agents' && (
        <div className="space-y-6">
          {agentsLoading && !agents ? (
            <div className="py-16 text-center">
              <RefreshCcw className="animate-spin mx-auto text-indigo-400 mb-3" size={32} />
              <p className="text-slate-400">Cargando equipo…</p>
            </div>
          ) : agents ? (
            <>
              {/* Avisos de configuración incompleta */}
              {(!agents.token_configurado || !agents.webhook_firmado) && (
                <div className="space-y-2">
                  {!agents.token_configurado && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        <strong>AGENT_API_TOKEN no configurado.</strong> Los agentes de n8n no pueden
                        conectarse hasta que la variable exista en el entorno de Producción de Vercel.
                      </p>
                    </div>
                  )}
                  {!agents.webhook_firmado && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-800">
                        <strong>RESEND_WEBHOOK_SECRET no configurado.</strong> El correo entrante se
                        procesa sin verificar la firma: cualquiera que conozca la URL puede inyectar
                        emails falsos en este buzón.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Control principal */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">Equipo de ventas automatizado</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {agents.enviados_hoy} de {agents.config.cupo_diario} envíos usados hoy
                    </p>
                  </div>
                  {/* Interruptor general: lo más grande y lo más a mano. */}
                  <button
                    onClick={() => patchAgentConfig({ enabled: !agents.config.enabled })}
                    disabled={agentBusy === 'config'}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      agents.config.enabled
                        ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {agents.config.enabled ? 'Parar todo' : 'Reactivar equipo'}
                  </button>
                </div>

                {!agents.config.enabled && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                    <Ban size={16} className="text-red-600 flex-shrink-0" />
                    <p className="text-xs text-red-800">Equipo parado. No se envía ni se redacta nada.</p>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4 mt-5">
                  {/* Modo */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Modo</p>
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                      {([
                        { id: 'borrador' as const, label: 'Borrador' },
                        { id: 'autonomo' as const, label: 'Autónomo' },
                      ]).map(m => (
                        <button
                          key={m.id}
                          onClick={() => patchAgentConfig({ autonomia: m.id })}
                          disabled={agentBusy === 'config'}
                          className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                            agents.config.autonomia === m.id
                              ? 'bg-white text-indigo-600 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >{m.label}</button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      {agents.config.autonomia === 'borrador'
                        ? 'Los agentes redactan y tú apruebas. No sale nada sin tu clic.'
                        : 'Los agentes envían solos dentro del cupo. Las bajas se siguen respetando.'}
                    </p>
                  </div>

                  {/* Cupo */}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
                      Cupo diario · {agents.config.cupo_diario}
                    </p>
                    <input
                      type="range" min={0} max={200} step={5}
                      value={agents.config.cupo_diario}
                      onChange={e => setAgents(a => (a ? { ...a, config: { ...a.config, cupo_diario: Number(e.target.value) } } : a))}
                      onMouseUp={e => patchAgentConfig({ cupo_diario: Number((e.target as HTMLInputElement).value) })}
                      onTouchEnd={e => patchAgentConfig({ cupo_diario: Number((e.target as HTMLInputElement).value) })}
                      className="w-full accent-indigo-600"
                    />
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      Techo de emails que los agentes pueden mandar al día. Al llegar, dejan de enviar
                      aunque estén en modo autónomo.
                    </p>
                  </div>
                </div>
              </div>

              {/* Borradores pendientes */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Pendientes de aprobar ({agents.borradores.length})
                </h3>
                <p className="text-xs text-slate-400 mb-4">Redactados por los agentes. Nada sale sin que lo apruebes</p>
                {agents.borradores.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">No hay borradores esperando.</p>
                ) : (
                  <div className="space-y-2">
                    {agents.borradores.map(b => (
                      <div key={b.id} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="p-3 flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate">{b.subject}</p>
                            <p className="text-xs text-slate-400 truncate">
                              Para {b.to_name || b.to_email}
                              {b.metadata?.agent && <> · agente <span className="font-medium">{b.metadata.agent}</span></>}
                              {b.metadata?.variant && <> · variante {b.metadata.variant}</>}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => setDraftOpen(draftOpen === b.id ? null : b.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100"
                            >{draftOpen === b.id ? 'Ocultar' : 'Ver'}</button>
                            <button
                              onClick={() => resolveDraft(b.id, 'discard')}
                              disabled={agentBusy === b.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100"
                            >Descartar</button>
                            <button
                              onClick={() => resolveDraft(b.id, 'approve')}
                              disabled={agentBusy === b.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >{agentBusy === b.id ? 'Enviando…' : 'Aprobar y enviar'}</button>
                          </div>
                        </div>
                        {draftOpen === b.id && (
                          <div
                            className="border-t border-slate-100 p-3 bg-slate-50 max-h-96 overflow-y-auto text-sm"
                            dangerouslySetInnerHTML={{ __html: b.body_html }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Actividad */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">Actividad reciente</h3>
                  <p className="text-xs text-slate-400 mb-4">Todo lo que han hecho los agentes</p>
                  {agents.acciones.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">Sin actividad todavía.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {agents.acciones.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0">
                          <span className={`px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                            a.action === 'enviado' ? 'bg-emerald-50 text-emerald-700'
                              : a.action === 'descartado' ? 'bg-red-50 text-red-600'
                              : 'bg-slate-100 text-slate-600'
                          }`}>{a.action}</span>
                          <span className="text-slate-600 truncate flex-1">{a.email || '—'}</span>
                          <span className="text-slate-400 flex-shrink-0">{a.agent}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bajas */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                    Bajas · últimos 30 días ({agents.bajas_recientes.length})
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">A estos no se les vuelve a escribir</p>
                  {agents.bajas_recientes.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">Ninguna baja.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto">
                      {agents.bajas_recientes.map(b => (
                        <div key={b.email} className="flex items-center gap-2 text-xs py-1.5 border-b border-slate-50 last:border-0">
                          <span className="text-slate-600 truncate flex-1">{b.email}</span>
                          <span className={`px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                            b.reason === 'queja_spam' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`}>{b.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              <AlertCircle className="mx-auto mb-3" size={32} />
              <p className="text-sm">No se pudo cargar el equipo.</p>
            </div>
          )}
        </div>
      )}

      {/* ── EMBUDO TAB ────────────────────────────── */}
      {tab === 'funnel' && (
        <div className="space-y-6">
          {funnelLoading && !funnel ? (
            <div className="py-16 text-center">
              <RefreshCcw className="animate-spin mx-auto text-indigo-400 mb-3" size={32} />
              <p className="text-slate-400">Cargando embudo…</p>
            </div>
          ) : funnel ? (
            <>
              {/* Cabecera con selector de ventana */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Embudo de activación</h2>
                  <p className="text-xs text-slate-400">
                    Dónde se cae la gente entre registrarse y pagar · {funnel.activeTrials} en prueba ahora
                  </p>
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  {[7, 30, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => { setFunnelDays(d); loadFunnel(d); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        funnelDays === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >{d}d</button>
                  ))}
                </div>
              </div>

              {/* Cartera de leads: el trabajo que hay por delante */}
              {funnel.cartera && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">En cartera</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{funnel.cartera.total}</p>
                    <p className="text-[11px] text-slate-400">{funnel.cartera.vivos} vivos</p>
                  </div>
                  {/* La cifra que dice si hay trabajo para el equipo de ventas */}
                  <div className={`rounded-xl border p-3 ${funnel.cartera.sin_contactar > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Sin contactar</p>
                    <p className="text-xl font-bold text-amber-900 mt-0.5">{funnel.cartera.sin_contactar}</p>
                    <p className="text-[11px] text-amber-600">pendientes de tocar</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nuevos · {funnel.days}d</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{funnel.cartera.nuevos_en_ventana}</p>
                    <p className="text-[11px] text-slate-400">entradas a la cartera</p>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Descartados</p>
                    <p className="text-xl font-bold text-slate-800 mt-0.5">{funnel.cartera.perdidos + funnel.cartera.de_baja}</p>
                    <p className="text-[11px] text-slate-400">{funnel.cartera.perdidos} perdidos · {funnel.cartera.de_baja} bajas</p>
                  </div>
                </div>
              )}

              {/* Embudo comercial: lo que pasa ANTES de que exista una cuenta */}
              {funnel.comercial && funnel.comercial.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">Embudo comercial</h3>
                  <p className="text-xs text-slate-400 mb-5">De lead en cartera a cliente. Incluye a los que aún no tienen cuenta</p>
                  <div className="space-y-3">
                    {funnel.comercial.map(paso => {
                      const base = funnel.comercial[0].total || 1;
                      const width = (paso.total / base) * 100;
                      const fuga = paso.fromPrevious !== null && paso.fromPrevious < 20;
                      return (
                        <div key={paso.key}>
                          <div className="flex items-baseline justify-between gap-3 mb-1">
                            <span className="text-sm text-slate-700 truncate">{paso.label}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">
                              <span className="font-semibold text-slate-700 text-sm">{paso.total}</span>
                              {paso.fromPrevious !== null && (
                                <span className={`ml-2 font-medium ${fuga ? 'text-red-600' : 'text-slate-400'}`}>
                                  {paso.fromPrevious}% del anterior
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                            <div
                              className={`h-full rounded-lg transition-all ${fuga ? 'bg-red-400' : 'bg-cyan-500'}`}
                              style={{ width: `${Math.max(width, 1.5)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4">
                    «Contactados» cuenta haber recibido algo de verdad, no la etiqueta de etapa: la etapa
                    se puede mover a mano sin haber escrito nunca.
                  </p>
                </div>
              )}

              {/* Embudo acumulado: una barra por paso, ancho proporcional */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">Activación del producto</h3>
                <p className="text-xs text-slate-400 mb-5">Psicólogos distintos que han alcanzado cada hito</p>
                <div className="space-y-3">
                  {funnel.funnel.map(step => {
                    const width = funnel.funnel[0].total ? (step.total / funnel.funnel[0].total) * 100 : 0;
                    // Un paso a cero no es una fuga: puede ser un evento que se
                    // empezo a medir despues del backfill (checkout_started no
                    // tiene historico). Sin datos se muestra neutro, no en rojo.
                    const noData = step.total === 0;
                    // Por debajo del 40% respecto al paso anterior si es una fuga.
                    const leaking = !noData && step.fromPrevious !== null && step.fromPrevious < 40;
                    return (
                      <div key={step.event}>
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className={`text-sm truncate ${noData ? 'text-slate-400' : 'text-slate-700'}`}>{step.label}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            <span className={`font-semibold text-sm ${noData ? 'text-slate-400' : 'text-slate-700'}`}>{step.total}</span>
                            {noData ? (
                              <span className="ml-2 font-medium text-slate-400">sin datos aún</span>
                            ) : step.fromPrevious !== null && (
                              <span className={`ml-2 font-medium ${leaking ? 'text-red-600' : 'text-slate-400'}`}>
                                {step.fromPrevious}% del anterior
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                          {!noData && (
                            <div
                              className={`h-full rounded-lg transition-all ${leaking ? 'bg-red-400' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.max(width, 1.5)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">
                  Los hitos históricos se reconstruyeron desde el alta de cada psicólogo.
                  «Abre checkout» solo cuenta desde que se instrumentó, así que aún no tiene serie completa.
                </p>
              </div>

              {/* Serie diaria */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Últimos {funnel.days} días
                </h3>
                <p className="text-xs text-slate-400 mb-4">Registros, primeras grabaciones y pagos por día</p>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={funnel.series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSignup" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#94a3b8' }}
                      tickFormatter={(d: string) => d.slice(5)}
                      minTickGap={24}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Area type="monotone" dataKey="signup" name="Registros" stroke="#6366f1" fill="url(#gSignup)" strokeWidth={2} />
                    <Area type="monotone" dataKey="first_session_recorded" name="1ª grabación" stroke="#0ea5e9" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="paid" name="Pagos" stroke="#10b981" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* En riesgo */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  En riesgo ({funnel.atRisk.length})
                </h3>
                <p className="text-xs text-slate-400 mb-4">En prueba, atascados antes de pagar. Ordenados por días restantes</p>
                {funnel.atRisk.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Nadie atascado ahora mismo.</p>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-sm min-w-[420px]">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                          <th className="py-2 px-4 sm:px-2 font-semibold">Psicólogo</th>
                          <th className="py-2 px-2 font-semibold">Atascado en</th>
                          <th className="py-2 px-4 sm:px-2 font-semibold text-right">Prueba</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funnel.atRisk.map(r => (
                          <tr key={r.userId} className="border-b border-slate-50 last:border-0">
                            <td className="py-2.5 px-4 sm:px-2 text-slate-700 truncate max-w-[220px]">{r.email || r.userId}</td>
                            <td className="py-2.5 px-2 text-slate-500">{r.stuck}</td>
                            <td className={`py-2.5 px-4 sm:px-2 text-right font-medium ${r.daysLeft <= 3 ? 'text-red-600' : 'text-slate-500'}`}>
                              {r.daysLeft > 0 ? `${r.daysLeft}d` : 'Expirada'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400">
              <AlertCircle className="mx-auto mb-3" size={32} />
              <p className="text-sm">No se pudo cargar el embudo.</p>
            </div>
          )}
        </div>
      )}

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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                <KpiCard
                  label="Psicólogos activos"
                  value={stats.overview.totalPsychologists}
                  from="from-indigo-50" to="to-indigo-100" border="border-indigo-200"
                  textMain="text-indigo-900" textLabel="text-indigo-600"
                  icon={<Shield size={18} className="text-indigo-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="En periodo de prueba"
                  value={stats.overview.trialCount}
                  sub={`de ${stats.overview.totalPsychologists} psicólogos`}
                  from="from-sky-50" to="to-sky-100" border="border-sky-200"
                  textMain="text-sky-900" textLabel="text-sky-600"
                  icon={<Calendar size={18} className="text-sky-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="Con plan contratado"
                  value={stats.overview.paidCount}
                  from="from-emerald-50" to="to-emerald-100" border="border-emerald-200"
                  textMain="text-emerald-900" textLabel="text-emerald-600"
                  icon={<CreditCard size={18} className="text-emerald-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="MRR estimado"
                  value={`€${stats.overview.mrr.toFixed(2)}`}
                  sub="ingresos mensuales recurrentes"
                  from="from-amber-50" to="to-amber-100" border="border-amber-200"
                  textMain="text-amber-900" textLabel="text-amber-600"
                  icon={<BadgeEuro size={18} className="text-amber-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="Total pacientes"
                  value={stats.overview.totalPatients}
                  from="from-purple-50" to="to-purple-100" border="border-purple-200"
                  textMain="text-purple-900" textLabel="text-purple-600"
                  icon={<Users size={18} className="text-purple-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="Media pacientes/psicólogo"
                  value={stats.overview.avgPatientsPerPsych}
                  sub="sólo psicólogos con pacientes"
                  from="from-rose-50" to="to-rose-100" border="border-rose-200"
                  textMain="text-rose-900" textLabel="text-rose-600"
                  icon={<TrendingUp size={18} className="text-rose-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="Inactivos (trial agotado)"
                  value={stats.overview.blockedCount}
                  sub="prueba expirada sin plan"
                  from="from-red-50" to="to-red-100" border="border-red-200"
                  textMain="text-red-900" textLabel="text-red-600"
                  icon={<UserX size={18} className="text-red-600 sm:w-[22px] sm:h-[22px]" />}
                />
                <KpiCard
                  label="Total usuarios"
                  value={stats.overview.totalUsers}
                  from="from-slate-50" to="to-slate-100" border="border-slate-200"
                  textMain="text-slate-900" textLabel="text-slate-500"
                  icon={<Activity size={18} className="text-slate-500 sm:w-[22px] sm:h-[22px]" />}
                />
              </div>

              {/* Weekly registrations chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">
                  Nuevos psicólogos por semana · últimas 8 semanas
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.weeklyRegistrations} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [v, 'Psicólogos']}
                    />
                    <Bar dataKey="psicologos" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Weekly cumulative active paid psychologists chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Psicólogos de pago activos (acumulado) · últimas 8 semanas
                </h3>
                <p className="text-xs text-slate-400 mb-4">Total de psicólogos actualmente de pago al final de cada semana</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.weeklyActivePaidPsychs || []} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="activePaidGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [v, 'Psicólogos de pago activos']}
                    />
                    <Area dataKey="pagantes" stroke="#10b981" strokeWidth={2} fill="url(#activePaidGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Weekly new paid psychologists chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Nuevos psicólogos de pago por semana · últimas 8 semanas
                </h3>
                <p className="text-xs text-slate-400 mb-4">Psicólogos que actualmente tienen plan activo, agrupados por su semana de alta</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.weeklyPaidPsychs} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number) => [v, 'Nuevos psicólogos de pago']}
                    />
                    <Bar dataKey="pagantes" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly MRR chart */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 overflow-hidden">
                <h3 className="text-sm font-semibold text-slate-700 mb-1 uppercase tracking-wide">
                  Ingresos por suscripciones de psicólogos · últimos 12 meses + previsión
                </h3>
                <p className="text-xs text-slate-400 mb-4">MRR calculado a partir del estado real de las suscripciones de Stripe. El último punto es la previsión del próximo mes (excluye suscripciones canceladas que terminan antes).</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={stats.monthlyMrr} margin={{ top: 4, right: 4, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="mes"
                      tick={(props: any) => {
                        const { x, y, payload, index } = props;
                        const isExpected = stats.monthlyMrr[index]?.expected === true;
                        return (
                          <text x={x} y={y + 10} textAnchor="middle" fontSize={10} fill={isExpected ? '#f59e0b' : '#94a3b8'} fontStyle={isExpected ? 'italic' : 'normal'}>
                            {payload.value}{isExpected ? ' (prev.)' : ''}
                          </text>
                        );
                      }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v: number) => `€${v}`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v: number, _name: string, ctx: any) => [`€${v.toFixed(2)}`, ctx?.payload?.expected ? 'Previsión' : 'Ingresos']}
                    />
                    <Area
                      dataKey="mrr"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#mrrGradient)"
                      dot={(props: any) => {
                        const { cx, cy, index, key } = props;
                        const isExpected = stats.monthlyMrr[index]?.expected === true;
                        return (
                          <circle
                            key={key}
                            cx={cx}
                            cy={cy}
                            r={isExpected ? 4 : 3}
                            fill={isExpected ? '#fff' : '#f59e0b'}
                            stroke="#f59e0b"
                            strokeWidth={isExpected ? 2 : 0}
                            strokeDasharray={isExpected ? '2 2' : undefined}
                          />
                        );
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Plan breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Distribución por plan · psicólogos de pago
                  </h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {(['starter', 'mainder', 'supermainder'] as const).map(planId => {
                    const planNames: Record<string, string> = { starter: 'Starter', mainder: 'Mainder', supermainder: 'Supermainder' };
                    const planPrices: Record<string, string> = { starter: '€9.99', mainder: '€19.99', supermainder: '€29.99' };
                    const count = stats.psychologists.filter(p => p.plan === planId && p.isSubscribed && !p.isMaster).length;
                    const base = stats.overview.paidCount;
                    const pct = base > 0 ? Math.round((count / base) * 100) : 0;
                    return (
                      <div key={planId} className="px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
                        <span className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold w-20 sm:w-28 text-center flex-shrink-0 ${PLAN_COLORS[planId]}`}>
                          {planNames[planId]}
                        </span>
                        <span className="text-[10px] sm:text-xs text-slate-400 w-12 sm:w-16 flex-shrink-0">{planPrices[planId]}/mes</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-0">
                          <div
                            className={`h-full rounded-full transition-all ${planId === 'starter' ? 'bg-blue-400' : planId === 'mainder' ? 'bg-violet-400' : 'bg-amber-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-slate-700 w-6 text-right flex-shrink-0">{count}</span>
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
                <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1fr_1.5fr_1.5fr_1fr_1fr_28px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>Nombre</span>
                  <span>Email</span>
                  <span>Teléfono</span>
                  <span>Tipo</span>
                  <span>Plan</span>
                  <span>Estado</span>
                  <span>Relaciones</span>
                  <span>Registro</span>
                  <span />
                </div>
                <div className="divide-y divide-slate-100">
                  {filtered.map(u => {
                    const isPsych = u.is_psychologist === true;
                    const pStat = isPsych ? getPsychStat(u.id) : undefined;
                    return (
                      <div
                        key={u.id}
                        className={`${isPsych && pStat ? 'cursor-pointer' : ''} hover:bg-slate-50 transition-colors`}
                        onClick={() => isPsych && pStat && openPsychDrawer(pStat)}
                      >
                        {/* ── Mobile card layout ─────────────────── */}
                        <div className="lg:hidden px-4 py-3 space-y-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                              {u.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{u.name || 'Sin nombre'}</p>
                              <p className="text-xs text-slate-400 truncate">
                                {!isTempEmail(u.email) ? u.email : <span className="italic text-slate-300">Sin email</span>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isPsych ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                                  <Shield size={10} /> Psic.
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                                  Paciente
                                </span>
                              )}
                              {isPsych && pStat && <ChevronRight size={14} className="text-slate-300" />}
                            </div>
                          </div>
                          {isPsych && pStat && (
                            <div className="flex items-center gap-2 flex-wrap pl-12">
                              {(() => { const pd = getPlanDisplay(pStat); return (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${pd.className}`}>
                                {pd.label}
                              </span>
                              ); })()}
                              <StatusBadge p={pStat} />
                              <span className="text-xs text-slate-400">{pStat.careRelationshipsCount} pacientes</span>
                              {pStat.createdAt && (
                                <span className="text-xs text-slate-400">
                                  {new Date(pStat.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* ── Desktop table row ─────────────────── */}
                        <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1fr_1.5fr_1.5fr_1fr_1fr_28px] gap-3 items-center px-5 py-3">
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

                          {/* Phone */}
                          <span className="text-sm text-slate-500 truncate">
                            {u.phone || <span className="text-slate-300">—</span>}
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
                              (() => { const pd = getPlanDisplay(pStat); return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${pd.className}`}>
                                {pd.label}
                              </span>
                              ); })()
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

                          {/* Registration date */}
                          <div>
                            {isPsych && pStat?.createdAt ? (
                              <span className="text-xs text-slate-500">
                                {new Date(pStat.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
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
                      </div>
                    );
                  })}
                </div>
              </>
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
            className="bg-white w-full max-w-[100vw] sm:max-w-sm h-full overflow-y-auto shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-lg">Detalle psicólogo</h3>
              <button
                onClick={() => setSelectedPsych(null)}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto">
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
                    {(() => { const pd = getPlanDisplay(selectedPsych); return (
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${pd.className}`}>
                      {pd.label}{selectedPsych.isSubscribed ? ` · €${selectedPsych.planPrice}/mes` : ''}
                    </span>
                    ); })()}
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

      {/* ── VENTAS TAB ─────────────────────────── */}
      {tab === 'sales' && (
        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full" /></div>}>
          <SalesPipeline />
        </React.Suspense>
      )}

      {/* ── PLANTILLAS TAB ─────────────────────── */}
      {tab === 'templates' && (
        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full" /></div>}>
          <TemplatesPanel />
        </React.Suspense>
      )}

      {/* ── EMAIL INBOX TAB ─────────────────────── */}
      {tab === 'email' && (
        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full" /></div>}>
          <EmailInbox />
        </React.Suspense>
      )}
    </div>
  );
};

export default SuperAdmin;

