import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Lock, ShieldAlert, FileSignature, Pencil, Trash2, CornerDownRight, Save, CalendarPlus, Repeat } from 'lucide-react';
import {
  getPatient, updatePatient, setPatientAssignments, listNotes, createNote, updatePrivateNote, deletePrivateNote, breakGlass,
  listConsentTemplates, listPatientConsents, registerConsent, isClinicalMember, listPatientAppointments, PATIENT_STATUS_LABELS,
  SERVICE_TYPE_LABELS, APPOINTMENT_STATUS_LABELS,
  type OrgPatient, type OrgMember, type ClinicalNote, type ConsentTemplate, type PatientConsent, type PatientStatus, type OrgAppointment
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

type Tab = 'ficha' | 'citas' | 'historia' | 'privadas' | 'consentimientos';
const TABS: Tab[] = ['ficha', 'citas', 'historia', 'privadas', 'consentimientos'];

const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const PatientDetail: React.FC<{ c: ClinicContext; patientId: string; members: OrgMember[]; initialTab?: string; onBack: () => void }> = ({ c, patientId, members, initialTab, onBack }) => {
  const [patient, setPatient] = useState<OrgPatient | null>(null);
  const [clinicalAccess, setClinicalAccess] = useState(false);
  const [canBreakGlass, setCanBreakGlass] = useState(false);
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab as Tab) ? initialTab as Tab : 'ficha');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await getPatient(c.orgId, patientId);
    if (r.ok && r.data) {
      setPatient(r.data.patient);
      setClinicalAccess(r.data.clinical_access);
      setCanBreakGlass(r.data.can_break_glass);
    } else setError(r.error || 'No se pudo cargar el paciente');
  }, [c.orgId, patientId]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="space-y-3"><button onClick={onBack} className="text-sm text-indigo-700 flex items-center gap-1"><ArrowLeft size={16} /> Pacientes</button><p className="text-sm text-red-700">{error}</p></div>;
  if (!patient) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'ficha', label: 'Ficha', show: true },
    { id: 'citas', label: 'Citas', show: c.can('agenda.view_all') || c.can('agenda.view_busy') },
    { id: 'historia', label: 'Historia clínica', show: clinicalAccess || canBreakGlass },
    { id: 'privadas', label: 'Mis anotaciones privadas', show: clinicalAccess && c.member.permissions.includes('agenda.manage_own') },
    { id: 'consentimientos', label: 'Consentimientos', show: true }
  ];

  const visible = tabs.filter(t => t.show);
  // Pestaña pedida sin permiso (p. ej. historia sin acceso): se muestra la ficha.
  const current = visible.some(t => t.id === tab) ? tab : 'ficha';

  return (
    <div className="space-y-4 max-w-4xl">
      <button onClick={onBack} className="text-sm text-indigo-700 hover:text-indigo-900 flex items-center gap-1"><ArrowLeft size={16} /> Pacientes</button>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-slate-900 flex-1">{patient.name}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{PATIENT_STATUS_LABELS[patient.status]}</span>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {visible.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${current === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.id === 'privadas' && <Lock size={13} className="inline mr-1 -mt-0.5" />}{t.label}
          </button>
        ))}
      </div>
      {current === 'ficha' && <Ficha c={c} patient={patient} members={members} onSaved={setPatient} />}
      {current === 'citas' && <Appointments c={c} patient={patient} members={members} />}
      {current === 'historia' && (clinicalAccess
        ? <Notes c={c} patientId={patient.id} visibility="clinical_record" />
        : <BreakGlass c={c} patientId={patient.id} />)}
      {current === 'privadas' && <Notes c={c} patientId={patient.id} visibility="private_annotation" />}
      {current === 'consentimientos' && <Consents c={c} patientId={patient.id} />}
    </div>
  );
};

