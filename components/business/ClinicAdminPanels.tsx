import React, { useEffect, useState } from 'react';
import { Loader2, CreditCard, AlertTriangle, Check } from 'lucide-react';
import {
  getOrgBilling, startOrgCheckout, updateOrganization, updateMember, leaveOrganization, closeOrganization, PLAN_INFO,
  type OrgBilling, type OrgPlan, type Organization
} from '../../services/businessService';

const STATUS_LABEL: Record<string, string> = {
  trialing: 'En prueba', active: 'Activa', past_due: 'Pago pendiente', canceled: 'Cancelada'
};

export const SubscriptionPanel: React.FC<{ orgId: string }> = ({ orgId }) => {
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [plan, setPlan] = useState<OrgPlan>('essential');
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrgBilling(orgId).then(r => {
      if (r.ok && r.data) {
        setBilling(r.data);
        setPlan(r.data.plan_id);
        setInterval(r.data.billing_interval);
      } else setError(r.error || 'No se pudo cargar la suscripción');
    });
  }, [orgId]);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    const r = await startOrgCheckout(orgId, plan, interval);
    setBusy(false);
    if (r.ok && r.data?.url) { window.location.href = r.data.url; return; }
    setError(r.error || 'No se pudo iniciar el pago');
  };

  if (!billing) {
    return error
      ? <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      : <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>;
  }

  const info = PLAN_INFO[plan];
  const months = interval === 'year' ? 10 : 1; // anual = 2 meses gratis
  const total = (info.base + info.seat * billing.seats) * months;
  const canPay = !(billing.has_subscription && billing.status === 'active');

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Suscripción</h2>
        <p className="text-sm text-slate-500">Solo el titular ve y gestiona la suscripción de la clínica. Se cobra aparte de mainds pro: si tienes tu consulta personal, esa suscripción sigue igual.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 grid sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-slate-500">Estado</p>
          <p className="font-semibold text-slate-900">{STATUS_LABEL[billing.status] || billing.status}</p>
          {billing.trial && <p className="text-xs text-slate-500">{billing.trial_days_left} días de prueba</p>}
        </div>
        <div>
          <p className="text-xs text-slate-500">Plan</p>
          <p className="font-semibold text-slate-900">{PLAN_INFO[billing.plan_id].name}</p>
          <p className="text-xs text-slate-500">{billing.billing_interval === 'year' ? 'Anual' : 'Mensual'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Licencias de profesional</p>
          <p className="font-semibold text-slate-900">{billing.seats}</p>
          <p className="text-xs text-slate-500">Incluye la tuya si atiendes pacientes en la clínica.</p>
          {billing.seat_sync_pending && <p className="text-xs text-amber-700">Pendiente de actualizar en el cobro</p>}
        </div>
      </div>

      {canPay && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="font-semibold text-slate-900 flex items-center gap-2"><CreditCard size={18} /> {billing.status === 'trialing' ? 'Activar la suscripción' : 'Reactivar la suscripción'}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {(Object.keys(PLAN_INFO) as OrgPlan[]).map(p => (
              <button key={p} type="button" onClick={() => setPlan(p)}
                className={`text-left rounded-xl border-2 p-3 ${plan === p ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>
                <span className="font-semibold text-slate-900 flex items-center gap-2">{PLAN_INFO[p].name}{plan === p && <Check size={14} className="text-indigo-600" />}</span>
                <span className="block text-sm text-slate-600">{PLAN_INFO[p].base} € + {PLAN_INFO[p].seat} €/profesional al mes</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 text-sm">
            {(['month', 'year'] as const).map(i => (
              <button key={i} type="button" onClick={() => setInterval(i)}
                className={`px-3 py-1.5 rounded-lg border ${interval === i ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>
                {i === 'month' ? 'Mensual' : 'Anual (2 meses gratis)'}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-700">
            Total estimado: <strong>{total.toFixed(2).replace('.', ',')} €</strong> {interval === 'year' ? 'al año' : 'al mes'} + IVA
            <span className="text-slate-500"> ({billing.seats} {billing.seats === 1 ? 'licencia' : 'licencias'}). Las altas y bajas del equipo se prorratean.</span>
          </p>
          {billing.trial && <p className="text-xs text-slate-500">No se cobra nada hasta que termine la prueba.</p>}
          {!billing.stripe_configured && <p className="text-xs text-amber-700">Los pagos de mainds business aún no están disponibles. Te avisaremos.</p>}
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}
          <button onClick={checkout} disabled={busy || !billing.stripe_configured}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin" />} Ir al pago seguro
          </button>
        </div>
      )}
    </div>
  );
};

export const OrgSettingsPanel: React.FC<{
  org: Organization;
  myMemberId: string;
  isOwner: boolean;
  isClinical: boolean;
  canEdit: boolean;
  onSaved: (org: Organization) => void;
  onLeft: () => void;
}> = ({ org, myMemberId, isOwner, isClinical, canEdit, onSaved, onLeft }) => {
  const [name, setName] = useState(org.name);
  const [legalName, setLegalName] = useState(org.legal_name || '');
  const [cif, setCif] = useState(org.cif || '');
  const [logoUrl, setLogoUrl] = useState(org.logo_url || '');
  const [clinical, setClinical] = useState(isClinical);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await updateOrganization(org.id, { name, legal_name: legalName || null, cif: cif || null, logo_url: logoUrl || null } as any);
    if (r.ok && r.data && isOwner && clinical !== isClinical) {
      const m = await updateMember(org.id, myMemberId, { is_clinical: clinical } as any);
      if (!m.ok) { setBusy(false); setMsg({ ok: false, text: m.error || 'No se pudo guardar' }); return; }
    }
    setBusy(false);
    if (r.ok && r.data) { onSaved(r.data.organization); setMsg({ ok: true, text: 'Guardado' }); }
    else setMsg({ ok: false, text: r.error || 'No se pudo guardar' });
  };

  const leave = async () => {
    if (!window.confirm(`¿Salir de ${org.name}? Perderás el acceso a la clínica. Tu cuenta y tu espacio personal no se tocan.`)) return;
    const r = await leaveOrganization(org.id);
    if (r.ok) onLeft();
    else setMsg({ ok: false, text: r.error || 'No se pudo salir' });
  };

  const [closing, setClosing] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const close = async () => {
    setBusy(true);
    setMsg(null);
    const r = await closeOrganization(org.id, confirmName);
    setBusy(false);
    if (r.ok) onLeft(); // vuelve a la consulta personal (mainds pro)
    else setMsg({ ok: false, text: r.error || 'No se pudo cerrar la clínica' });
  };

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Ajustes de la clínica</h2>
      </div>
      <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <label className="block"><span className="text-sm font-medium text-slate-700">Nombre</span>
          <input className={input} value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} required /></label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm font-medium text-slate-700">Razón social</span>
            <input className={input} value={legalName} onChange={e => setLegalName(e.target.value)} disabled={!canEdit} /></label>
          <label className="block"><span className="text-sm font-medium text-slate-700">CIF</span>
            <input className={input} value={cif} onChange={e => setCif(e.target.value.toUpperCase())} disabled={!canEdit} /></label>
        </div>
        <label className="block"><span className="text-sm font-medium text-slate-700">URL del logo (https)</span>
          <input className={input} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} disabled={!canEdit} placeholder="https://…" /></label>
        {isOwner && (
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={clinical} onChange={e => setClinical(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" />
            <span>Atiendo pacientes en la clínica <span className="text-slate-500">(ocupas una licencia de profesional de la clínica, aparte de tu mainds pro)</span></span>
          </label>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`} role="status">{msg.text}</p>}
        {canEdit && (
          <button disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={16} className="animate-spin" />} Guardar
          </button>
        )}
      </form>

      {isOwner && !org.closed_at && (
        <div className="bg-white rounded-xl border border-red-200 p-5 space-y-3" data-testid="close-clinic">
          <p className="font-semibold text-red-800 flex items-center gap-2"><AlertTriangle size={16} /> Cerrar la clínica</p>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
            <li>Se cancela la suscripción de la clínica: no se cobra nada más.</li>
            <li>El equipo pierde el acceso. Los datos se conservan en modo consulta (la historia clínica debe guardarse 5 años).</li>
            <li><strong>Tu consulta personal de mainds pro y su suscripción no cambian.</strong></li>
            <li>Puedes reabrirla cuando quieras activando de nuevo la suscripción.</li>
          </ul>
          {!closing ? (
            <button onClick={() => setClosing(true)} className="px-4 py-2 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100">Cerrar {org.name}</button>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm text-slate-700">Escribe <strong>{org.name}</strong> para confirmar
                <input className={input} value={confirmName} onChange={e => setConfirmName(e.target.value)} aria-label="Nombre de la clínica para confirmar" /></label>
              <div className="flex gap-2">
                <button onClick={() => { setClosing(false); setConfirmName(''); }} className="px-4 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100">Cancelar</button>
                <button onClick={close} disabled={busy || confirmName.trim().toLowerCase() !== org.name.trim().toLowerCase()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {busy && <Loader2 size={16} className="animate-spin" />} Cerrar definitivamente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isOwner && (
        <div className="bg-white rounded-xl border border-red-200 p-5 space-y-2">
          <p className="font-semibold text-red-800 flex items-center gap-2"><AlertTriangle size={16} /> Salir de la clínica</p>
          <p className="text-sm text-slate-600">Los pacientes y la historia clínica son de la clínica y se quedan en ella.</p>
          <button onClick={leave} className="px-4 py-2 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100">Salir de {org.name}</button>
        </div>
      )}
    </div>
  );
};
