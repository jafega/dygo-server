import React, { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  Loader2, RefreshCcw, TrendingUp, TrendingDown, Clock,
  Search, Send, UserPlus, Mic, CalendarCheck, CheckCircle2, LogOut, XCircle,
} from 'lucide-react';

// El embudo comercial de verdad.
//
// A diferencia del kanban de abajo, que pinta `leads.stage` tal cual, estos
// pasos se DERIVAN de hechos: eventos de producto y el estado real de la
// suscripcion en Stripe. El motivo es concreto: el 7 sep 2026 habia 6 leads en
// etapa `won` y cinco mentian, cuatro habian cancelado y una que si pagaba
// constaba como no suscrita. Un campo que se pone a mano se queda viejo; un
// evento con fecha, no.
//
// SOBRE EL ESTILO: aqui no se usa ni una clase `dark:`. No es un descuido —
// el panel de superadmin entero esta escrito con colores claros fijos, asi que
// un componente que respetara el modo oscuro seria el unico que se pondria
// negro sobre una pagina clara. Se sigue la paleta de components/sales/types.ts.
//
// Y OJO CON LOS PORCENTAJES: estos pasos son fotos del momento, no cohortes.
// Quien paga ya no cuenta en "grabo sesion", asi que dividir un paso por el
// anterior daria una conversion falsa. Para eso esta /api/admin/funnel, que si
// sigue cohortes. Aqui solo se ensenan cuantos hay y cuanto llevan.

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

interface DatosPipeline {
  dias: number;
  pasos: Paso[];
  resumen: { en_juego: number; ganado: number; fuga: number; perdido: number; total: number };
  movimientos: { fecha: string; lead: string; de: string | null; a: string | null; titulo: string; via: string }[];
  avances: { fecha: string; lead: string; hito: string; titulo: string }[];
}

type Estilo = { texto: string; fondo: string; borde: string; barra: string; icono: React.ElementType };

// Etiquetas y color de cada paso. Las etiquetas viven aqui, bien acentuadas,
// porque son texto de pantalla; el backend manda las suyas como respaldo.
const PASO: Record<string, { titulo: string; pista: string } & Estilo> = {
  nuevo: {
    titulo: 'Nuevo', pista: 'En cartera. Nadie le ha escrito todavía',
    texto: 'text-blue-700', fondo: 'bg-blue-50', borde: 'border-blue-200', barra: 'bg-blue-400', icono: Search,
  },
  contactado: {
    titulo: 'Contactado', pista: 'Le hemos escrito y aún no se ha registrado',
    texto: 'text-amber-700', fondo: 'bg-amber-50', borde: 'border-amber-200', barra: 'bg-amber-400', icono: Send,
  },
  prueba: {
    titulo: 'En prueba', pista: 'Se registró, pero todavía no tiene pacientes',
    texto: 'text-cyan-700', fondo: 'bg-cyan-50', borde: 'border-cyan-200', barra: 'bg-cyan-400', icono: Clock,
  },
  con_paciente: {
    titulo: 'Añadió paciente', pista: 'Ya tiene un paciente en ficha',
    texto: 'text-teal-700', fondo: 'bg-teal-50', borde: 'border-teal-200', barra: 'bg-teal-400', icono: UserPlus,
  },
  grabando: {
    titulo: 'Grabó sesión', pista: 'El hito que mejor predice la compra',
    texto: 'text-indigo-700', fondo: 'bg-indigo-50', borde: 'border-indigo-200', barra: 'bg-indigo-400', icono: Mic,
  },
  demo: {
    titulo: 'Demo', pista: 'Demo agendada o ya hecha',
    texto: 'text-violet-700', fondo: 'bg-violet-50', borde: 'border-violet-200', barra: 'bg-violet-400', icono: CalendarCheck,
  },
  ganado: {
    titulo: 'Ganado', pista: 'Paga ahora mismo',
    texto: 'text-emerald-700', fondo: 'bg-emerald-50', borde: 'border-emerald-200', barra: 'bg-emerald-500', icono: CheckCircle2,
  },
  fuga: {
    titulo: 'Se dio de baja', pista: 'Fue cliente y se fue',
    texto: 'text-orange-700', fondo: 'bg-orange-50', borde: 'border-orange-200', barra: 'bg-orange-400', icono: LogOut,
  },
  perdido: {
    titulo: 'Perdido', pista: 'Nunca compró, o dijo que no',
    texto: 'text-red-700', fondo: 'bg-red-50', borde: 'border-red-200', barra: 'bg-red-400', icono: XCircle,
  },
};

