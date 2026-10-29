import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, FileText, Printer, Undo2, CheckCircle2, Trash2, Download, ShieldCheck } from 'lucide-react';
import {
  listClinicInvoices, getClinicInvoice, createClinicInvoice, deleteClinicInvoice, issueClinicInvoice, rectifyClinicInvoice,
  markClinicInvoicePaid, listBillable, listPatients, listBillingEntities, createBillingEntity, updateBillingEntity,
  listCommissionRules, createCommissionRule, endCommissionRule, listMembers, isClinicalMember, setMemberRent, exportInvoicesCsv,
  INVOICE_KIND_LABELS, INVOICE_STATUS_LABELS, SERVICE_TYPE_LABELS,
  type ClinicInvoice, type VerifactuInfo, type BillableAppointment, type OrgPatient, type BillingEntity, type CommissionRule, type OrgMember
} from '../../services/businessApi';
import { printHtmlAsPdf } from '../../services/printUtils';
import type { ClinicContext } from './ClinicWorkspace';

type Tab = 'invoices' | 'new' | 'entities' | 'rules' | 'export';
const eur = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

/** HTML imprimible de una factura (se guarda como PDF desde el navegador). */
export function invoiceHtml(inv: ClinicInvoice, verifactu: VerifactuInfo | null, qr: string | null): string {
  const lines = inv.lines.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${esc(l.quantity)}</td><td class="r">${esc(eur(l.unit_price))}</td><td class="r">${esc(l.vat_rate)} %</td><td class="r">${esc(eur(l.base))}</td></tr>`).join('');
  const title = inv.rectifies_invoice_id ? 'FACTURA RECTIFICATIVA' : (inv.aeat_type === 'F2' ? 'FACTURA SIMPLIFICADA' : 'FACTURA');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(inv.full_number || 'Borrador')}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:36px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}
.grid{display:flex;justify-content:space-between;gap:24px;margin:20px 0}
.box{flex:1}.muted{color:#64748b}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:6px;border-bottom:1px solid #e2e8f0;text-align:left}
.r{text-align:right}.tot td{border:none;padding:3px 6px}.tot .big{font-size:14px;font-weight:bold}
.foot{margin-top:28px;display:flex;gap:16px;align-items:flex-end}.qr img{width:110px;height:110px}
</style></head><body>
<h1>${title} ${esc(inv.full_number || '(borrador)')}</h1>
<div class="muted">Fecha de expedición: ${esc(inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('es-ES') : '—')}</div>
${inv.rectification_reason ? `<p><strong>Motivo de la rectificación:</strong> ${esc(inv.rectification_reason)}</p>` : ''}
<div class="grid">
<div class="box"><strong>Emisor</strong><br>${esc(inv.issuer_name)}<br>NIF: ${esc(inv.issuer_tax_id)}<br>${esc(inv.issuer_address || '')}</div>
<div class="box"><strong>Destinatario</strong><br>${esc(inv.recipient_name)}<br>${inv.recipient_tax_id ? `NIF: ${esc(inv.recipient_tax_id)}<br>` : ''}${esc(inv.recipient_address || '')}</div>
</div>
<table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">IVA</th><th class="r">Base</th></tr></thead><tbody>${lines}</tbody></table>
<table class="tot" style="width:320px;margin-left:auto">
<tr><td>Base imponible</td><td class="r">${esc(eur(inv.subtotal))}</td></tr>
<tr><td>IVA</td><td class="r">${esc(eur(inv.vat_total))}</td></tr>
${inv.irpf_total ? `<tr><td>Retención IRPF (${esc(inv.irpf_rate)} %)</td><td class="r">-${esc(eur(inv.irpf_total))}</td></tr>` : ''}
<tr><td class="big">Total</td><td class="r big">${esc(eur(inv.total))}</td></tr>
</table>
${inv.exemption_text ? `<p class="muted">${esc(inv.exemption_text)}</p>` : ''}
${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ''}
<div class="foot">${qr ? `<div class="qr"><img src="${esc(qr)}" alt="QR tributario"></div>` : ''}
<div class="muted">${verifactu ? `Código QR de cotejo con la AEAT.<br>Huella del registro: ${esc(verifactu.hash.slice(0, 16))}…` : ''}</div></div>
</body></html>`;
}

const ClinicBillingPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const canManage = c.can('billing.manage');
  const canExport = c.can('billing.read_export');
  const issuesOwn = c.can('billing.own') && ['psych_invoices', 'fixed_rent'].includes(c.member.billing_model || '');
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'invoices', label: 'Facturas', show: true },
    { id: 'new', label: 'Nueva factura', show: (canManage || issuesOwn) && !c.readOnly },
    { id: 'entities', label: 'Emisores', show: c.can('org.settings') },
    { id: 'rules', label: 'Comisiones y alquileres', show: c.can('team.manage') || c.can('settlements.manage') || c.can('settlements.read') },
    { id: 'export', label: 'Exportar', show: canExport }
  ];
  const [tab, setTab] = useState<Tab>('invoices');
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Facturación</h2>
        <p className="text-sm text-slate-500">Facturas de la clínica y de sus profesionales, numeradas por emisor y con registro Verifactu encadenado.</p>
      </div>
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.filter(t => t.show).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'invoices' && <InvoicesList key={refreshKey} c={c} onOpen={setOpenInvoice} />}
      {tab === 'new' && <NewInvoice c={c} canManage={canManage} issuesOwn={issuesOwn} onCreated={(id) => { setTab('invoices'); setOpenInvoice(id); }} />}
      {tab === 'entities' && <Entities c={c} />}
      {tab === 'rules' && <Rules c={c} />}
      {tab === 'export' && <ExportCsv c={c} />}
      {openInvoice && <InvoiceDetail c={c} id={openInvoice} onClose={() => { setOpenInvoice(null); setRefreshKey(k => k + 1); }} />}
    </div>
  );
};

