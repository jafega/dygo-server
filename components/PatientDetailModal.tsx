import React, { useState, useEffect, useRef } from 'react';
import { PatientSummary, JournalEntry, ClinicalNoteContent, Attachment, Goal } from '../types';
import { getEntriesForUser, updateEntry, saveEntry, getGoalsForUser, saveUserGoals } from '../services/storageService';
import InsightsPanel from './InsightsPanel';
import GoalsPanel from './GoalsPanel';
import { 
    X, Mail, AlertTriangle, Calendar, FileText, MessageCircle, Save, Paperclip, 
    Image as ImageIcon, File, Trash2, Download, Plus, Stethoscope, 
    BarChart2, List, Activity, TrendingUp, PieChart, ChevronLeft, CheckSquare, Filter
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';

interface PatientDetailModalProps {
  patient: PatientSummary;
  onClose: () => void;
}

// Helper to normalize data structure
const normalizeNote = (note?: string | ClinicalNoteContent): ClinicalNoteContent => {
    if (!note) return { text: '', attachments: [] };
    if (typeof note === 'string') return { text: note, attachments: [] };
    return note;
};

const PatientDetailModal: React.FC<PatientDetailModalProps> = ({ patient, onClose }) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  
  // View State
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'ANALYTICS' | 'PLAN'>('TIMELINE');
  
  // Analytics State
  const [analyticsRange, setAnalyticsRange] = useState<'WEEK' | 'MONTH' | 'YEAR'>('WEEK');

  // Creation Mode State
  const [isCreating, setIsCreating] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });

  // Edit/Create State
  const [internalNote, setInternalNote] = useState<ClinicalNoteContent>({ text: '', attachments: [] });
  const [feedback, setFeedback] = useState<ClinicalNoteContent>({ text: '', attachments: [] });
  
  // Refs for file inputs
  const internalFileInputRef = useRef<HTMLInputElement>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [e, g] = await Promise.all([
          getEntriesForUser(patient.id),
          getGoalsForUser(patient.id)
        ]);
        if (!cancelled) {
          setEntries(e);
          setGoals(g);
        }
      } catch (err) {
        console.error('Error loading patient data', err);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [patient.id]);

  // Filter entries based on role (Psych sees patient data) and TIME RANGE
  const getFilteredEntries = () => {
      // 1. Only Patient Entries
      const patientEntries = entries.filter(e => e.createdBy !== 'PSYCHOLOGIST');
      
      // 2. Filter by Time Range
      const now = new Date();
      const cutoffDate = new Date();
      
      if (analyticsRange === 'WEEK') {
          cutoffDate.setDate(now.getDate() - 7);
      } else if (analyticsRange === 'MONTH') {
          cutoffDate.setMonth(now.getMonth() - 1);
      } else if (analyticsRange === 'YEAR') {
          cutoffDate.setFullYear(now.getFullYear() - 1);
      }

      // We compare using timestamp for accuracy or date string
      return patientEntries.filter(e => e.timestamp >= cutoffDate.getTime());
  };

  const filteredEntries = getFilteredEntries();

  // --- GOAL HANDLERS ---
  const handleAddGoal = (desc: string) => {
      const newGoal: Goal = {
          id: crypto.randomUUID(),
          userId: patient.id,
          description: desc,
          createdAt: Date.now(),
          completed: false,
          aiFeedback: '',
          createdBy: 'PSYCHOLOGIST' // Mark as assigned by Psych
      };
      const updated = [...goals, newGoal];
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  const handleToggleGoal = (id: string) => {
      const updated = goals.map(g => g.id === id ? { ...g, completed: !g.completed } : g);
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  const handleDeleteGoal = (id: string) => {
      if (!window.confirm("¿Eliminar esta tarea?")) return;
      const updated = goals.filter(g => g.id !== id);
      setGoals(updated);
      saveUserGoals(patient.id, updated);
  };

  // --- NOTE HANDLERS ---
  const handleEditClick = (entry: JournalEntry) => {
      setEditingEntryId(entry.id);
      setIsCreating(false);
      setInternalNote(normalizeNote(entry.psychologistNote));
      setFeedback(normalizeNote(entry.psychologistFeedback));
  };

  const handleStartCreate = () => {
      setEditingEntryId(null);
      setInternalNote({ text: '', attachments: [] });
      setFeedback({ text: '', attachments: [] });
      setIsCreating(true);
      setActiveTab('TIMELINE'); // Switch back to timeline to show form
  };

  const handleSaveNotes = async (entry: JournalEntry) => {
      const updated: JournalEntry = {
          ...entry,
          psychologistNote: internalNote,
          psychologistFeedback: feedback
      };
      
      try {
        await updateEntry(updated);
        setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
      } catch (err) {
        console.error('Error saving notes', err);
      } finally {
        setEditingEntryId(null);
      }
  };

  const handleCreateEntry = async () => {
      const newEntry: JournalEntry = {
          id: crypto.randomUUID(),
          userId: patient.id,
          date: newEntryDate,
          timestamp: Date.now(),
          transcript: '', 
          summary: 'Sesión Clínica / Nota del Especialista',
          sentimentScore: 5, 
          emotions: ['Clínico'],
          advice: 'Revisa las notas de tu especialista.',
          psychologistNote: internalNote,
          psychologistFeedback: feedback,
          createdBy: 'PSYCHOLOGIST'
      };

      try {
        await saveEntry(newEntry);
        const e = await getEntriesForUser(patient.id);
        setEntries(e);
      } catch (err) {
        console.error('Error creating entry', err);
      } finally {
        setIsCreating(false);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'INTERNAL' | 'FEEDBACK') => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
          const base64 = reader.result as string;
          const newAttachment: Attachment = {
              id: crypto.randomUUID(),
              type: file.type.startsWith('image/') ? 'IMAGE' : 'DOCUMENT',
              url: base64,
              name: file.name
          };

          if (target === 'INTERNAL') {
              setInternalNote(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
          } else {
              setFeedback(prev => ({ ...prev, attachments: [...prev.attachments, newAttachment] }));
          }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const removeAttachment = (id: string, target: 'INTERNAL' | 'FEEDBACK') => {
      if (target === 'INTERNAL') {
          setInternalNote(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
      } else {
          setFeedback(prev => ({ ...prev, attachments: prev.attachments.filter(a => a.id !== id) }));
      }
  };

  // --- ANALYTICS DATA PREP ---
  const chartData = [...filteredEntries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(e => ({
      date: e.date.substring(5), // MM-DD
      score: e.sentimentScore
    }));

  // Aggregation Logic
  const emotionStats: Record<string, { count: number, parent: string }> = {};
  
  filteredEntries.forEach(e => {
      if (e.structuredEmotions && e.structuredEmotions.length > 0) {
          e.structuredEmotions.forEach(em => {
              const name = em.level2 || em.level1;
              const parent = em.level1; 
              if (!emotionStats[name]) {
                  emotionStats[name] = { count: 0, parent };
              }
              emotionStats[name].count += 1;
          });
      } else {
          e.emotions.forEach(em => {
              if (em !== 'Clínico') {
                  if (!emotionStats[em]) {
                      emotionStats[em] = { count: 0, parent: em };
                  }
                  emotionStats[em].count += 1;
              }
          });
      }
  });

  const getEmotionColor = (name: string) => {
      const n = name.toLowerCase();
      if (n.includes('alegr') || n.includes('joy') || n.includes('felici')) return '#fbbf24'; 
      if (n.includes('amor') || n.includes('love')) return '#ec4899'; 
      if (n.includes('trist') || n.includes('sad')) return '#60a5fa'; 
      if (n.includes('ira') || n.includes('ang')) return '#f87171'; 
      if (n.includes('mied') || n.includes('fear')) return '#a78bfa'; 
      if (n.includes('sorp') || n.includes('surp')) return '#34d399'; 
      return '#94a3b8';
  };
  
  // Sorted but NOT SLICED (User requested all names)
  const emotionData = Object.entries(emotionStats)
      .map(([name, stat]) => ({ name, count: stat.count, fill: getEmotionColor(stat.parent) }))
      .sort((a, b) => b.count - a.count);

  // Dynamic Height for Bar Chart based on number of emotions to prevent squashing
  const barChartHeight = Math.max(250, emotionData.length * 50);

  return (
    // FULL SCREEN OVERLAY - Uses 100dvh for dynamic viewport height on mobile
    <div className="fixed top-0 left-0 w-screen h-[100dvh] bg-white z-[9999] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* HEADER */}
        <div className="bg-white border-b border-slate-200 shrink-0 shadow-sm z-20">
            <div className="px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-3 overflow-hidden">
                    <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-800 -ml-2 p-1">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm md:text-lg shrink-0">
                        {patient.name.charAt(0)}
                    </div>
                    <div className="overflow-hidden">
                        <h2 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2 truncate">
                            {patient.name}
                            {patient.riskLevel === 'HIGH' && (
                                <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-red-200 shrink-0">
                                    Riesgo Alto
                                </span>
                            )}
                        </h2>
                        <p className="text-xs text-slate-500 truncate">{patient.email}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleStartCreate}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 md:px-4 md:py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
                        title="Nueva Nota"
                    >
                        <Plus size={20} /> <span className="hidden md:inline">Nueva Nota</span>
                    </button>
                    <button onClick={onClose} className="hidden md:block p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 hover:text-red-500">
                        <X size={28} />
                    </button>
                </div>
            </div>

            {/* Sub-Header Tabs */}
            <div className="flex px-4 pb-0 md:px-6">
                 <button 
                     onClick={() => setActiveTab('TIMELINE')}
                     className={`flex-1 md:flex-none pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 ${activeTab === 'TIMELINE' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <List size={16} /> Historia Clínica
                 </button>
                 <button 
                     onClick={() => setActiveTab('ANALYTICS')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 ${activeTab === 'ANALYTICS' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <BarChart2 size={16} /> Analíticas
                 </button>
                 <button 
                     onClick={() => setActiveTab('PLAN')}
                     className={`flex-1 md:flex-none md:ml-6 pb-3 pt-1 text-sm font-medium border-b-2 transition-colors flex justify-center md:justify-start gap-2 ${activeTab === 'PLAN' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}
                 >
                     <CheckSquare size={16} /> Plan
                 </button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative bg-white">
            
            {activeTab === 'TIMELINE' ? (
                <div className="flex h-full flex-col md:flex-row">
                    {/* Left: Timeline Feed */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">
                        
                        {/* Creation Form */}
                        {isCreating && (
                            <div className="mb-6 bg-white p-4 md:p-6 rounded-xl border border-indigo-200 shadow-lg animate-in slide-in-from-top-4">
                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                                    <h4 className="font-bold text-indigo-800 flex items-center gap-2 text-base md:text-lg">
                                        <Stethoscope size={20} /> Nueva Entrada
                                    </h4>
                                    <input 
                                        type="date" 
                                        value={newEntryDate}
                                        onChange={(e) => setNewEntryDate(e.target.value)}
                                        className="text-sm bg-white border border-slate-300 text-slate-900 rounded px-2 py-1 font-medium shadow-sm"
                                    />
                                </div>

                                <div className="flex flex-col gap-4 md:gap-6">
                                    {/* Internal Note Input */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                                <FileText size={12} /> Nota Interna
                                            </label>
                                            <button onClick={() => internalFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                <Paperclip size={12} /> <span className="hidden sm:inline">Adjuntar</span>
                                            </button>
                                            <input type="file" ref={internalFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'INTERNAL')} accept="image/*,application/pdf" />
                                        </div>
                                        <textarea 
                                            className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none shadow-sm"
                                            rows={4}
                                            value={internalNote.text}
                                            onChange={(e) => setInternalNote(prev => ({...prev, text: e.target.value}))}
                                            placeholder="Notas privadas..."
                                        />
                                        {internalNote.attachments.length > 0 && (
                                            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                                {internalNote.attachments.map(att => (
                                                    <div key={att.id} className="relative group/att shrink-0 w-10 h-10">
                                                        <img src={att.url} alt="att" className="w-full h-full rounded object-cover border border-slate-200" />
                                                        <button onClick={() => removeAttachment(att.id, 'INTERNAL')} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={8} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Feedback Input */}
                                    <div>
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1">
                                                <MessageCircle size={12} /> Feedback Paciente
                                            </label>
                                            <button onClick={() => feedbackFileInputRef.current?.click()} className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1">
                                                <Paperclip size={12} /> <span className="hidden sm:inline">Adjuntar</span>
                                            </button>
                                            <input type="file" ref={feedbackFileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'FEEDBACK')} accept="image/*,application/pdf" />
                                        </div>
                                        <textarea 
                                            className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                                            rows={4}
                                            value={feedback.text}
                                            onChange={(e) => setFeedback(prev => ({...prev, text: e.target.value}))}
                                            placeholder="Instrucciones para el paciente..."
                                        />
                                        {feedback.attachments.length > 0 && (
                                            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                                {feedback.attachments.map(att => (
                                                    <div key={att.id} className="relative group/att shrink-0 w-10 h-10">
                                                        <img src={att.url} alt="att" className="w-full h-full rounded object-cover border border-slate-200" />
                                                        <button onClick={() => removeAttachment(att.id, 'FEEDBACK')} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={8} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                                    <button onClick={() => setIsCreating(false)} className="px-5 py-2.5 text-sm text-slate-600 hover:text-slate-800 font-medium bg-slate-100 rounded-lg">Cancelar</button>
                                    <button onClick={handleCreateEntry} className="px-5 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 shadow-md font-medium">
                                        <Save size={18} /> Guardar Entrada
                                    </button>
                                </div>
                            </div>
                        )}

                        {entries.length === 0 && !isCreating ? (
                            <div className="text-center py-20 opacity-50 flex flex-col items-center">
                                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                                    <FileText size={24} className="text-slate-400" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-600">Historia Clínica Vacía</h3>
                                <p className="text-slate-500 mt-2 max-w-sm text-sm">No hay registros aún.</p>
                            </div>
                        ) : (
                            <div className="space-y-6 md:space-y-8 relative max-w-5xl mx-auto pl-12 md:pl-0">
                                {/* Vertical Line: Left on mobile, Center on Desktop */}
                                <div className="absolute top-0 bottom-0 left-5 md:left-1/2 md:-ml-px w-0.5 bg-gradient-to-b from-transparent via-slate-200 to-transparent -ml-12 md:-ml-px"></div>

                                {entries.map((entry) => {
                                    const pNote = normalizeNote(entry.psychologistNote);
                                    const pFeed = normalizeNote(entry.psychologistFeedback);
                                    const isEditing = editingEntryId === entry.id;
                                    const isPsychEntry = entry.createdBy === 'PSYCHOLOGIST';

                                    return (
                                        <div key={entry.id} className="relative flex flex-col md:flex-row items-start md:items-center justify-between group">
                                            
                                            {/* Central Dot */}
                                            <div className={`
                                                flex items-center justify-center w-10 h-10 md:w-16 md:h-16 rounded-full border-4 border-slate-50 shadow-md shrink-0 z-10 
                                                absolute left-[-2.5rem] top-0 md:static md:top-auto md:left-auto
                                                md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2
                                                ${isPsychEntry ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'}
                                            `}>
                                                {isPsychEntry ? <Stethoscope className="w-5 h-5 md:w-6 md:h-6" /> : <Calendar className="w-5 h-5 md:w-6 md:h-6 font-bold" />}
                                            </div>
                                            
                                            {/* Content Card */}
                                            <div className={`
                                                w-full md:w-[calc(50%-4rem)] p-4 md:p-6 bg-white rounded-xl border shadow-sm transition-all hover:shadow-md 
                                                ${isPsychEntry ? 'border-purple-100 ring-1 ring-purple-50' : 'border-slate-200'}
                                                md:group-odd:mr-auto md:group-even:ml-auto
                                            `}>
                                                
                                                {/* Entry Header */}
                                                <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-100">
                                                    <div className="flex flex-col">
                                                        <time className="text-base md:text-lg font-bold text-slate-800">{entry.date}</time>
                                                        {isPsychEntry ? (
                                                            <span className="text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-0.5">Nota Clínica</span>
                                                        ) : (
                                                            <span className="text-[10px] text-indigo-500 font-medium mt-0.5">Diario del Paciente</span>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="flex flex-col items-end gap-1">
                                                        {!isEditing && (
                                                            <button onClick={() => handleEditClick(entry)} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline pt-1">
                                                                {isPsychEntry ? 'Editar' : 'Añadir Nota'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Patient Summary */}
                                                {!isPsychEntry && (
                                                    <div className="mb-4">
                                                        <p className="text-slate-700 text-sm md:text-base leading-relaxed">{entry.summary}</p>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {entry.emotions.map(em => (
                                                                <span key={em} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-medium">
                                                                    {em}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Editor Mode */}
                                                {isEditing ? (
                                                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
                                                        <div>
                                                            <label className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1 mb-1">
                                                                <FileText size={12} /> Nota Interna
                                                            </label>
                                                            <textarea 
                                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                                                                rows={3}
                                                                value={internalNote.text}
                                                                onChange={(e) => setInternalNote(prev => ({...prev, text: e.target.value}))}
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="text-xs font-bold text-indigo-700 uppercase tracking-wider flex items-center gap-1 mb-1">
                                                                <MessageCircle size={12} /> Feedback
                                                            </label>
                                                            <textarea 
                                                                className="w-full p-3 text-sm border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                                rows={3}
                                                                value={feedback.text}
                                                                onChange={(e) => setFeedback(prev => ({...prev, text: e.target.value}))}
                                                            />
                                                        </div>

                                                        <div className="flex justify-end gap-2 pt-2">
                                                            <button onClick={() => setEditingEntryId(null)} className="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-200 rounded">Cancelar</button>
                                                            <button onClick={() => handleSaveNotes(entry)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded flex items-center gap-1">
                                                                <Save size={12} /> Guardar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3 pt-1">
                                                        {(pNote.text || pNote.attachments.length > 0) && (
                                                            <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 relative">
                                                                <h5 className="text-[10px] font-bold text-amber-800 uppercase mb-1">Nota Interna</h5>
                                                                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{pNote.text}</p>
                                                            </div>
                                                        )}
                                                        {(pFeed.text || pFeed.attachments.length > 0) && (
                                                            <div className={`rounded-lg p-3 border relative ${isPsychEntry ? 'bg-white border-indigo-100' : 'bg-indigo-50 border-indigo-100'}`}>
                                                                <h5 className="text-[10px] font-bold text-indigo-800 uppercase mb-1">Feedback Paciente</h5>
                                                                <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{pFeed.text}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right: Resumen Global */}
                    <div className="hidden md:block w-96 bg-white border-l border-slate-200 p-8 overflow-y-auto shrink-0">
                        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                             <Activity className="text-indigo-500" /> Resumen Global
                        </h3>
                        <InsightsPanel entries={filteredEntries} mode="CLINICAL" hideChart={true} />
                    </div>
                </div>
            ) : activeTab === 'PLAN' ? (
                <div className="p-8 max-w-4xl mx-auto">
                    <GoalsPanel 
                        title="Plan Terapéutico & Tareas"
                        goals={goals}
                        onAddGoal={handleAddGoal}
                        onToggleGoal={handleToggleGoal}
                        onDeleteGoal={handleDeleteGoal}
                        showAdd={true}
                    />
                </div>
            ) : (
                // ANALYTICS TAB CONTENT
                <div className="h-full bg-slate-50 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-6xl mx-auto space-y-6 md:space-y-8">
                        
                        {/* Control Bar for Analytics */}
                        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800 px-3 flex items-center gap-2">
                                <Filter size={16} className="text-slate-400" /> Filtros
                            </h3>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button 
                                    onClick={() => setAnalyticsRange('WEEK')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'WEEK' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Semana
                                </button>
                                <button 
                                    onClick={() => setAnalyticsRange('MONTH')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'MONTH' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Mes
                                </button>
                                <button 
                                    onClick={() => setAnalyticsRange('YEAR')}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${analyticsRange === 'YEAR' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Año
                                </button>
                            </div>
                        </div>

                        {/* Stats Cards - Grid cols 1 on mobile, 3 on Desktop */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Total Entradas</h4>
                                    <p className="text-3xl md:text-4xl font-bold text-slate-800">{filteredEntries.length}</p>
                                </div>
                                <div className="md:hidden bg-indigo-50 p-2 rounded-full text-indigo-500"><FileText size={20} /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Promedio Ánimo</h4>
                                    <p className={`text-3xl md:text-4xl font-bold ${patient.averageSentiment >= 7 ? 'text-green-500' : patient.averageSentiment >= 4 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {patient.averageSentiment}<span className="text-sm md:text-lg text-slate-300">/10</span>
                                    </p>
                                </div>
                                <div className="md:hidden bg-indigo-50 p-2 rounded-full text-indigo-500"><Activity size={20} /></div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between md:block">
                                <div>
                                    <h4 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wide mb-1 md:mb-2">Nivel de Riesgo</h4>
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border ${patient.riskLevel === 'HIGH' ? 'bg-red-50 text-red-700 border-red-200' : patient.riskLevel === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                        {patient.riskLevel === 'HIGH' && <AlertTriangle size={16} />}
                                        {patient.riskLevel === 'HIGH' ? 'ALTO' : patient.riskLevel === 'MEDIUM' ? 'MEDIO' : 'BAJO'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Charts Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pb-10">
                            
                            {/* Mood Evolution Chart */}
                            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 md:mb-6 flex items-center gap-2">
                                    <TrendingUp className="text-indigo-500" /> Evolución Anímica
                                </h3>
                                <div className="h-48 md:h-64 w-full">
                                    {chartData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} dy={10} />
                                                <YAxis domain={[0, 10]} tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} width={25} />
                                                <RechartsTooltip 
                                                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                    itemStyle={{color: '#6366f1', fontSize: '14px', fontWeight: 'bold'}}
                                                    cursor={{stroke: '#cbd5e1', strokeWidth: 1}}
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
                                                    isAnimationActive={true}
                                                >
                                                    <LabelList dataKey="score" position="top" offset={10} style={{ fontSize: '10px', fill: '#6366f1', fontWeight: 'bold' }} />
                                                </Line>
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                                            Sin datos en este periodo
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Frequent Emotions Chart */}
                            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 shrink-0">
                                    <PieChart className="text-rose-500" /> Frecuencia de Emociones
                                </h3>
                                <div className="flex-1 w-full overflow-y-auto min-h-[200px]" style={{ maxHeight: '400px' }}>
                                    {emotionData.length > 0 ? (
                                        <div style={{ height: `${barChartHeight}px`, minHeight: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart 
                                                    data={emotionData} 
                                                    layout="vertical" 
                                                    margin={{top: 5, right: 30, left: 10, bottom: 5}}
                                                    barSize={24}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                                                    <XAxis type="number" hide />
                                                    <YAxis 
                                                        dataKey="name" 
                                                        type="category" 
                                                        tick={{fontSize: 11, fill: '#475569', fontWeight: 600}} 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        width={110} 
                                                        interval={0}
                                                    />
                                                    <RechartsTooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: '8px'}} />
                                                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                                        {emotionData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                                        ))}
                                                        <LabelList dataKey="count" position="right" style={{ fontSize: '12px', fill: '#64748b' }} />
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    ) : (
                                        <div className="h-48 flex items-center justify-center text-slate-400 text-sm italic">
                                            Sin emociones registradas
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

// Mini Component for Displaying Attachment Thumbnails
const AttachmentThumb: React.FC<{ att: Attachment }> = ({ att }) => (
    <a href={att.url} download={att.name} className="block group shrink-0 relative" title={att.name}>
        {att.type === 'IMAGE' ? (
            <img src={att.url} alt="adjunto" className="w-16 h-16 rounded-lg object-cover border border-slate-200 hover:border-indigo-400 transition-colors" />
        ) : (
            <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors">
                <FileText size={20} className="text-slate-400" />
                <span className="text-[8px] text-slate-500 mt-1 max-w-full truncate px-1">{att.name}</span>
            </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition-opacity text-white">
            <Download size={16} />
        </div>
    </a>
);

export default PatientDetailModal;