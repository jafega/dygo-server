import React, { useEffect, useState } from 'react';
import { JournalEntry } from '../types';
import { generateWeeklyInsights, generateClinicalSummary } from '../services/genaiService';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, TrendingUp, Heart, Activity } from 'lucide-react';

interface InsightsPanelProps {
  entries: JournalEntry[];
  mode?: 'PERSONAL' | 'CLINICAL'; // Default is PERSONAL
  hideChart?: boolean; // New prop to optionally hide visual charts
}

const InsightsPanel: React.FC<InsightsPanelProps> = ({ entries, mode = 'PERSONAL', hideChart = false }) => {
  const [insight, setInsight] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchInsights = async () => {
      if (entries.length === 0) return;
      setLoading(true);
      try {
        // Take last 7 entries for analysis
        const recent = [...entries].sort((a,b) => b.timestamp - a.timestamp).slice(0, 7);
        
        let text = '';
        if (mode === 'CLINICAL') {
            text = await generateClinicalSummary(recent);
        } else {
            text = await generateWeeklyInsights(recent);
        }
        
        setInsight(text);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [entries, mode]);

  // Prep Chart Data
  const chartData = [...entries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-14) // Last 14 entries
    .map(e => ({
      date: e.date.substring(5), // MM-DD
      score: e.sentimentScore
    }));

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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500"/>
                {isClinical ? "Evolución Anímica (Últimos 14 días)" : "Tu Ánimo Reciente"}
            </h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    itemStyle={{color: '#6366f1', fontSize: '12px'}}
                    isAnimationActive={false}
                    formatter={(value: number) => [value, 'Puntuación']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#6366f1" 
                    strokeWidth={3} 
                    dot={{fill: '#6366f1', strokeWidth: 2, r: 4, stroke: '#fff'}} 
                    activeDot={{r: 6}}
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
        
        <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 relative z-10 ${isClinical ? 'text-slate-800' : 'text-indigo-900'}`}>
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
    </div>
  );
};

export default InsightsPanel;