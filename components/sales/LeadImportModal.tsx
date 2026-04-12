import React, { useState, useRef } from 'react';
import { LeadImportRow } from './types';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  X, Upload, FileText, AlertCircle, CheckCircle2,
  FileSpreadsheet, Loader2, Sparkles, Trash2,
} from 'lucide-react';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export const LeadImportModal: React.FC<Props> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<Step>('upload');
  const [parsedLeads, setParsedLeads] = useState<LeadImportRow[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; invalid: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse pasted text (tab/comma separated)
  const parsePastedText = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const lines = pasteText.trim().split('\n').filter(Boolean);
      const leads: LeadImportRow[] = [];

      for (const line of lines) {
        const cols = line.includes('\t') ? line.split('\t') : line.split(',');
        const cleanCols = cols.map(c => c.trim().replace(/^["']|["']$/g, ''));

        // Heuristic: find email column
        const emailIdx = cleanCols.findIndex(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
        if (emailIdx === -1) continue;

        const email = cleanCols[emailIdx].toLowerCase();
        const remaining = cleanCols.filter((_, i) => i !== emailIdx);

        leads.push({
          email,
          name: remaining[0] || undefined,
          phone: remaining.find(c => /^[\d+\s()-]{7,}$/.test(c)) || undefined,
          company: remaining.find(c => !(/^[\d+\s()-]{7,}$/.test(c)) && c !== remaining[0]) || undefined,
        });
      }

      setParsedLeads(leads.map(l => ({ ...l, _status: 'ok' })));
      setFileName('Texto pegado');
      setStep('preview');
    } catch (e) { console.error('Error parsing text:', e); }
    setParsing(false);
  };

  // Upload file for AI parsing
  const handleFileUpload = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await apiFetch(`${API_URL}/admin/leads/import-file`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        setParsedLeads(result.leads || []);
        setStep('preview');
      } else {
        const err = await res.json();
        alert(err.error || 'Error procesando archivo');
      }
    } catch (e) {
      console.error('Error uploading file:', e);
      alert('Error subiendo archivo');
    }
    setParsing(false);
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Import confirmed leads
  const handleImport = async () => {
    const toImport = parsedLeads.filter(l => l._status === 'ok');
    if (toImport.length === 0) return;
    setStep('importing');
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/import`, {
        method: 'POST',
        body: JSON.stringify({ leads: toImport }),
      });
      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        setStep('done');
        onImported();
      } else {
        alert('Error importando leads');
        setStep('preview');
      }
    } catch (e) {
      console.error('Error importing:', e);
      setStep('preview');
    }
  };

  const removeFromPreview = (idx: number) => {
    setParsedLeads(prev => prev.filter((_, i) => i !== idx));
  };

  const okCount = parsedLeads.filter(l => l._status === 'ok').length;
  const dupCount = parsedLeads.filter(l => l._status === 'duplicate').length;
  const invCount = parsedLeads.filter(l => l._status === 'invalid').length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">Importar Leads</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* File upload */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf,.doc,.docx,.txt"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center">
                    <Sparkles size={24} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Sube un archivo</p>
                    <p className="text-sm text-slate-500 mt-1">CSV, Excel, PDF, Word — la IA extraerá los contactos</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <FileSpreadsheet size={12} /> CSV / XLSX
                    <FileText size={12} /> PDF / DOCX
                  </div>
                </div>
              </div>

              {/* Paste text */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">O pega una tabla de datos</p>
                <textarea
                  placeholder={"Pega aquí datos separados por tabulación o coma...\n\nEjemplo:\nJuan García\tjuan@clinica.com\t+34 612 345 678\tClínica Psico\nMaría López\tmaria@consulta.es\t+34 698 765 432\tConsulta ML"}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-mono resize-none h-32 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                />
                <button
                  onClick={parsePastedText}
                  disabled={!pasteText.trim() || parsing}
                  className="mt-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {parsing ? 'Procesando...' : 'Procesar texto'}
                </button>
              </div>

              {parsing && (
                <div className="flex items-center justify-center gap-3 py-6">
                  <Loader2 size={20} className="animate-spin text-indigo-600" />
                  <span className="text-sm text-slate-600">Procesando archivo con IA...</span>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-600">Archivo: <span className="font-medium">{fileName}</span></span>
                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> {okCount} válidos</span>
                {dupCount > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertCircle size={14} /> {dupCount} duplicados</span>}
                {invCount > 0 && <span className="flex items-center gap-1 text-red-600"><AlertCircle size={14} /> {invCount} inválidos</span>}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Email</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Nombre</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 hidden sm:table-cell">Teléfono</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 hidden sm:table-cell">Empresa</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Estado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedLeads.map((lead, idx) => (
                      <tr key={idx} className={lead._status === 'duplicate' ? 'bg-amber-50/50' : lead._status === 'invalid' ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 text-slate-800 truncate max-w-[180px]">{lead.email}</td>
                        <td className="px-3 py-2 text-slate-600">{lead.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{lead.phone || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{lead.company || '—'}</td>
                        <td className="px-3 py-2">
                          {lead._status === 'ok' && <span className="text-xs text-emerald-600 font-medium">OK</span>}
                          {lead._status === 'duplicate' && <span className="text-xs text-amber-600 font-medium">Duplicado</span>}
                          {lead._status === 'invalid' && <span className="text-xs text-red-600 font-medium">Inválido</span>}
                        </td>
                        <td className="px-3 py-2">
                          {lead._status === 'ok' && (
                            <button onClick={() => removeFromPreview(idx)} className="p-1 rounded text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={32} className="animate-spin text-indigo-600" />
              <p className="text-sm text-slate-600">Importando {okCount} leads...</p>
            </div>
          )}

          {step === 'done' && importResult && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900">Importación completa</p>
                <p className="text-sm text-slate-500 mt-1">
                  {importResult.imported} importados · {importResult.duplicates} duplicados · {importResult.invalid} inválidos
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          {step === 'upload' && (
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancelar</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setParsedLeads([]); }} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Volver</button>
              <button onClick={handleImport} disabled={okCount === 0} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                Importar {okCount} leads
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">Cerrar</button>
          )}
        </div>
      </div>
    </div>
  );
};
