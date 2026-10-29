import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Plus, Loader2, CheckCircle2, Circle, ExternalLink, Sparkles, Send, Users, Trash2, Lock } from 'lucide-react';
import {
  listLibrary, createLibraryItem, deleteLibraryItem, askLibrary, listCourses, createCourse, addCourseModule, completeModule,
  getTrainingHours, listSupervision, createSupervision, listMembers, listPatients, isClinicalMember, LIBRARY_KIND_LABELS,
  type LibraryItem, type LibraryKind, type Course, type TrainingHoursRow, type SupervisionLog, type OrgMember
} from '../../services/businessApi';
import { buildChatDictionary, createAnonymizerState, anonymize, deanonymize } from '../../services/chatAnonymizer';
import type { ClinicContext } from './ClinicWorkspace';

type Tab = 'library' | 'assistant' | 'courses' | 'supervision';
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const KnowledgePanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const manage = c.can('library.manage');
  const clinical = c.member.permissions.includes('agenda.manage_own') || c.can('clinical.read_all');
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'library', label: 'Biblioteca', show: true },
    { id: 'assistant', label: 'Asistente IA', show: true },
    { id: 'courses', label: 'Cursos', show: true },
    { id: 'supervision', label: 'Supervisión', show: clinical }
  ];
  const [tab, setTab] = useState<Tab>('library');
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Formación y protocolos</h2>
        <p className="text-sm text-slate-500">La biblioteca de la clínica, los cursos de acogida y formación y el registro de supervisión.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'library' && <LibraryTab c={c} manage={manage} />}
      {tab === 'assistant' && <AssistantTab c={c} />}
      {tab === 'courses' && <CoursesTab c={c} manage={manage} />}
      {tab === 'supervision' && <SupervisionTab c={c} />}
    </div>
  );
};

const LibraryTab: React.FC<{ c: ClinicContext; manage: boolean }> = ({ c, manage }) => {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; kind: LibraryKind; body: string; url: string; tags: string } | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => listLibrary(c.orgId).then(r => setItems(r.ok && r.data ? r.data.items : [])), [c.orgId]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form) return;
    const r = await createLibraryItem(c.orgId, { title: form.title, kind: form.kind, body: form.body || null, url: form.url || null, tags: form.tags.split(',').map(s => s.trim()).filter(Boolean) });
    if (r.ok) { setForm(null); setError(null); load(); } else setError(r.error || 'No se pudo guardar');
  };
  const shown = (items || []).filter(i => !q || `${i.title} ${i.tags.join(' ')} ${i.body || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en la biblioteca" className={`${input} flex-1 min-w-[200px]`} />
        {manage && !c.readOnly && !form && <button onClick={() => setForm({ title: '', kind: 'protocolo', body: '', url: '', tags: '' })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700"><Plus size={16} /> Añadir</button>}
      </div>
      {form && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Título" className={`${input} flex-1 min-w-[200px]`} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            <select className={`${input} bg-white`} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value as LibraryKind })}>
              {Object.entries(LIBRARY_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <textarea rows={6} placeholder="Contenido (puedes usar Markdown)" className={`${input} w-full font-mono`} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <input placeholder="Enlace https:// (opcional)" className={`${input} flex-1`} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            <input placeholder="Etiquetas, separadas por comas" className={`${input} flex-1`} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
            <button onClick={save} disabled={!form.title.trim()} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-600 disabled:opacity-50">Guardar</button>
          </div>
        </div>
      )}
      {items === null ? <Loader2 className="animate-spin text-indigo-400" /> : shown.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white rounded-xl border border-slate-200 px-4 py-8 text-center">La biblioteca está vacía{manage ? ': añade los protocolos y materiales de la clínica.' : '.'}</p>
      ) : (
        <ul className="space-y-2">
          {shown.map(i => (
            <li key={i.id} className="bg-white rounded-xl border border-slate-200">
              <button onClick={() => setOpen(open === i.id ? null : i.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <BookOpen size={16} className="text-indigo-600 flex-shrink-0" />
                <span className="flex-1 font-semibold text-slate-900">{i.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{LIBRARY_KIND_LABELS[i.kind]}</span>
              </button>
              {open === i.id && (
                <div className="px-4 pb-4 space-y-2 text-sm">
                  {i.body && <p className="whitespace-pre-wrap text-slate-700">{i.body}</p>}
                  {i.url && <a href={i.url} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline flex items-center gap-1">{i.url} <ExternalLink size={13} /></a>}
                  {i.tags.length > 0 && <p className="text-xs text-slate-500">{i.tags.map(t => `#${t}`).join(' ')}</p>}
                  {manage && !c.readOnly && <button onClick={async () => { if (window.confirm('¿Eliminar de la biblioteca?')) { await deleteLibraryItem(c.orgId, i.id); load(); } }} className="text-xs text-red-700 flex items-center gap-1"><Trash2 size={12} /> Eliminar</button>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const AssistantTab: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ q: string; a: string; sources: { n: number; title: string }[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!c.plus) {
    return <p className="max-w-xl text-sm text-slate-600 bg-white rounded-xl border border-indigo-200 p-5 flex gap-2"><Sparkles size={18} className="text-indigo-600 flex-shrink-0" /> El asistente que responde con los protocolos de la clínica está incluido en mainds business Plus.</p>;
  }
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    // La pregunta se anonimiza aquí, antes de salir del navegador: nombres,
    // emails y teléfonos de los pacientes que ves se sustituyen por tokens.
    const state = createAnonymizerState();
    let dict: ReturnType<typeof buildChatDictionary> = [];
    if (c.can('patients.contact_all') || c.can('patients.contact_assigned')) {
      const r = await listPatients(c.orgId, { status: 'all' });
      dict = buildChatDictionary((r.data?.patients || []).map(p => ({ name: p.name, email: p.email || undefined, phone: p.phone || undefined, dni: p.tax_id || undefined })), c.currentUser.name);
    }
    const safe = anonymize(question, dict, state);
    const r = await askLibrary(c.orgId, safe);
    setBusy(false);
    if (!r.ok || !r.data) { setError(r.error || 'El asistente no ha podido responder'); return; }
    setHistory([{ q: question, a: deanonymize(r.data.answer, state), sources: r.data.sources }, ...history]);
    setQuestion('');
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <form onSubmit={ask} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <p className="text-sm text-slate-600 flex items-center gap-1.5"><Lock size={14} /> Responde solo con la biblioteca de la clínica. Los datos de pacientes que escribas se anonimizan antes de enviarse.</p>
        <div className="flex gap-2">
          <input value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} placeholder="¿Cuál es el protocolo ante riesgo suicida?" className={`${input} flex-1`} />
          <button disabled={busy || !question.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Preguntar
          </button>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
      </form>
      {history.map((h, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
          <p className="font-semibold text-slate-900">{h.q}</p>
          <p className="whitespace-pre-wrap text-slate-700">{h.a}</p>
          {h.sources.length > 0 && <p className="text-xs text-slate-500">Fuentes: {h.sources.map(s => `[${s.n}] ${s.title}`).join(' · ')}</p>}
          <p className="text-[11px] text-amber-700">Apoyo a los protocolos de la clínica: no sustituye tu criterio clínico.</p>
        </div>
      ))}
    </div>
  );
};

