import React, { useState, useEffect } from 'react';
import { Lead, LeadActivity, LeadEmailTemplate, LEAD_STAGES, LeadStage } from './types';
import { LeadEmailComposer } from './LeadEmailComposer';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import type { MasterUser } from './SalesPipeline';
import {
  X, Mail, Phone, Building2, Calendar, Smartphone, Tag,
  ChevronDown, Trash2, Plus, FileText, ArrowRightLeft,
  Send, StickyNote, Paperclip, Zap, Globe, Clock,
  Eye, EyeOff, MousePointer, AlertTriangle, CheckCircle2, UserCheck,
} from 'lucide-react';

interface Props {
  lead: Lead;
  templates: LeadEmailTemplate[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}

const stageMap = Object.fromEntries(LEAD_STAGES.map(s => [s.id, s]));

const activityIcons: Record<string, React.ReactNode> = {
  note: <StickyNote size={14} className="text-yellow-600" />,
  email_sent: <Send size={14} className="text-blue-600" />,
  email_received: <Mail size={14} className="text-green-600" />,
  email_bulk: <Mail size={14} className="text-violet-600" />,
  document: <Paperclip size={14} className="text-slate-600" />,
  stage_change: <ArrowRightLeft size={14} className="text-indigo-600" />,
  app_event: <Zap size={14} className="text-amber-600" />,
};

const emailEventIcons: Record<string, React.ReactNode> = {
  delivered: <CheckCircle2 size={11} className="text-emerald-500" />,
  opened: <Eye size={11} className="text-blue-500" />,
  clicked: <MousePointer size={11} className="text-violet-500" />,
  bounced: <AlertTriangle size={11} className="text-red-500" />,
  complained: <AlertTriangle size={11} className="text-orange-500" />,
};

export const LeadDetailDrawer: React.FC<Props> = ({ lead, templates, onClose, onUpdate, onDelete, onRefresh }) => {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [assignees, setAssignees] = useState<MasterUser[]>([]);
  const [showAssignMenu, setShowAssignMenu] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');

  useEffect(() => {
    loadActivities();
    loadAssignees();
  }, [lead.id]);

  const loadActivities = async () => {
    setLoadingActivities(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/${lead.id}/activities`);
      if (res.ok) setActivities(await res.json());
    } catch (e) { console.error('Error loading activities:', e); }
    setLoadingActivities(false);
  };

  const loadAssignees = async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/assignees`);
      if (res.ok) setAssignees(await res.json());
    } catch (e) { console.error('Error loading assignees:', e); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/${lead.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: 'note', title: 'Nota', body: noteText }),
      });
      if (res.ok) {
        setNoteText('');
        setShowAddNote(false);
        loadActivities();
      }
    } catch (e) { console.error('Error adding note:', e); }
  };

  const changeStage = (stage: LeadStage) => {
    onUpdate(lead.id, { stage });
    setShowStageMenu(false);
    setTimeout(loadActivities, 500);
  };

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(value || '');
  };

  const saveEdit = () => {
    if (editingField) {
      onUpdate(lead.id, { [editingField]: editValue || null });
      setEditingField(null);
    }
  };

  const st = stageMap[lead.stage];

  return (
    <>
      {!isFullscreen && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}
      <div className={`fixed right-0 top-0 bottom-0 bg-white shadow-2xl z-50 flex flex-col overflow-hidden transition-all duration-300 ${isFullscreen ? 'left-0' : 'w-full max-w-lg'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900 truncate">{lead.name || lead.email}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => onDelete(lead.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 size={16} />
            </button>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title={isFullscreen ? 'Reducir' : 'Ampliar'}>
              {isFullscreen ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button onClick={() => { setIsFullscreen(false); onClose(); }} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {/* Lead info */}
          <div className="p-5 space-y-4 border-b border-slate-100">
            {/* Stage */}
            <div className="relative">
              <button
                onClick={() => setShowStageMenu(!showStageMenu)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${st?.bgColor} ${st?.color} ${st?.borderColor} border transition-colors hover:opacity-80`}
              >
                {st?.label}
                <ChevronDown size={14} />
              </button>
              {showStageMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-20 min-w-[160px]">
                    {LEAD_STAGES.map(s => (
                      <button
                        key={s.id}
                        onClick={() => changeStage(s.id)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${lead.stage === s.id ? 'font-semibold' : ''}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${s.bgColor} ${s.borderColor} border`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Contact fields */}
            <div className="space-y-2">
              {[
                { key: 'email', icon: <Mail size={14} className="text-slate-400" />, label: 'Email' },
                { key: 'name', icon: <Tag size={14} className="text-slate-400" />, label: 'Nombre' },
                { key: 'phone', icon: <Phone size={14} className="text-slate-400" />, label: 'Teléfono' },
                { key: 'company', icon: <Building2 size={14} className="text-slate-400" />, label: 'Empresa' },
              ].map(({ key, icon, label }) => (
                <div key={key} className="flex items-center gap-3 group">
                  {icon}
                  {editingField === key ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
                      className="flex-1 text-sm border border-indigo-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />
                  ) : (
                    <span
                      onClick={() => startEdit(key, (lead as any)[key])}
                      className="flex-1 text-sm text-slate-700 cursor-pointer hover:text-indigo-600 transition-colors"
                    >
                      {(lead as any)[key] || <span className="text-slate-300 italic">Añadir {label.toLowerCase()}</span>}
                    </span>
                  )}
                </div>
              ))}

              {/* Details field — multiline */}
              <div className="flex gap-3 group">
                <FileText size={14} className="text-slate-400 mt-1 flex-shrink-0" />
                {editingField === 'details' ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
                    className="flex-1 text-sm border border-indigo-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-200 outline-none resize-none h-20"
                  />
                ) : (
                  <span
                    onClick={() => startEdit('details', lead.details || '')}
                    className="flex-1 text-sm text-slate-700 cursor-pointer hover:text-indigo-600 transition-colors whitespace-pre-wrap"
                  >
                    {lead.details || <span className="text-slate-300 italic">Añadir detalles</span>}
                  </span>
                )}
              </div>

              {/* Assigned to */}
              <div className="flex items-center gap-3 relative">
                <UserCheck size={14} className="text-slate-400" />
                <div className="flex-1 relative">
                  <button
                    onClick={() => { setShowAssignMenu(!showAssignMenu); setAssignSearch(''); }}
                    className="text-sm text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {lead.assigned_to ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {(() => { const m = assignees.find(a => a.email === lead.assigned_to); return m?.name ? `${m.name} (${m.email})` : lead.assigned_to; })()}
                      </span>
                    ) : (
                      <span className="text-slate-300 italic text-sm">Asignar responsable</span>
                    )}
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>
                  {showAssignMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAssignMenu(false)} />
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[260px] overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Buscar por email o nombre..."
                            value={assignSearch}
                            onChange={e => setAssignSearch(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto py-1">
                          {assignees
                            .filter(a => {
                              if (!assignSearch) return true;
                              const q = assignSearch.toLowerCase();
                              return a.email.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
                            })
                            .map(a => (
                              <button
                                key={a.id}
                                onClick={() => { onUpdate(lead.id, { assigned_to: a.email }); setShowAssignMenu(false); }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex flex-col ${lead.assigned_to === a.email ? 'bg-indigo-50' : ''}`}
                              >
                                <span className={`font-medium ${lead.assigned_to === a.email ? 'text-indigo-600' : 'text-slate-700'}`}>{a.name || a.email}</span>
                                {a.name && <span className="text-xs text-slate-400">{a.email}</span>}
                              </button>
                            ))}
                          {assignees.filter(a => { const q = assignSearch.toLowerCase(); return !assignSearch || a.email.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q); }).length === 0 && (
                            <div className="px-3 py-2 text-xs text-slate-400">No se encontraron usuarios</div>
                          )}
                        </div>
                        {lead.assigned_to && (
                          <div className="border-t border-slate-100">
                            <button
                              onClick={() => { onUpdate(lead.id, { assigned_to: null }); setShowAssignMenu(false); }}
                              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                            >
                              <X size={12} /> Sin asignar
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* App status */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                <Smartphone size={12} /> Estado en la App
              </div>
              {lead.app_user_id ? (
                <div className="space-y-1">
                  <p className="text-sm text-emerald-700 font-medium">Registrado</p>
                  {lead.app_registered_at && (
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar size={11} /> {new Date(lead.app_registered_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {lead.app_plan && (
                    <p className="text-xs text-slate-600">
                      Plan: <span className="font-medium">{lead.app_plan}</span>
                      {lead.app_is_subscribed && <span className="ml-1 text-emerald-600">(activo)</span>}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No registrado en la app</p>
              )}
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Globe size={11} /> {lead.source}</span>
              <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(lead.created_at).toLocaleDateString('es-ES')}</span>
              {lead.last_contacted_at && (
                <span className="flex items-center gap-1"><Clock size={11} /> Último contacto: {new Date(lead.last_contacted_at).toLocaleDateString('es-ES')}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
            <button onClick={() => setShowEmailComposer(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
              <Send size={14} /> Enviar Email
            </button>
            <button onClick={() => setShowAddNote(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              <StickyNote size={14} /> Nota
            </button>
          </div>

          {/* Add note form */}
          {showAddNote && (
            <div className="px-5 py-3 border-b border-slate-100 bg-yellow-50/50">
              <textarea
                autoFocus
                placeholder="Escribe una nota..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm resize-none h-20 focus:ring-2 focus:ring-yellow-200 focus:border-yellow-400 outline-none"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => { setShowAddNote(false); setNoteText(''); }} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
                <button onClick={addNote} disabled={!noteText.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-yellow-500 rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors">Guardar nota</button>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Timeline</h3>
            {loadingActivities ? (
              <p className="text-sm text-slate-400 text-center py-6">Cargando...</p>
            ) : activities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sin actividad</p>
            ) : (
              <div className="space-y-0">
                {activities.map((act, idx) => (
                  <div key={act.id} className="flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        {activityIcons[act.type] || <FileText size={14} className="text-slate-400" />}
                      </div>
                      {idx < activities.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>

                    {/* Content */}
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-slate-800">{act.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(act.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · {new Date(act.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Email delivery events */}
                      {(act.type === 'email_sent' || act.type === 'email_bulk') && act.metadata?.events && (
                        <div className="flex items-center gap-2 mt-1 mb-1">
                          {(act.metadata.events as { type: string; at: string }[]).map((ev, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                              {emailEventIcons[ev.type]} {ev.type}
                            </span>
                          ))}
                        </div>
                      )}

                      {act.body && (
                        <div className={`text-xs text-slate-600 mt-1 ${act.type === 'email_sent' || act.type === 'email_bulk' ? 'bg-blue-50 rounded-lg p-2 border border-blue-100' : act.type === 'note' ? 'bg-yellow-50 rounded-lg p-2 border border-yellow-100' : ''}`}>
                          {act.type === 'email_sent' || act.type === 'email_bulk' ? (
                            <div className="overflow-x-auto max-w-full">
                              <div dangerouslySetInnerHTML={{ __html: act.body }} className="prose prose-xs max-w-none" />
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{act.body}</p>
                          )}
                        </div>
                      )}

                      {/* Stage change details */}
                      {act.type === 'stage_change' && act.metadata?.from_stage && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs">
                          <span className={`px-1.5 py-0.5 rounded-full ${stageMap[act.metadata.from_stage as LeadStage]?.bgColor} ${stageMap[act.metadata.from_stage as LeadStage]?.color}`}>
                            {stageMap[act.metadata.from_stage as LeadStage]?.label}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className={`px-1.5 py-0.5 rounded-full ${stageMap[act.metadata.to_stage as LeadStage]?.bgColor} ${stageMap[act.metadata.to_stage as LeadStage]?.color}`}>
                            {stageMap[act.metadata.to_stage as LeadStage]?.label}
                          </span>
                        </div>
                      )}

                      {act.created_by && (
                        <span className="text-[10px] text-slate-400 mt-1 block">por {act.created_by}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email composer */}
      {showEmailComposer && (
        <LeadEmailComposer
          mode="single"
          leadIds={[lead.id]}
          leads={[lead]}
          templates={templates}
          onClose={() => setShowEmailComposer(false)}
          onSent={() => { setShowEmailComposer(false); loadActivities(); onRefresh(); }}
        />
      )}
    </>
  );
};
