import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, CalendarPlus, UserPlus, Receipt, CalendarDays, CheckCircle2, Circle, ArrowRight, FileText, NotebookPen,
  AlertTriangle, Megaphone, Wallet, Users, CheckCheck
} from 'lucide-react';
import {
  getClinicHome, bulkAppointmentStatus, SERVICE_TYPE_LABELS, APPOINTMENT_STATUS_LABELS,
  type ClinicHomeData, type SetupStep
} from '../../services/businessApi';
import type { ClinicContext, NavParams } from './ClinicWorkspace';

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const dayShort = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const greeting = () => {
  const h = new Date().getHours();
  return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
};

// Primeros pasos: el mismo formato que "Primeros pasos" de mainds pro.
const SETUP: Record<SetupStep, { title: string; hint: string; cta: string; section: string; params?: NavParams }> = {
  billing_entity: { title: 'Añade los datos fiscales de la clínica', hint: 'Razón social y CIF para emitir facturas', cta: 'Datos fiscales', section: 'billing', params: { tab: 'entities' } },
  prices: { title: 'Define tus tarifas', hint: 'Precio de la sesión, la primera visita…: rellenan las citas solas', cta: 'Tarifas', section: 'billing', params: { tab: 'prices' } },
  location: { title: 'Crea tu sede y tus salas', hint: 'Para reservar despacho sin solapes', cta: 'Sedes y salas', section: 'locations' },
  team: { title: 'Invita a tu equipo', hint: 'Profesionales, recepción o gestoría, cada uno con su cuenta', cta: 'Equipo', section: 'team' },
  patient: { title: 'Da de alta a tu primer paciente', hint: 'O conviértelo desde una solicitud de cita', cta: 'Nuevo paciente', section: 'patients', params: { tab: 'new' } },
  appointment: { title: 'Agenda la primera cita', hint: 'Puede repetirse cada semana', cta: 'Nueva cita', section: 'agenda', params: { tab: 'new' } },
  public_page: { title: 'Publica la página de la clínica', hint: 'Recibe solicitudes de cita desde tu web', cta: 'Captación', section: 'leads' }
};

const hiddenKey = (orgId: string) => `mainds_business_setup_hidden_${orgId}`;

const Card: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }> = ({ title, icon, children, right }) => (
  <section className="bg-white rounded-2xl border border-slate-200 p-5">
    <div className="flex items-center gap-2 mb-3">
      {icon}<h2 className="font-semibold text-slate-900 flex-1">{title}</h2>{right}
    </div>
    {children}
  </section>
);

