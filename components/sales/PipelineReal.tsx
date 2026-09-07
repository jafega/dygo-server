import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import { ChevronRight, Loader2, RefreshCcw, TrendingUp, TrendingDown, Clock } from 'lucide-react';

// El embudo comercial de verdad.
//
// A diferencia del kanban de abajo, que pinta `leads.stage` tal cual, estos
// pasos se DERIVAN de hechos: eventos de producto y el estado real de la
// suscripcion en Stripe. El motivo es concreto — el 7 sep 2026 habia 6 leads
// en etapa `won` y cinco mentian, cuatro habian cancelado y una que si pagaba
// constaba como no suscrita. Un campo que se pone a mano se queda viejo; un
// evento con fecha, no.
//
// Y "se dio de baja" va aparte de "perdido" a proposito: uno fue cliente y se
// fue, el otro nunca compro. Juntarlos esconde la fuga.

interface LeadEnPaso {
  id: string;
  name: string;
  email: string;
  source: string | null;
  plan: string | null;
  tiene_cuenta: boolean;
  desde: string | null;
  dias_en_paso: number | null;
}

interface Paso {
  id: string;
  label: string;
  ayuda: string;
  total: number;
  leads: LeadEnPaso[];
}

interface Movimiento {
  fecha: string;
  lead_id: string | null;
  lead: string;
  de: string | null;
  a: string | null;
  titulo: string;
  via: string;
}

interface Avance {
  fecha: string;
  lead_id: string | null;
  lead: string;
  hito: string;
  titulo: string;
}

interface DatosPipeline {
  dias: number;
  pasos: Paso[];
  resumen: { en_juego: number; ganado: number; fuga: number; perdido: number; total: number };
  movimientos: Movimiento[];
  avances: Avance[];
}

// Los tres desenlaces se pintan distinto del resto: no son pasos por los que
// se avanza, son sitios donde el lead se queda.
const CIERRE: Record<string, { fondo: string; texto: string; barra: string }> = {
  ganado:  { fondo: 'bg-emerald-50 dark:bg-emerald-950/30', texto: 'text-emerald-700 dark:text-emerald-400', barra: 'bg-emerald-500' },
  fuga:    { fondo: 'bg-orange-50 dark:bg-orange-950/30',   texto: 'text-orange-700 dark:text-orange-400',   barra: 'bg-orange-500' },
  perdido: { fondo: 'bg-slate-100 dark:bg-slate-800/60',    texto: 'text-slate-600 dark:text-slate-400',     barra: 'bg-slate-400' },
};
const EN_JUEGO = { fondo: 'bg-white dark:bg-slate-900', texto: 'text-slate-900 dark:text-slate-100', barra: 'bg-amber-500' };

const relativo = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
};

