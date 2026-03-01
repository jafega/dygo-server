import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Plus, Edit2, Trash2, Send, Eye, X,
  ChevronLeft, Save, Loader2, Award, User, CheckCircle, AlertCircle, Search
} from 'lucide-react';
import { API_URL } from '../services/config';

// ─── Simple Markdown → HTML converter ────────────────────────────────────────
function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-2">$1</h1>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-4 border-slate-300" />')
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-sm font-mono">$1</code>')
    // Unordered lists
    .replace(/^\s*[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-slate-300 pl-3 italic text-slate-600 my-2">$1</blockquote>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p class="mb-3">')
    // Single newlines become <br>
    .replace(/\n/g, '<br />');

  // Wrap list items
  html = html.replace(/(<li[\s\S]+?<\/li>)/g, '<ul class="my-2">$1</ul>');

  return `<p class="mb-3">${html}</p>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isHtmlContent(content: string): boolean {
  return /^\s*(<(!DOCTYPE|html|head|body|div|section|article|p\b|h[1-6]\b|ul\b|ol\b|table\b)|<!DOCTYPE)/i.test(content.trim());
}

function stripToText(content: string, maxChars = 160): string {
  let text = content;
  if (isHtmlContent(content)) {
    text = content
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ');
  } else {
    text = content.replace(/[#*_`>~\[\]]/g, '');
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

function renderContent(content: string): string {
  if (isHtmlContent(content)) return content;
  return markdownToHtml(content);
}

// --- Types ---

interface Template {
  id: number;
  created_at: string;
  content: string;
  template_name?: string;
  psych_user_id: string | null;
  master: boolean;
}

interface Patient {
  id: string;
  name: string;
  email?: string;
  userId?: string;
  user_id?: string;
}