/** Inicio de la clínica: el día, lo pendiente que bloquea dinero y los primeros pasos. */
const ClinicHomePanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [d, setD] = useState<ClinicHomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupHidden, setSetupHidden] = useState(() => { try { return localStorage.getItem(hiddenKey(c.orgId)) === '1'; } catch { return false; } });

  const load = useCallback(async () => {
    const r = await getClinicHome(c.orgId);
    if (r.ok && r.data) { setD(r.data); setError(null); } else setError(r.error || 'No se pudo cargar el inicio');
  }, [c.orgId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>;
  if (!d) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>;

  const firstName = (c.member.display_name || c.currentUser.name || '').split(' ')[0];
  const mine = d.today.mine;
  const summary = mine
    ? (mine.length ? `Hoy tienes ${plural(mine.length, 'cita', 'citas')}` : 'Hoy no tienes citas')
    : d.today.clinic ? `Hoy hay ${plural(d.today.clinic.total, 'cita', 'citas')} en la clínica` : `Estás en ${c.org.name}`;
  const canCreateAppt = (c.can('agenda.manage_all') || c.can('agenda.manage_own')) && !c.readOnly;
  const canCreatePatient = (c.can('patients.contact_all') || c.can('patients.contact_assigned')) && !c.readOnly;
  const setup = d.setup;
  const setupDone = setup ? setup.filter(s => s.done).length : 0;

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-200 mb-1">{c.org.name}</h2>
        <h1 className="text-2xl font-bold">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-indigo-100 text-sm mt-1">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {summary}
        </p>
      </div>

      {(canCreateAppt || canCreatePatient) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {canCreateAppt && <QuickAction icon={<CalendarPlus size={18} />} label="Nueva cita" onClick={() => c.open('agenda', { tab: 'new' })} tone="indigo" />}
          {canCreatePatient && <QuickAction icon={<UserPlus size={18} />} label="Nuevo paciente" onClick={() => c.open('patients', { tab: 'new' })} tone="sky" />}
          <QuickAction icon={<CalendarDays size={18} />} label="Ver agenda" onClick={() => c.open('agenda')} tone="violet" />
          {c.can('billing.manage') && !c.readOnly && <QuickAction icon={<Receipt size={18} />} label="Facturar pendientes" onClick={() => c.open('billing', { tab: 'bulk' })} tone="emerald" />}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        {mine && (
          <Card title="Tu día" icon={<CalendarDays size={18} className="text-indigo-600" />}>
            {mine.length === 0 ? <p className="text-sm text-slate-500">No tienes citas hoy.</p> : (
              <ul className="divide-y divide-slate-100">
                {mine.map(a => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="text-sm font-semibold text-slate-900 w-12">{hm(a.starts_at)}</span>
                    <div className="flex-1 min-w-[120px]">
                      <p className="text-sm text-slate-800">{a.patient_name || 'Paciente'}</p>
                      <p className="text-xs text-slate-500">
                        {SERVICE_TYPE_LABELS[a.service_type] || 'Sesión'} · {a.room_name || 'Online'}
                        {a.status !== 'scheduled' && ` · ${APPOINTMENT_STATUS_LABELS[a.status]}`}
                      </p>
                    </div>
                    {a.patient_id && (
                      <>
                        <button onClick={() => c.open('patients', { patientId: a.patient_id!, tab: 'historia' })} className="text-xs text-indigo-700 hover:bg-indigo-50 rounded-lg px-2 py-1 flex items-center gap-1"><NotebookPen size={13} /> Nota</button>
                        <button onClick={() => c.open('patients', { patientId: a.patient_id! })} className="text-xs text-slate-600 hover:bg-slate-100 rounded-lg px-2 py-1 flex items-center gap-1"><FileText size={13} /> Ficha</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Pending c={c} d={d} reload={load} />
        {d.today.clinic && (
          <Card title="La clínica hoy" icon={<Users size={18} className="text-indigo-600" />}
            right={<button onClick={() => c.open('agenda', { date: d.date })} className="text-xs text-indigo-700 hover:underline">Ver agenda</button>}>
            {d.today.clinic.total === 0 ? <p className="text-sm text-slate-500">No hay citas hoy.</p> : (
              <ul className="space-y-1.5">
                {d.today.clinic.by_member.map(m => (
                  <li key={m.member_id} className="flex justify-between text-sm"><span className="text-slate-700">{m.name}</span><span className="text-slate-500">{plural(m.count, 'cita', 'citas')}</span></li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>


      {setup && !setupHidden && setupDone < setup.length && (
        <Card title="Primeros pasos" right={<button onClick={() => { setSetupHidden(true); try { localStorage.setItem(hiddenKey(c.orgId), '1'); } catch { /* */ } }} className="text-xs text-slate-500 hover:text-slate-700">Ocultar</button>}>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{setupDone} de {setup.length} completados</span><span>{Math.round((setupDone / setup.length) * 100)} %</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 mb-3"><div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(setupDone / setup.length) * 100}%` }} /></div>
          <ul className="space-y-2">
            {setup.map(s => {
              const def = SETUP[s.id];
              return (
                <li key={s.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${s.done ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                  {s.done ? <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" /> : <Circle size={18} className="text-slate-300 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${s.done ? 'text-emerald-800 line-through' : 'text-slate-800'}`}>{def.title}</p>
                    <p className="text-xs text-slate-500">{def.hint}</p>
                  </div>
                  {!s.done && (
                    <button onClick={() => c.open(def.section, def.params)} className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 flex items-center gap-1 whitespace-nowrap">
                      {def.cta} <ArrowRight size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
};

const QuickAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; tone: 'indigo' | 'sky' | 'violet' | 'emerald' }> = ({ icon, label, onClick, tone }) => {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100', sky: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
    violet: 'bg-violet-50 text-violet-700 hover:bg-violet-100', emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
  };
  return (
    <button onClick={onClick} className={`rounded-xl px-3 py-4 flex flex-col items-center gap-1.5 text-sm font-medium ${tones[tone]}`}>
      {icon}{label}
    </button>
  );
};

/** Pendientes: lo que bloquea dinero o trabajo, con el botón que lo resuelve. */
const Pending: React.FC<{ c: ClinicContext; d: ClinicHomeData; reload: () => void }> = ({ c, d, reload }) => {
  const p = d.pending;
  const toClose = p.to_close;
  const [selected, setSelected] = useState<string[]>(() => toClose?.items.map(i => i.id) || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setSelected(toClose?.items.map(i => i.id) || []); }, [toClose]);

  const close = async (status: 'completed' | 'no_show') => {
    if (!selected.length) return;
    setBusy(true);
    const r = await bulkAppointmentStatus(c.orgId, selected, status);
    setBusy(false);
    if (r.ok && r.data) {
      setMsg(`${plural(r.data.updated, 'cita cerrada', 'citas cerradas')}${r.data.skipped.length ? ` · ${r.data.skipped.length} sin cambios` : ''}.`);
      reload();
    } else setMsg(r.error || 'No se pudieron cerrar las citas');
  };

  const rows: { key: string; icon: React.ReactNode; text: string; hint?: string; cta: string; go: () => void; warn?: boolean }[] = [];
  if (p.unbilled && p.unbilled.count > 0) {
    rows.push({
      key: 'unbilled', icon: <Receipt size={16} />, text: `${plural(p.unbilled.count, 'sesión realizada', 'sesiones realizadas')} sin facturar · ${eur(p.unbilled.amount)}`,
      hint: p.unbilled.without_price ? `${plural(p.unbilled.without_price, 'no tiene precio', 'no tienen precio')}: pónselo en la agenda o define las tarifas.` : undefined,
      warn: p.unbilled.without_price > 0, cta: 'Facturar', go: () => c.open('billing', { tab: 'bulk' })
    });
  }
  if (p.drafts) rows.push({ key: 'drafts', icon: <FileText size={16} />, text: `${plural(p.drafts, 'borrador de factura', 'borradores de factura')} sin emitir`, cta: 'Revisar', go: () => c.open('billing', { tab: 'invoices' }) });
  if (p.leads_new) rows.push({ key: 'leads', icon: <Megaphone size={16} />, text: `${plural(p.leads_new, 'solicitud de cita nueva', 'solicitudes de cita nuevas')}`, cta: 'Atender', go: () => c.open('leads') });
  if (p.settlements_to_validate) rows.push({ key: 'settlements', icon: <Wallet size={16} />, text: `Tienes ${plural(p.settlements_to_validate, 'liquidación', 'liquidaciones')} por validar`, cta: 'Validar', go: () => c.open('settlements') });
  if (p.invitations_pending) rows.push({ key: 'invites', icon: <Users size={16} />, text: `${plural(p.invitations_pending, 'invitación', 'invitaciones')} sin aceptar`, cta: 'Equipo', go: () => c.open('team') });

  const nothing = !rows.length && !(toClose && toClose.count > 0);
  return (
    <Card title="Pendiente" icon={<AlertTriangle size={18} className="text-amber-500" />}>
      {nothing && <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCheck size={16} /> Todo al día.</p>}
      {toClose && toClose.count > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 mb-3" data-testid="to-close">
          <p className="text-sm font-medium text-amber-900">{plural(toClose.count, 'cita pasada sigue', 'citas pasadas siguen')} como "Programada"</p>
          <p className="text-xs text-amber-800 mb-2">Ciérralas para que cuenten en la producción y se puedan facturar.</p>
          <ul className="max-h-48 overflow-y-auto space-y-1 mb-2">
            {toClose.items.map(i => (
              <li key={i.id}><label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.includes(i.id)} onChange={e => setSelected(e.target.checked ? [...selected, i.id] : selected.filter(x => x !== i.id))} />
                <span className="w-32 flex-shrink-0 whitespace-nowrap text-slate-500">{dayShort(i.starts_at)} {hm(i.starts_at)}</span>
                <span className="flex-1 truncate">{i.patient_name || 'Paciente'} · {i.member_name}</span>
              </label></li>
            ))}
          </ul>
          {toClose.count > toClose.items.length && <p className="text-xs text-amber-800 mb-2">Se muestran las {toClose.items.length} más antiguas.</p>}
          {!c.readOnly && (
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || !selected.length} onClick={() => close('completed')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                {busy && <Loader2 size={14} className="animate-spin" />} Marcar como realizadas ({selected.length})
              </button>
              <button disabled={busy || !selected.length} onClick={() => close('no_show')} className="px-3 py-1.5 rounded-lg text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50">No se presentaron</button>
            </div>
          )}
        </div>
      )}
      {msg && <p className="text-xs text-slate-600 mb-2" role="status">{msg}</p>}
      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map(r => (
            <li key={r.key} className="flex items-center gap-3 py-2.5">
              <span className={r.warn ? 'text-amber-600' : 'text-slate-500'}>{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800">{r.text}</p>
                {r.hint && <p className="text-xs text-amber-700">{r.hint}</p>}
              </div>
              <button onClick={r.go} className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 flex items-center gap-1 whitespace-nowrap">{r.cta} <ArrowRight size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default ClinicHomePanel;
