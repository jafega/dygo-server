import React, { useState, useEffect, useCallback } from 'react';
import { Lead, LeadEmailTemplate } from './types';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import { X, Send, FileText, Loader2, ChevronDown, Plus, Trash2, Save, RefreshCcw } from 'lucide-react';

interface Props {
  mode: 'single' | 'bulk';
  leadIds: string[];
  leads: Lead[];
  templates: LeadEmailTemplate[];
  onClose: () => void;
  onSent: () => void;
}

export const LeadEmailComposer: React.FC<Props> = ({ mode, leadIds, leads, templates: initialTemplates, onClose, onSent }) => {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [senderName, setSenderName] = useState('');
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [localTemplates, setLocalTemplates] = useState<LeadEmailTemplate[]>(initialTemplates);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Refresh templates from server
  const refreshTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates`);
      if (res.ok) setLocalTemplates(await res.json());
    } catch (e) { console.error('Error:', e); }
    setLoadingTemplates(false);
  }, []);

  // Sync when parent templates change
  useEffect(() => { setLocalTemplates(initialTemplates); }, [initialTemplates]);

  const loadTemplate = (tpl: LeadEmailTemplate) => {
    setSubject(tpl.subject);
    setBodyHtml(tpl.body_html);
    setShowTemplates(false);
  };

  const handleSend = async () => {
    if (!subject || !bodyHtml) { alert('Rellena asunto y cuerpo'); return; }
    setSending(true);
    try {
      if (mode === 'single') {
        const res = await apiFetch(`${API_URL}/admin/leads/${leadIds[0]}/email`, {
          method: 'POST',
          body: JSON.stringify({ subject, body_html: bodyHtml, sender_name: senderName || undefined }),
        });
        if (res.ok) onSent();
        else alert('Error enviando email');
      } else {
        const res = await apiFetch(`${API_URL}/admin/leads/email-bulk`, {
          method: 'POST',
          body: JSON.stringify({ lead_ids: leadIds, subject, body_html: bodyHtml, sender_name: senderName || undefined }),
        });
        if (res.ok) {
          const result = await res.json();
          alert(`Enviados: ${result.sent}, Fallidos: ${result.failed}`);
          onSent();
        } else alert('Error enviando emails');
      }
    } catch (e) { console.error('Error:', e); alert('Error enviando'); }
    setSending(false);
  };

  const handleSaveTemplate = async () => {
    if (!templateName || !subject || !bodyHtml) return;
    setSavingTemplate(true);
    try {
      const url = editingTemplateId
        ? `${API_URL}/admin/lead-templates/${editingTemplateId}`
        : `${API_URL}/admin/lead-templates`;
      const method = editingTemplateId ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: templateName,
          subject,
          body_html: bodyHtml,
          variables: [...new Set((bodyHtml.match(/\{\{(\w+)\}\}/g) || []).map(m => m.replace(/[{}]/g, '')))],
        }),
      });
      if (res.ok) {
        setShowSaveTemplate(false);
        setTemplateName('');
        setEditingTemplateId(null);
        refreshTemplates();
      }
    } catch (e) { console.error('Error:', e); }
    setSavingTemplate(false);
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      await apiFetch(`${API_URL}/admin/lead-templates/${id}`, { method: 'DELETE' });
      setLocalTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error('Error:', e); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {mode === 'single' ? 'Enviar Email' : `Email masivo (${leadIds.length} leads)`}
            </h3>
            {mode === 'single' && leads[0] && (
              <p className="text-sm text-slate-500">{leads[0].email}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Sender name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nombre del remitente</label>
            <input
              type="text"
              placeholder="Tu nombre (se envía desde mainds@mainds.app)"
              value={senderName}
              onChange={e => setSenderName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-0.5">Se enviará como "{senderName || 'mainds'} &lt;mainds@mainds.app&gt;"</p>
          </div>

          {/* Templates */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => { setShowTemplates(!showTemplates); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <FileText size={13} /> Plantillas ({localTemplates.length}) <ChevronDown size={12} />
              </button>
              {showTemplates && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                  <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[320px] max-h-[350px] flex flex-col">
                    {/* Dropdown header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Seleccionar plantilla</span>
                      <button
                        onClick={refreshTemplates}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Actualizar lista"
                      >
                        <RefreshCcw size={12} className={loadingTemplates ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    {/* Template list */}
                    <div className="overflow-y-auto py-1 flex-1">
                      {localTemplates.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-400 text-center">No hay plantillas — créalas en la pestaña Plantillas</p>
                      ) : (
                        localTemplates.map(tpl => (
                          <div key={tpl.id} className="flex items-center group hover:bg-slate-50">
                            <button
                              onClick={() => loadTemplate(tpl)}
                              className="flex-1 px-3 py-2.5 text-left"
                            >
                              <span className="font-medium text-sm text-slate-800 block truncate">{tpl.name}</span>
                              <span className="text-xs text-slate-400 truncate block">{tpl.subject}</span>
                              {tpl.variables.length > 0 && (
                                <div className="flex gap-1 mt-1">
                                  {tpl.variables.map(v => (
                                    <span key={v} className="px-1 py-0.5 text-[9px] font-mono bg-amber-50 text-amber-600 rounded">{`{{${v}}}`}</span>
                                  ))}
                                </div>
                              )}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id); }}
                              className="p-1.5 mr-2 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => { setShowSaveTemplate(true); setTemplateName(''); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Save size={12} /> Guardar como plantilla
            </button>
          </div>

          {/* Save template form */}
          {showSaveTemplate && (
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
              <input
                autoFocus
                placeholder="Nombre de la plantilla"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              />
              <button onClick={handleSaveTemplate} disabled={savingTemplate || !templateName} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingTemplate ? '...' : 'Guardar'}
              </button>
              <button onClick={() => setShowSaveTemplate(false)} className="px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-200 rounded-lg">Cancelar</button>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asunto</label>
            <input
              type="text"
              placeholder="Asunto del email"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              Cuerpo del email
              {mode === 'bulk' && <span className="text-slate-400 normal-case font-normal"> — usa {'{{name}}'} / {'{{email}}'} para personalizar</span>}
            </label>
            <textarea
              placeholder="Escribe el contenido del email..."
              value={bodyHtml}
              onChange={e => setBodyHtml(e.target.value)}
              className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none h-48 font-mono focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>

          {/* Recipients preview (bulk) */}
          {mode === 'bulk' && (
            <div className="bg-violet-50 rounded-lg p-3">
              <p className="text-xs font-semibold text-violet-700 mb-1">Destinatarios ({leads.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {leads.slice(0, 20).map(l => (
                  <span key={l.id} className="px-2 py-0.5 bg-white border border-violet-200 rounded-full text-xs text-violet-700">
                    {l.name || l.email}
                  </span>
                ))}
                {leads.length > 20 && <span className="text-xs text-violet-500">+{leads.length - 20} más</span>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancelar</button>
          <button
            onClick={handleSend}
            disabled={sending || !subject || !bodyHtml}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Enviando...' : mode === 'single' ? 'Enviar' : `Enviar a ${leads.length}`}
          </button>
        </div>
      </div>
    </div>
  );
};
