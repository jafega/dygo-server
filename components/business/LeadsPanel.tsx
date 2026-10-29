import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, Phone, Mail, UserCheck, Sparkles, Copy, Check, ExternalLink, BarChart3, Inbox } from 'lucide-react';
import {
  listLeads, createLead, updateLead, assignLead, convertLead, getLeadMetrics, getPublicPage, savePublicPage, saveMyPublicProfile,
  listMembers, isClinicalMember, LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS,
  type Lead, type LeadStatus, type LeadMetrics, type PublicPageSettings, type OrgMember
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

type Tab = 'inbox' | 'metrics' | 'page' | 'profile';
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const STATUS_COLORS: Record<LeadStatus, string> = {
  nuevo: 'bg-indigo-50 text-indigo-700', contactado: 'bg-sky-50 text-sky-700', primera_cita: 'bg-amber-50 text-amber-800',
  paciente: 'bg-emerald-50 text-emerald-700', descartado: 'bg-slate-100 text-slate-500'
};
const NEXT: Record<LeadStatus, LeadStatus[]> = {
  nuevo: ['contactado', 'primera_cita', 'descartado'], contactado: ['primera_cita', 'descartado', 'nuevo'],
  primera_cita: ['contactado', 'descartado'], descartado: ['nuevo'], paciente: []
};

const LeadsPanel: React.FC<{ c: ClinicContext; onOpenPatients?: () => void }> = ({ c }) => {
  const manage = c.can('leads.manage');
  const practitioner = c.member.permissions.includes('agenda.manage_own');
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'inbox', label: 'Solicitudes', show: manage || c.can('leads.assigned') },
    { id: 'metrics', label: 'Métricas', show: manage },
    { id: 'page', label: 'Página pública', show: c.can('org.settings') },
    { id: 'profile', label: 'Mi perfil público', show: practitioner }
  ];
  const [tab, setTab] = useState<Tab>(tabs.find(t => t.show)?.id || 'profile');

  if (!c.plus) {
    return (
      <div className="max-w-xl bg-white rounded-2xl border border-indigo-200 p-6 space-y-3">
        <p className="font-bold text-lg text-slate-900 flex items-center gap-2"><Sparkles size={20} className="text-indigo-600" /> Captación de pacientes</p>
        <p className="text-sm text-slate-600">Página pública de la clínica, widget de reservas para tu web, bandeja de solicitudes con reparto automático entre el equipo y métricas de conversión por canal. Incluido en <strong>mainds business Plus</strong>.</p>
        {c.can('org.subscription') && <p className="text-sm text-slate-600">Puedes cambiar de plan en Suscripción.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Captación</h2>
        <p className="text-sm text-slate-500">Solicitudes de cita que llegan por la página pública, el widget o por teléfono.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'inbox' && <InboxTab c={c} manage={manage} />}
      {tab === 'metrics' && <MetricsTab c={c} />}
      {tab === 'page' && <PageTab c={c} />}
      {tab === 'profile' && <ProfileTab c={c} />}
    </div>
  );
};

