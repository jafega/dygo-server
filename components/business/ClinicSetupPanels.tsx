import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, MapPin, DoorOpen, Save, ShieldCheck } from 'lucide-react';
import {
  listLocations, createLocation, deleteLocation, createRoom, updateRoom, deleteRoom,
  listConsentTemplates, createConsentTemplate, updateConsentTemplate, listAudit, listPatients,
  type OrgLocation, type ConsentTemplate, type AuditEntry, type OrgPatient
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

// ── Sedes y salas ──────────────────────────────────────────────────────────
export const LocationsRoomsPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLoc, setNewLoc] = useState({ name: '', address: '' });
  const [newRoom, setNewRoom] = useState<Record<string, { name: string; rate: string }>>({});
  const ro = c.readOnly;

  const load = useCallback(async () => {
    const r = await listLocations(c.orgId);
    setLoading(false);
    if (r.ok && r.data) setLocations(r.data.locations); else setError(r.error || 'No se pudieron cargar las sedes');
  }, [c.orgId]);
  useEffect(() => { load(); }, [load]);

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const r = await p;
    if (!r.ok) setError(r.error || 'No se pudo completar'); else setError(null);
    load();
    return r.ok;
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Sedes y salas</h2>
        <p className="text-sm text-slate-500">Las salas se reservan al crear citas; la agenda impide dobles reservas. La tarifa por hora se usa para el alquiler de despacho.</p>
      </div>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
      {loading ? <Loader2 className="animate-spin text-indigo-400" /> : locations.map(l => (
        <div key={l.id} className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <MapPin size={18} className="text-indigo-600" />
            <div className="flex-1"><p className="font-semibold text-slate-900">{l.name}</p>{l.address && <p className="text-xs text-slate-500">{l.address}</p>}</div>
            {!ro && l.rooms.length === 0 && (
              <button onClick={() => window.confirm(`¿Eliminar la sede ${l.name}?`) && run(deleteLocation(c.orgId, l.id))} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Eliminar sede"><Trash2 size={15} /></button>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {l.rooms.map(r => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <DoorOpen size={16} className="text-slate-400" />
                <span className={`flex-1 ${r.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{r.name}</span>
                <span className="text-slate-500">{r.hourly_rate != null ? `${r.hourly_rate} €/h` : 'Sin tarifa'}</span>
                {!ro && (
                  <>
                    <button onClick={() => {
                      const v = window.prompt('Tarifa por hora (€). Vacío para quitarla:', r.hourly_rate == null ? '' : String(r.hourly_rate));
                      if (v !== null) run(updateRoom(c.orgId, r.id, { hourly_rate: v.trim() === '' ? null : Number(v) }));
                    }} className="text-xs text-indigo-700 hover:underline">Tarifa</button>
                    <button onClick={() => window.confirm(`¿Eliminar la sala ${r.name}? Si tiene citas pasadas se desactiva.`) && run(deleteRoom(c.orgId, r.id))} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" aria-label="Eliminar sala"><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {!ro && (
            <form className="flex flex-wrap gap-2 px-4 py-3 border-t border-slate-100" onSubmit={async (e) => {
              e.preventDefault();
              const v = newRoom[l.id] || { name: '', rate: '' };
              if (await run(createRoom(c.orgId, { location_id: l.id, name: v.name, hourly_rate: v.rate ? Number(v.rate) : null }))) setNewRoom({ ...newRoom, [l.id]: { name: '', rate: '' } });
            }}>
              <input required placeholder="Nueva sala" className={`${input} flex-1 min-w-[140px]`} value={newRoom[l.id]?.name || ''} onChange={e => setNewRoom({ ...newRoom, [l.id]: { ...(newRoom[l.id] || { rate: '' }), name: e.target.value } })} />
              <input type="number" min={0} step="0.01" placeholder="€/hora" className={`${input} w-28`} value={newRoom[l.id]?.rate || ''} onChange={e => setNewRoom({ ...newRoom, [l.id]: { ...(newRoom[l.id] || { name: '' }), rate: e.target.value } })} />
              <button className="px-3 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1"><Plus size={15} /> Sala</button>
            </form>
          )}
        </div>
      ))}
      {!ro && (
        <form className="bg-white rounded-xl border border-dashed border-slate-300 p-4 flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await run(createLocation(c.orgId, newLoc))) setNewLoc({ name: '', address: '' });
        }}>
          <input required placeholder="Nombre de la sede" className={`${input} flex-1 min-w-[160px]`} value={newLoc.name} onChange={e => setNewLoc({ ...newLoc, name: e.target.value })} />
          <input placeholder="Dirección" className={`${input} flex-1 min-w-[200px]`} value={newLoc.address} onChange={e => setNewLoc({ ...newLoc, address: e.target.value })} />
          <button className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1"><Plus size={15} /> Añadir sede</button>
        </form>
      )}
    </div>
  );
};

// ── Plantillas de consentimiento ───────────────────────────────────────────
export const ConsentTemplatesPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [editing, setEditing] = useState<ConsentTemplate | { id: null; name: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listConsentTemplates(c.orgId);
    if (r.ok && r.data) setTemplates(r.data.templates); else setError(r.error || 'No se pudieron cargar');
  }, [c.orgId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const r = editing.id
      ? await updateConsentTemplate(c.orgId, editing.id, { name: editing.name, content: editing.content })
      : await createConsentTemplate(c.orgId, { name: editing.name, content: editing.content });
    setBusy(false);
    if (r.ok) { setEditing(null); load(); } else setError(r.error || 'No se pudo guardar');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Consentimientos</h2>
          <p className="text-sm text-slate-500">Plantillas de la clínica. Al registrar un consentimiento se guarda una copia literal del texto y su huella: editar una plantilla crea una versión nueva y no altera lo ya firmado.</p>
        </div>
        {!c.readOnly && <button onClick={() => setEditing({ id: null, name: '', content: '' })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"><Plus size={16} /> Nueva plantilla</button>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {editing && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <input placeholder="Nombre" className={`${input} w-full`} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          <textarea rows={10} placeholder="Texto del consentimiento" className={`${input} w-full`} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
            <button onClick={save} disabled={busy || !editing.name.trim() || !editing.content.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"><Save size={15} /> Guardar</button>
          </div>
        </div>
      )}
      <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {templates.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">Sin plantillas todavía.</li>}
        {templates.map(t => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className={`flex-1 ${t.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{t.name} <span className="text-slate-500">v{t.version}</span></span>
            {!c.readOnly && (
              <>
                <button onClick={() => setEditing(t)} className="text-indigo-700 hover:underline">Editar</button>
                <button onClick={async () => { await updateConsentTemplate(c.orgId, t.id, { active: !t.active }); load(); }} className="text-slate-600 hover:underline">{t.active ? 'Desactivar' : 'Activar'}</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ── Auditoría ──────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  'clinical.read': 'Leyó la historia clínica',
  'clinical.read.denied': 'Intento de leer la historia (denegado)',
  'clinical.write': 'Escribió en la historia clínica',
  'clinical.private_write': 'Escribió una anotación privada',
  'clinical.write.denied': 'Intento de escribir en la historia (denegado)',
  'clinical.break_glass': 'ACCESO DE EMERGENCIA a la historia',
  'patient.created': 'Creó el paciente',
  'patient.updated': 'Modificó la ficha',
  'patient.assigned': 'Cambió los profesionales asignados',
  'patient.consent_registered': 'Registró un consentimiento',
  'org.created': 'Creó la clínica',
  'org.dpa_accepted': 'Aceptó el contrato de encargo (DPA)',
  'org.member_invited': 'Invitó a un miembro',
  'org.member_joined': 'Se unió al equipo',
  'org.member_updated': 'Modificó un miembro',
  'org.member_suspend': 'Suspendió a un miembro',
  'org.member_reactivate': 'Reactivó a un miembro',
  'org.member_remove': 'Dio de baja a un miembro',
  'org.member_left': 'Salió de la clínica',
  'org.member_offboarded': 'Baja con reasignación de pacientes',
  'agenda.appointment_created': 'Creó una cita',
  'agenda.appointment_updated': 'Modificó una cita'
};

export const AuditPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [patients, setPatients] = useState<OrgPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [onlyClinical, setOnlyClinical] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (c.can('patients.contact_all')) listPatients(c.orgId, { status: 'all' }).then(r => r.ok && r.data && setPatients(r.data.patients)); }, [c.orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLoading(true);
    listAudit(c.orgId, { patientId: patientId || undefined }).then(r => {
      setLoading(false);
      if (r.ok && r.data) setEntries(r.data.entries); else setError(r.error || 'No se pudo cargar la auditoría');
    });
  }, [c.orgId, patientId]);

  const shown = entries.filter(e => !onlyClinical || e.action.startsWith('clinical.'));
  const patientName = (id: string | null) => patients.find(p => p.id === id)?.name;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><ShieldCheck size={20} className="text-emerald-600" /> Registro de accesos</h2>
        <p className="text-sm text-slate-500">Quién ha accedido a qué y cuándo. No se puede modificar ni borrar.</p>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        {patients.length > 0 && (
          <select value={patientId} onChange={e => setPatientId(e.target.value)} className={`${input} bg-white`}>
            <option value="">Todos los pacientes</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={onlyClinical} onChange={e => setOnlyClinical(e.target.checked)} /> Solo historia clínica</label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2 font-medium">Fecha</th><th className="px-4 py-2 font-medium">Quién</th><th className="px-4 py-2 font-medium">Qué</th><th className="px-4 py-2 font-medium">Paciente / motivo</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={4} className="px-4 py-6 text-center"><Loader2 className="animate-spin text-indigo-400 inline" size={20} /></td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">Sin registros.</td></tr>}
            {shown.map(e => (
              <tr key={e.id} className={e.action === 'clinical.break_glass' ? 'bg-red-50' : e.action.endsWith('.denied') ? 'bg-amber-50' : ''}>
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">{new Date(e.at).toLocaleString('es-ES')}</td>
                <td className="px-4 py-2 text-slate-800">{e.actor_name || 'Persona ajena al equipo'}</td>
                <td className="px-4 py-2 text-slate-800">{ACTION_LABELS[e.action] || e.action}</td>
                <td className="px-4 py-2 text-slate-600">{[patientName(e.patient_id), e.justification].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
