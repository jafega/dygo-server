import React, { useState, useEffect } from 'react';
import { JournalEntry, ClinicalNoteContent, Attachment } from '../types';
import { X, Calendar, MessageSquare, Lightbulb, Trash2, Edit2, Save, MessageCircle, FileText, Download, Stethoscope } from 'lucide-react';

interface EntryModalProps {
  entries: JournalEntry[];
  dateStr: string;
  onClose: () => void;
    onStartSession: (dateStr: string) => void;
  onDeleteEntry: (id: string) => void;
  onUpdateEntry: (entry: JournalEntry) => void;
  currentUserId?: string;
}

const EntryModal: React.FC<EntryModalProps> = ({ entries, dateStr, onClose, onStartSession, onDeleteEntry, onUpdateEntry, currentUserId }) => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isPastOrToday = dateStr <= todayStr;

  if (entries.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-40 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center relative animate-in fade-in zoom-in duration-200 shadow-xl">
           <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <X size={20} />
           </button>
           <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
           <h3 className="text-xl font-semibold text-slate-800 mb-2">Sin entradas</h3>
           <p className="text-slate-500 mb-6">No hay grabaciones para el día {dateStr}.</p>
           
                     {isPastOrToday ? (
              <button 
                                onClick={() => { onClose(); onStartSession(dateStr); }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                Empezar nueva grabación
              </button>
           ) : (
                         <p className="text-xs text-slate-400">Solo puedes añadir entradas a días anteriores o el día actual.</p>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-40 p-4 backdrop-blur-sm">
       <div className="bg-white rounded-2xl max-w-2xl w-full p-0 overflow-hidden shadow-2xl relative animate-in fade-in slide-in-from-bottom-4 duration-300 max-h-[90vh] flex flex-col">
          
          {/* Header */}
          <div className="bg-indigo-600 p-6 text-white relative shrink-0 flex justify-between items-center">
             <div>
                 <h2 className="text-2xl font-bold">{dateStr}</h2>
                 <p className="text-indigo-200 text-sm mt-1">{entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}</p>
             </div>
             <div className="flex items-center gap-3">
                      {isPastOrToday && (
                     <button 
                                onClick={() => { onClose(); onStartSession(dateStr); }}
                        className="bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                     >
                        + Nueva
                     </button>
                 )}
                 <button onClick={onClose} className="text-indigo-200 hover:text-white transition-colors">
                    <X size={24} />
                 </button>
             </div>
          </div>

          {/* List of Entries */}
          <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-slate-50">
             {entries
                .filter(entry => {
                    // Filtrar notas internas que no fueron creadas por el usuario actual
                    const isInternalNote = entry.createdBy === 'PSYCHOLOGIST' && 
                                          !entry.psychologistEntryType;
                    if (isInternalNote && entry.creator_user_id !== currentUserId) {
                        return false; // No mostrar esta entrada
                    }
                    return true;
                })
                .map((entry, index) => (
                    <EntryCard 
                        key={entry.id} 
                        entry={entry} 
                        index={entries.length - index} // Show reverse chronological number
                        onDelete={() => onDeleteEntry(entry.id)}
                        onUpdate={onUpdateEntry}
                        currentUserId={currentUserId}
                    />
                ))
             }
          </div>
       </div>
    </div>
  );
};

// Sub-component for individual entry card
const EntryCard: React.FC<{
    entry: JournalEntry; 
    index: number;
    onDelete: () => void;
    onUpdate: (entry: JournalEntry) => void;
    currentUserId: string;
}> = ({ entry, index, onDelete, onUpdate, currentUserId }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editSummary, setEditSummary] = useState(entry.summary);
    
    const isPsychEntry = entry.createdBy === 'PSYCHOLOGIST';
    const isSession = entry.psychologistEntryType === 'SESSION';
    const psychEntryLabel = isSession ? 'Sesión Clínica' : entry.psychologistEntryType === 'FEEDBACK' ? 'Feedback Clínico' : 'Nota Clínica';
    const [showTranscript, setShowTranscript] = useState(false);

    // Sync state if props change (e.g., after a save or external update)
    useEffect(() => {
        setEditSummary(entry.summary);
    }, [entry.summary]);

    const handleSave = () => {
        onUpdate({ ...entry, summary: editSummary });
        setIsEditing(false);
    };

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };

    const normalizeNote = (note?: string | ClinicalNoteContent | null): ClinicalNoteContent | null => {
        if (!note) return null;
        if (typeof note === 'string') return { text: note, attachments: [] };
        return note;
    };

    const feedback = normalizeNote(entry.psychologistFeedback);
    const internalNote = normalizeNote(entry.psychologistNote);
    const fallbackPsychText = (entry.summary || '').trim();
    const referenceLabel = entry.createdBy === 'PSYCHOLOGIST'
        ? (entry.psychologistEntryType === 'SESSION'
            ? 'Relacionado: sesión clínica'
            : (entry.transcript && entry.transcript.trim().length > 0 ? 'Relacionado: entrada de diario' : ''))
        : '';

    return (
        <div className={`rounded-xl shadow-sm border overflow-hidden ${isPsychEntry ? 'bg-purple-50/50 border-purple-100' : 'bg-white border-slate-200'}`}>
            {/* Entry Header */}
            <div className="px-4 py-3 bg-white/50 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isPsychEntry ? 'bg-purple-100 text-purple-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {isPsychEntry ? <Stethoscope size={12}/> : `#${index}`}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{formatTime(entry.timestamp)}</span>
                    {isPsychEntry && (
                        <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                            {psychEntryLabel}
                        </span>
                    )}
                    {!isPsychEntry && (
                        <div className="flex gap-1">
                            {entry.emotions.map((e, idx) => (
                                <span key={`${e}-${idx}`} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-[10px] text-slate-600 font-medium">
                                    {e}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {referenceLabel && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        {referenceLabel}
                    </span>
                )}
                
                {/* Only allow deleting user diary entries, editing user entries text */}
                <div className="flex gap-2 sm:justify-end">
                    {!isPsychEntry && (
                        isEditing ? (
                            <button onClick={handleSave} className="px-3 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1" title="Guardar">
                                <Save size={16} />
                                <span className="sm:hidden">Guardar</span>
                            </button>
                        ) : (
                            <button onClick={() => setIsEditing(true)} className="px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1" title="Editar texto">
                                <Edit2 size={16} />
                                <span className="sm:hidden">Editar</span>
                            </button>
                        )
                    )}

                    {!isPsychEntry && (
                        <button 
                            onClick={() => {
                                if(window.confirm('¿Estás seguro de que quieres eliminar esta entrada?')) onDelete();
                            }} 
                            className="px-3 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors text-xs font-semibold flex items-center gap-1" 
                            title="Eliminar"
                        >
                            <Trash2 size={16} />
                            <span className="sm:hidden">Eliminar</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-4">
                 {/* Summary / Content (Only show for User Entries) */}
                 {!isPsychEntry && (
                     <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MessageSquare size={14} /> Resumen
                        </h4>
                        {isEditing ? (
                            <textarea 
                                className="w-full p-3 border border-indigo-200 rounded-lg text-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                rows={4}
                                value={editSummary}
                                onChange={(e) => setEditSummary(e.target.value)}
                            />
                        ) : (
                            <p className="text-slate-700 leading-relaxed text-sm">
                                {entry.summary}
                            </p>
                        )}
                     </div>
                 )}

                 {/* Clinical Session Summary + Transcript (Psych Session) */}
                                 {isPsychEntry && isSession && (
                     <div>
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                             <MessageSquare size={14} /> Resumen de la sesión (IA)
                         </h4>
                         <p className="text-slate-700 leading-relaxed text-sm">{entry.summary}</p>
                                                 <div className="mt-3 flex flex-wrap items-center gap-2">
                                                     <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${entry.sentimentScore >= 7 ? 'bg-green-50 text-green-700 border-green-200' : entry.sentimentScore >= 4 ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                         {entry.sentimentScore}/10
                                                     </span>
                                                     {entry.emotions?.length > 0 && entry.emotions.slice(0, 6).map(em => (
                                                         <span key={em} className="text-[10px] bg-white text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-semibold">
                                                             {em}
                                                         </span>
                                                     ))}
                                                 </div>
                         {entry.transcript && entry.transcript.trim().length > 0 && (
                             <div className="mt-3">
                                 <button
                                     onClick={() => setShowTranscript(prev => !prev)}
                                     className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full hover:bg-indigo-100 transition-colors"
                                 >
                                     {showTranscript ? 'Ocultar transcript' : 'Ver transcript completo'}
                                 </button>
                                 {showTranscript && (
                                     <div className="mt-2 p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                                         {entry.transcript}
                                     </div>
                                 )}
                             </div>
                         )}
                     </div>
                 )}

                 {/* Advice (Only show for User Entries) */}
                 {!isPsychEntry && (
                     <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100/50">
                        <h4 className="text-xs font-bold text-amber-500/70 uppercase tracking-wider mb-1 flex items-center gap-2">
                            <Lightbulb size={12} /> Consejo de la IA
                        </h4>
                        <p className="text-slate-600 italic text-sm">
                            "{entry.advice}"
                        </p>
                     </div>
                 )}

                 {/* Psychologist Feedback (hide internal notes from patient) */}
                 {!isPsychEntry && (feedback && (feedback.text || feedback.attachments.length > 0)) && (
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                        <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MessageCircle size={14} /> Feedback del especialista
                        </h4>
                        
                        {feedback.text && (
                            <p className="text-indigo-900 text-sm leading-relaxed mb-3">
                                {feedback.text}
                            </p>
                        )}
                        
                        {/* Attachments Grid */}
                        {feedback.attachments.length > 0 && (
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-2 pt-2 border-t border-indigo-50">
                                {feedback.attachments.map(att => (
                                    att.type === 'AUDIO' ? (
                                        <div key={att.id} className="group relative aspect-square bg-slate-50 rounded-lg border border-indigo-100 overflow-hidden flex flex-col items-center justify-center p-1">
                                            <audio controls src={att.url} className="w-full" />
                                            <a href={att.url} download={att.name} className="text-[9px] text-indigo-600 mt-1">Descargar</a>
                                        </div>
                                    ) : att.type === 'VIDEO' ? (
                                        <div key={att.id} className="group relative aspect-square bg-slate-50 rounded-lg border border-indigo-100 overflow-hidden flex flex-col items-center justify-center p-1">
                                            <video controls src={att.url} className="w-full" />
                                            <a href={att.url} download={att.name} className="text-[9px] text-indigo-600 mt-1">Descargar</a>
                                        </div>
                                    ) : (
                                        <a 
                                            key={att.id} 
                                            href={att.url} 
                                            download={att.name}
                                            className="group relative aspect-square bg-slate-50 rounded-lg border border-indigo-100 overflow-hidden flex flex-col items-center justify-center hover:shadow-md transition-all"
                                        >
                                            {att.type === 'IMAGE' ? (
                                                <img src={att.url} alt="adjunto" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center justify-center p-1 text-center">
                                                    <FileText size={20} className="text-indigo-400 mb-1" />
                                                    <span className="text-[8px] text-slate-500 line-clamp-2 w-full leading-tight">{att.name}</span>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <Download className="text-white w-5 h-5" />
                                            </div>
                                        </a>
                                    )
                                ))}
                            </div>
                        )}
                    </div>
                 )}

                 {/* Notas del psicólogo - solo mostrar si hay contenido visible para el usuario actual */}
                 {isPsychEntry && !isSession && (() => {
                   const canSeeInternalNote = entry.creator_user_id === currentUserId && (internalNote?.text || (internalNote?.attachments?.length || 0) > 0);
                   const hasFeedback = feedback?.text || (feedback?.attachments?.length || 0) > 0;
                   const hasFallback = !internalNote?.text && !feedback?.text && fallbackPsychText;
                   
                   // Solo mostrar el bloque si hay algo visible
                   const hasVisibleContent = canSeeInternalNote || hasFeedback || hasFallback;
                   
                   if (!hasVisibleContent) return null;
                   
                   return (
                     <div className="space-y-3">
                         {/* Solo mostrar notas internas si el usuario actual es el creador */}
                         {canSeeInternalNote && (
                             <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                 <h4 className="text-[10px] font-bold uppercase text-amber-700 mb-1 flex items-center gap-1">
                                     <FileText size={11} /> Nota interna
                                 </h4>
                                 {internalNote?.text && (
                                     <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{internalNote.text}</p>
                                 )}
                             </div>
                         )}

                         {hasFeedback && (
                             <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                                 <h4 className="text-[10px] font-bold uppercase text-indigo-700 mb-1 flex items-center gap-1">
                                     <MessageCircle size={11} /> Feedback
                                 </h4>
                                 {feedback?.text && (
                                     <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{feedback.text}</p>
                                 )}
                             </div>
                         )}

                         {hasFallback && (
                             <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                 <h4 className="text-[10px] font-bold uppercase text-slate-400 mb-1">Detalle</h4>
                                 <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{fallbackPsychText}</p>
                             </div>
                         )}
                     </div>
                   );
                 })()}

                 {/* Stats Bar (Only for User Entries) */}
                 {!isPsychEntry && (
                     <div className="flex items-center gap-3 pt-2">
                         <span className="text-xs text-slate-400">Bienestar:</span>
                         <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                               className={`h-full rounded-full ${entry.sentimentScore >= 7 ? 'bg-green-400' : entry.sentimentScore >= 4 ? 'bg-yellow-400' : 'bg-red-400'}`}
                               style={{width: `${entry.sentimentScore * 10}%`}} 
                             />
                         </div>
                         <span className="text-xs font-bold text-slate-600">{entry.sentimentScore}/10</span>
                     </div>
                 )}
            </div>
        </div>
    );
};

export default EntryModal;