const Ficha: React.FC<{ c: ClinicContext; patient: OrgPatient; members: OrgMember[]; onSaved: (p: OrgPatient) => void }> = ({ c, patient, members, onSaved }) => {
  const [f, setF] = useState({
    first_name: patient.first_name, last_name: patient.last_name || '', email: patient.email || '', phone: patient.phone || '',
    birth_date: patient.birth_date || '', tax_id: patient.tax_id || '', address: patient.address || '', admin_notes: patient.admin_notes || '',
    status: patient.status, default_price: patient.default_price == null ? '' : String(patient.default_price)
  });
  const [assigned, setAssigned] = useState<string[]>(patient.assigned_member_ids);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canAssign = c.can('patients.contact_all') && !c.readOnly;
  const clinicians = members.filter(isClinicalMember);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await updatePatient(c.orgId, patient.id, { ...f, last_name: f.last_name || null, email: f.email || null, phone: f.phone || null, birth_date: f.birth_date || null, tax_id: f.tax_id || null, address: f.address || null, admin_notes: f.admin_notes || null, default_price: f.default_price === '' ? null : Number(f.default_price) } as any);
    let p = r.data?.patient;
    if (r.ok && canAssign && JSON.stringify([...assigned].sort()) !== JSON.stringify([...patient.assigned_member_ids].sort())) {
      const a = await setPatientAssignments(c.orgId, patient.id, assigned);
      if (!a.ok) { setBusy(false); setMsg({ ok: false, text: a.error || 'No se pudo asignar' }); return; }
      p = a.data?.patient;
    }
    setBusy(false);
    if (r.ok && p) { onSaved(p); setMsg({ ok: true, text: 'Guardado' }); } else setMsg({ ok: false, text: r.error || 'No se pudo guardar' });
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50';
  const ro = c.readOnly;
  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-3">
      <label className="block"><span className="text-sm font-medium text-slate-700">Nombre</span><input disabled={ro} required className={input} value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Apellidos</span><input disabled={ro} className={input} value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Teléfono</span><input disabled={ro} className={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Email</span><input disabled={ro} type="email" className={input} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Fecha de nacimiento</span><input disabled={ro} type="date" className={input} value={f.birth_date} onChange={e => setF({ ...f, birth_date: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">NIF/NIE</span><input disabled={ro} className={input} value={f.tax_id} onChange={e => setF({ ...f, tax_id: e.target.value.toUpperCase() })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Dirección</span><input disabled={ro} className={input} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Precio por sesión (€)</span>
        <input disabled={ro} type="number" min={0} step="0.01" className={input} value={f.default_price} onChange={e => setF({ ...f, default_price: e.target.value })}
          placeholder={c.org.service_prices?.session != null ? `Tarifa de la clínica: ${c.org.service_prices.session} €` : 'Tarifa de la clínica'} />
        <span className="text-xs text-slate-500">Solo si es distinto de la tarifa (precio reducido, convenio…).</span></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Estado</span>
        <select disabled={ro} className={`${input} bg-white`} value={f.status} onChange={e => setF({ ...f, status: e.target.value as PatientStatus })}>
          {Object.entries(PATIENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <div className="block">
        <span className="text-sm font-medium text-slate-700">Profesionales asignados</span>
        {canAssign ? (
          <div className="mt-1 space-y-1 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {clinicians.map(m => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assigned.includes(m.id)} onChange={e => setAssigned(e.target.checked ? [...assigned, m.id] : assigned.filter(x => x !== m.id))} />
                {m.display_name || m.email}
              </label>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-slate-700">{patient.assigned_members.map(m => m.name).join(', ') || 'Ninguno'}</p>}
      </div>
      <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Notas administrativas</span>
        <textarea disabled={ro} rows={2} className={input} value={f.admin_notes} onChange={e => setF({ ...f, admin_notes: e.target.value })} placeholder="Horarios preferidos, forma de pago… Nada clínico." /></label>
      {msg && <p className={`sm:col-span-2 text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{msg.text}</p>}
      {!ro && (
        <div className="sm:col-span-2 flex justify-end">
          <button disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
          </button>
        </div>
      )}
    </form>
  );
};

const Notes: React.FC<{ c: ClinicContext; patientId: string; visibility: ClinicalNote['visibility'] }> = ({ c, patientId, visibility }) => {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [amending, setAmending] = useState<ClinicalNote | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = c.member.permissions.includes('agenda.manage_own') && !c.readOnly;
  const isPrivate = visibility === 'private_annotation';

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listNotes(c.orgId, patientId);
    setLoading(false);
    if (r.ok && r.data) { setNotes(r.data.notes.filter(n => n.visibility === visibility)); setError(null); }
    else setError(r.error || 'No se pudo cargar la historia');
  }, [c.orgId, patientId, visibility]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const r = await createNote(c.orgId, patientId, { content: text, visibility, amends_note_id: amending?.id });
    setBusy(false);
    if (r.ok) { setText(''); setAmending(null); load(); } else setError(r.error || 'No se pudo guardar la nota');
  };

  const saveEdit = async (n: ClinicalNote) => {
    const r = await updatePrivateNote(c.orgId, patientId, n.id, editText);
    if (r.ok) { setEditing(null); load(); } else setError(r.error || 'No se pudo guardar');
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-3 py-2 text-xs ${isPrivate ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
        {isPrivate
          ? <><Lock size={12} className="inline mr-1 -mt-0.5" />Anotaciones subjetivas (art. 18.3 Ley 41/2002): <strong>solo las ves tú</strong>. Ni la dirección, ni la clínica, ni mainds pueden leerlas.</>
          : 'Historia clínica de la clínica: la ve el equipo que trata al paciente y la dirección clínica. Las notas no se borran ni se editan: se corrigen con una nota nueva. Cada lectura queda registrada.'}
      </div>
      {canWrite && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          {amending && (
            <p className="text-xs text-slate-600 flex items-center gap-1"><CornerDownRight size={13} /> Corrigiendo la nota del {fmt(amending.created_at)} <button onClick={() => setAmending(null)} className="underline ml-1">cancelar</button></p>
          )}
          <textarea rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={50000}
            placeholder={isPrivate ? 'Impresiones personales, hipótesis…' : 'Evolución, intervención, plan…'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="flex justify-end">
            <button onClick={add} disabled={busy || !text.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} {amending ? 'Añadir corrección' : 'Añadir nota'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      {loading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400" size={24} /></div> : (
        <ol className="space-y-3">
          {notes.length === 0 && <p className="text-sm text-slate-500">Todavía no hay notas.</p>}
          {[...notes].reverse().map(n => (
            <li key={n.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
                <span className="font-semibold text-slate-700">{n.author_name || 'Profesional'}</span>
                <span>{fmt(n.created_at)}</span>
                {n.amends_note_id && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Corrección</span>}
                <div className="flex-1" />
                {canWrite && !isPrivate && <button onClick={() => { setAmending(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-indigo-700 hover:underline">Corregir</button>}
                {isPrivate && n.is_mine && !c.readOnly && (
                  <>
                    <button onClick={() => { setEditing(n.id); setEditText(n.content || ''); }} className="p-1 hover:text-slate-800" aria-label="Editar"><Pencil size={13} /></button>
                    <button onClick={async () => { if (window.confirm('¿Borrar esta anotación privada?')) { await deletePrivateNote(c.orgId, patientId, n.id); load(); } }} className="p-1 hover:text-red-700" aria-label="Borrar"><Trash2 size={13} /></button>
                  </>
                )}
              </div>
              {editing === n.id ? (
                <div className="space-y-2">
                  <textarea rows={4} value={editText} onChange={e => setEditText(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
                    <button onClick={() => saveEdit(n)} className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white">Guardar</button>
                  </div>
                </div>
              ) : n.unreadable
                ? <p className="text-sm text-red-700">No se ha podido descifrar esta nota. Avisa al soporte.</p>
                : <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.content}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/** Citas del paciente: próximas y pasadas, con "Nueva cita" (abre la agenda). */
const Appointments: React.FC<{ c: ClinicContext; patient: OrgPatient; members: OrgMember[] }> = ({ c, patient, members }) => {
  const [rows, setRows] = useState<OrgAppointment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listPatientAppointments(c.orgId, patient.id).then(r => { if (r.ok && r.data) setRows(r.data.appointments); else setError(r.error || 'No se pudieron cargar las citas'); });
  }, [c.orgId, patient.id]);
  const name = (id: string) => { const m = members.find(x => x.id === id); return m?.display_name || m?.email || 'Profesional'; };
  const now = Date.now();
  const upcoming = (rows || []).filter(a => new Date(a.ends_at).getTime() > now && a.status !== 'cancelled').reverse();
  const past = (rows || []).filter(a => !upcoming.includes(a));
  const canBook = (c.can('agenda.manage_all') || c.can('agenda.manage_own')) && !c.readOnly && patient.status !== 'archived';
  const row = (a: OrgAppointment) => (
    <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
      <span className="w-40 text-slate-700">{new Date(a.starts_at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      <span className="flex-1 min-w-[120px] text-slate-600">{a.busy ? 'Otro profesional' : `${SERVICE_TYPE_LABELS[a.service_type || 'session']} · ${name(a.member_id)}`}</span>
      {a.series_id && <Repeat size={13} className="text-slate-400" aria-label="Serie" />}
      {!a.busy && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{APPOINTMENT_STATUS_LABELS[a.status || 'scheduled']}</span>}
      {!a.busy && a.status === 'completed' && <span className={`text-xs ${a.invoice_id ? 'text-emerald-700' : 'text-amber-700'}`}>{a.invoice_id ? 'Facturada' : 'Sin facturar'}</span>}
    </li>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-600 flex-1">{rows ? `${rows.filter(a => a.status === 'completed').length} sesiones realizadas` : ''}</p>
        {canBook && (
          <button onClick={() => c.open('agenda', { newAppointmentFor: patient.id })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <CalendarPlus size={16} /> Nueva cita
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {!rows ? <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-400" size={24} /></div> : (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Próximas</p>
            <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {upcoming.length ? upcoming.map(row) : <li className="px-4 py-3 text-sm text-slate-500">Sin citas próximas.</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Anteriores</p>
            <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {past.length ? past.map(row) : <li className="px-4 py-3 text-sm text-slate-500">Todavía no hay citas.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

const BreakGlass: React.FC<{ c: ClinicContext; patientId: string }> = ({ c, patientId }) => {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState<ClinicalNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const r = await breakGlass(c.orgId, patientId, reason);
    setBusy(false);
    if (r.ok && r.data) setNotes(r.data.notes); else setError(r.error || 'No se pudo abrir la historia');
  };
  if (notes) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-900">Acceso de emergencia registrado. Solo lectura.</p>
        {notes.length === 0 && <p className="text-sm text-slate-500">No hay notas.</p>}
        {notes.map(n => (
          <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">{n.author_name} · {fmt(n.created_at)}</p>
            <p className="text-sm whitespace-pre-wrap">{n.content}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl border border-red-200 p-5 space-y-3 max-w-xl">
      <p className="font-semibold text-red-800 flex items-center gap-2"><ShieldAlert size={18} /> Acceso de emergencia a la historia clínica</p>
      <p className="text-sm text-slate-600">Como titular no ves la historia clínica. Solo puedes abrirla en una situación justificada (requerimiento judicial, urgencia, ausencia del profesional…). El acceso y el motivo quedan registrados y los ve la dirección clínica. Las anotaciones privadas de los profesionales nunca se muestran.</p>
      <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo del acceso (mínimo 20 caracteres)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button onClick={open} disabled={busy || reason.trim().length < 20} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">Abrir con este motivo</button>
    </div>
  );
};

const Consents: React.FC<{ c: ClinicContext; patientId: string }> = ({ c, patientId }) => {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [consents, setConsents] = useState<PatientConsent[]>([]);
  const [tpl, setTpl] = useState('');
  const [method, setMethod] = useState<PatientConsent['method']>('papel_firmado');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PatientConsent | null>(null);

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([listConsentTemplates(c.orgId), listPatientConsents(c.orgId, patientId)]);
    if (t.ok && t.data) setTemplates(t.data.templates.filter(x => x.active));
    if (p.ok && p.data) setConsents(p.data.consents);
  }, [c.orgId, patientId]);
  useEffect(() => { load(); }, [load]);

  const register = async () => {
    const r = await registerConsent(c.orgId, patientId, tpl, method);
    if (r.ok) { setTpl(''); setError(null); load(); } else setError(r.error || 'No se pudo registrar');
  };

  return (
    <div className="space-y-4">
      {!c.readOnly && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[200px]"><span className="text-sm font-medium text-slate-700">Consentimiento</span>
            <select value={tpl} onChange={e => setTpl(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Elige una plantilla…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Cómo se ha firmado</span>
            <select value={method} onChange={e => setMethod(e.target.value as PatientConsent['method'])} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="papel_firmado">Papel firmado</option>
              <option value="aceptacion_presencial">Aceptación presencial</option>
            </select></label>
          <button onClick={register} disabled={!tpl} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"><FileSignature size={16} /> Registrar</button>
          {templates.length === 0 && <p className="w-full text-xs text-slate-500">La clínica aún no tiene plantillas de consentimiento (se crean en Consentimientos).</p>}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {consents.length === 0 && <li className="px-4 py-6 text-sm text-slate-500 text-center">Sin consentimientos registrados.</li>}
        {consents.map(x => (
          <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="font-semibold text-slate-900 flex-1">{x.template_name} <span className="font-normal text-slate-500">v{x.template_version}</span></span>
            <span className="text-slate-600">{x.method === 'papel_firmado' ? 'Papel firmado' : 'Aceptación presencial'}</span>
            <span className="text-slate-500">{fmt(x.signed_at)}</span>
            <button onClick={() => setView(x)} className="text-indigo-700 hover:underline">Ver texto</button>
          </li>
        ))}
      </ul>
      {view && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" onClick={() => setView(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85dvh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">{view.template_name} (v{view.template_version})</h3>
            <p className="text-xs text-slate-500 mb-3">Huella SHA-256: <span className="font-mono break-all">{view.content_sha256}</span></p>
            <p className="text-sm whitespace-pre-wrap text-slate-800">{view.content_snapshot}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDetail;
