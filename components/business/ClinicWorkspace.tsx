import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Users, CreditCard, Settings, Home, Loader2, ArrowLeftRight, Menu, X, AlertTriangle, Clock,
  CalendarDays, UserRound, MapPin, FileSignature, ShieldCheck, Receipt, Wallet, Megaphone, GraduationCap, LayoutDashboard
} from 'lucide-react';
import { getOrganization, ROLE_LABELS, type Organization, type OrgMember } from '../../services/businessService';
import TeamPanel from './TeamPanel';
import { SubscriptionPanel, OrgSettingsPanel } from './ClinicAdminPanels';

const AgendaPanel = lazy(() => import('./AgendaPanel'));
const PatientsPanel = lazy(() => import('./PatientsPanel'));
const LocationsRoomsPanel = lazy(() => import('./ClinicSetupPanels').then(m => ({ default: m.LocationsRoomsPanel })));
const ConsentTemplatesPanel = lazy(() => import('./ClinicSetupPanels').then(m => ({ default: m.ConsentTemplatesPanel })));
const ClinicBillingPanel = lazy(() => import('./ClinicBillingPanel'));
const SettlementsPanel = lazy(() => import('./SettlementsPanel'));
const LeadsPanel = lazy(() => import('./LeadsPanel'));
const KnowledgePanel = lazy(() => import('./KnowledgePanel'));
const DashboardPanel = lazy(() => import('./DashboardPanel'));
const AuditPanel = lazy(() => import('./ClinicSetupPanels').then(m => ({ default: m.AuditPanel })));

export interface ClinicContext {
  orgId: string;
  org: Organization;
  member: OrgMember & { permissions: string[] };
  can: (action: string) => boolean;
  readOnly: boolean;
  plus: boolean;
  currentUser: { id: string; name?: string; email?: string };
}

interface SectionDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  visible: (c: ClinicContext) => boolean;
  render: (c: ClinicContext, helpers: { reload: () => void; exit: () => void; setOrg: (o: Organization) => void }) => React.ReactNode;
}

interface ClinicWorkspaceProps {
  orgId: string;
  currentUser: { id: string; name?: string; email?: string };
  /** Texto del botón para volver al espacio personal. */
  backLabel: string;
  onExit: () => void;
  /** Al salir de la clínica o perder el acceso. */
  onLeft: () => void;
  /** Selector de espacio (otras clínicas) para la barra lateral. */
  switcher?: React.ReactNode;
}

const ClinicHome: React.FC<{ c: ClinicContext; go: (id: string) => void; sections: SectionDef[] }> = ({ c, go, sections }) => (
  <div className="space-y-6 max-w-3xl">
    <div>
      <h1 className="text-2xl font-bold text-slate-900">{c.org.name}</h1>
      <p className="text-sm text-slate-500">Estás en el espacio de la clínica como <strong>{ROLE_LABELS[c.member.role]}</strong>. Lo que hagas aquí no se mezcla con tu espacio personal.</p>
    </div>
    <div className="grid sm:grid-cols-2 gap-3">
      {sections.filter(s => s.id !== 'home').map(s => (
        <button key={s.id} onClick={() => go(s.id)} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-300 hover:shadow-sm">
          <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">{s.icon}</span>
          <span className="font-semibold text-slate-800">{s.label}</span>
        </button>
      ))}
    </div>
  </div>
);

// Secciones de la clínica, en el orden del menú. Solo se muestran las que
// permiten los permisos de la membresía (el backend vuelve a comprobarlo).
const SECTIONS: SectionDef[] = [
  {
    id: 'dashboard', label: 'Panel de la clínica', icon: <LayoutDashboard size={18} />,
    visible: (c) => c.can('team.manage'),
    render: (c) => <DashboardPanel c={c} />
  },
  {
    id: 'agenda', label: 'Agenda', icon: <CalendarDays size={18} />,
    visible: (c) => c.can('agenda.view_all') || c.can('agenda.view_busy'),
    render: (c) => <AgendaPanel c={c} />
  },
  {
    id: 'patients', label: 'Pacientes', icon: <UserRound size={18} />,
    visible: (c) => c.can('patients.contact_all') || c.can('patients.contact_assigned'),
    render: (c) => <PatientsPanel c={c} />
  },
  {
    id: 'leads', label: 'Captación', icon: <Megaphone size={18} />,
    visible: (c) => c.can('leads.manage') || c.can('leads.assigned') || c.can('org.settings'),
    render: (c) => <LeadsPanel c={c} />
  },
  {
    id: 'billing', label: 'Facturación', icon: <Receipt size={18} />,
    visible: (c) => c.can('billing.manage') || c.can('billing.own') || c.can('billing.read_export'),
    render: (c) => <ClinicBillingPanel c={c} />
  },
  {
    id: 'settlements', label: 'Liquidaciones', icon: <Wallet size={18} />,
    visible: (c) => c.can('settlements.manage') || c.can('settlements.read') || c.can('settlements.own'),
    render: (c) => <SettlementsPanel c={c} />
  },
  {
    id: 'knowledge', label: 'Formación', icon: <GraduationCap size={18} />,
    visible: (c) => c.can('library.consume') || c.can('library.manage'),
    render: (c) => <KnowledgePanel c={c} />
  },
  {
    id: 'team', label: 'Equipo', icon: <Users size={18} />,
    visible: () => true,
    render: (c) => <TeamPanel orgId={c.orgId} canManage={c.can('team.manage')} myMemberId={c.member.id} readOnly={c.readOnly} />
  },
  {
    id: 'locations', label: 'Sedes y salas', icon: <MapPin size={18} />,
    visible: (c) => c.can('team.manage'),
    render: (c) => <LocationsRoomsPanel c={c} />
  },
  {
    id: 'consents', label: 'Consentimientos', icon: <FileSignature size={18} />,
    visible: (c) => c.can('team.manage') || c.can('clinical.read_all'),
    render: (c) => <ConsentTemplatesPanel c={c} />
  },
  {
    id: 'audit', label: 'Registro de accesos', icon: <ShieldCheck size={18} />,
    visible: (c) => c.can('audit.view'),
    render: (c) => <AuditPanel c={c} />
  },
  {
    id: 'subscription', label: 'Suscripción', icon: <CreditCard size={18} />,
    visible: (c) => c.can('org.subscription'),
    render: (c) => <SubscriptionPanel orgId={c.orgId} />
  },
  {
    id: 'settings', label: 'Ajustes', icon: <Settings size={18} />,
    visible: () => true,
    render: (c, h) => (
      <OrgSettingsPanel
        org={c.org} myMemberId={c.member.id} isOwner={c.member.role === 'titular'} isClinical={!!c.member.is_clinical}
        canEdit={c.can('org.settings') && !c.readOnly} onSaved={(o) => { h.setOrg(o); h.reload(); }} onLeft={h.exit}
      />
    )
  }
];

