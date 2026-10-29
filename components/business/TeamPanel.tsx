import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, Loader2, Copy, Check, X, Pause, Play, Trash2, Pencil, Mail } from 'lucide-react';
import {
  listMembers, inviteMember, updateMember, suspendMember, reactivateMember, removeMember,
  ROLE_LABELS, EMPLOYMENT_LABELS, BILLING_MODEL_LABELS,
  type OrgMember, type OrgRole, type EmploymentType, type BillingModel
} from '../../services/businessService';

interface TeamPanelProps {
  orgId: string;
  canManage: boolean;
  myMemberId: string;
  readOnly: boolean;
}

const INVITABLE_ROLES: OrgRole[] = ['psicologo', 'director_clinico', 'en_practicas', 'recepcion', 'gerente', 'contable'];
const CLINICAL: OrgRole[] = ['psicologo', 'director_clinico', 'en_practicas'];

const STATUS_BADGE: Record<OrgMember['status'], { label: string; cls: string }> = {
  active: { label: 'Activo', cls: 'bg-emerald-50 text-emerald-700' },
  invited: { label: 'Invitado', cls: 'bg-amber-50 text-amber-800' },
  suspended: { label: 'Suspendido', cls: 'bg-slate-100 text-slate-600' },
  left: { label: 'Baja', cls: 'bg-slate-100 text-slate-500' },
  declined: { label: 'Rechazó', cls: 'bg-slate-100 text-slate-500' }
};

interface FormState {
  email: string;
  display_name: string;
  role: OrgRole;
  employment_type: EmploymentType;
  billing_model: BillingModel;
  irpf_rate: string;
  supervisor_member_id: string;
}

const emptyForm = (): FormState => ({
  email: '', display_name: '', role: 'psicologo', employment_type: 'freelance', billing_model: 'org_invoices',
  irpf_rate: '15', supervisor_member_id: ''
});