interface TemplatesPanelProps {
  psychologistId: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
const TemplatesPanel: React.FC<TemplatesPanelProps> = ({ psychologistId }) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'mine' | 'master'>('all');

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Send-to-patient state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState<Template | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  // template IDs already sent to currently selected patient
  const [sentTemplateIds, setSentTemplateIds] = useState<Set<number>>(new Set());
  const [isLoadingSent, setIsLoadingSent] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [psychologistId]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/templates?psych_user_id=${psychologistId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error('Error loading templates:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const res = await fetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data.filter((p: any) => !p.isSelf));
      }
    } catch (e) {
      console.error('Error loading patients:', e);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const openCreateEditor = () => {
    setEditorMode('create');
    setEditingTemplate(null);
    setTemplateName('');
    setEditorContent('# Título del documento\n\nEscribe aquí el contenido del documento...\n\n---\n\nFirma del paciente: ________________\n\nFecha: ________________');
    setPreviewMode(false);
    setShowEditor(true);
  };

  const openEditEditor = (tpl: Template) => {
    setEditorMode('edit');
    setEditingTemplate(tpl);
    setTemplateName(tpl.template_name || '');
    setEditorContent(tpl.content);
    setPreviewMode(false);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!editorContent.trim()) return;
    setIsSaving(true);
    try {
      if (editorMode === 'create') {
        const res = await fetch(`${API_URL}/templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ psych_user_id: psychologistId, content: editorContent, template_name: templateName.trim() || null })
        });
        if (!res.ok) throw new Error(await res.text());
      } else if (editingTemplate) {
        const res = await fetch(`${API_URL}/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ psych_user_id: psychologistId, content: editorContent, template_name: templateName.trim() || null })
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setShowEditor(false);
      await loadTemplates();
    } catch (e: any) {
      alert('Error guardando template: ' + (e.message || e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_URL}/templates/${id}?psych_user_id=${psychologistId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      setDeletingId(null);
      await loadTemplates();
    } catch (e: any) {
      alert('Error eliminando template: ' + (e.message || e));
    } finally {
      setIsDeleting(false);
    }
  };

  const loadSentTemplatesForPatient = async (patient: Patient) => {
    const patientUserId = patient.userId || patient.user_id || patient.id;
    setIsLoadingSent(true);
    try {
      const res = await fetch(`${API_URL}/signatures?psych_user_id=${psychologistId}&patient_user_id=${patientUserId}`);
      if (res.ok) {
        const sigs: any[] = await res.json();
        setSentTemplateIds(new Set(sigs.map(s => s.template_id)));
      }
    } catch (e) {
      console.error('Error loading sent templates:', e);
    } finally {
      setIsLoadingSent(false);
    }
  };

  const openSendModal = async (tpl: Template) => {
    setSendingTemplate(tpl);
    setSelectedPatient(null);
    setPatientSearch('');
    setShowPatientDropdown(false);
    setSentTemplateIds(new Set());
    setSendSuccess(false);
    setShowSendModal(true);
    await loadPatients();
  };

  const handleSend = async () => {
    if (!sendingTemplate || !selectedPatient) return;
    const patientUserId = selectedPatient.userId || selectedPatient.user_id || selectedPatient.id;
    setIsSending(true);
    try {
      const res = await fetch(`${API_URL}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: sendingTemplate.id,
          psych_user_id: psychologistId,
          patient_user_id: patientUserId,
          content: sendingTemplate.content
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setSendSuccess(true);
      setTimeout(() => {
        setShowSendModal(false);
        setSendSuccess(false);
      }, 2000);
    } catch (e: any) {
      alert('Error enviando documento: ' + (e.message || e));
    } finally {
      setIsSending(false);
    }
  };

  // Filtered list
  const filteredTemplates = templates.filter(t => {
    if (activeFilter === 'mine') return !t.master;
    if (activeFilter === 'master') return t.master;
    return true;
  });

  const myCount = templates.filter(t => !t.master).length;
  const masterCount = templates.filter(t => t.master).length;

  // ─── Editor View ──────────────────────────────────────────────────────────
  if (showEditor) {
    return (
      <div className="h-full flex flex-col">
        {/* Editor Header */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEditor(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-600" />
            </button>
            <h2 className="text-lg font-bold text-slate-900">
              {editorMode === 'create' ? 'Nuevo Template' : 'Editar Template'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                previewMode ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Eye size={16} />
              {previewMode ? 'Editar' : 'Vista previa'}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !editorContent.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar
            </button>
          </div>
        </div>

        {/* Template name input */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Nombre del template</label>
          <input
            type="text"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            placeholder="Ej: Consentimiento Informado, Contrato de horas..."
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          />
        </div>

        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Markdown Editor */}
          {!previewMode && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Markdown</div>
              <textarea
                className="flex-1 w-full p-4 bg-white border border-slate-200 rounded-xl font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-relaxed"
                value={editorContent}
                onChange={e => setEditorContent(e.target.value)}
                placeholder="# Título&#10;&#10;Escribe el contenido en Markdown..."
                style={{ minHeight: '400px' }}
              />
            </div>
          )}

          {/* HTML Preview */}
          {(previewMode || window.innerWidth >= 1024) && (
            <div className={`flex-1 flex flex-col min-h-0 ${!previewMode && 'hidden lg:flex'}`}>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Vista previa</div>
              <div
                className="flex-1 p-6 bg-white border border-slate-200 rounded-xl overflow-y-auto prose prose-slate max-w-none text-slate-800 leading-relaxed"
                style={{ minHeight: '400px' }}
                dangerouslySetInnerHTML={{ __html: renderContent(editorContent) }}
              />
            </div>
          )}
        </div>

        {/* Markdown cheatsheet */}
        <div className="mt-3 p-3 bg-slate-50 rounded-xl text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span><code># H1</code> → Título</span>
          <span><code>## H2</code> → Subtítulo</span>
          <span><code>**negrita**</code></span>
          <span><code>*cursiva*</code></span>
          <span><code>- item</code> → Lista</span>
          <span><code>---</code> → Separador</span>
          <span><code>&gt; cita</code></span>
        </div>
      </div>
    );
  }

  // ─── Main List View ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { key: 'all', label: `Todos (${templates.length})` },
            { key: 'mine', label: `Míos (${myCount})` },
            { key: 'master', label: `Plantillas (${masterCount})` }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setActiveFilter(item.key as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeFilter === item.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          onClick={openCreateEditor}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium"
        >
          <Plus size={16} />
          Nuevo Template
        </button>
      </div>

      {/* Templates grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay templates todavía</p>
          <p className="text-sm mt-1">Crea tu primer template con el botón superior</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredTemplates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              isOwn={!tpl.master}
              onEdit={() => openEditEditor(tpl)}
              onDelete={() => setDeletingId(tpl.id)}
              onSend={() => openSendModal(tpl)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm modal */}
      {deletingId !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-slate-900 mb-2">¿Eliminar template?</h3>
            <p className="text-sm text-slate-500 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send to patient modal */}
      {showSendModal && sendingTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            {sendSuccess ? (
              <div className="py-8 text-center">
                <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-900">¡Enviado!</h3>
                <p className="text-sm text-slate-500 mt-1">El documento ha llegado al paciente.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Enviar a paciente</h3>
                  <button onClick={() => setShowSendModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                    <X size={18} className="text-slate-500" />
                  </button>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Documento</p>
                  <p className="text-sm text-slate-700 line-clamp-2">
                    {sendingTemplate.template_name || stripToText(sendingTemplate.content, 120)}
                  </p>
                </div>

                <p className="text-sm font-semibold text-slate-700 mb-2">Selecciona el paciente:</p>
                {isLoadingPatients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-indigo-400" />
                  </div>
                ) : patients.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No tienes pacientes activos</p>
                ) : (
                  <div className="relative mb-4">
                    {/* Search input */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all cursor-text ${
                        showPatientDropdown ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                      }`}
                      onClick={() => setShowPatientDropdown(true)}
                    >
                      {selectedPatient && !showPatientDropdown ? (
                        <>
                          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-indigo-600" />
                          </div>
                          <span className="flex-1 text-slate-800 font-medium truncate">{selectedPatient.name}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedPatient(null); setPatientSearch(''); setShowPatientDropdown(true); }}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <Search size={15} className="text-slate-400 flex-shrink-0" />
                          <input
                            autoFocus
                            type="text"
                            className="flex-1 bg-transparent outline-none text-slate-700 placeholder-slate-400"
                            placeholder="Buscar paciente..."
                            value={patientSearch}
                            onChange={e => { setPatientSearch(e.target.value); setShowPatientDropdown(true); }}
                            onFocus={() => setShowPatientDropdown(true)}
                          />
                          {patientSearch && (
                            <button type="button" onClick={() => setPatientSearch('')} className="text-slate-400 hover:text-slate-600">
                              <X size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Dropdown list */}
                    {showPatientDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowPatientDropdown(false)} />
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                          {(() => {
                            const filtered = patients.filter(p =>
                              p.name.toLowerCase().includes(patientSearch.toLowerCase()) ||
                              (p.email && p.email.toLowerCase().includes(patientSearch.toLowerCase()))
                            );
                            return filtered.length === 0 ? (
                              <p className="text-sm text-slate-400 py-4 text-center">Sin resultados</p>
                            ) : filtered.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPatient(p);
                                  setPatientSearch('');
                                  setShowPatientDropdown(false);
                                  loadSentTemplatesForPatient(p);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-indigo-50 transition-colors ${
                                  selectedPatient?.id === p.id ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700'
                                }`}
                              >
                                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                  <User size={13} className="text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{p.name}</p>
                                  {p.email && <p className="text-xs text-slate-400 truncate">{p.email}</p>}
                                </div>
                                {selectedPatient?.id === p.id && (
                                  <CheckCircle size={15} className="text-indigo-600 flex-shrink-0" />
                                )}
                              </button>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Already-sent warning */}
                {selectedPatient && !isLoadingSent && sendingTemplate && sentTemplateIds.has(sendingTemplate.id) && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                    <AlertCircle size={14} />
                    Este documento ya fue enviado a este paciente y no puede enviarse de nuevo.
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setShowSendModal(false)}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={!selectedPatient || isSending || isLoadingSent || (sendingTemplate ? sentTemplateIds.has(sendingTemplate.id) : false)}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSending ? <Loader2 size={14} className="animate-spin" /> : isLoadingSent ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Enviar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Template Card ────────────────────────────────────────────────────────────
interface TemplateCardProps {
  template: Template;
  isOwn: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSend: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, isOwn, onEdit, onDelete, onSend }) => {
  const [showPreview, setShowPreview] = useState(false);

  const title = template.template_name
    || (isHtmlContent(template.content)
        ? stripToText(template.content, 60)
        : template.content.split('\n')[0].replace(/^#+\s*/, '').trim())
    || 'Sin título';
  const preview = stripToText(template.content, 150);

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all group flex flex-col">
        <div className="p-5 flex-1">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {template.master ? (
                <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
                  <Award size={10} />
                  Plantilla
                </span>
              ) : (
                <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                  Mío
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 flex-shrink-0">
              {new Date(template.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          <h3 className="font-bold text-slate-900 text-sm mb-1 line-clamp-1">{title}</h3>
          {preview && (
            <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">{preview}</p>
          )}
        </div>

        <div className="px-4 pb-4 flex items-center gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            <Eye size={13} /> Ver
          </button>
          <button
            onClick={onSend}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
          >
            <Send size={13} /> Enviar
          </button>
          {isOwn && (
            <>
              <button
                onClick={onEdit}
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title="Editar"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={onDelete}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-900">{title}</h3>
              <button onClick={() => setShowPreview(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-6 prose prose-slate max-w-none text-slate-800 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderContent(template.content) }}
            />
            <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cerrar</button>
              <button
                onClick={() => { setShowPreview(false); onSend(); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Send size={14} /> Enviar a paciente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TemplatesPanel;
