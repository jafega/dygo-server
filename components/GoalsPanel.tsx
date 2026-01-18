import React, { useState } from 'react';
import { Goal } from '../types';
import { Target, Plus, Trash2, CheckCircle, Circle, Stethoscope, User } from 'lucide-react';

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
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-500"/>
              {title}
          </h3>
          <div className="text-xs text-slate-400">{goals.length} metas</div>
        </div>
        
        {showAdd && !readOnly && (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 sm:items-center mb-6">
                <input 
                    type="text" 
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    placeholder="Nueva meta o tarea..."
                    className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-white text-slate-900 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button 
                    type="submit" 
                    className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-3 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                    disabled={!newGoal.trim()}
                >
                    <Plus size={18} />
                    <span className="text-sm font-medium">Añadir</span>
                </button>
            </form>
        )}

        <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1 sm:pr-2">
            {goals.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-6 italic bg-slate-50 rounded-xl border border-slate-100">
                  No tienes metas activas.
                </div>
            )}
            
            {(Array.isArray(goals) ? goals : []).map(goal => {

                const isAssigned = goal.createdBy === 'PSYCHOLOGIST';
                return (
                    <div key={goal.id} className={`p-4 rounded-2xl border transition-all ${goal.completed ? 'bg-slate-50 border-slate-200 opacity-70' : isAssigned ? 'bg-purple-50/50 border-purple-200 shadow-sm' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="flex items-start justify-between gap-4">
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
                                <p className={`font-medium text-sm sm:text-[15px] leading-snug ${goal.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                                    {goal.description}
                                </p>
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