export const PipelineReal: React.FC = () => {
  const [datos, setDatos] = useState<DatosPipeline | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [dias, setDias] = useState(7);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_URL}/admin/sales/pipeline?dias=${dias}`);
      if (!res.ok) throw new Error(`El servidor respondio ${res.status}`);
      setDatos(await res.json());
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el pipeline');
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !datos) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculando el embudo…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 mb-6 text-sm rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
        {error}{' '}
        <button onClick={cargar} className="underline">Reintentar</button>
      </div>
    );
  }
  if (!datos) return null;

  const maximo = Math.max(...datos.pasos.map(p => p.total), 1);
  const movimientos = [
    ...datos.avances.map(a => ({ fecha: a.fecha, quien: a.lead, que: a.titulo, bueno: true })),
    ...datos.movimientos.map(m => ({
      fecha: m.fecha, quien: m.lead, que: m.titulo,
      bueno: m.a !== 'cancelled' && m.a !== 'lost',
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Embudo comercial</h2>
        <div className="flex items-center gap-3">
          <select
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
          >
            <option value={1}>movimientos de hoy</option>
            <option value={7}>últimos 7 días</option>
            <option value={30}>últimos 30 días</option>
          </select>
          <button
            onClick={cargar}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Actualizar"
          >
            <RefreshCcw className={`w-3.5 h-3.5 text-slate-500 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Los pasos salen de hechos con fecha —eventos de producto y el estado real en Stripe—, no del campo de etapa.
        <strong className="font-medium"> {datos.resumen.en_juego} en juego</strong>, {datos.resumen.ganado} pagando,
        {' '}{datos.resumen.fuga} de baja y {datos.resumen.perdido} perdidos.
      </p>

      {/* Los pasos */}
      <div className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-3 lg:grid-cols-9">
        {datos.pasos.map((paso, i) => {
          const estilo = CIERRE[paso.id] || EN_JUEGO;
          const activo = abierto === paso.id;
          const estancados = paso.leads.filter(l => (l.dias_en_paso ?? 0) >= 14).length;
          return (
            <button
              key={paso.id}
              onClick={() => setAbierto(activo ? null : paso.id)}
              title={paso.ayuda}
              className={`relative text-left p-3 rounded-lg border transition-colors ${estilo.fondo} ${
                activo
                  ? 'border-amber-500 ring-1 ring-amber-500'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[10px] font-mono text-slate-400">{i + 1}</span>
                {i < datos.pasos.length - 3 && <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />}
              </div>
              <div className={`text-2xl font-semibold tabular-nums ${estilo.texto}`}>{paso.total}</div>
              <div className="text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-300">{paso.label}</div>
              <div className="w-full h-1 mt-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full ${estilo.barra}`} style={{ width: `${(paso.total / maximo) * 100}%` }} />
              </div>
              {estancados > 0 && (
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-600 dark:text-amber-500">
                  <Clock className="w-2.5 h-2.5" /> {estancados} +14d
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Quien esta en el paso elegido, el mas atascado primero */}
      {abierto && (() => {
        const paso = datos.pasos.find(p => p.id === abierto);
        if (!paso) return null;
        return (
          <div className="mb-6 border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-baseline justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/60">
              <div>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{paso.label}</span>
                <span className="ml-2 text-xs text-slate-500">{paso.ayuda}</span>
              </div>
              <span className="text-xs text-slate-500">
                {paso.total === 0 ? 'nadie aquí' : 'quien lleva más tiempo, primero'}
              </span>
            </div>
            {paso.total > 0 && (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {paso.leads.slice(0, 60).map(l => (
                      <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{l.name}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{l.email}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{l.plan || l.source || ''}</td>
                        <td className={`px-4 py-2 text-xs text-right tabular-nums ${
                          (l.dias_en_paso ?? 0) >= 14 ? 'text-amber-600 dark:text-amber-500 font-medium' : 'text-slate-500'
                        }`}>
                          {l.dias_en_paso === null ? '—' : `${l.dias_en_paso} d`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {paso.total > 60 && (
                  <div className="px-4 py-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40">
                    …y {paso.total - 60} más. Usa los filtros de abajo para verlos todos.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Quien se ha movido */}
      <div className="border rounded-lg border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Quién ha avanzado
          </span>
          <span className="ml-2 text-xs text-slate-500">
            {dias === 1 ? 'hoy' : `últimos ${dias} días`} · {movimientos.length}
          </span>
        </div>
        {movimientos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center text-slate-500">
            Nadie ha dado un paso en este periodo.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {movimientos.slice(0, 50).map((m, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 w-6">
                      {m.bueno
                        ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        : <TrendingDown className="w-3.5 h-3.5 text-orange-600" />}
                    </td>
                    <td className="px-2 py-2 font-medium text-slate-800 dark:text-slate-200">{m.quien}</td>
                    <td className={`px-3 py-2 ${m.bueno ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-700 dark:text-orange-400'}`}>
                      {m.que}
                    </td>
                    <td className="px-4 py-2 text-xs text-right text-slate-500 whitespace-nowrap">{relativo(m.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
