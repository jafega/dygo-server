import React, { useState, useEffect, useCallback } from 'react';
import { LeadEmailTemplate } from './types';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  Plus, Trash2, Pencil, X, Save, Eye, Code, FileText,
  Loader2, Search, Copy, Check,
} from 'lucide-react';

const TemplatesPanel: React.FC = () => {
  const [templates, setTemplates] = useState<LeadEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<LeadEmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formMode, setFormMode] = useState<'html' | 'text'>('text');

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.error('Error loading templates:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const extractVariables = (text: string): string[] => {
    return [...new Set((text.match(/\{\{(\w+)\}\}/g) || []).map(m => m.replace(/[{}]/g, '')))];
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setFormName('');
    setFormSubject('');
    setFormBody('');
    setFormMode('text');
  };

  const openEdit = (tpl: LeadEmailTemplate) => {
    setCreating(false);
    setEditing(tpl);
    setFormName(tpl.name);
    setFormSubject(tpl.subject);
    setFormBody(tpl.body_html);
    setFormMode(tpl.body_html.includes('<') ? 'html' : 'text');
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSubject.trim() || !formBody.trim()) {
      alert('Rellena nombre, asunto y cuerpo');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        subject: formSubject.trim(),
        body_html: formBody,
        variables: extractVariables(formBody + ' ' + formSubject),
      };
      const url = editing
        ? `${API_URL}/admin/lead-templates/${editing.id}`
        : `${API_URL}/admin/lead-templates`;
      const method = editing ? 'PUT' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
      if (res.ok) {
        closeForm();
        loadTemplates();
      } else {
        alert('Error guardando plantilla');
      }
    } catch (e) { console.error('Error:', e); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta plantilla? No se puede deshacer.')) return;
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (editing?.id === id) closeForm();
        if (previewId === id) setPreviewId(null);
      }
    } catch (e) { console.error('Error:', e); }
  };

  const handleDuplicate = async (tpl: LeadEmailTemplate) => {
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates`, {
        method: 'POST',
        body: JSON.stringify({
          name: `${tpl.name} (copia)`,
          subject: tpl.subject,
          body_html: tpl.body_html,
          variables: tpl.variables,
        }),
      });
      if (res.ok) {
        setCopiedId(tpl.id);
        setTimeout(() => setCopiedId(null), 1500);
        loadTemplates();
      }
    } catch (e) { console.error('Error:', e); }
  };

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subject.toLowerCase().includes(search.toLowerCase())
  );

  const isFormOpen = creating || editing !== null;

  const insertVariable = (varName: string) => {
    setFormBody(prev => prev + `{{${varName}}}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plantillas de Email</h1>
          <p className="text-sm text-slate-500 mt-0.5">{templates.length} plantillas · Reutilizables en envíos individuales y masivos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={15} /> Nueva Plantilla
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar plantillas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>

      <div className={`grid gap-6 ${isFormOpen ? 'lg:grid-cols-2' : ''}`}>
        {/* Templates list */}
        <div className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Cargando plantillas...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
              <FileText size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">{search ? 'No se encontraron plantillas' : 'No hay plantillas aún'}</p>
              <button onClick={openCreate} className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Crear primera plantilla
              </button>
            </div>
          ) : (
            filtered.map(tpl => (
              <div
                key={tpl.id}
                className={`bg-white border rounded-xl p-4 transition-all ${
                  editing?.id === tpl.id ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{tpl.name}</h3>
                    <p className="text-sm text-slate-500 truncate mt-0.5">Asunto: {tpl.subject}</p>
                    {tpl.variables.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {tpl.variables.map(v => (
                          <span key={v} className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 rounded">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-2">
                      Actualizada {new Date(tpl.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setPreviewId(previewId === tpl.id ? null : tpl.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        previewId === tpl.id ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                      title="Vista previa"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleDuplicate(tpl)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Duplicar"
                    >
                      {copiedId === tpl.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => openEdit(tpl)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(tpl.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Inline preview */}
                {previewId === tpl.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Vista previa</p>
                    {tpl.body_html.includes('<') ? (
                      <div
                        className="prose prose-sm max-w-none text-sm text-slate-700 bg-slate-50 rounded-lg p-3 max-h-48 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: tpl.body_html }}
                      />
                    ) : (
                      <pre className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                        {tpl.body_html}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Editor panel */}
        {isFormOpen && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 h-fit sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {creating ? 'Nueva Plantilla' : 'Editar Plantilla'}
              </h3>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nombre de la plantilla</label>
                <input
                  type="text"
                  placeholder="Ej: Bienvenida inicial, Seguimiento demo..."
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Asunto</label>
                <input
                  type="text"
                  placeholder="Asunto del email — puedes usar {{name}}"
                  value={formSubject}
                  onChange={e => setFormSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
              </div>

              {/* Mode toggle + variables */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setFormMode('text')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      formMode === 'text' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FileText size={12} /> Texto
                  </button>
                  <button
                    onClick={() => setFormMode('html')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      formMode === 'html' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Code size={12} /> HTML
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 mr-1">Insertar:</span>
                  {['name', 'email', 'company'].map(v => (
                    <button
                      key={v}
                      onClick={() => insertVariable(v)}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body editor */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Cuerpo {formMode === 'html' ? '(HTML)' : '(texto plano)'}
                </label>
                <textarea
                  placeholder={formMode === 'html'
                    ? '<h2>Hola {{name}}</h2>\n<p>Gracias por tu interés en mainds...</p>'
                    : 'Hola {{name}},\n\nGracias por tu interés en mainds...'
                  }
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)}
                  className={`w-full border border-slate-200 rounded-lg p-3 text-sm resize-none h-56 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none ${
                    formMode === 'html' ? 'font-mono text-xs' : ''
                  }`}
                />
              </div>

              {/* Live preview */}
              {formBody && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Vista previa</p>
                  <div className="bg-slate-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {formMode === 'html' || formBody.includes('<') ? (
                      <div
                        className="prose prose-sm max-w-none text-sm text-slate-700"
                        dangerouslySetInnerHTML={{
                          __html: formBody
                            .replace(/\{\{name\}\}/g, '<strong>María García</strong>')
                            .replace(/\{\{email\}\}/g, 'maria@ejemplo.com')
                            .replace(/\{\{company\}\}/g, 'Clínica Ejemplo')
                        }}
                      />
                    ) : (
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">
                        {formBody
                          .replace(/\{\{name\}\}/g, 'María García')
                          .replace(/\{\{email\}\}/g, 'maria@ejemplo.com')
                          .replace(/\{\{company\}\}/g, 'Clínica Ejemplo')
                        }
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {/* Detected variables */}
              {extractVariables(formBody + ' ' + formSubject).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-400">Variables detectadas:</span>
                  {extractVariables(formBody + ' ' + formSubject).map(v => (
                    <span key={v} className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={closeForm}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim() || !formSubject.trim() || !formBody.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Guardando...' : creating ? 'Crear Plantilla' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatesPanel;
