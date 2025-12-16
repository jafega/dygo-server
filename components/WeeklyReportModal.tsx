import React from 'react';
import { WeeklyReport } from '../types';
import { X, Calendar, TrendingUp, Award, Lightbulb } from 'lucide-react';

interface WeeklyReportModalProps {
  report: WeeklyReport;
  onClose: () => void;
}

const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ report, onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
       <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col">
          
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white shrink-0 relative">
             <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
                <X size={24} />
             </button>
             <h2 className="text-2xl font-bold flex items-center gap-2">
                <Calendar className="w-6 h-6" />
                Resumen Semanal
             </h2>
             <p className="text-purple-100 mt-1">Tu análisis de los últimos 7 días</p>
          </div>

          <div className="p-6 overflow-y-auto space-y-8">
             
             {/* Mood & Themes */}
             <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                        <TrendingUp size={18} className="text-indigo-500"/> Estado de Ánimo
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{report.moodSummary}</p>
                </div>
                <div>
                    <h3 className="font-semibold text-slate-800 mb-2">Temas Recurrentes</h3>
                    <div className="flex flex-wrap gap-2">
                        {report.themes.map((theme, i) => (
                            <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium border border-indigo-100">
                                {theme}
                            </span>
                        ))}
                    </div>
                </div>
             </div>

             {/* Milestones */}
             {report.milestones.length > 0 && (
                 <div>
                    <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                        <Award size={18} className="text-amber-500"/> Logros e Hitos
                    </h3>
                    <ul className="space-y-2">
                        {report.milestones.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <span className="text-amber-500 font-bold">•</span>
                                {m}
                            </li>
                        ))}
                    </ul>
                 </div>
             )}

             {/* Recommendations */}
             <div>
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                    <Lightbulb size={18} className="text-rose-500"/> Recomendaciones
                </h3>
                <div className="grid gap-3">
                    {report.recommendations.map((rec, i) => (
                        <div key={i} className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex gap-3">
                            <div className="bg-rose-200 text-rose-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                {i + 1}
                            </div>
                            <p className="text-sm text-slate-700">{rec}</p>
                        </div>
                    ))}
                </div>
             </div>

          </div>
          
          <div className="p-4 border-t border-slate-100 text-center shrink-0">
             <button onClick={onClose} className="text-slate-500 hover:text-indigo-600 text-sm font-medium">
                Cerrar Reporte
             </button>
          </div>

       </div>
    </div>
  );
};

export default WeeklyReportModal;