const TeamPanel: React.FC<TeamPanelProps> = ({ orgId, canManage, myMemberId, readOnly }) => {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<null | 'invite' | string>(null); // 'invite' o id del miembro editado
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<{ url: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFormer, setShowFormer] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await listMembers(orgId);
    setLoading(false);
    if (r.ok && r.data) setMembers(r.data.members);
    else setError(r.error || 'No se pudo cargar el equipo');
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const supervisors = members.filter(m => m.status === 'active' && (m.role === 'psicologo' || m.role === 'director_clinico' || (m.role === 'titular' && m.is_clinical)));

  const openInvite = () => { setForm(emptyForm()); setInviteLink(null); setError(null); setFormOpen('invite'); };
  const openEdit = (m: OrgMember) => {
    setForm({
      email: m.email || '', display_name: m.display_name || '', role: m.role,
      employment_type: m.employment_type || 'employee', billing_model: m.billing_model || 'payroll',
      irpf_rate: m.irpf_rate == null ? '' : String(m.irpf_rate), supervisor_member_id: m.supervisor_member_id || ''
    });
    setError(null);
    setFormOpen(m.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const irpf = form.irpf_rate.trim() === '' ? null : Number(form.irpf_rate);
    const common = {
      display_name: form.display_name.trim() || undefined,
      employment_type: form.employment_type,
      billing_model: form.billing_model,
      irpf_rate: irpf,
      supervisor_member_id: form.role === 'en_practicas' && form.supervisor_member_id ? form.supervisor_member_id : null
    };
    if (formOpen === 'invite') {
      const r = await inviteMember(orgId, { email: form.email.trim(), role: form.role, ...common });
      setSaving(false);
      if (!r.ok || !r.data) { setError(r.error || 'No se pudo invitar'); return; }
      setInviteLink({ url: r.data.invite_url, emailSent: r.data.email_sent });
      setFormOpen(null);
    } else if (formOpen) {
      const target = members.find(m => m.id === formOpen);
      const body: any = { ...common };
      if (target && target.role !== 'titular' && form.role !== target.role) body.role = form.role;
      const r = await updateMember(orgId, formOpen, body);
      setSaving(false);
      if (!r.ok) { setError(r.error || 'No se pudo guardar'); return; }
      setFormOpen(null);
    }
    load();
  };

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const r = await fn();
    if (!r.ok) setError(r.error || 'No se pudo completar la operación');
    load();
  };

  const copy = async () => {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  };

  const visible = members.filter(m => showFormer || (m.status !== 'left' && m.status !== 'declined'));
  const seats = members.filter(m => m.status === 'active' && m.seat_billable).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-xl font-bold text-slate-900">Equipo</h2>
          <p className="text-sm text-slate-500">
            Cada persona entra con su propia cuenta de mainds.{canManage && ` Licencias de profesional en uso: ${seats}.`}
          </p>
        </div>
        {canManage && !readOnly && (
          <button onClick={openInvite} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            <UserPlus size={16} /> Invitar
          </button>
        )}
      </div>

      {inviteLink && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
          <p className="font-semibold flex items-center gap-2"><Mail size={16} /> {inviteLink.emailSent ? 'Invitación enviada por email.' : 'Invitación creada.'}</p>
          <p>{inviteLink.emailSent ? 'También puedes compartir este enlace' : 'Comparte este enlace con la persona invitada'} (caduca en 7 días y solo funciona con su email):</p>
          <div className="flex gap-2">
            <input readOnly value={inviteLink.url} className="flex-1 min-w-0 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-mono" onFocus={e => e.target.select()} />
            <button onClick={copy} className="px-3 py-2 rounded-lg bg-white border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {error && !formOpen && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {visible.map(m => {
            const badge = STATUS_BADGE[m.status];
            const isMe = m.id === myMemberId;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                  {(m.display_name || m.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {m.display_name || m.email || 'Sin nombre'}{isMe && <span className="text-slate-400 font-normal"> (tú)</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {ROLE_LABELS[m.role]}{m.role === 'titular' && m.is_clinical ? ' · atiende pacientes' : ''}
                    {canManage && m.employment_type && m.role !== 'titular' ? ` · ${EMPLOYMENT_LABELS[m.employment_type]}` : ''}
                    {canManage && m.email && m.display_name ? ` · ${m.email}` : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                {canManage && !readOnly && m.role !== 'titular' && !isMe && (
                  <div className="flex items-center gap-1">
                    {(m.status === 'active' || m.status === 'invited' || m.status === 'suspended') && (
                      <button onClick={() => openEdit(m)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={15} /></button>
                    )}
                    {m.status === 'active' && (
                      <button onClick={() => act(() => suspendMember(orgId, m.id), `¿Suspender a ${m.display_name || m.email}? No podrá entrar en la clínica.`)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Suspender"><Pause size={15} /></button>
                    )}
                    {m.status === 'suspended' && (
                      <button onClick={() => act(() => reactivateMember(orgId, m.id))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Reactivar"><Play size={15} /></button>
                    )}
                    {(m.status === 'active' || m.status === 'invited' || m.status === 'suspended') && (
                      <button
                        onClick={() => act(() => removeMember(orgId, m.id), m.status === 'invited' ? '¿Anular la invitación?' : `¿Dar de baja a ${m.display_name || m.email}? Perderá el acceso a la clínica; su cuenta personal no se toca.`)}
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600" title={m.status === 'invited' ? 'Anular invitación' : 'Dar de baja'}
                      ><Trash2 size={15} /></button>
                    )}
                  </div>
                )}
                {canManage && !readOnly && m.role === 'titular' && isMe && (
                  <button onClick={() => openEdit(m)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={15} /></button>
                )}
              </div>
            );
          })}
          {visible.length === 0 && <p className="px-4 py-8 text-sm text-slate-500 text-center">Todavía no hay nadie más en el equipo.</p>}
        </div>
      )}
      {canManage && members.some(m => m.status === 'left' || m.status === 'declined') && (
        <button onClick={() => setShowFormer(s => !s)} className="text-sm text-slate-500 hover:text-slate-700">
          {showFormer ? 'Ocultar antiguos miembros' : 'Ver antiguos miembros'}
        </button>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 flex-1">{formOpen === 'invite' ? 'Invitar al equipo' : 'Editar miembro'}</h3>
              <button type="button" onClick={() => setFormOpen(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formOpen === 'invite' && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email *</span>
                  <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </label>
              )}
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre visible</span>
                <input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} maxLength={120}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              {form.role !== 'titular' && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Rol</span>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as OrgRole })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                    {INVITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  {(form.role === 'recepcion' || form.role === 'contable' || form.role === 'gerente') && (
                    <span className="text-xs text-slate-500">Sin acceso a la historia clínica. No ocupa licencia.</span>
                  )}
                </label>
              )}
              {(CLINICAL.includes(form.role)) && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Relación con la clínica</span>
                    <select value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value as EmploymentType })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                      {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map(k => <option key={k} value={k}>{EMPLOYMENT_LABELS[k]}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Modelo económico</span>
                    <select value={form.billing_model} onChange={e => setForm({ ...form, billing_model: e.target.value as BillingModel })}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                      {(Object.keys(BILLING_MODEL_LABELS) as BillingModel[]).map(k => <option key={k} value={k}>{BILLING_MODEL_LABELS[k]}</option>)}
                    </select>
                    <span className="text-xs text-slate-500">Los porcentajes se configuran en Facturación → Reglas de comisión.</span>
                  </label>
                  {form.employment_type !== 'employee' && (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Retención IRPF en sus facturas a la clínica (%)</span>
                      <input type="number" min={0} max={50} step="0.01" value={form.irpf_rate} onChange={e => setForm({ ...form, irpf_rate: e.target.value })}
                        className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <span className="block text-xs text-slate-500">Habitualmente 15 % (7 % los primeros años de actividad).</span>
                    </label>
                  )}
                  {form.role === 'en_practicas' && (
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Supervisor/a</span>
                      <select value={form.supervisor_member_id} onChange={e => setForm({ ...form, supervisor_member_id: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                        <option value="">Sin asignar</option>
                        {supervisors.map(s => <option key={s.id} value={s.id}>{s.display_name || s.email}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
              {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button type="button" onClick={() => setFormOpen(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 size={16} className="animate-spin" />} {formOpen === 'invite' ? 'Enviar invitación' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TeamPanel;
