import React, { useState, useRef, useMemo } from 'react';
import { LeadImportRow } from './types';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  X, Upload, FileText, AlertCircle, CheckCircle2,
  FileSpreadsheet, Loader2, Sparkles, Trash2,
  ChevronRight, ArrowLeft, AlertTriangle, Info,
} from 'lucide-react';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Step = 'upload' | 'review' | 'importing' | 'done';

interface ParseSummary {
  totalExtracted: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  fileName: string;
}

export const LeadImportModal: React.FC<Props> = ({ onClose, onImported }) => {
  const [step, setStep] = useState<Step>('upload');
  const [parsedLeads, setParsedLeads] = useState<LeadImportRow[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseSummary, setParseSummary] = useState<ParseSummary | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; invalid: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort: errors/invalid first, then duplicates, then ok
  const sortedLeads = useMemo(() => {
    return [...parsedLeads].sort((a, b) => {
      const order = { invalid: 0, duplicate: 1, ok: 2 };
      return (order[a._status || 'ok'] ?? 2) - (order[b._status || 'ok'] ?? 2);
    });
  }, [parsedLeads]);

  const okCount = parsedLeads.filter(l => l._status === 'ok').length;
  const dupCount = parsedLeads.filter(l => l._status === 'duplicate').length;
  const invCount = parsedLeads.filter(l => l._status === 'invalid').length;

  // Parse pasted text
  const parsePastedText = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const lines = pasteText.trim().split('\n').filter(Boolean);
      const leads: LeadImportRow[] = [];

      for (const line of lines) {
        const cols = line.includes('\t') ? line.split('\t') : line.split(',');
        const cleanCols = cols.map(c => c.trim().replace(/^["']|["']$/g, ''));

        const emailIdx = cleanCols.findIndex(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
        if (emailIdx === -1) continue;

        const email = cleanCols[emailIdx].toLowerCase();
        const remaining = cleanCols.filter((_, i) => i !== emailIdx);

        leads.push({
          email,
          name: remaining[0] || undefined,
          phone: remaining.find(c => /^[\d+\s()-]{7,}$/.test(c)) || undefined,
          company: remaining.find(c => !(/^[\d+\s()-]{7,}$/.test(c)) && c !== remaining[0]) || undefined,
          _status: 'ok',
        });
      }

      setParsedLeads(leads);
      setParseSummary({ totalExtracted: lines.length, validCount: leads.length, invalidCount: lines.length - leads.length, duplicateCount: 0, fileName: 'Texto pegado' });
      setStep('review');
    } catch (e) { console.error('Error parsing text:', e); }
    setParsing(false);
  };

  // Upload file
  const handleFileUpload = async (file: File) => {
    setParsing(true);
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
        setParseSummary({
          totalExtracted: result.totalExtracted,
          validCount: result.validCount,
          invalidCount: result.invalidCount || 0,
          duplicateCount: result.duplicateCount || 0,
          fileName: result.fileName || file.name,
        });
        setStep('review');
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Import
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
        setStep('review');
      }
    } catch (e) {
      console.error('Error importing:', e);
      setStep('review');
    }
  };

  const removeFromPreview = (email: string) => {
    setParsedLeads(prev => prev.filter(l => l.email !== email));
  };

  const stepNumber = step === 'upload' ? 1 : step === 'review' ? 2 : step === 'importing' ? 3 : 3;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
        <div className="flex items-center gap-4">
          <Upload size={20} className="text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">Importar Leads</h2>

          {/* Step indicator */}
          <div className="flex items-center gap-2 ml-4">
            {[
              { n: 1, label: 'Subir' },
              { n: 2, label: 'Validar' },
              { n: 3, label: 'Resumen' },
            ].map(({ n, label }, idx) => (
              <React.Fragment key={n}>
                {idx > 0 && <ChevronRight size={14} className="text-slate-300" />}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  stepNumber === n ? 'bg-indigo-100 text-indigo-700' :
                  stepNumber > n ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {stepNumber > n ? <CheckCircle2 size={12} /> : <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">{n}</span>}
                  {label}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="max-w-2xl mx-auto py-12 px-6 space-y-8">
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900">Sube tu archivo de contactos</h3>
              <p className="text-sm text-slate-500 mt-2">La IA extraerá automáticamente todos los contactos del documento</p>
            </div>

            {/* File upload area */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
              />
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center">
                  <Sparkles size={28} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-lg">Arrastra un archivo o haz clic</p>
                  <p className="text-sm text-slate-500 mt-1">CSV, Excel, PDF, Word — hasta 10MB</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><FileSpreadsheet size={12} /> CSV / XLSX</span>
                  <span className="flex items-center gap-1"><FileText size={12} /> PDF / DOCX</span>
                </div>
              </div>
            </div>

            {/* Or paste text */}
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">O pega una tabla de datos</p>
              <textarea
                placeholder={"Pega aquí datos separados por tabulación o coma...\n\nEjemplo:\nJuan García\tjuan@clinica.com\t+34 612 345 678\tClínica Psico"}
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-4 text-sm font-mono resize-none h-32 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
              />
              <button
                onClick={parsePastedText}
                disabled={!pasteText.trim() || parsing}
                className="mt-3 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                Procesar texto
              </button>
            </div>

            {parsing && (
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
                <span className="text-slate-600">Procesando archivo con IA...</span>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Review & Validate */}
        {step === 'review' && (
          <div className="px-6 py-6 space-y-4">
            {/* Extraction summary */}
            {parseSummary && (
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={16} className="text-indigo-600" />
                  <h4 className="text-sm font-bold text-slate-800">Resumen de la extracción</h4>
                  <span className="text-xs text-slate-400 ml-2">{parseSummary.fileName}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-slate-100 text-center">
                    <p className="text-2xl font-bold text-slate-800">{parseSummary.totalExtracted}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Extraídos del archivo</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-emerald-100 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{okCount}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Listos para importar</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-amber-100 text-center">
                    <p className="text-2xl font-bold text-amber-600">{dupCount}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Duplicados</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-red-100 text-center">
                    <p className="text-2xl font-bold text-red-600">{invCount}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Inválidos</p>
                  </div>
                </div>
                {parseSummary.totalExtracted > parseSummary.validCount + parseSummary.invalidCount && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
                    <AlertTriangle size={12} />
                    <span>{parseSummary.totalExtracted - parseSummary.validCount} contactos no tenían email válido y fueron descartados</span>
                  </div>
                )}
              </div>
            )}

            {/* Stats bar */}
            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="text-slate-600 font-medium">{parsedLeads.length} contactos en la tabla</span>
              <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 size={14} /> {okCount} válidos</span>
              {dupCount > 0 && <span className="flex items-center gap-1 text-amber-600 font-medium"><AlertCircle size={14} /> {dupCount} duplicados</span>}
              {invCount > 0 && <span className="flex items-center gap-1 text-red-600 font-medium"><AlertTriangle size={14} /> {invCount} inválidos</span>}
            </div>

            {/* Preview table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(100vh-340px)] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 w-8">#</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Estado</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Email</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Nombre</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 hidden md:table-cell">Teléfono</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 hidden md:table-cell">Empresa</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 hidden lg:table-cell">Detalles</th>
                      <th className="px-3 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedLeads.map((lead, idx) => (
                      <tr key={`${lead.email}-${idx}`} className={
                        lead._status === 'invalid' ? 'bg-red-50/50' :
                        lead._status === 'duplicate' ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'
                      }>
                        <td className="px-3 py-2 text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2">
                          {lead._status === 'ok' && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={10} /> OK</span>}
                          {lead._status === 'duplicate' && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><AlertCircle size={10} /> Duplicado</span>}
                          {lead._status === 'invalid' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><AlertTriangle size={10} /> {lead._reason || 'Inválido'}</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-800 truncate max-w-[200px]">{lead.email}</td>
                        <td className="px-3 py-2 text-slate-600">{lead.name || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600 hidden md:table-cell">{lead.phone || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-600 hidden md:table-cell">{lead.company || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs hidden lg:table-cell truncate max-w-[200px]" title={lead.details || ''}>{lead.details || <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2">
                          {lead._status === 'ok' && (
                            <button onClick={() => removeFromPreview(lead.email)} className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 size={40} className="animate-spin text-indigo-600" />
            <p className="text-lg font-medium text-slate-700">Importando {okCount} leads...</p>
            <p className="text-sm text-slate-400">Esto puede tardar unos segundos</p>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && importResult && (
          <div className="max-w-lg mx-auto py-16 px-6">
            <div className="flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-slate-900">Importación completada</h3>
                <p className="text-slate-500 mt-2">Resumen de la operación</p>
              </div>

              <div className="w-full grid grid-cols-3 gap-4 mt-4">
                <div className="bg-emerald-50 rounded-xl p-5 text-center border border-emerald-100">
                  <p className="text-3xl font-bold text-emerald-700">{importResult.imported}</p>
                  <p className="text-sm text-emerald-600 mt-1 font-medium">Importados</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-5 text-center border border-amber-100">
                  <p className="text-3xl font-bold text-amber-700">{importResult.duplicates}</p>
                  <p className="text-sm text-amber-600 mt-1 font-medium">Duplicados</p>
                </div>
                <div className="bg-red-50 rounded-xl p-5 text-center border border-red-100">
                  <p className="text-3xl font-bold text-red-700">{importResult.invalid}</p>
                  <p className="text-sm text-red-600 mt-1 font-medium">Inválidos</p>
                </div>
              </div>

              {parseSummary && (
                <div className="w-full bg-slate-50 rounded-xl p-4 border border-slate-200 mt-2">
                  <p className="text-xs text-slate-500 font-medium mb-2">Detalles</p>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>Archivo: <span className="font-medium text-slate-800">{parseSummary.fileName}</span></p>
                    <p>Total extraídos del archivo: <span className="font-medium text-slate-800">{parseSummary.totalExtracted}</span></p>
                    <p>Con email válido: <span className="font-medium text-slate-800">{parseSummary.validCount}</span></p>
                    <p>Nuevos importados: <span className="font-medium text-emerald-700">{importResult.imported}</span></p>
                    <p>Ya existían (omitidos): <span className="font-medium text-amber-700">{importResult.duplicates}</span></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-white">
        <div>
          {step === 'review' && (
            <button onClick={() => { setStep('upload'); setParsedLeads([]); setParseSummary(null); }} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
              <ArrowLeft size={14} /> Volver
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step === 'upload' && (
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancelar</button>
          )}
          {step === 'review' && (
            <button onClick={handleImport} disabled={okCount === 0} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              Importar {okCount} leads <ChevronRight size={14} />
            </button>
          )}
          {step === 'done' && (
            <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">Cerrar</button>
          )}
        </div>
      </div>
    </div>
  );
};