const CoursesTab: React.FC<{ c: ClinicContext; manage: boolean }> = ({ c, manage }) => {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [hours, setHours] = useState<TrainingHoursRow[]>([]);
  const [newCourse, setNewCourse] = useState('');
  const [mod, setMod] = useState<Record<string, { title: string; minutes: string }>>({});
  const load = useCallback(() => {
    listCourses(c.orgId).then(r => setCourses(r.ok && r.data ? r.data.courses : []));
    getTrainingHours(c.orgId).then(r => setHours(r.ok && r.data ? r.data.members : []));
  }, [c.orgId]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4 max-w-3xl">
      {manage && !c.readOnly && (
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!newCourse.trim()) return; await createCourse(c.orgId, { title: newCourse, required_for: ['psicologo', 'en_practicas'] }); setNewCourse(''); load(); }}>
          <input value={newCourse} onChange={e => setNewCourse(e.target.value)} placeholder="Nuevo curso (p. ej. Acogida en la clínica)" className={`${input} flex-1`} />
          <button className="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1"><Plus size={15} /> Curso</button>
        </form>
      )}
      {courses === null ? <Loader2 className="animate-spin text-indigo-400" /> : courses.length === 0 ? <p className="text-sm text-slate-500">No hay cursos todavía.</p> : courses.map(co => (
        <div key={co.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-indigo-600" />
            <p className="font-semibold text-slate-900 flex-1">{co.title}</p>
            {co.required && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">Obligatorio</span>}
            <span className="text-xs text-slate-500">{co.my_completed}/{co.modules.length} · {Math.round(co.total_minutes / 6) / 10} h</span>
          </div>
          <ul className="space-y-1">
            {co.modules.map(m => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <button disabled={m.completed || c.readOnly} onClick={async () => { await completeModule(c.orgId, co.id, m.id); load(); }} aria-label={m.completed ? 'Completado' : 'Marcar como completado'} className="disabled:cursor-default">
                  {m.completed ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} className="text-slate-300 hover:text-indigo-500" />}
                </button>
                <span className="flex-1">{m.title}</span>
                {m.url && <a href={m.url} target="_blank" rel="noreferrer" className="text-indigo-700"><ExternalLink size={13} /></a>}
                <span className="text-xs text-slate-500">{m.minutes} min</span>
              </li>
            ))}
          </ul>
          {manage && !c.readOnly && (
            <form className="flex gap-2 pt-1" onSubmit={async (e) => { e.preventDefault(); const v = mod[co.id]; if (!v?.title) return; await addCourseModule(c.orgId, co.id, { title: v.title, minutes: Number(v.minutes) || 30 }); setMod({ ...mod, [co.id]: { title: '', minutes: '' } }); load(); }}>
              <input placeholder="Nuevo módulo" className={`${input} flex-1`} value={mod[co.id]?.title || ''} onChange={e => setMod({ ...mod, [co.id]: { ...(mod[co.id] || { minutes: '' }), title: e.target.value } })} />
              <input type="number" min={1} placeholder="min" className={`${input} w-20`} value={mod[co.id]?.minutes || ''} onChange={e => setMod({ ...mod, [co.id]: { ...(mod[co.id] || { title: '' }), minutes: e.target.value } })} />
              <button className="px-3 py-2 rounded-lg text-sm bg-indigo-50 text-indigo-700">Añadir</button>
            </form>
          )}
        </div>
      ))}
      {hours.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <p className="px-4 py-2 text-sm font-semibold bg-slate-50 flex items-center gap-1.5"><Users size={15} /> Horas de formación y supervisión</p>
          <table className="w-full text-sm"><tbody className="divide-y divide-slate-100">
            {hours.map(h => <tr key={h.member_id}><td className="px-4 py-2">{h.name}</td><td className="px-4 py-2 text-right">{h.training_hours.toLocaleString('es-ES')} h formación</td><td className="px-4 py-2 text-right">{h.modules_completed} módulos</td><td className="px-4 py-2 text-right">{h.supervision_hours.toLocaleString('es-ES')} h supervisión</td></tr>)}
          </tbody></table>
        </div>
      )}
    </div>
  );
};