const ClinicWorkspace: React.FC<ClinicWorkspaceProps> = ({ orgId, currentUser, backLabel, onExit, onLeft, switcher }) => {
  const [org, setOrg] = useState<Organization | null>(null);
  const [member, setMember] = useState<(OrgMember & { permissions: string[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getOrganization(orgId);
    if (r.ok && r.data) {
      setOrg(r.data.organization);
      setMember(r.data.membership as any);
      setError(null);
    } else if (r.status === 404) {
      onLeft(); // ya no es miembro (baja o suspensión)
    } else {
      setError(r.error || 'No se pudo cargar la clínica');
    }
  }, [orgId, onLeft]);

  useEffect(() => { setActive('home'); setOrg(null); load(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: ClinicContext | null = useMemo(() => (org && member ? {
    orgId, org, member,
    can: (a: string) => member.permissions.includes(a),
    readOnly: org.access !== 'full',
    plus: org.plus,
    currentUser
  } : null), [org, member, orgId, currentUser]);

  const sections: SectionDef[] = useMemo(() => {
    if (!ctx) return [];
    const home: SectionDef = { id: 'home', label: 'Inicio', icon: <Home size={18} />, visible: () => true, render: () => null };
    return [home, ...SECTIONS.filter(s => s.visible(ctx))];
  }, [ctx]);

  if (error) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <p className="text-slate-700">{error}</p>
        <button onClick={onExit} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">{backLabel}</button>
      </div>
    );
  }
  if (!ctx) {
    return <div className="h-dvh flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>;
  }

  const current = sections.find(s => s.id === active) || sections[0];
  const go = (id: string) => { setActive(id); setSidebarOpen(false); };
  const helpers = { reload: load, exit: onLeft, setOrg };

  return (
    <div className="h-dvh bg-slate-50 text-slate-900 flex overflow-hidden" data-testid="clinic-workspace">
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200">
          {ctx.org.logo_url
            ? <img src={ctx.org.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
            : <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Building2 size={18} /></div>}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 truncate">{ctx.org.name}</p>
            <p className="text-xs text-slate-500 truncate">{ROLE_LABELS[ctx.member.role]}</p>
          </div>
          <button className="md:hidden p-1 text-slate-500" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {sections.map(s => (
            <button key={s.id} onClick={() => go(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${current.id === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              {s.icon}<span>{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200 space-y-2">
          {switcher}
          <button onClick={onExit} className="w-full px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-2 border border-indigo-100">
            <ArrowLeftRight size={16} /><span className="truncate">{backLabel}</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1 text-slate-600" aria-label="Abrir menú"><Menu size={20} /></button>
          <span className="font-semibold truncate">{ctx.org.name}</span>
        </header>
        {ctx.org.trial && (
          <div className="flex items-center gap-2 px-4 md:px-8 py-2 bg-indigo-50 text-indigo-900 text-sm border-b border-indigo-100">
            <Clock size={15} className="flex-shrink-0" />
            <span className="flex-1">Prueba gratuita: quedan {ctx.org.trial_days_left} {ctx.org.trial_days_left === 1 ? 'día' : 'días'}.</span>
            {ctx.can('org.subscription') && <button onClick={() => go('subscription')} className="font-semibold underline">Activar suscripción</button>}
          </div>
        )}
        {ctx.readOnly && (
          <div className="flex items-center gap-2 px-4 md:px-8 py-2 bg-amber-50 text-amber-900 text-sm border-b border-amber-200" role="alert">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span className="flex-1">La suscripción de la clínica no está activa: puedes consultar los datos, pero no modificarlos.</span>
            {ctx.can('org.subscription')
              ? <button onClick={() => go('subscription')} className="font-semibold underline">Reactivar</button>
              : <span className="text-xs">Avisa al titular.</span>}
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>}>
            {current.id === 'home'
              ? <ClinicHome c={ctx} go={go} sections={sections} />
              : current.render(ctx, helpers)}
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default ClinicWorkspace;
