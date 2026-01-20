import React, { useEffect, useMemo, useState } from 'react';
import { JournalEntry } from '../types';
import { generateWeeklyInsights, generateClinicalSummary } from '../services/genaiService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Sparkles, TrendingUp, Heart, Activity } from 'lucide-react';

interface InsightsPanelProps {
  entries: JournalEntry[];
  mode?: 'PERSONAL' | 'CLINICAL'; // Default is PERSONAL
  hideChart?: boolean; // New prop to optionally hide visual charts
}

const InsightsPanel: React.FC<InsightsPanelProps> = ({ entries, mode = 'PERSONAL', hideChart = false }) => {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const latestEntry = useMemo(() => {
    if (!entries.length) return null;
    return [...entries].sort((a, b) => b.timestamp - a.timestamp)[0];
  }, [entries]);

  const getCacheKeys = () => {
    const userId = latestEntry?.userId || 'unknown';
    const modeKey = mode.toLowerCase();
    return {
      idKey: `dygo_insight_last_entry_${modeKey}_${userId}`,
      textKey: `dygo_insight_text_${modeKey}_${userId}`
    };
  };

  useEffect(() => {
    const fetchInsights = async () => {
      if (!latestEntry || entries.length === 0) return;

      const { idKey, textKey } = getCacheKeys();
      let cachedId: string | null = null;
      let cachedText: string | null = null;
      try {
        cachedId = localStorage.getItem(idKey);
        cachedText = localStorage.getItem(textKey);
      } catch (_) {
        // ignore storage errors
      }

      if (cachedText && !insight) {
        setInsight(cachedText);
      }

      if (latestEntry.id && cachedId === latestEntry.id) return;

      setLoading(true);
      try {
        // Optimización: Tomar solo las últimas 7 entradas necesarias
        // Ya filtradas desde entries prop (limitadas en el componente padre)
        const recent = [...entries]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 7);

        let text = '';
        if (mode === 'CLINICAL') {
          text = await generateClinicalSummary(recent);
          // Remove '**Resumen de Estado**' and any leading asterisks or whitespace
          text = text.replace(/^\*{0,2}\s*Resumen de Estado:?\s*\*{0,2}\s*/i, '');
        } else {
          text = await generateWeeklyInsights(recent);
        }

        setInsight(text);
        try {
          if (latestEntry.id) localStorage.setItem(idKey, latestEntry.id);
          localStorage.setItem(textKey, text);
        } catch (_) {
          // ignore storage errors
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [entries, mode, latestEntry, insight]);

  // Prep Chart Data
  const chartData = [...entries]
    .filter(e => {
      if (e.createdBy === 'PSYCHOLOGIST') return false;
      const hasTranscript = Boolean(e.transcript && e.transcript.trim().length > 0);
      const hasNonClinicalEmotion = Array.isArray(e.emotions) ? e.emotions.some(em => em !== 'Clínico') : false;
      return hasTranscript || hasNonClinicalEmotion;
    })
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-14) // Last 14 entries
    .map(e => ({
      date: e.date.substring(5), // MM-DD
      score: e.sentimentScore
    }));

  const emotionChartData = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const relevant = entries.filter(e => {
      if (e.createdBy === 'PSYCHOLOGIST') return false;
      if (typeof e.timestamp === 'number') return e.timestamp >= cutoff;
      return true;
    });

    const counts = new Map<string, number>();
    relevant.forEach(e => {
      (e.emotions || []).forEach(em => {
        if (!em || em === 'Clínico') return;
        counts.set(em, (counts.get(em) || 0) + 1);
      });
    });

    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-100">
        <Sparkles className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <p>
            {mode === 'CLINICAL' 
             ? "No hay suficientes datos para generar un resumen clínico." 
             : "Completa algunos días en tu diario para ver tus estadísticas y consejos personalizados."}
        </p>
      </div>
    );
  }

  const isClinical = mode === 'CLINICAL';

  return (
    <div className="space-y-6">
      {/* Chart Section - Conditionally Rendered */}
      {!hideChart && (
          <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500"/>
                  {isClinical ? "Evolución Anímica (Últimos 14 días)" : "Tu Ánimo Reciente"}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">14 días</span>
                <div className="text-xs text-slate-400">0–10</div>
              </div>
            </div>
            <div className="h-52 w-full rounded-xl bg-gradient-to-b from-slate-50 via-white to-white border border-slate-100 p-2 shadow-inner">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="moodGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} width={28} />
                  <Tooltip 
                    contentStyle={{borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)'}}
                    itemStyle={{color: '#4f46e5', fontSize: '12px', fontWeight: 600}}
                    labelStyle={{fontSize: '11px', color: '#64748b'}}
                    isAnimationActive={false}
                    formatter={(value: number) => [value, 'Puntuación']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="url(#moodGradient)" 
                    strokeWidth={3} 
                    dot={{fill: '#6366f1', strokeWidth: 2, r: 4, stroke: '#fff'}} 
                    activeDot={{r: 7, stroke: '#6366f1', strokeWidth: 2}}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
      )}

          {/* AI Analysis Section */}
          <div className={`p-6 rounded-2xl border relative overflow-hidden ${isClinical ? 'bg-slate-50 border-slate-200' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100'}`}>
          {!isClinical && (
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-200 rounded-full blur-2xl opacity-50"></div>
          )}
        
          <h3 className={`text-base md:text-lg font-semibold mb-3 flex items-center gap-2 relative z-10 ${isClinical ? 'text-slate-800' : 'text-indigo-900'}`}>
            {isClinical ? (
              <>
                <Activity className="w-5 h-5 text-blue-600" />
                Resumen Clínico (IA)
              </>
            ) : (
              <>
                <Heart className="w-5 h-5 text-rose-500" />
                Consejo de Bienestar
              </>
            )}
          </h3>
        
          <div className={`relative z-10 leading-relaxed text-sm md:text-base ${isClinical ? 'text-slate-700' : 'text-indigo-800'}`}>
            {loading ? (
             <div className="flex items-center gap-2 animate-pulse">
              <div className={`w-2 h-2 rounded-full ${isClinical ? 'bg-slate-400' : 'bg-indigo-400'}`}></div>
              <span>{isClinical ? "Generando resumen clínico..." : "Analizando tus días..."}</span>
             </div>
            ) : (
             <p>{insight}</p>
            )}
          </div>
          </div>

      {!hideChart && !isClinical && (
        <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-base md:text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" /> Emociones más frecuentes (14 días)
            </h3>
            <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">Top 10</span>
          </div>
          {emotionChartData.length === 0 ? (
            <div className="text-sm text-slate-500">Aún no hay emociones registradas.</div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emotionChartData} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="6 6" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)' }}
                    itemStyle={{ color: '#7c3aed', fontSize: '12px', fontWeight: 600 }}
                    labelStyle={{ fontSize: '11px', color: '#64748b' }}
                    formatter={(value: number) => [value, 'Ocurrencias']}
                  />
                  <Bar dataKey="count" fill="#a78bfa" radius={[8, 8, 8, 8]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InsightsPanel;