const InboxTab: React.FC<{ c: ClinicContext; manage: boolean }> = ({ c, manage }) => {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [filter, setFilter] = useState<LeadStatus | ''>('');
  const [open, setOpen] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await listLeads(c.orgId);
    if (r.ok && r.data) setLeads(r.data.leads); else { setLeads([]); setError(r.error || 'No se pudieron cargar'); }
  }, [c.orgId]);
  useEffect(() => { load(); listMembers(c.orgId).then(r => r.ok && r.data && setMembers(r.data.members)); }, [load, c.orgId]);
  const clinicians = members.filter(isClinicalMember);
  const shown = (leads || []).filter(l => !filter || l.status === filter);
  const counts = useMemo(() => Object.fromEntries((Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map(s => [s, (leads || []).filter(l => l.status === s).length])), [leads]);

  const act = async (p: Promise<{ ok: boolean; error?: string; data?: any }>) => {
    const r = await p;
    if (!r.ok) { setError(r.error || 'No se pudo completar'); return null; }
    setError(null);
    await load();
    if (r.data?.lead) setOpen(r.data.lead);
    return r.data;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 rounded-full text-xs border ${!filter ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}>Todas ({leads?.length || 0})</button>
        {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs border ${filter === s ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}>{LEAD_STATUS_LABELS[s]} ({counts[s] || 0})</button>
        ))}
        <div className="flex-1" />
        {manage && !c.readOnly && <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"><Plus size={16} /> Apuntar solicitud</button>}
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {leads === null && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400" /></div>}
        {leads && shown.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500 flex flex-col items-center gap-2"><Inbox size={28} className="text-slate-300" /> No hay solicitudes.</p>}
        {shown.map(l => (
          <button key={l.id} onClick={() => setOpen(l)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-semibold text-slate-900">{l.name}</p>
              <p className="text-xs text-slate-500 truncate">{l.reason || 'Sin motivo indicado'}</p>
            </div>
            <span className="text-xs text-slate-500">{LEAD_SOURCE_LABELS[l.source] || l.source}</span>
            <span className="text-xs text-slate-600 min-w-[120px]">{l.assigned_member_name || <span className="text-amber-700">Sin asignar</span>}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[l.status]}`}>{LEAD_STATUS_LABELS[l.status]}</span>
            <span className="text-xs text-slate-400">{new Date(l.created_at).toLocaleDateString('es-ES')}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 flex-1">{open.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${STATUS_COLORS[open.status]}`}>{LEAD_STATUS_LABELS[open.status]}</span>
              <button onClick={() => setOpen(null)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-3 text-sm">
              <div className="flex flex-wrap gap-4">
                {open.phone && <a href={`tel:${open.phone}`} className="flex items-center gap-1 text-indigo-700"><Phone size={14} /> {open.phone}</a>}
                {open.email && <a href={`mailto:${open.email}`} className="flex items-center gap-1 text-indigo-700"><Mail size={14} /> {open.email}</a>}
              </div>
              {open.reason && <p className="text-slate-700 whitespace-pre-wrap">{open.reason}</p>}
              <p className="text-xs text-slate-500">
                {LEAD_SOURCE_LABELS[open.source]}{open.utm?.source ? ` · ${open.utm.source}` : ''}{open.modality && open.modality !== 'any' ? ` · ${open.modality === 'online' ? 'online' : 'presencial'}` : ''}
                {open.preferences ? ` · ${open.preferences}` : ''}{open.preferred_member_name ? ` · prefiere a ${open.preferred_member_name}` : ''}
                {open.consent_at ? ' · consentimiento registrado' : ''}
              </p>
              {manage && open.status !== 'paciente' && !c.readOnly && (
                <label className="block"><span className="text-xs font-medium text-slate-600">Profesional asignado</span>
                  <select className={`${input} w-full mt-1 bg-white`} value={open.assigned_member_id || ''} onChange={e => act(assignLead(c.orgId, open.id, e.target.value || null))}>
                    <option value="">Sin asignar</option>
                    {clinicians.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
                  </select>
                  <button onClick={() => act(assignLead(c.orgId, open.id, 'round_robin'))} className="mt-1 text-xs text-indigo-700 hover:underline">Asignar por turno rotatorio</button>
                </label>
              )}
              {open.events.length > 0 && (
                <ol className="border-l-2 border-slate-100 pl-3 space-y-1">
                  {open.events.slice().reverse().map((ev, i) => (
                    <li key={i} className="text-xs text-slate-500">
                      {new Date(ev.at).toLocaleString('es-ES')} · {ev.type === 'status' ? `${LEAD_STATUS_LABELS[ev.from as LeadStatus]} → ${LEAD_STATUS_LABELS[ev.to as LeadStatus]}` : ev.type === 'note' ? `Nota: ${ev.note}` : ev.type === 'assigned' ? 'Asignada' : ev.type === 'converted' ? 'Convertida en paciente' : 'Recibida'}
                    </li>
                  ))}
                </ol>
              )}
              <NoteBox onAdd={(note) => act(updateLead(c.orgId, open.id, { note }))} disabled={c.readOnly} />
              {error && <p className="text-red-700">{error}</p>}
            </div>
            {!c.readOnly && (
              <div className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-slate-200">
                {NEXT[open.status].map(s => (
                  <button key={s} onClick={() => act(updateLead(c.orgId, open.id, { status: s }))} className={`px-3 py-1.5 rounded-lg text-sm ${s === 'descartado' ? 'text-slate-600 hover:bg-slate-100' : 'text-indigo-700 hover:bg-indigo-50'}`}>{LEAD_STATUS_LABELS[s]}</button>
                ))}
                {open.status !== 'paciente' && open.status !== 'descartado' && (
                  <button onClick={async () => { const d = await act(convertLead(c.orgId, open.id)); if (d) setOpen(d.lead); }} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5"><UserCheck size={15} /> Convertir en paciente</button>
                )}
                {open.status === 'paciente' && <span className="text-sm text-emerald-700 self-center">Ya es paciente: búscalo en Pacientes.</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {adding && <NewLeadModal c={c} onClose={() => setAdding(false)} onCreated={(l) => { setAdding(false); load(); setOpen(l); }} />}
    </div>
  );
};

const NoteBox: React.FC<{ onAdd: (note: string) => void; disabled: boolean }> = ({ onAdd, disabled }) => {
  const [v, setV] = useState('');
  if (disabled) return null;
  return (
    <div className="flex gap-2">
      <input value={v} onChange={e => setV(e.target.value)} placeholder="Añadir nota (llamada, mensaje…)" className={`${input} flex-1`} />
      <button disabled={!v.trim()} onClick={() => { onAdd(v); setV(''); }} className="px-3 py-2 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50">Añadir</button>
    </div>
  );
};

const NewLeadModal: React.FC<{ c: ClinicContext; onClose: () => void; onCreated: (l: Lead) => void }> = ({ c, onClose, onCreated }) => {
  const [f, setF] = useState({ name: '', phone: '', email: '', reason: '', source: 'telefono', consent: true });
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await createLead(c.orgId, { ...f, phone: f.phone || undefined, email: f.email || undefined });
    if (r.ok && r.data) onCreated(r.data.lead); else setError(r.error || 'No se pudo guardar');
  };
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-3">
        <h3 className="font-bold text-slate-900">Apuntar solicitud</h3>
        <input required placeholder="Nombre" className={`${input} w-full`} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Teléfono" className={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <input placeholder="Email" type="email" className={input} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        </div>
        <textarea rows={2} placeholder="Motivo" className={`${input} w-full`} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
        <select className={`${input} w-full bg-white`} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}>
          <option value="telefono">Llamada</option><option value="whatsapp">WhatsApp</option><option value="otro">Otro</option>
        </select>
        <label className="flex items-start gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} className="mt-0.5" /> La persona ha dado su consentimiento para que la contactemos.</label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
          <button className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700">Guardar</button>
        </div>
      </form>
    </div>
  );
};

const MetricsTab: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [m, setM] = useState<LeadMetrics | null>(null);
  useEffect(() => { getLeadMetrics(c.orgId).then(r => r.ok && r.data && setM(r.data)); }, [c.orgId]);
  if (!m) return <Loader2 className="animate-spin text-indigo-400" />;
  const Table: React.FC<{ title: string; rows: { label: string; leads: number; converted: number; rate: number }[] }> = ({ title, rows }) => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <p className="px-4 py-2 text-sm font-semibold bg-slate-50 flex items-center gap-1.5"><BarChart3 size={15} /> {title}</p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && <tr><td className="px-4 py-4 text-slate-500">Sin datos.</td></tr>}
          {rows.map(r => (
            <tr key={r.label}><td className="px-4 py-2">{r.label}</td><td className="px-4 py-2 text-right">{r.leads} solicitudes</td><td className="px-4 py-2 text-right">{r.converted} pacientes</td><td className="px-4 py-2 text-right font-semibold">{r.rate.toLocaleString('es-ES')} %</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Solicitudes</p><p className="text-2xl font-bold">{m.total}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Convertidas en pacientes</p><p className="text-2xl font-bold">{m.converted}</p></div>
        <div className="bg-white rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">Conversión</p><p className="text-2xl font-bold">{m.rate.toLocaleString('es-ES')} %</p></div>
      </div>
      <Table title="Por canal" rows={m.by_source.map(s => ({ label: LEAD_SOURCE_LABELS[s.source] || s.source, ...s }))} />
      <Table title="Por profesional" rows={m.by_member.map(s => ({ label: s.member_name || 'Profesional', ...s }))} />
    </div>
  );
};

const PageTab: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [p, setP] = useState<PublicPageSettings | null>(null);
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { getPublicPage(c.orgId).then(r => { if (r.ok && r.data) { setP(r.data.public_page || {}); setSlug(r.data.slug); } }); }, [c.orgId]);
  if (!p) return <Loader2 className="animate-spin text-indigo-400" />;
  const url = `${window.location.origin}/c/${slug}`;
  const snippet = `<iframe src="${url}?embed=1" title="Pide cita" style="width:100%;max-width:520px;height:720px;border:0"></iframe>`;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await savePublicPage(c.orgId, p);
    setMsg(r.ok ? { ok: true, text: 'Guardado' } : { ok: false, text: r.error || 'No se pudo guardar' });
  };
  return (
    <div className="space-y-4 max-w-2xl">
      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={!!p.enabled} onChange={e => setP({ ...p, enabled: e.target.checked })} /> Página pública activa
        </label>
        <input placeholder="Titular (ej. Psicología para adultos y parejas en Vigo)" className={`${input} w-full`} value={p.headline || ''} onChange={e => setP({ ...p, headline: e.target.value })} />
        <textarea rows={4} placeholder="Presentación de la clínica" className={`${input} w-full`} value={p.description || ''} onChange={e => setP({ ...p, description: e.target.value })} />
        <input placeholder="Especialidades separadas por comas" className={`${input} w-full`} value={(p.specialties || []).join(', ')} onChange={e => setP({ ...p, specialties: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
        <div className="grid sm:grid-cols-2 gap-3">
          <input placeholder="Teléfono de contacto" className={input} value={p.contact_phone || ''} onChange={e => setP({ ...p, contact_phone: e.target.value })} />
          <input placeholder="Email de contacto" className={input} value={p.contact_email || ''} onChange={e => setP({ ...p, contact_email: e.target.value })} />
          <input placeholder="Dirección" className={input} value={p.address || ''} onChange={e => setP({ ...p, address: e.target.value })} />
          <input placeholder="Ciudad" className={input} value={p.city || ''} onChange={e => setP({ ...p, city: e.target.value })} />
        </div>
        <label className="block text-sm"><span className="font-medium text-slate-700">Reparto de solicitudes</span>
          <select className={`${input} w-full mt-1 bg-white`} value={p.assignment || 'manual'} onChange={e => setP({ ...p, assignment: e.target.value as 'manual' | 'round_robin' })}>
            <option value="manual">Manual (recepción las asigna)</option>
            <option value="round_robin">Automático por turnos entre quienes aceptan solicitudes</option>
          </select></label>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
        <div className="flex justify-end"><button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Guardar</button></div>
      </form>
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2 text-sm">
        <p className="font-semibold">Enlace y widget</p>
        <a href={url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline flex items-center gap-1 break-all">{url} <ExternalLink size={13} /></a>
        <p className="text-slate-600">Pega este código en tu web para mostrar el formulario de cita:</p>
        <div className="flex gap-2">
          <input readOnly value={snippet} onFocus={e => e.target.select()} className={`${input} flex-1 font-mono text-xs`} />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ } }} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
        </div>
      </div>
    </div>
  );
};

const ProfileTab: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const pp = (c.member as any).public_profile || {};
  const [f, setF] = useState({
    visible: !!pp.visible, display_name: pp.display_name || c.member.display_name || '', bio: pp.bio || '',
    specialties: (pp.specialties || []).join(', '), photo_url: pp.photo_url || '', accepts_leads: !!c.member.accepts_leads
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await saveMyPublicProfile(c.orgId, {
      visible: f.visible, display_name: f.display_name || null, bio: f.bio || null, photo_url: f.photo_url || null,
      specialties: f.specialties.split(',').map(s => s.trim()).filter(Boolean), accepts_leads: f.accepts_leads
    });
    setMsg(r.ok ? { ok: true, text: 'Guardado' } : { ok: false, text: r.error || 'No se pudo guardar' });
  };
  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 max-w-2xl">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.visible} onChange={e => setF({ ...f, visible: e.target.checked })} /> Aparecer en la página pública de la clínica</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.accepts_leads} onChange={e => setF({ ...f, accepts_leads: e.target.checked })} /> Acepto nuevas solicitudes de pacientes</label>
      <input placeholder="Nombre público" className={`${input} w-full`} value={f.display_name} onChange={e => setF({ ...f, display_name: e.target.value })} />
      <input placeholder="Especialidades separadas por comas" className={`${input} w-full`} value={f.specialties} onChange={e => setF({ ...f, specialties: e.target.value })} />
      <textarea rows={4} placeholder="Presentación breve" className={`${input} w-full`} value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} />
      <input placeholder="URL de tu foto (https://…)" className={`${input} w-full`} value={f.photo_url} onChange={e => setF({ ...f, photo_url: e.target.value })} />
      <p className="text-xs text-slate-500">Nunca se publican tu email ni tu teléfono.</p>
      {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      <div className="flex justify-end"><button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Guardar</button></div>
    </form>
  );
};

export default LeadsPanel;
