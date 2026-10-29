import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, X, Loader2, Ticket, Wallet, Users, Save, Power, AlertCircle, Handshake, ChevronRight,
} from 'lucide-react';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  CollaboratorListItem, CollaboratorPanel, CollaboratorPayout,
  eur, fecha, describeDiscount, describePayout, STATUS_LABEL, EARNING_LABEL,
} from './types';

const DEFAULT_PAYOUT: CollaboratorPayout = {
  payout_model: 'recurring',
  payout_amount_type: 'percent',
  payout_amount: 0,
  payout_percent: 20,
  payout_min_months: 3,
  payout_max_months: 12,
};

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const label = 'block text-xs font-semibold text-slate-600 mb-1';

const request = async (url: string, method = 'GET', body?: unknown) => {
  const res = await apiFetch(`${API_URL}${url}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Error');
  return data;
};

// ── Editor de la estructura de pagos ────────────────────────────────────────
const PayoutEditor: React.FC<{ value: CollaboratorPayout; onChange: (v: CollaboratorPayout) => void }> = ({ value, onChange }) => {
  const set = (patch: Partial<CollaboratorPayout>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {([
          ['recurring', 'Recurrente', 'Cada mes que el lead paga'],
          ['one_time', 'Pago único', 'Una vez, tras X meses pagados'],
        ] as const).map(([id, t, d]) => (
          <button
            key={id}
            type="button"
            onClick={() => set({ payout_model: id, ...(id === 'one_time' ? { payout_amount_type: 'fixed' } : {}) })}
            className={`text-left rounded-xl border p-3 transition-colors ${value.payout_model === id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-sm font-semibold text-slate-900">{t}</p>
            <p className="text-xs text-slate-500">{d}</p>
          </button>
        ))}
      </div>

      {value.payout_model === 'recurring' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Tipo de comisión</label>
              <select
                className={input}
                value={value.payout_amount_type}
                onChange={e => set({ payout_amount_type: e.target.value as CollaboratorPayout['payout_amount_type'] })}
              >
                <option value="percent">% de lo que paga</option>
                <option value="fixed">Importe fijo €</option>
              </select>
            </div>
            {value.payout_amount_type === 'percent' ? (
              <div>
                <label className={label}>Porcentaje (sin IVA)</label>
                <input type="number" min={0} max={100} step="0.5" className={input}
                  value={value.payout_percent} onChange={e => set({ payout_percent: Number(e.target.value) })} />
              </div>
            ) : (
              <div>
                <label className={label}>€ por lead y mes</label>
                <input type="number" min={0} step="0.5" className={input}
                  value={value.payout_amount} onChange={e => set({ payout_amount: Number(e.target.value) })} />
              </div>
            )}
          </div>
          <div>
            <label className={label}>Tope de meses por lead (vacío = mientras pague)</label>
            <input type="number" min={1} className={input}
              value={value.payout_max_months ?? ''}
              onChange={e => set({ payout_max_months: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>€ por lead</label>
            <input type="number" min={0} step="0.5" className={input}
              value={value.payout_amount} onChange={e => set({ payout_amount: Number(e.target.value) })} />
          </div>
          <div>
            <label className={label}>Tras X meses pagados</label>
            <input type="number" min={1} className={input}
              value={value.payout_min_months} onChange={e => set({ payout_min_months: Number(e.target.value) })} />
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">El colaborador verá: <em>{describePayout(value)}</em>.</p>
    </div>
  );
};

// ── Ficha de un colaborador ─────────────────────────────────────────────────
const CollaboratorDetail: React.FC<{ id: string; onClose: () => void; onChanged: () => void }> = ({ id, onClose, onChanged }) => {
  const [panel, setPanel] = useState<CollaboratorPanel | null>(null);
  const [payout, setPayout] = useState<CollaboratorPayout>(DEFAULT_PAYOUT);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [codeForm, setCodeForm] = useState({ code: '', percent_off: 20, duration_months: '3', max_redemptions: '' });
  const [payForm, setPayForm] = useState({ amount: '', description: '', type: 'payout' as 'payout' | 'adjustment' });

  const apply = (p: CollaboratorPanel) => {
    setPanel(p);
    const c = p.collaborator;
    setPayout({
      payout_model: c.payout_model, payout_amount_type: c.payout_amount_type,
      payout_amount: c.payout_amount, payout_percent: c.payout_percent,
      payout_min_months: c.payout_min_months, payout_max_months: c.payout_max_months,
    });
    setNotes(c.notes || '');
  };

  useEffect(() => {
    request(`/admin/collaborators/${id}`).then(apply).catch(e => setError(e.message));
  }, [id]);

  const run = async (key: string, fn: () => Promise<CollaboratorPanel>) => {
    setBusy(key);
    setError('');
    try {
      apply(await fn());
      onChanged();
      return true;
    } catch (e: any) {
      setError(e?.message || 'Error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = () => {
    if (!panel) return;
    const off = panel.collaborator.active;
    if (off && !window.confirm('¿Dar de baja a este colaborador? Pierde el premium y su área, sus códigos se desactivan en Stripe y sus leads dejan de generar comisión. Lo que ya tenga en la bolsa se mantiene.')) return;
    run('active', () => request(`/admin/collaborators/${id}`, 'PATCH', { active: !off }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex justify-end" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl h-full overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-3 z-10">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate">{panel?.collaborator.name || panel?.collaborator.email || 'Colaborador'}</p>
            <p className="text-xs text-slate-500 truncate">{panel?.collaborator.email}</p>
          </div>
          {panel && (
            <button
              onClick={toggleActive}
              disabled={busy === 'active'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${panel.collaborator.active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              {busy === 'active' ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
              {panel.collaborator.active ? 'Dar de baja' : 'Reactivar'}
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {!panel ? (
          <div className="flex items-center justify-center h-64">
            {error ? <p className="text-red-600 text-sm">{error}</p> : <Loader2 className="animate-spin text-indigo-400" size={28} />}
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}
              </div>
            )}
            {!panel.collaborator.active && (
              <p className="text-sm bg-slate-200 text-slate-700 rounded-lg px-3 py-2">
                Dado de baja el {fecha(panel.collaborator.deactivated_at)}. Si lo reactivas, sus códigos siguen desactivados: actívalos uno a uno abajo.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Bolsa', eur(panel.stats.balance)],
                ['Total ganado', eur(panel.stats.total_earned)],
                ['Leads', `${panel.stats.leads} (${panel.stats.paying} pagando)`],
                ['Ya pagado', eur(panel.stats.total_paid_out)],
              ].map(([k, v]) => (
                <div key={k} className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
                  <p className="text-lg font-bold text-slate-900 truncate">{v}</p>
                </div>
              ))}
            </div>

            {/* Estructura de pagos */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3">Estructura de pagos</h4>
              <PayoutEditor value={payout} onChange={setPayout} />
              <label className={`${label} mt-3`}>Notas internas (no las ve el colaborador)</label>
              <textarea className={input} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              <p className="text-xs text-slate-500 mt-2">Los cambios aplican a las facturas que se cobren a partir de ahora; lo ya ganado no se recalcula.</p>
              <button
                onClick={() => run('payout', () => request(`/admin/collaborators/${id}`, 'PATCH', { ...payout, notes }))}
                disabled={busy === 'payout'}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === 'payout' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </section>

            {/* Códigos */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Ticket size={16} /> Códigos de descuento</h4>
              {panel.codes.length > 0 && (
                <ul className="divide-y divide-slate-100 mb-4">
                  {panel.codes.map(k => (
                    <li key={k.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className={`font-mono font-bold ${k.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{k.code}</p>
                        <p className="text-xs text-slate-500">
                          {describeDiscount(k)} · {k.uses} {k.uses === 1 ? 'uso' : 'usos'}{k.max_redemptions ? ` / ${k.max_redemptions}` : ''} · {fecha(k.created_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => run(`code-${k.id}`, () => request(`/admin/collaborator-codes/${k.id}`, 'PATCH', { active: !k.active }))}
                        disabled={busy === `code-${k.id}` || (!k.active && !panel.collaborator.active)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-lg disabled:opacity-50 ${k.active ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                      >
                        {busy === `code-${k.id}` ? '…' : k.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {panel.collaborator.active && (
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const ok = await run('code', () => request(`/admin/collaborators/${id}/codes`, 'POST', {
                      code: codeForm.code,
                      percent_off: codeForm.percent_off,
                      duration_months: codeForm.duration_months === '' ? null : Number(codeForm.duration_months),
                      max_redemptions: codeForm.max_redemptions === '' ? null : Number(codeForm.max_redemptions),
                    }));
                    if (ok) setCodeForm(f => ({ ...f, code: '' }));
                  }}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end bg-slate-50 rounded-xl p-3"
                >
                  <div className="col-span-2">
                    <label className={label}>Código</label>
                    <input required className={`${input} font-mono uppercase`} placeholder="LAURA20"
                      value={codeForm.code} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))} />
                  </div>
                  <div>
                    <label className={label}>% dto.</label>
                    <input required type="number" min={1} max={100} className={input}
                      value={codeForm.percent_off} onChange={e => setCodeForm(f => ({ ...f, percent_off: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className={label}>Meses</label>
                    <input type="number" min={1} max={36} className={input} placeholder="siempre"
                      value={codeForm.duration_months} onChange={e => setCodeForm(f => ({ ...f, duration_months: e.target.value }))} />
                  </div>
                  <div>
                    <label className={label}>Máx. usos</label>
                    <input type="number" min={1} className={input} placeholder="∞"
                      value={codeForm.max_redemptions} onChange={e => setCodeForm(f => ({ ...f, max_redemptions: e.target.value }))} />
                  </div>
                  <button
                    type="submit"
                    disabled={busy === 'code'}
                    className="col-span-2 sm:col-span-5 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy === 'code' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear código en Stripe
                  </button>
                </form>
              )}
            </section>

            {/* Bolsa: pagos */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Wallet size={16} /> Bolsa</h4>
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  const amount = Number(payForm.amount);
                  if (payForm.type === 'payout' && !window.confirm(`¿Registrar que le has pagado ${eur(amount)}? Se resta de su bolsa.`)) return;
                  const ok = await run('pay', () => request(`/admin/collaborators/${id}/payouts`, 'POST', { ...payForm, amount }));
                  if (ok) setPayForm({ amount: '', description: '', type: 'payout' });
                }}
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end bg-slate-50 rounded-xl p-3 mb-4"
              >
                <div>
                  <label className={label}>Tipo</label>
                  <select className={input} value={payForm.type} onChange={e => setPayForm(f => ({ ...f, type: e.target.value as 'payout' | 'adjustment' }))}>
                    <option value="payout">Le he pagado</option>
                    <option value="adjustment">Ajuste (+/−)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Importe €</label>
                  <input required type="number" step="0.01" className={input} placeholder={eur(panel.stats.balance)}
                    value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={label}>Concepto</label>
                  <input className={input} placeholder="Transferencia octubre"
                    value={payForm.description} onChange={e => setPayForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <button type="submit" disabled={busy === 'pay'}
                  className="col-span-2 sm:col-span-4 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
                  {busy === 'pay' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Registrar
                </button>
              </form>
              {panel.earnings.length === 0 ? (
                <p className="text-sm text-slate-500">Sin movimientos.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {panel.earnings.map(m => (
                    <li key={m.id} className="flex justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{EARNING_LABEL[m.type]}</span>
                        <span className="block text-xs text-slate-500 truncate">{m.description} · {fecha(m.created_at)}</span>
                      </span>
                      <span className={`font-semibold whitespace-nowrap ${m.amount >= 0 ? 'text-emerald-700' : 'text-slate-600'}`}>{eur(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Leads */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Users size={16} /> Leads</h4>
              {panel.referrals.length === 0 ? (
                <p className="text-sm text-slate-500">Nadie ha entrado aún con sus códigos.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                        <th className="py-2 pr-2">Lead</th><th className="py-2 px-2">Código</th><th className="py-2 px-2">Estado</th>
                        <th className="py-2 px-2 text-right">Meses</th><th className="py-2 px-2 text-right">Ha pagado</th><th className="py-2 pl-2 text-right">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panel.referrals.map(r => {
                        const st = STATUS_LABEL[r.status || ''] || { label: r.status || '—', className: 'bg-slate-100 text-slate-500' };
                        return (
                          <tr key={r.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-2 pr-2"><p className="font-medium">{r.name || '—'}</p><p className="text-xs text-slate-500">{r.email}</p></td>
                            <td className="py-2 px-2 font-mono text-xs">{r.code}</td>
                            <td className="py-2 px-2"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span></td>
                            <td className="py-2 px-2 text-right">{r.months_paid}</td>
                            <td className="py-2 px-2 text-right">{eur(r.total_paid || 0)}</td>
                            <td className="py-2 pl-2 text-right font-semibold">{eur(r.earned)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Lista + alta ────────────────────────────────────────────────────────────
const CollaboratorsAdmin: React.FC = () => {
  const [list, setList] = useState<CollaboratorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPayout, setNewPayout] = useState<CollaboratorPayout>(DEFAULT_PAYOUT);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setList(await request('/admin/collaborators'));
    } catch (e: any) {
      setError(e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setCreateError('');
    try {
      const panel: CollaboratorPanel = await request('/admin/collaborators', 'POST', { email: newEmail, ...newPayout });
      setCreating(false);
      setNewEmail('');
      setNewPayout(DEFAULT_PAYOUT);
      await load();
      setOpenId(panel.collaborator.id);
    } catch (err: any) {
      setCreateError(err?.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const totals = list.reduce((t, c) => ({
    balance: t.balance + c.stats.balance,
    leads: t.leads + c.stats.leads,
    paying: t.paying + c.stats.paying,
  }), { balance: 0, leads: 0, paying: 0 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Handshake size={20} /> Colaboradores</h2>
          <p className="text-sm text-slate-500">Premium incluido, códigos de descuento en Stripe y comisión por los leads que traen.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo colaborador
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Activos', String(list.filter(c => c.active).length)],
          ['Leads / pagando', `${totals.leads} / ${totals.paying}`],
          ['Pendiente de pagar', eur(totals.balance)],
        ].map(([k, v]) => (
          <div key={k} className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</p>
            <p className="text-lg sm:text-xl font-bold text-slate-900 truncate">{v}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-indigo-400" size={28} /></div>
      ) : error ? (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {error}
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          Aún no hay colaboradores. Da de alta el primero con el botón de arriba.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {list.map(c => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {c.name || c.email}
                  {!c.active && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 align-middle">Baja</span>}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {c.email} · {describePayout(c)}
                </p>
                {c.codes.length > 0 && (
                  <p className="text-xs mt-1 flex flex-wrap gap-1">
                    {c.codes.map(k => (
                      <span key={k.code} className={`font-mono px-1.5 py-0.5 rounded ${k.active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400 line-through'}`}>{k.code}</span>
                    ))}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-slate-900">{eur(c.stats.balance)}</p>
                <p className="text-xs text-slate-500">{c.stats.leads} leads · {c.stats.paying} pagando</p>
              </div>
              <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => !saving && setCreating(false)}>
          <form onSubmit={create} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Nuevo colaborador</h3>
              <button type="button" onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div>
              <label className={label}>Email de su cuenta en mainds</label>
              <input required type="email" className={input} placeholder="psicologa@ejemplo.com"
                value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              <p className="text-xs text-slate-500 mt-1">Tiene que estar registrado. Desde ya tendrá Premium incluido y verá el botón “Área de colaborador”.</p>
            </div>
            <PayoutEditor value={newPayout} onChange={setNewPayout} />
            {createError && <p className="text-sm text-red-600">{createError}</p>}
            <button type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Dar de alta
            </button>
            <p className="text-xs text-slate-500 text-center">Los códigos de descuento se crean después, desde su ficha.</p>
          </form>
        </div>
      )}

      {openId && <CollaboratorDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
};

export default CollaboratorsAdmin;