// Tres fases. Nueve tarjetas en fila se leen como un muro; agrupadas se lee el
// recorrido. Y los desenlaces van aparte porque no son pasos por los que se
// avanza, son sitios donde el lead se queda.
const FASES: { nombre: string; pista: string; pasos: string[] }[] = [
  { nombre: 'Prospección', pista: 'antes de que exista una cuenta', pasos: ['nuevo', 'contactado'] },
  { nombre: 'Dentro de la prueba', pista: 'aquí se decide la venta', pasos: ['prueba', 'con_paciente', 'grabando'] },
  { nombre: 'Desenlace', pista: 'dónde acabó', pasos: ['demo', 'ganado', 'fuga', 'perdido'] },
];

// Las tarjetas NO llevan insignia de "llevan mas de 14 dias aqui". Se probo y
// se quito: casi todo el mundo se registro en abril, asi que marcaba 36 de 37
// en "En prueba" y 946 de 946 en "Contactado". Un aviso que senala a todos no
// avisa de nada. El dato sigue estando donde si tiene contexto: la columna de
// dias al abrir un paso, donde se resalta en ambar en las fases en las que
// hoy puedes hacer algo al respecto.
const VIGILAR_ESTANCADOS = ['prueba', 'con_paciente', 'grabando', 'demo'];

const relativo = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

