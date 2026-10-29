import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, CheckCircle2, FileText, AlertTriangle, Save } from 'lucide-react';
import {
  listSettlements, generateSettlements, validateSettlement, invoiceSettlement, markSettlementPaid, getProductivity,
  getMyBillingProfile, saveMyBillingProfile, SETTLEMENT_STATUS_LABELS, BILLING_MODEL_LABELS,
  type Settlement, type ProductivityRow, type BillingProfile
} from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

const eur = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const prevMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const WARNING_TEXT: Record<string, string> = {
  SIN_REGLA: 'Hay citas sin regla de comisión: cuentan 0 € para el profesional. Crea una regla por defecto.',
  SIN_PRECIO: 'Hay citas realizadas sin precio.',
  SALA_SIN_TARIFA: 'Hay citas en salas sin tarifa por hora.'
};
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const SettlementsPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const manage = c.can('settlements.manage');
  const readAll = manage || c.can('settlements.read');
  const own = c.can('settlements.own');
  const [period, setPeriod] = useState(prevMonth());
  const [tab, setTab] = useState<'settlements' | 'productivity' | 'profile'>('settlements');
  const [rows, setRows] = useState<Settlement[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const r = await listSettlements(c.orgId, period);
    if (r.ok && r.data) setRows(r.data.settlements); else { setRows([]); setError(r.error || 'No se pudieron cargar'); }
  }, [c.orgId, period]);
  useEffect(() => { if (tab === 'settlements') load(); }, [load, tab]);

  const run = async (key: string, p: Promise<{ ok: boolean; error?: string }>, ok?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    const r = await p;
    setBusy(null);
    if (!r.ok) setError(r.error || 'No se pudo completar');
    else if (ok) setNotice(ok);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-xl font-bold text-slate-900">Liquidaciones</h2>
          <p className="text-sm text-slate-500">{readAll ? 'Reparto mensual con los profesionales según su modelo económico.' : 'Lo que te corresponde cada mes y tu factura a la clínica.'}</p>
        </div>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className={input} aria-label="Mes" />
        {manage && tab === 'settlements' && !c.readOnly && (
          <button onClick={() => run('gen', generateSettlements(c.orgId, period), 'Liquidaciones calculadas. Las ya validadas no se tocan.')} disabled={busy === 'gen'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
            {busy === 'gen' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Calcular el mes
          </button>
        )}
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {([['settlements', 'Liquidaciones'], ['productivity', 'Productividad'], ...(own ? [['profile', 'Mis datos fiscales']] : [])] as [typeof tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
        ))}
      </div>
      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{notice}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      {tab === 'settlements' && (
        rows === null ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-400" /></div> :
        rows.length === 0 ? <p className="text-sm text-slate-500 bg-white rounded-xl border border-slate-200 px-4 py-8 text-center">No hay liquidaciones de este mes{manage ? '. Pulsa "Calcular el mes".' : '.'}</p> : (
          <div className="space-y-3">
            {rows.map(s => {
              const d = s.data;
              const mine = s.member_id === c.member.id;
              const toOrg = d.invoice_kind === 'psych_to_org';
              return (
                <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 flex-1">{s.member_name}{mine && <span className="text-slate-400 font-normal"> (tú)</span>}</p>
                    <span className="text-xs text-slate-500">{BILLING_MODEL_LABELS[s.billing_model as keyof typeof BILLING_MODEL_LABELS]}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : s.status === 'draft' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-700'}`}>{SETTLEMENT_STATUS_LABELS[s.status]}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-slate-500">Sesiones</p><p className="font-semibold">{d.summary.sessions} · {d.summary.hours.toLocaleString('es-ES')} h</p></div>
                    <div><p className="text-xs text-slate-500">Facturado a pacientes</p><p className="font-semibold">{eur(d.summary.revenue)}</p></div>
                    <div><p className="text-xs text-slate-500">{toOrg ? 'Para el profesional' : 'Para la clínica'}</p><p className="font-semibold">{eur(toOrg ? d.summary.psych_amount : (d.invoice?.subtotal ?? d.summary.clinic_amount))}</p></div>
                    <div><p className="text-xs text-slate-500">{toOrg ? 'A pagar al profesional' : 'A pagar a la clínica'}</p><p className="font-semibold">{eur(d.net_payable == null ? null : Math.abs(d.net_payable))}</p></div>
                  </div>
                  {d.invoice && (
                    <p className="text-xs text-slate-600">
                      Factura {toOrg ? 'del profesional a la clínica' : 'de la clínica al profesional'}: base {eur(d.invoice.subtotal)} · IVA {eur(d.invoice.vat)}
                      {d.invoice.irpf ? ` · IRPF ${d.invoice.irpf_rate} % −${eur(d.invoice.irpf)}` : ''} · total {eur(d.invoice.total)}
                      {d.deductions.map(x => ` · ${x.concept} −${eur(x.amount)}`).join('')}
                    </p>
                  )}
                  {[...new Set(d.warnings.map(w => w.code))].map(code => (
                    <p key={code} className="flex items-center gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} /> {WARNING_TEXT[code] || code}</p>
                  ))}
                  {!c.readOnly && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {mine && s.status === 'draft' && (
                        <button onClick={() => run(s.id, validateSettlement(c.orgId, s.id), 'Liquidación validada.')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> Estoy de acuerdo</button>
                      )}
                      {s.status === 'validated' && d.invoice && ((toOrg && mine) || (!toOrg && manage)) && (
                        <button onClick={() => run(s.id, invoiceSettlement(c.orgId, s.id), 'Factura emitida.')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5">
                          <FileText size={15} /> {toOrg ? 'Emitir mi factura a la clínica' : 'Emitir factura al profesional'}
                        </button>
                      )}
                      {s.status === 'validated' && toOrg && !mine && <span className="text-xs text-slate-500 self-center">Pendiente de que el profesional emita su factura.</span>}
                      {s.status === 'draft' && !mine && <span className="text-xs text-slate-500 self-center">Pendiente de que el profesional la valide.</span>}
                      {manage && s.status === 'invoiced' && (
                        <button onClick={() => run(s.id, markSettlementPaid(c.orgId, s.id), 'Marcada como pagada.')} className="px-3 py-1.5 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50">Marcar pagada</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      {tab === 'productivity' && <Productivity c={c} period={period} />}
      {tab === 'profile' && <MyProfile c={c} />}
    </div>
  );
};

const Productivity: React.FC<{ c: ClinicContext; period: string }> = ({ c, period }) => {
  const [rows, setRows] = useState<ProductivityRow[] | null>(null);
  useEffect(() => { setRows(null); getProductivity(c.orgId, period).then(r => setRows(r.ok && r.data ? r.data.members : [])); }, [c.orgId, period]);
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr><th className="px-4 py-2 font-medium">Profesional</th><th className="px-4 py-2 font-medium text-right">Sesiones</th><th className="px-4 py-2 font-medium text-right">Horas</th><th className="px-4 py-2 font-medium text-right">Ingresos generados</th><th className="px-4 py-2 font-medium text-right">No presentados</th><th className="px-4 py-2 font-medium text-right">Canceladas</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows === null && <tr><td colSpan={6} className="px-4 py-6 text-center"><Loader2 className="animate-spin text-indigo-400 inline" size={20} /></td></tr>}
          {rows?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Sin actividad este mes.</td></tr>}
          {rows?.map(r => (
            <tr key={r.member_id}>
              <td className="px-4 py-2">{r.member_name}</td><td className="px-4 py-2 text-right">{r.sessions}</td><td className="px-4 py-2 text-right">{r.hours.toLocaleString('es-ES')}</td>
              <td className="px-4 py-2 text-right">{eur(r.revenue)}</td><td className="px-4 py-2 text-right">{r.no_shows}</td><td className="px-4 py-2 text-right">{r.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MyProfile: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [p, setP] = useState<BillingProfile | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { getMyBillingProfile(c.orgId).then(r => setP(r.ok && r.data ? r.data.billing_profile : {})); }, [c.orgId]);
  if (!p) return <Loader2 className="animate-spin text-indigo-400" />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await saveMyBillingProfile(c.orgId, { legal_name: p.legal_name, tax_id: p.tax_id, address: p.address, series_prefix: p.series_prefix || undefined, iban: p.iban });
    setMsg(r.ok ? { ok: true, text: 'Guardado' } : { ok: false, text: r.error || 'No se pudo guardar' });
  };
  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-3 max-w-2xl">
      <p className="sm:col-span-2 text-sm text-slate-600">Con estos datos se emiten tus facturas a la clínica (o las que la clínica te emite a ti). Solo los usa esta clínica.</p>
      <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Nombre fiscal</span><input className={`${input} w-full mt-1`} value={p.legal_name || ''} onChange={e => setP({ ...p, legal_name: e.target.value })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">NIF / NIE</span><input className={`${input} w-full mt-1`} value={p.tax_id || ''} onChange={e => setP({ ...p, tax_id: e.target.value.toUpperCase() })} /></label>
      <label className="block"><span className="text-sm font-medium text-slate-700">Prefijo de tus facturas</span><input className={`${input} w-full mt-1`} value={p.series_prefix || ''} placeholder="L" onChange={e => setP({ ...p, series_prefix: e.target.value.toUpperCase() })} />
        <span className="text-xs text-slate-500">Usa uno distinto al de tu consulta para no repetir números.</span></label>
      <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">Domicilio fiscal</span><input className={`${input} w-full mt-1`} value={p.address || ''} onChange={e => setP({ ...p, address: e.target.value })} /></label>
      <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700">IBAN para cobrar</span><input className={`${input} w-full mt-1`} value={p.iban || ''} onChange={e => setP({ ...p, iban: e.target.value })} /></label>
      {msg && <p className={`sm:col-span-2 text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      <div className="sm:col-span-2 flex justify-end"><button className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"><Save size={15} /> Guardar</button></div>
    </form>
  );
};

export default SettlementsPanel;