const InvoicesList: React.FC<{ c: ClinicContext; onOpen: (id: string) => void }> = ({ c, onOpen }) => {
  const [rows, setRows] = useState<ClinicInvoice[] | null>(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setRows(null);
    listClinicInvoices(c.orgId, { kind, status }).then(r => { if (r.ok && r.data) setRows(r.data.invoices); else { setRows([]); setError(r.error || 'No se pudieron cargar'); } });
  }, [c.orgId, kind, status]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={e => setKind(e.target.value)} className={`${input} bg-white`}>
          <option value="">Todos los tipos</option>
          {Object.entries(INVOICE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className={`${input} bg-white`}>
          <option value="">Todos los estados</option>
          {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-4 py-2 font-medium">Número</th><th className="px-4 py-2 font-medium">Fecha</th><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Destinatario</th><th className="px-4 py-2 font-medium text-right">Total</th><th className="px-4 py-2 font-medium">Estado</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows === null && <tr><td colSpan={6} className="px-4 py-6 text-center"><Loader2 className="animate-spin text-indigo-400 inline" size={20} /></td></tr>}
            {rows?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No hay facturas.</td></tr>}
            {rows?.map(i => (
              <tr key={i.id} onClick={() => onOpen(i.id)} className="cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-2 font-mono">{i.full_number || 'Borrador'}</td>
                <td className="px-4 py-2 text-slate-600">{i.issue_date ? new Date(i.issue_date).toLocaleDateString('es-ES') : '—'}</td>
                <td className="px-4 py-2 text-slate-600">{INVOICE_KIND_LABELS[i.kind]}</td>
                <td className="px-4 py-2">{i.recipient_name}</td>
                <td className={`px-4 py-2 text-right ${i.total < 0 ? 'text-red-700' : ''}`}>{eur(i.total)}</td>
                <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${i.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : i.status === 'draft' ? 'bg-amber-50 text-amber-800' : i.status === 'rectified' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-700'}`}>{INVOICE_STATUS_LABELS[i.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InvoiceDetail: React.FC<{ c: ClinicContext; id: string; onClose: () => void }> = ({ c, id, onClose }) => {
  const [data, setData] = useState<{ invoice: ClinicInvoice; verifactu: VerifactuInfo | null; qr_data_url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => getClinicInvoice(c.orgId, id).then(r => { if (r.ok && r.data) setData(r.data); else setError(r.error || 'No se pudo cargar'); }), [c.orgId, id]);
  useEffect(() => { load(); }, [load]);

  const run = async (p: Promise<{ ok: boolean; error?: string; data?: any }>, after?: (d: any) => void) => {
    setBusy(true);
    setError(null);
    const r = await p;
    setBusy(false);
    if (!r.ok) { setError(r.error || 'No se pudo completar'); return; }
    if (after) after(r.data); else load();
  };

  const inv = data?.invoice;
  const mine = inv && inv.issuer_type === 'member' && inv.issuer_member_id === c.member.id;
  const canAct = !!inv && !c.readOnly && (inv.issuer_type === 'entity' ? c.can('billing.manage') : mine);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <FileText size={18} className="text-indigo-600 mr-2" />
          <h3 className="font-bold text-slate-900 flex-1">{inv ? (inv.full_number || 'Borrador de factura') : 'Factura'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={16} /></button>
        </div>
        {!inv ? <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-indigo-400" /></div> : (
          <div className="px-6 py-5 space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-4">
              <div><p className="text-xs text-slate-500">Emisor</p><p className="font-semibold">{inv.issuer_name}</p><p className="text-slate-600">{inv.issuer_tax_id}</p></div>
              <div><p className="text-xs text-slate-500">Destinatario</p><p className="font-semibold">{inv.recipient_name}</p><p className="text-slate-600">{inv.recipient_tax_id || 'Sin NIF (factura simplificada)'}</p></div>
            </div>
            {inv.rectification_reason && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">Rectificativa: {inv.rectification_reason}</p>}
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {inv.lines.map((l, i) => <tr key={i}><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right whitespace-nowrap">{eur(l.base)}</td></tr>)}
              </tbody>
            </table>
            <div className="ml-auto w-64 space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Base</span><span>{eur(inv.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">IVA</span><span>{eur(inv.vat_total)}</span></div>
              {inv.irpf_total !== 0 && <div className="flex justify-between"><span className="text-slate-500">IRPF ({inv.irpf_rate} %)</span><span>-{eur(inv.irpf_total)}</span></div>}
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{eur(inv.total)}</span></div>
            </div>
            {inv.exemption_text && <p className="text-xs text-slate-500">{inv.exemption_text}</p>}
            {data?.verifactu && (
              <div className="flex gap-3 items-center rounded-lg border border-slate-200 p-3">
                {data.qr_data_url && <img src={data.qr_data_url} alt="QR tributario" className="w-20 h-20" />}
                <div className="text-xs text-slate-600 min-w-0">
                  <p className="flex items-center gap-1 font-semibold text-slate-800"><ShieldCheck size={14} className="text-emerald-600" /> Registro de facturación generado</p>
                  <p className="break-all">Huella: {data.verifactu.hash}</p>
                  <p>Pendiente de envío a la AEAT (el envío automático se activará más adelante).</p>
                </div>
              </div>
            )}
            {error && <p className="text-red-700" role="alert">{error}</p>}
          </div>
        )}
        {inv && (
          <div className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-slate-200">
            {inv.status !== 'draft' && (
              <button onClick={() => printHtmlAsPdf(invoiceHtml(inv, data!.verifactu, data!.qr_data_url), `Factura ${inv.full_number}`)} className="px-3 py-2 rounded-lg text-sm hover:bg-slate-100 flex items-center gap-1.5"><Printer size={15} /> PDF</button>
            )}
            {canAct && inv.status === 'draft' && (
              <>
                <button disabled={busy} onClick={() => window.confirm('¿Borrar este borrador? Las citas vuelven a quedar pendientes de facturar.') && run(deleteClinicInvoice(c.orgId, inv.id), onClose)} className="px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50 flex items-center gap-1.5"><Trash2 size={15} /> Borrar</button>
                <button disabled={busy} onClick={() => window.confirm('Al emitirla se le asigna número y ya no se podrá modificar. ¿Emitir?') && run(issueClinicInvoice(c.orgId, inv.id))} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">Emitir factura</button>
              </>
            )}
            {canAct && (inv.status === 'issued' || inv.status === 'paid') && !inv.rectifies_invoice_id && (
              <button disabled={busy} onClick={() => { const r = window.prompt('Motivo de la rectificación (se emitirá una factura rectificativa que la anula):'); if (r) run(rectifyClinicInvoice(c.orgId, inv.id, r)); }} className="px-3 py-2 rounded-lg text-sm hover:bg-slate-100 flex items-center gap-1.5"><Undo2 size={15} /> Rectificar</button>
            )}
            {inv.status === 'issued' && !c.readOnly && (c.can('billing.manage') || mine) && (
              <button disabled={busy} onClick={() => { const m = window.prompt('Forma de pago (transferencia, tarjeta, efectivo, bizum, domiciliacion, otro):', 'transferencia'); if (m) run(markClinicInvoicePaid(c.orgId, inv.id, m.trim().toLowerCase())); }} className="px-3 py-2 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5"><CheckCircle2 size={15} /> Marcar pagada</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const NewInvoice: React.FC<{ c: ClinicContext; canManage: boolean; issuesOwn: boolean; onCreated: (id: string) => void }> = ({ c, canManage, issuesOwn, onCreated }) => {
  const [patients, setPatients] = useState<OrgPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [billable, setBillable] = useState<BillableAppointment[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [issuer, setIssuer] = useState<'entity' | 'member'>(canManage ? 'entity' : 'member');
  const [taxId, setTaxId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listPatients(c.orgId, { status: 'all' }).then(r => r.ok && r.data && setPatients(r.data.patients)); }, [c.orgId]);
  useEffect(() => {
    setSelected([]);
    if (!patientId) { setBillable([]); return; }
    listBillable(c.orgId, patientId).then(r => {
      const rows = r.ok && r.data ? r.data.appointments : [];
      setBillable(issuer === 'member' ? rows.filter(a => a.member_id === c.member.id) : rows);
    });
    setTaxId(patients.find(p => p.id === patientId)?.tax_id || '');
  }, [c.orgId, patientId, issuer]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = billable.filter(a => selected.includes(a.id)).reduce((s, a) => s + Number(a.price || 0), 0);
  const create = async () => {
    setBusy(true);
    setError(null);
    const r = await createClinicInvoice(c.orgId, { patient_id: patientId, appointment_ids: selected, issuer, recipient_tax_id: taxId || undefined });
    setBusy(false);
    if (r.ok && r.data) onCreated(r.data.invoice.id); else setError(r.error || 'No se pudo crear la factura');
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 max-w-2xl">
      {canManage && issuesOwn && (
        <div className="flex gap-2 text-sm">
          {(['entity', 'member'] as const).map(k => (
            <button key={k} onClick={() => setIssuer(k)} className={`px-3 py-1.5 rounded-lg border ${issuer === k ? 'border-indigo-600 bg-indigo-50 text-indigo-800' : 'border-slate-200'}`}>{k === 'entity' ? 'Factura la clínica' : 'Facturo yo'}</button>
          ))}
        </div>
      )}
      <label className="block"><span className="text-sm font-medium text-slate-700">Paciente</span>
        <select value={patientId} onChange={e => setPatientId(e.target.value)} className={`${input} w-full mt-1 bg-white`}>
          <option value="">Elige…</option>
          {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      {patientId && (
        <>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Citas realizadas pendientes de facturar</p>
            {billable.length === 0 ? <p className="text-sm text-slate-500">No hay citas pendientes.</p> : (
              <ul className="space-y-1">
                {billable.map(a => (
                  <li key={a.id}><label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={e => setSelected(e.target.checked ? [...selected, a.id] : selected.filter(x => x !== a.id))} />
                    <span className="flex-1">{new Date(a.starts_at).toLocaleDateString('es-ES')} · {SERVICE_TYPE_LABELS[a.service_type] || a.service_type}</span>
                    <span>{eur(a.price)}</span>
                  </label></li>
                ))}
              </ul>
            )}
          </div>
          <label className="block"><span className="text-sm font-medium text-slate-700">NIF del paciente</span>
            <input value={taxId} onChange={e => setTaxId(e.target.value.toUpperCase())} className={`${input} w-full mt-1`} placeholder="Sin NIF → factura simplificada (hasta 400 €)" /></label>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-700 flex-1">Total: <strong>{eur(total)}</strong> (exento de IVA)</span>
            <button disabled={busy || !selected.length} onClick={create} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 size={16} className="animate-spin" />} Crear borrador
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
};

const Entities: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [rows, setRows] = useState<BillingEntity[]>([]);
  const [form, setForm] = useState<Partial<BillingEntity> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => listBillingEntities(c.orgId).then(r => r.ok && r.data && setRows(r.data.entities)), [c.orgId]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form) return;
    const body = { legal_name: form.legal_name, tax_id: form.tax_id, address: form.address, postal_code: form.postal_code, city: form.city, province: form.province, iban: form.iban, email: form.email, series_prefix: form.series_prefix || 'C' };
    const r = form.id ? await updateBillingEntity(c.orgId, form.id, body) : await createBillingEntity(c.orgId, body);
    if (r.ok) { setForm(null); setError(null); load(); } else setError(r.error || 'No se pudo guardar');
  };
  const f = (k: keyof BillingEntity, label: string, extra = '') => (
    <label className={`block ${extra}`}><span className="text-sm font-medium text-slate-700">{label}</span>
      <input className={`${input} w-full mt-1`} value={(form?.[k] as string) || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>
  );
  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-sm text-slate-500">Datos fiscales con los que factura la clínica. Una clínica puede tener más de un CIF; cada uno numera sus facturas por separado.</p>
      {rows.map(e => (
        <div key={e.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="flex-1"><p className="font-semibold">{e.legal_name}</p><p className="text-sm text-slate-500">{e.tax_id} · Serie {e.series_prefix}AA</p></div>
          {!c.readOnly && <button onClick={() => setForm(e)} className="text-sm text-indigo-700 hover:underline">Editar</button>}
        </div>
      ))}
      {!form && !c.readOnly && <button onClick={() => setForm({ series_prefix: 'C' })} className="px-3 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1"><Plus size={15} /> Añadir emisor</button>}
      {form && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid sm:grid-cols-2 gap-3">
          {f('legal_name', 'Razón social', 'sm:col-span-2')}
          {f('tax_id', 'CIF / NIF')}
          {f('series_prefix', 'Prefijo de serie')}
          {f('address', 'Dirección', 'sm:col-span-2')}
          {f('postal_code', 'Código postal')}
          {f('city', 'Ciudad')}
          {f('iban', 'IBAN')}
          {f('email', 'Email de facturación')}
          {error && <p className="sm:col-span-2 text-sm text-red-700">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="px-3 py-2 text-sm rounded-lg hover:bg-slate-100">Cancelar</button>
            <button onClick={save} className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700">Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
};

const Rules: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [form, setForm] = useState({ member_id: '', service_type: '', lead_source: '', mode: 'percent', value: '', valid_from: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState<string | null>(null);
  const canEdit = c.can('team.manage') && !c.readOnly;
  const load = useCallback(() => listCommissionRules(c.orgId).then(r => r.ok && r.data && setRules(r.data.rules)), [c.orgId]);
  useEffect(() => { load(); listMembers(c.orgId).then(r => r.ok && r.data && setMembers(r.data.members)); }, [load, c.orgId]);
  const name = useMemo(() => Object.fromEntries(members.map(m => [m.id, m.display_name || m.email || 'Profesional'])), [members]);
  const today = new Date().toISOString().slice(0, 10);

  const add = async () => {
    const body: Partial<CommissionRule> = {
      member_id: form.member_id || null, service_type: form.service_type || null, lead_source: (form.lead_source || null) as any,
      valid_from: form.valid_from,
      ...(form.mode === 'percent' ? { psych_percent: Number(form.value) } : { fixed_fee: Number(form.value) })
    };
    const r = await createCommissionRule(c.orgId, body);
    if (r.ok) { setError(null); setForm({ ...form, value: '' }); load(); } else setError(r.error || 'No se pudo crear la regla');
  };

  const rentMembers = members.filter(m => m.status === 'active' && m.billing_model === 'fixed_rent');
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <p className="text-sm text-slate-600">Cuánto se queda el profesional de cada cita. Gana la regla más concreta (profesional + servicio + origen del paciente) y se <strong>congela en la cita al crearla</strong>: cambiar una regla no altera citas ni liquidaciones anteriores.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {rules.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Sin reglas. Crea al menos una regla por defecto.</p>}
        {rules.map(r => {
          const ended = r.valid_to && r.valid_to < today;
          return (
            <div key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${ended ? 'opacity-50' : ''}`}>
              <span className="flex-1 min-w-[200px]">
                <strong>{r.member_id ? name[r.member_id] : 'Todos'}</strong>
                {r.service_type ? ` · ${SERVICE_TYPE_LABELS[r.service_type]}` : ''}
                {r.lead_source ? ` · ${r.lead_source === 'clinic' ? 'pacientes captados por la clínica' : 'pacientes propios'}` : ''}
              </span>
              <span className="font-semibold">{r.psych_percent != null ? `${r.psych_percent} % para el profesional` : `${eur(r.fixed_fee)} por cita`}</span>
              <span className="text-xs text-slate-500">desde {r.valid_from}{r.valid_to ? ` hasta ${r.valid_to}` : ''}</span>
              {canEdit && !r.valid_to && <button onClick={async () => { await endCommissionRule(c.orgId, r.id, today); load(); }} className="text-xs text-slate-600 hover:underline">Cerrar hoy</button>}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 grid sm:grid-cols-3 gap-3">
          <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} className={`${input} bg-white`}>
            <option value="">Todos los profesionales</option>
            {members.filter(isClinicalMember).map(m => <option key={m.id} value={m.id}>{name[m.id]}</option>)}
          </select>
          <select value={form.service_type} onChange={e => setForm({ ...form, service_type: e.target.value })} className={`${input} bg-white`}>
            <option value="">Cualquier servicio</option>
            {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={form.lead_source} onChange={e => setForm({ ...form, lead_source: e.target.value })} className={`${input} bg-white`}>
            <option value="">Cualquier origen</option>
            <option value="clinic">Paciente captado por la clínica</option>
            <option value="own">Paciente propio del profesional</option>
          </select>
          <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} className={`${input} bg-white`}>
            <option value="percent">% para el profesional</option>
            <option value="fixed">Importe fijo por cita</option>
          </select>
          <input type="number" min={0} step="0.01" placeholder={form.mode === 'percent' ? 'Ej. 60' : 'Ej. 35'} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={input} />
          <input type="date" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} className={input} />
          {error && <p className="sm:col-span-3 text-sm text-red-700">{error}</p>}
          <div className="sm:col-span-3 flex justify-end"><button onClick={add} disabled={!form.value} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">Añadir regla</button></div>
        </div>
      )}
      {rentMembers.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-900">Alquiler de despacho</h3>
          <p className="text-sm text-slate-500">Cuota fija mensual. Si no hay cuota, se cobran las horas de sala reservadas a la tarifa de cada sala.</p>
          {rentMembers.map(m => (
            <RentRow key={m.id} c={c} member={m} canEdit={canEdit} name={name[m.id]} />
          ))}
        </div>
      )}
    </div>
  );
};

const RentRow: React.FC<{ c: ClinicContext; member: OrgMember; canEdit: boolean; name: string }> = ({ c, member, canEdit, name }) => {
  const [v, setV] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-slate-200 px-4 py-2 text-sm">
      <span className="flex-1">{name}</span>
      {canEdit && (
        <>
          <input type="number" min={0} step="0.01" placeholder="€/mes (vacío = por horas)" value={v} onChange={e => setV(e.target.value)} className={`${input} w-52`} />
          <button onClick={async () => { const r = await setMemberRent(c.orgId, member.id, v === '' ? null : Number(v)); setSaved(r.ok ? 'Guardado' : (r.error || 'Error')); }} className="px-3 py-2 rounded-lg text-sm bg-indigo-50 text-indigo-700">Guardar</button>
        </>
      )}
      {saved && <span className="text-xs text-slate-500">{saved}</span>}
    </div>
  );
};

const ExportCsv: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 max-w-xl">
      <p className="text-sm text-slate-600">Libro de facturas emitidas y recibidas por la clínica en CSV (separador ";" y coma decimal), listo para la gestoría.</p>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="block"><span className="text-sm text-slate-700">Desde</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} className={`${input} block mt-1`} /></label>
        <label className="block"><span className="text-sm text-slate-700">Hasta</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className={`${input} block mt-1`} /></label>
        <button onClick={async () => { const r = await exportInvoicesCsv(c.orgId, from, to); setMsg(r.ok ? null : (r.error || 'Error')); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5"><Download size={15} /> Descargar CSV</button>
      </div>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </div>
  );
};

export default ClinicBillingPanel;
