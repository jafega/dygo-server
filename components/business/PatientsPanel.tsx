import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Loader2, X, ChevronRight } from 'lucide-react';
import {
  listPatients, createPatient, listMembers, isClinicalMember, PATIENT_STATUS_LABELS,
  type OrgPatient, type OrgMember
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';
import PatientDetail from './PatientDetail';

const SOURCE_LABELS: Record<string, string> = { own: 'Propio', clinic_lead: 'Captado por la clínica', referral: 'Derivación', other: 'Otro' };

const PatientsPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [patients, setPatients] = useState<OrgPatient[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const all = c.can('patients.contact_all');
  const load = useCallback(async () => {
    setLoading(true);
    const r = await listPatients(c.orgId, { q: q || undefined, status: status || undefined });
    setLoading(false);
    if (r.ok && r.data) { setPatients(r.data.patients); setError(null); } else setError(r.error || 'No se pudieron cargar los pacientes');
  }, [c.orgId, q, status]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { listMembers(c.orgId).then(r => r.ok && r.data && setMembers(r.data.members)); }, [c.orgId]);

  if (openId) {
    return <PatientDetail c={c} patientId={openId} members={members} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-xl font-bold text-slate-900">Pacientes</h2>
          <p className="text-sm text-slate-500">{all ? 'Todos los pacientes de la clínica.' : 'Los pacientes que tienes asignados.'}</p>
        </div>
        {!c.readOnly && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <Plus size={16} /> Nuevo paciente
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, email o teléfono"
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white">
          <option value="">Activos y altas</option>
          <option value="active">Activos</option>
          <option value="discharged">Altas</option>
          <option value="archived">Archivados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {loading && patients.length === 0 && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-400" size={26} /></div>}
        {!loading && patients.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No hay pacientes{q ? ' que coincidan con la búsqueda' : ''}.</p>}
        {patients.map(p => (
          <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">{p.first_name.charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-[160px]">
              <p className="text-sm font-semibold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500 truncate">{[p.phone, p.email].filter(Boolean).join(' · ') || 'Sin contacto'}</p>
            </div>
            <p className="text-xs text-slate-600 min-w-[140px]">
              {p.assigned_members.length ? p.assigned_members.map(m => m.name).join(', ') : <span className="text-amber-700">Sin profesional asignado</span>}
            </p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{PATIENT_STATUS_LABELS[p.status]}</span>
            {p.acquisition_source === 'clinic_lead' && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{SOURCE_LABELS[p.acquisition_source]}</span>}
            <ChevronRight size={16} className="text-slate-400" />
          </button>
        ))}
      </div>

      {creating && (
        <NewPatientModal c={c} clinicians={members.filter(isClinicalMember)} onClose={() => setCreating(false)}
          onCreated={(p) => { setCreating(false); setOpenId(p.id); }} />
      )}
    </div>
  );
};

const NewPatientModal: React.FC<{ c: ClinicContext; clinicians: OrgMember[]; onClose: () => void; onCreated: (p: OrgPatient) => void }> = ({ c, clinicians, onClose, onCreated }) => {
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', birth_date: '', tax_id: '', acquisition_source: 'own', assigned: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = c.can('patients.contact_all');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: any = {
      first_name: f.first_name, last_name: f.last_name || null, email: f.email || null, phone: f.phone || null,
      birth_date: f.birth_date || null, tax_id: f.tax_id || null, acquisition_source: f.acquisition_source
    };
    if (all) body.assigned_member_ids = f.assigned ? [f.assigned] : [];
    const r = await createPatient(c.orgId, body);
    setBusy(false);
    if (r.ok && r.data) onCreated(r.data.patient); else setError(r.error || 'No se pudo crear el paciente');
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 flex-1">Nuevo paciente</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-sm font-medium text-slate-700">Nombre *</span>
            <input required className={input} value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Apellidos</span>
            <input className={input} value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Teléfono</span>
            <input className={input} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Email</span>
            <input type="email" className={input} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Fecha de nacimiento</span>
            <input type="date" className={input} value={f.birth_date} onChange={e => setF({ ...f, birth_date: e.target.value })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">NIF/NIE (para facturar)</span>
            <input className={input} value={f.tax_id} onChange={e => setF({ ...f, tax_id: e.target.value.toUpperCase() })} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">Origen</span>
            <select className={`${input} bg-white`} value={f.acquisition_source} onChange={e => setF({ ...f, acquisition_source: e.target.value })}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {all ? (
            <label className="block"><span className="text-sm font-medium text-slate-700">Profesional</span>
              <select className={`${input} bg-white`} value={f.assigned} onChange={e => setF({ ...f, assigned: e.target.value })}>
                <option value="">Sin asignar todavía</option>
                {clinicians.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
              </select></label>
          ) : <p className="text-xs text-slate-500 self-end">Se te asignará a ti.</p>}
          {error && <p className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin" />} Crear
          </button>
        </div>
      </form>
    </div>
  );
};

export default PatientsPanel;
