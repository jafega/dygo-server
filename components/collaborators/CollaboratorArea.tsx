import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, Users, Copy, Check, Share2, Ticket, Loader2,
  AlertCircle, Sparkles, Eye, MessageCircle, RefreshCcw,
} from 'lucide-react';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  CollaboratorPanel, CollaboratorListItem, CollaboratorCode,
  eur, fecha, describeDiscount, describePayout, STATUS_LABEL, EARNING_LABEL,
} from './types';

interface Props {
  /** Un superadmin puede abrir el área de cualquier colaborador. */
  isSuperAdmin: boolean;
  /** Id del colaborador del usuario actual, si lo es. */
  ownCollaboratorId: string | null;
}

const shareText = (c: CollaboratorCode) =>
  `Uso mainds para gestionar mi consulta y me encanta. Con mi código ${c.code} tienes un ${describeDiscount(c)} en tu suscripción: https://mainds.app`;

const CollaboratorArea: React.FC<Props> = ({ isSuperAdmin, ownCollaboratorId }) => {
  const [panel, setPanel] = useState<CollaboratorPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  // Solo superadmin: a qué colaborador estamos mirando.
  const [options, setOptions] = useState<CollaboratorListItem[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(ownCollaboratorId);

  useEffect(() => {
    if (!isSuperAdmin) return;
    apiFetch(`${API_URL}/admin/collaborators`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: CollaboratorListItem[]) => {
        setOptions(list);
        setViewingId(prev => prev || list[0]?.id || null);
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    if (isSuperAdmin && !viewingId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const q = isSuperAdmin && viewingId ? `?collaborator_id=${encodeURIComponent(viewingId)}` : '';
      const res = await apiFetch(`${API_URL}/collaborator/dashboard${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el área de colaborador');
      setPanel(data);
    } catch (e: any) {
      setPanel(null);
      setError(e?.message || 'Error');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, viewingId]);

  useEffect(() => { load(); }, [load]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1800);
    } catch { /* el navegador no deja: no pasa nada */ }
  };

  const share = async (c: CollaboratorCode) => {
    const text = shareText(c);
    if (navigator.share) {
      try { await navigator.share({ title: 'mainds', text }); return; } catch { /* cancelado */ }
    }
    copy(`msg-${c.id}`, text);
  };

  const previewBar = isSuperAdmin && (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
      <div className="flex items-center gap-2 flex-1">
        <Eye size={16} className="flex-shrink-0" />
        <span>Vista de superadmin: ves el área exactamente como la ve el colaborador.</span>
      </div>
      {options.length > 0 && (
        <select
          value={viewingId || ''}
          onChange={e => setViewingId(e.target.value)}
          className="bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-sm text-slate-800"
        >
          {options.map(o => (
            <option key={o.id} value={o.id}>
              {(o.name || o.email || o.id)}{o.id === ownCollaboratorId ? ' (tú)' : ''}{o.active ? '' : ' · baja'}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {previewBar}
        <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-indigo-400" size={32} /></div>
      </div>
    );
  }

  if (!panel) {
    return (
      <div className="space-y-4">
        {previewBar}
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-600">
          <AlertCircle className="mx-auto mb-3 text-slate-400" size={28} />
          <p>{isSuperAdmin && options.length === 0
            ? 'Todavía no hay colaboradores. Da de alta el primero desde Superadmin → Colaboradores.'
            : error}</p>
        </div>
      </div>
    );
  }

  const { collaborator: c, stats, codes, referrals, earnings } = panel;
  const activeCodes = codes.filter(k => k.active);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {previewBar}

      {/* ── Saludo + bolsa ───────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 rounded-2xl p-5 sm:p-7 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-end gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-sm font-medium flex items-center gap-1.5">
              <Sparkles size={15} /> Colaborador de mainds
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold mt-1 truncate">Hola{c.name ? `, ${c.name.split(' ')[0]}` : ''} 👋</h2>
            <p className="text-white/85 text-sm mt-2 max-w-xl">
              Tienes <strong>mainds Premium incluido</strong>. Comparte tus códigos: quien se suscribe con ellos
              consigue descuento y tú ganas <strong>{describePayout(c)}</strong>.
            </p>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-4 min-w-[220px]">
            <p className="text-white/80 text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14} /> Tu bolsa
            </p>
            <p className="text-4xl font-bold mt-1">{eur(stats.balance)}</p>
            <p className="text-white/80 text-xs mt-1">pendiente de cobro</p>
          </div>
        </div>
        {!c.active && (
          <p className="mt-4 text-sm bg-white/15 rounded-lg px-3 py-2">
            Esta colaboración está dada de baja desde el {fecha(c.deactivated_at)}.
          </p>
        )}
      </div>

      {/* ── Números ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Leads', value: String(stats.leads), sub: 'entraron con tus códigos', icon: <Users size={18} className="text-indigo-600" /> },
          { label: 'Pagando ahora', value: String(stats.paying), sub: `${stats.converted} han pagado alguna vez`, icon: <TrendingUp size={18} className="text-emerald-600" /> },
          { label: 'Este mes', value: eur(stats.earned_this_month), sub: 'ganado en el mes', icon: <Sparkles size={18} className="text-violet-600" /> },
          { label: 'Total ganado', value: eur(stats.total_earned), sub: `${eur(stats.total_paid_out)} ya cobrado`, icon: <Wallet size={18} className="text-amber-600" /> },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              {k.icon}
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 truncate">{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Códigos ──────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Ticket size={18} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-900">Tus códigos de descuento</h3>
        </div>
        {codes.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no tienes códigos. El equipo de mainds te los creará en breve.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...activeCodes, ...codes.filter(k => !k.active)].map(k => (
              <div key={k.id} className={`rounded-xl border p-4 ${k.active ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xl font-bold tracking-wider text-slate-900 break-all">{k.code}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{describeDiscount(k)}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {k.uses} {k.uses === 1 ? 'uso' : 'usos'}{k.max_redemptions ? ` de ${k.max_redemptions}` : ''}
                      {!k.active && ' · desactivado'}
                    </p>
                  </div>
                  {k.active && (
                    <button
                      onClick={() => copy(k.id, k.code)}
                      className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-700 hover:border-indigo-300 flex-shrink-0"
                      title="Copiar código"
                    >
                      {copied === k.id ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  )}
                </div>
                {k.active && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      onClick={() => share(k)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      {copied === `msg-${k.id}` ? <Check size={14} /> : <Share2 size={14} />}
                      {copied === `msg-${k.id}` ? 'Mensaje copiado' : 'Compartir'}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText(k))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Leads ───────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-900">Leads con tus códigos</h3>
          </div>
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Actualizar">
            <RefreshCcw size={16} />
          </button>
        </div>
        {referrals.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no ha entrado nadie con tus códigos. ¡Compártelos!</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="py-2 px-4 sm:px-2 font-semibold">Lead</th>
                  <th className="py-2 px-2 font-semibold">Código</th>
                  <th className="py-2 px-2 font-semibold">Estado</th>
                  <th className="py-2 px-2 font-semibold text-right">Meses pagados</th>
                  <th className="py-2 px-2 font-semibold text-right">Has ganado</th>
                  <th className="py-2 px-2 font-semibold">Entró</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map(r => {
                  const st = STATUS_LABEL[r.status || ''] || { label: r.status || '—', className: 'bg-slate-100 text-slate-500' };
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2.5 px-4 sm:px-2">
                        <p className="font-medium text-slate-900">{r.name || '—'}</p>
                        <p className="text-xs text-slate-500">{r.email}</p>
                      </td>
                      <td className="py-2.5 px-2 font-mono text-xs">{r.code}</td>
                      <td className="py-2.5 px-2">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right">{r.months_paid}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{eur(r.earned)}</td>
                      <td className="py-2.5 px-2 text-slate-500 whitespace-nowrap">{fecha(r.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Movimientos de la bolsa ──────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={18} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-900">Movimientos de tu bolsa</h3>
        </div>
        {earnings.length === 0 ? (
          <p className="text-sm text-slate-500">Aquí verás cada comisión que ganes y cada pago que recibas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {earnings.map(e => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{EARNING_LABEL[e.type]}</p>
                  <p className="text-xs text-slate-500 truncate">{e.description} · {fecha(e.created_at)}</p>
                </div>
                <span className={`text-sm font-semibold whitespace-nowrap ${e.amount >= 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {e.amount >= 0 ? '+' : ''}{eur(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default CollaboratorArea;