const SupervisionTab: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [logs, setLogs] = useState<SupervisionLog[] | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [f, setF] = useState({ supervisee: '', date: new Date().toISOString().slice(0, 10), minutes: '60', topics: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => listSupervision(c.orgId).then(r => setLogs(r.ok && r.data ? r.data.logs : [])), [c.orgId]);
  useEffect(() => { load(); listMembers(c.orgId).then(r => r.ok && r.data && setMembers(r.data.members)); }, [load, c.orgId]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await createSupervision(c.orgId, { supervisee_member_id: f.supervisee, session_date: f.date, minutes: Number(f.minutes), topics: f.topics.split(',').map(s => s.trim()).filter(Boolean), notes: f.notes || undefined });
    if (r.ok) { setF({ ...f, topics: '', notes: '' }); setError(null); load(); } else setError(r.error || 'No se pudo guardar');
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-xs text-slate-500 flex items-center gap-1"><Lock size={12} /> Las notas se guardan cifradas y solo las ven supervisor, supervisado y la dirección clínica.</p>
      {!c.readOnly && c.member.permissions.includes('agenda.manage_own') && (
        <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-4 grid sm:grid-cols-3 gap-2">
          <select required value={f.supervisee} onChange={e => setF({ ...f, supervisee: e.target.value })} className={`${input} bg-white sm:col-span-3`}>
            <option value="">Supervisado/a…</option>
            {members.filter(m => isClinicalMember(m) && m.id !== c.member.id).map(m => <option key={m.id} value={m.id}>{m.display_name || m.email}</option>)}
          </select>
          <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className={input} />
          <input type="number" min={1} value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} className={input} aria-label="Minutos" />
          <input placeholder="Temas (comas)" value={f.topics} onChange={e => setF({ ...f, topics: e.target.value })} className={input} />
          <textarea rows={3} placeholder="Notas de la supervisión" value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} className={`${input} sm:col-span-3`} />
          {error && <p className="sm:col-span-3 text-sm text-red-700">{error}</p>}
          <div className="sm:col-span-3 flex justify-end"><button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">Registrar sesión</button></div>
        </form>
      )}
      {logs === null ? <Loader2 className="animate-spin text-indigo-400" /> : logs.length === 0 ? <p className="text-sm text-slate-500">Sin sesiones de supervisión.</p> : logs.map(l => (
        <div key={l.id} className="bg-white rounded-xl border border-slate-200 p-4 text-sm space-y-1">
          <p className="font-semibold text-slate-900">{l.supervisor_name} → {l.supervisee_name}</p>
          <p className="text-xs text-slate-500">{new Date(l.session_date).toLocaleDateString('es-ES')} · {l.minutes} min{l.topics.length ? ` · ${l.topics.join(', ')}` : ''}</p>
          {l.notes && <p className="whitespace-pre-wrap text-slate-700">{l.notes}</p>}
        </div>
      ))}
    </div>
  );
};

export default KnowledgePanel;
