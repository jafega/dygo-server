import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getDashboard, type ClinicDashboard } from '../../services/businessApi';
import type { ClinicContext } from './ClinicWorkspace';

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
const pct = (n: number) => `${n.toLocaleString('es-ES')} %`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

const Kpi: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
    {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
  </div>
);

/** Panel del dueño: producción, ocupación, no-show, pacientes, captación y liquidaciones. */
const DashboardPanel: React.FC<{ c: ClinicContext }> = ({ c }) => {
  const [period, setPeriod] = useState(thisMonth());
  const [d, setD] = useState<ClinicDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    getDashboard(c.orgId, period).then(r => { if (r.ok && r.data) setD(r.data); else setError(r.error || 'No se pudo cargar'); });
  }, [c.orgId, period]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-slate-900">Panel de la clínica</h2>
          <p className="text-sm text-slate-500">Actividad del mes. La producción son las sesiones realizadas; lo facturado, las facturas a pacientes emitidas.</p>
        </div>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" aria-label="Mes" />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!d ? <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo-400" size={28} /></div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Producción" value={eur(d.production)} hint={`${d.sessions} sesiones realizadas`} />
            <Kpi label="Facturado a pacientes" value={eur(d.invoiced)} />
            <Kpi label="Ocupación de salas" value={pct(d.room_occupancy)} hint="Sobre 12 h por día laborable" />
            <Kpi label="No presentados" value={pct(d.no_show_rate)} hint={`${d.no_shows} ${d.no_shows === 1 ? 'cita' : 'citas'} · ${d.cancelled} ${d.cancelled === 1 ? 'cancelada' : 'canceladas'}`} />
            <Kpi label="Pacientes activos" value={String(d.patients_active)} hint={`${d.patients_seen} atendidos este mes`} />
            <Kpi label="Solicitudes de cita" value={String(d.leads)} hint={`${d.leads_converted} convertidas (${pct(d.lead_conversion)})`} />
            <Kpi label="Liquidaciones pendientes" value={String(d.settlements_pending)} hint={d.settlements_pending ? eur(d.settlements_pending_amount) : undefined} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-800 mb-2">Producción por profesional</p>
              {d.by_member.length === 0 ? <p className="text-sm text-slate-500">Sin sesiones realizadas.</p> : (
                <div style={{ height: Math.max(160, d.by_member.length * 44) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.by_member} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `${v} €`} fontSize={11} />
                      <YAxis type="category" dataKey="name" width={120} fontSize={12} />
                      <Tooltip formatter={(v: number) => eur(v)} />
                      <Bar dataKey="production" name="Producción" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Por sede y salas</p>
              <ul className="text-sm divide-y divide-slate-100">
                {d.by_location.map(l => <li key={l.name} className="flex justify-between py-1.5"><span>{l.name}</span><span>{l.sessions} sesiones · {eur(l.production)}</span></li>)}
                {d.by_location.length === 0 && <li className="text-slate-500 py-1.5">Sin actividad.</li>}
              </ul>
              {d.rooms.length > 0 && (
                <ul className="space-y-2">
                  {d.rooms.map(r => (
                    <li key={r.room_id} className="text-sm">
                      <div className="flex justify-between"><span>{r.name}</span><span className="text-slate-500">{r.hours.toLocaleString('es-ES')} h · {pct(r.occupancy)}</span></div>
                      <div className="h-2 rounded-full bg-slate-100 mt-1"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, r.occupancy)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPanel;