const inicial = (nombre: string) => (nombre || '?').trim().charAt(0).toUpperCase();

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
      if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
      setDatos(await res.json());
    } catch (e: any) {
      setError(e?.message || 'No se pudo cargar el embudo');
    } finally {
      setCargando(false);
    }
  }, [dias]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando && !datos) {
    return (
      <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500 bg-white border border-slate-200 rounded-xl">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculando el embudo…
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-3 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
        {error} <button onClick={cargar} className="ml-1 font-medium underline">Reintentar</button>
      </div>
    );
  }
  if (!datos) return null;

  const porId: Record<string, Paso> = {};
  for (const p of datos.pasos) porId[p.id] = p;
  const maximo = Math.max(...datos.pasos.map(p => p.total), 1);

  const movimientos = [
    ...datos.avances.map(a => ({ fecha: a.fecha, quien: a.lead, que: a.titulo, bueno: true })),
    ...datos.movimientos.map(m => ({
      fecha: m.fecha, quien: m.lead, que: m.titulo,
      bueno: m.a !== 'cancelled' && m.a !== 'lost',
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  const pasoAbierto = abierto ? porId[abierto] : null;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Embudo comercial</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            <strong className="font-semibold text-slate-700">{datos.resumen.en_juego}</strong> en juego ·{' '}
            <strong className="font-semibold text-emerald-700">{datos.resumen.ganado}</strong> pagando ·{' '}
            <strong className="font-semibold text-orange-700">{datos.resumen.fuga}</strong> de baja ·{' '}
            <strong className="font-semibold text-red-700">{datos.resumen.perdido}</strong> perdidos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dias}
            onChange={e => setDias(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border rounded-lg text-slate-600 border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value={1}>movimientos de hoy</option>
            <option value={7}>últimos 7 días</option>
            <option value={30}>últimos 30 días</option>
          </select>
          <button
            onClick={cargar}
            title="Actualizar"
            className="p-2 bg-white border rounded-lg border-slate-300 hover:bg-slate-50"
          >
            <RefreshCcw className={`w-3.5 h-3.5 text-slate-500 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Los pasos, agrupados en tres fases */}
      <div className="grid gap-3 lg:grid-cols-[2fr_3fr_4fr]">
        {FASES.map(fase => (
          <div key={fase.nombre}>
            <div className="flex items-baseline gap-2 mb-1.5 px-0.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{fase.nombre}</span>
              <span className="text-[11px] text-slate-400">{fase.pista}</span>
            </div>
            <div className={`grid gap-2 ${fase.pasos.length === 2 ? 'grid-cols-2' : fase.pasos.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {fase.pasos.map(id => {
                const paso = porId[id];
                if (!paso) return null;
                const est = PASO[id];
                const Icono = est.icono;
                const activo = abierto === id;
                return (
                  <button
                    key={id}
                    onClick={() => setAbierto(activo ? null : id)}
                    title={est.pista}
                    className={`text-left p-3 rounded-xl border transition-all ${est.fondo} ${
                      activo ? `${est.borde} ring-2 ring-offset-1 ring-slate-400` : `${est.borde} hover:shadow-sm`
                    }`}
                  >
                    <div className="mb-1.5">
                      <Icono className={`w-3.5 h-3.5 ${est.texto} opacity-70`} />
                    </div>
                    <div className={`text-2xl font-bold leading-none tabular-nums ${est.texto}`}>{paso.total}</div>
                    <div className="mt-1 text-xs font-semibold leading-tight text-slate-700">{est.titulo}</div>
                    <div className="w-full h-1 mt-2 overflow-hidden rounded-full bg-white/70">
                      <div className={`h-full rounded-full ${est.barra}`} style={{ width: `${Math.max(paso.total > 0 ? 6 : 0, (paso.total / maximo) * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Quién está en el paso elegido */}
      {pasoAbierto && (
        <div className="overflow-hidden bg-white border border-slate-200 rounded-xl">
          <div className={`flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 border-b ${PASO[pasoAbierto.id].fondo} ${PASO[pasoAbierto.id].borde}`}>
            <div>
              <span className={`text-sm font-bold ${PASO[pasoAbierto.id].texto}`}>{PASO[pasoAbierto.id].titulo}</span>
              <span className="ml-2 text-xs text-slate-500">{PASO[pasoAbierto.id].pista}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {pasoAbierto.total === 0 ? 'nadie aquí' : 'quien lleva más tiempo, primero'}
              </span>
              <button onClick={() => setAbierto(null)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                Cerrar
              </button>
            </div>
          </div>
          {pasoAbierto.total > 0 && (
            <>
              <div className="overflow-y-auto max-h-80">
                <table className="w-full text-sm">
                  <tbody>
                    {pasoAbierto.leads.slice(0, 60).map(l => (
                      <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-2 pl-4 pr-2 w-9">
                          <span className="flex items-center justify-center w-6 h-6 text-[11px] font-bold rounded-full bg-slate-100 text-slate-500">
                            {inicial(l.name)}
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-800">{l.name}</td>
                        <td className="hidden py-2 pr-3 text-xs sm:table-cell text-slate-500">{l.email}</td>
                        <td className="hidden py-2 pr-3 md:table-cell">
                          {l.plan && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700">{l.plan}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-xs text-right whitespace-nowrap">
                          {l.dias_en_paso === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className={
                              VIGILAR_ESTANCADOS.includes(pasoAbierto.id) && l.dias_en_paso >= 14
                                ? 'font-semibold text-amber-700'
                                : 'text-slate-500'
                            }>
                              {l.dias_en_paso} d aquí
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pasoAbierto.total > 60 && (
                <div className="px-4 py-2 text-xs border-t text-slate-500 bg-slate-50 border-slate-100">
                  …y {pasoAbierto.total - 60} más. Usa los filtros de abajo para verlos todos.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Quién ha avanzado */}
      <div className="overflow-hidden bg-white border border-slate-200 rounded-xl">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50">
          <span className="text-sm font-bold text-slate-800">Quién ha avanzado</span>
          <span className="text-xs text-slate-500">
            {dias === 1 ? 'hoy' : `últimos ${dias} días`}
            {movimientos.length > 0 && ` · ${movimientos.length} movimiento${movimientos.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {movimientos.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center text-slate-400">
            Nadie ha dado un paso en este periodo.
          </p>
        ) : (
          <div className="overflow-y-auto max-h-72">
            <table className="w-full text-sm">
              <tbody>
                {movimientos.slice(0, 50).map((m, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-2 pl-4 pr-2 w-9">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${m.bueno ? 'bg-emerald-100' : 'bg-orange-100'}`}>
                        {m.bueno
                          ? <TrendingUp className="w-3 h-3 text-emerald-700" />
                          : <TrendingDown className="w-3 h-3 text-orange-700" />}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{m.quien}</td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        m.bueno ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {m.que}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-right whitespace-nowrap text-slate-400">{relativo(m.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="px-0.5 text-[11px] leading-relaxed text-slate-400">
        Los pasos se calculan a partir de hechos con fecha —eventos de producto y el estado real de la suscripción en
        Stripe—, no del campo de etapa, que se queda desactualizado cuando un webhook no llega. Son fotos del momento,
        no cohortes: para la conversión entre pasos, mira Embudo.
      </p>
    </div>
  );
};
