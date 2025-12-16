import React, { useState } from 'react';
import { Goal } from '../types';
import { Target, Plus, Trash2, CheckCircle, Circle, Sparkles, Stethoscope, User } from 'lucide-react';

interface GoalsPanelProps {
  goals: Goal[];
  onAddGoal: (desc: string) => void;
  onToggleGoal: (id: string) => void;
  onDeleteGoal: (id: string) => void;
  readOnly?: boolean; // If true, cannot add, only toggle/delete if allowed
  title?: string;
  showAdd?: boolean;
}

const GoalsPanel: React.FC<GoalsPanelProps> = ({ 
    goals, 
    onAddGoal, 
    onToggleGoal, 
    onDeleteGoal, 
    readOnly = false,
    title = "Metas Personales",
    showAdd = true
}) => {
  const [newGoal, setNewGoal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoal.trim()) {
      onAddGoal(newGoal);
      setNewGoal('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500"/>
            {title}
        </h3>
        
        {showAdd && !readOnly && (
            <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
                <input 
                    type="text" 
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    placeholder="Nueva meta o tarea..."
                    className="flex-1 px-4 py-2 rounded-xl bg-white text-slate-900 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button 
                    type="submit" 
                    className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-colors"
                    disabled={!newGoal.trim()}
                >
                    <Plus size={20} />
                </button>
            </form>
        )}

        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {goals.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4 italic">Sin tareas activas.</p>
            )}
            
            {(Array.isArray(goals) ? goals : []).map(goal => {

                const isAssigned = goal.createdBy === 'PSYCHOLOGIST';
                return (
                    <div key={goal.id} className={`p-3 rounded-xl border transition-all ${goal.completed ? 'bg-slate-50 border-slate-200 opacity-70' : isAssigned ? 'bg-purple-50/50 border-purple-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <button onClick={() => onToggleGoal(goal.id)} className={`mt-1 transition-colors ${goal.completed ? 'text-green-500' : 'text-slate-300 hover:text-green-500'}`}>
                                {goal.completed ? <CheckCircle size={20} /> : <Circle size={20}/>}
                            </button>
                            
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                    {isAssigned && (
                                        <span className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 w-fit">
                                            <Stethoscope size={8} /> Asignado
                                        </span>
                                    )}
                                </div>
                                <p className={`font-medium text-sm leading-snug ${goal.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                    {goal.description}
                                </p>
                                
                                {/* AI Feedback */}
                                {goal.aiFeedback && !goal.completed && (
                                    <div className="mt-2 bg-indigo-50/50 p-2 rounded-lg flex gap-2 items-start border border-indigo-50">
                                        <Sparkles size={12} className="text-indigo-500 mt-0.5 shrink-0" />
                                        <p className="text-xs text-indigo-700 italic leading-tight">
                                            {goal.aiFeedback}
                                        </p>
                                    </div>
                                )}
                            </div>
                            
                            {!readOnly && (
                                <button onClick={() => onDeleteGoal(goal.id)} className="text-slate-300 hover:text-red-400 transition-colors self-center p-1">
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default GoalsPanel;