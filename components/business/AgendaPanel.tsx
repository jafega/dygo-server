import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Loader2, X, AlertTriangle, Video, MapPin } from 'lucide-react';
import {
  listAppointments, createAppointment, updateAppointment, listMembers, listLocations, listPatients, getMyBusy,
  isClinicalMember, SERVICE_TYPE_LABELS, APPOINTMENT_STATUS_LABELS,
  type OrgAppointment, type OrgMember, type OrgLocation, type OrgPatient, type BusyBlock, type AppointmentStatus
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_PX = 52;
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const COLORS = ['bg-indigo-100 border-indigo-400 text-indigo-900', 'bg-emerald-100 border-emerald-400 text-emerald-900',
  'bg-amber-100 border-amber-400 text-amber-900', 'bg-sky-100 border-sky-400 text-sky-900', 'bg-rose-100 border-rose-400 text-rose-900',
  'bg-violet-100 border-violet-400 text-violet-900', 'bg-lime-100 border-lime-500 text-lime-900', 'bg-cyan-100 border-cyan-400 text-cyan-900'];

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

interface Positioned<T> { item: T; lane: number; lanes: number }

/** Reparte en carriles los elementos de un día que se solapan. */
function layout<T extends { starts_at: string; ends_at: string }>(items: T[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const out: Positioned<T>[] = [];
  let group: Positioned<T>[] = [];
  let groupEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...group.map(g => g.lane + 1));
    group.forEach(g => { g.lanes = lanes; out.push(g); });
    group = [];
  };
  for (const item of sorted) {
    const s = new Date(item.starts_at).getTime();
    const e = new Date(item.ends_at).getTime();
    if (group.length && s >= groupEnd) flush();
    const used = new Set(group.filter(g => new Date(g.item.ends_at).getTime() > s).map(g => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, e);
  }
  if (group.length) flush();
  return out;
}

interface FormState {
  id?: string;
  patient_id: string;
  member_id: string;
  date: string;
  time: string;
  duration: number;
  room_id: string;
  service_type: string;
  price: string;
  admin_notes: string;
}

const AgendaPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<OrgAppointment[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [patients, setPatients] = useState<OrgPatient[]>([]);
  const [busy, setBusy] = useState<BusyBlock[]>([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [detail, setDetail] = useState<OrgAppointment | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManageAll = c.can('agenda.manage_all');
  const canManageOwn = c.can('agenda.manage_own');
  const canCreate = (canManageAll || canManageOwn) && !c.readOnly;
  const clinicians = members.filter(isClinicalMember);
  const rooms = locations.flatMap(l => l.rooms.filter(r => r.active).map(r => ({ ...r, locationName: l.name })));
  const memberColor = useMemo(() => {
    const map: Record<string, string> = {};
    clinicians.forEach((m, i) => { map[m.id] = COLORS[i % COLORS.length]; });
    return map;
  }, [clinicians]);
  const memberName = (id: string) => {
    const m = members.find(x => x.id === id);
    return m?.display_name || m?.email || 'Profesional';
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    const [a, b] = await Promise.all([
      listAppointments(c.orgId, from, to, { memberId: memberFilter || undefined, roomId: roomFilter || undefined }),
      getMyBusy(from, to)
    ]);
    setLoading(false);
    if (a.ok && a.data) setAppointments(a.data.appointments);
    else setError(a.error || 'No se pudo cargar la agenda');
    // Bloques de mis otros espacios (otras clínicas y mi consulta), sin esta clínica.
    setBusy(b.ok && b.data ? b.data.blocks.filter(x => x.org_id !== c.orgId) : []);
  }, [c.orgId, weekStart, memberFilter, roomFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listMembers(c.orgId).then(r => r.ok && r.data && setMembers(r.data.members));
    listLocations(c.orgId).then(r => r.ok && r.data && setLocations(r.data.locations));
    if (c.can('patients.contact_all') || c.can('patients.contact_assigned')) {
      listPatients(c.orgId).then(r => r.ok && r.data && setPatients(r.data.patients));
    }
  }, [c.orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const topOf = (d: Date) => ((d.getHours() + d.getMinutes() / 60) - START_HOUR) * HOUR_PX;

  const openNew = (date?: Date, hour?: number) => {
    if (!canCreate) return;
    const d = date || new Date();
    setFormError(null);
    setForm({
      patient_id: '', member_id: canManageAll ? (memberFilter || clinicians[0]?.id || '') : c.member.id,
      date: ymd(d), time: `${String(hour ?? 10).padStart(2, '0')}:00`, duration: 50,
      room_id: roomFilter || '', service_type: 'session', price: '', admin_notes: ''
    });
  };

  const openEdit = (a: OrgAppointment) => {
    const s = new Date(a.starts_at);
    setDetail(null);
    setFormError(null);
    setForm({
      id: a.id, patient_id: a.patient_id || '', member_id: a.member_id, date: ymd(s), time: hm(s),
      duration: Math.round((new Date(a.ends_at).getTime() - s.getTime()) / 60000), room_id: a.room_id || '',
      service_type: a.service_type || 'session', price: a.price == null ? '' : String(a.price), admin_notes: a.admin_notes || ''
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const start = new Date(`${form.date}T${form.time}`);
    const end = new Date(start.getTime() + form.duration * 60000);
    const body: Partial<OrgAppointment> & Record<string, unknown> = {
      member_id: form.member_id, starts_at: start.toISOString(), ends_at: end.toISOString(),
      room_id: form.room_id || null, modality: form.room_id ? 'in_person' : 'online',
      service_type: form.service_type, price: form.price === '' ? null : Number(form.price), admin_notes: form.admin_notes || null
    };
    if (!form.id || form.patient_id) body.patient_id = form.patient_id;
    setSaving(true);
    setFormError(null);
    const r = form.id ? await updateAppointment(c.orgId, form.id, body) : await createAppointment(c.orgId, body);
    setSaving(false);
    if (!r.ok || !r.data) { setFormError(r.error || 'No se pudo guardar la cita'); return; }
    setNotice(r.data.warnings?.includes('CONFLICT_OTHER_WORKSPACE')
      ? 'Cita guardada. Atención: el profesional tiene otra cita a esa hora en otro de sus espacios de trabajo.'
      : null);
    setForm(null);
    load();
  };

  const setStatus = async (a: OrgAppointment, status: AppointmentStatus) => {
    const r = await updateAppointment(c.orgId, a.id, { status });
    if (!r.ok) { setError(r.error || 'No se pudo actualizar'); return; }
    setDetail(null);
    load();
  };

  const canEditAppt = (a: OrgAppointment) => !a.busy && !c.readOnly && (canManageAll || (canManageOwn && a.member_id === c.member.id));
  const patientOptions = canManageAll ? patients.filter(p => p.status !== 'archived')
    : patients.filter(p => p.assigned_member_ids.includes(form?.member_id || c.member.id) && p.status !== 'archived');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold text-slate-900 mr-2">Agenda</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Semana anterior"><ChevronLeft size={18} /></button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50">Hoy</button>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Semana siguiente"><ChevronRight size={18} /></button>
        </div>
        <span className="text-sm text-slate-600">
          {weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <div className="flex-1" />
        {c.can('agenda.view_all') && (
          <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Todos los profesionales</option>
            {clinicians.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
          </select>
        )}
        {rooms.length > 0 && (
          <select value={roomFilter} onChange={e => setRoomFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Todas las salas</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.locationName}</option>)}
          </select>
        )}
        {canCreate && (
          <button onClick={() => openNew()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <Plus size={16} /> Nueva cita
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" /><span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 sticky top-0 bg-white z-10">
            <div />
            {days.map((d, i) => (
              <div key={i} className={`px-2 py-2 text-center text-xs font-semibold ${sameDay(d, new Date()) ? 'text-indigo-700' : 'text-slate-600'}`}>
                {DAYS[i]} {d.getDate()}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[56px_repeat(7,1fr)] relative">
            <div>
              {hours.map(h => <div key={h} style={{ height: HOUR_PX }} className="text-[11px] text-slate-400 text-right pr-2 pt-0.5 border-b border-transparent">{`${h}:00`}</div>)}
            </div>
            {days.map((d, di) => {
              const dayAppts = appointments.filter(a => sameDay(new Date(a.starts_at), d) && a.status !== 'cancelled');
              const dayBusy = busy.filter(b => sameDay(new Date(b.starts_at), d));
              return (
                <div key={di} className="relative border-l border-slate-100" style={{ height: hours.length * HOUR_PX }}>
                  {hours.map(h => (
                    <div key={h} style={{ height: HOUR_PX }} onClick={() => openNew(d, h)}
                      className={`border-b border-slate-100 ${canCreate ? 'cursor-pointer hover:bg-indigo-50/40' : ''}`} />
                  ))}
                  {dayBusy.map((b, i) => {
                    const s = new Date(b.starts_at); const e = new Date(b.ends_at);
                    return (
                      <div key={`b${i}`} title={b.source === 'personal' ? 'Ocupado en tu consulta personal' : `Ocupado en ${b.org_name || 'otra clínica'}`}
                        className="absolute left-0 right-0 bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] border-l-2 border-slate-400 text-[10px] text-slate-600 px-1 overflow-hidden pointer-events-none"
                        style={{ top: topOf(s), height: Math.max(16, topOf(e) - topOf(s)) }}>
                        {b.source === 'personal' ? 'Mi consulta' : b.org_name}
                      </div>
                    );
                  })}
                  {layout(dayAppts).map(({ item: a, lane, lanes }) => {
                    const s = new Date(a.starts_at); const e = new Date(a.ends_at);
                    const color = a.busy ? 'bg-slate-100 border-slate-300 text-slate-500' : (memberColor[a.member_id] || COLORS[0]);
                    return (
                      <button key={a.id} onClick={(ev) => { ev.stopPropagation(); setDetail(a); }}
                        className={`absolute rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] leading-tight overflow-hidden shadow-sm ${color} ${a.status === 'no_show' ? 'opacity-60 line-through' : ''}`}
                        style={{ top: topOf(s), height: Math.max(20, topOf(e) - topOf(s) - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}>
                        <span className="font-semibold block truncate">{a.busy ? 'Ocupado' : (a.patient_name || 'Cita')}</span>
                        <span className="block truncate">{hm(s)} · {memberName(a.member_id)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {loading && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>}
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500">Las franjas rayadas son citas tuyas en otros espacios (tu consulta u otras clínicas): solo se muestra que estás ocupado/a.</p>

      {detail && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 flex-1">{detail.busy ? 'Ocupado' : (detail.patient_name || 'Cita')}</h3>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm text-slate-700">
              <p>{new Date(detail.starts_at).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} – {hm(new Date(detail.ends_at))}</p>
              <p>Profesional: <strong>{memberName(detail.member_id)}</strong></p>
              {detail.room_id
                ? <p className="flex items-center gap-1"><MapPin size={14} /> {rooms.find(r => r.id === detail.room_id)?.name || 'Sala'}</p>
                : !detail.busy && <p className="flex items-center gap-1"><Video size={14} /> Online</p>}
              {!detail.busy && (
                <>
                  <p>{SERVICE_TYPE_LABELS[detail.service_type || 'session']} · {APPOINTMENT_STATUS_LABELS[detail.status || 'scheduled']}{detail.price != null ? ` · ${detail.price} €` : ''}</p>
                  {detail.invoice_id && <p className="text-xs text-emerald-700">Facturada</p>}
                  {detail.admin_notes && <p className="text-xs text-slate-500">{detail.admin_notes}</p>}
                </>
              )}
            </div>
            {canEditAppt(detail) && !detail.invoice_id && (
              <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-slate-200">
                {detail.status === 'scheduled' && (
                  <>
                    <button onClick={() => setStatus(detail, 'cancelled')} className="px-3 py-1.5 rounded-lg text-sm text-red-700 hover:bg-red-50">Cancelar cita</button>
                    <button onClick={() => setStatus(detail, 'no_show')} className="px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">No se presentó</button>
                    <button onClick={() => openEdit(detail)} className="px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Editar</button>
                    <button onClick={() => setStatus(detail, 'completed')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700">Marcar realizada</button>
                  </>
                )}
                {detail.status !== 'scheduled' && (
                  <button onClick={() => setStatus(detail, 'scheduled')} className="px-3 py-1.5 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Volver a programada</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center px-5 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 flex-1">{form.id ? 'Editar cita' : 'Nueva cita'}</h3>
              <button type="button" onClick={() => setForm(null)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 grid sm:grid-cols-2 gap-3">
              {canManageAll && (
                <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Profesional</span>
                  <select required value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                    <option value="">Elige…</option>
                    {clinicians.map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
                  </select></label>
              )}
              <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Paciente</span>
                <select required={!form.id} value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">Elige…</option>
                  {patientOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {patientOptions.length === 0 && <span className="text-xs text-slate-500">No hay pacientes {canManageAll ? 'activos' : 'asignados'}. Créalos en Pacientes.</span>}
              </label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Día</span>
                <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Hora</span>
                <input type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Duración</span>
                <select value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  {[30, 45, 50, 60, 75, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
                </select></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Sala</span>
                <select value={form.room_id} onChange={e => setForm({ ...form, room_id: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">Online (sin sala)</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name} · {r.locationName}</option>)}
                </select></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Servicio</span>
                <select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Precio (€)</span>
                <input type="number" min={0} step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Nota administrativa</span>
                <input value={form.admin_notes} onChange={e => setForm({ ...form, admin_notes: e.target.value })} maxLength={1000} placeholder="Nada clínico: eso va en la historia" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              {formError && <p className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={16} className="animate-spin" />} Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AgendaPanel;
