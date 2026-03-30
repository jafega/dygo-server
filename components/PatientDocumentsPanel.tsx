import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  FileText, CheckCircle, Clock, X, Pen, RotateCcw, Check, Loader2, AlertCircle, PenLine, User
} from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

// ─── Simple Markdown → HTML ───────────────────────────────────────────────────
function markdownToHtml(md: string): string {
  if (!md) return '';
  // Strip internal signature metadata added by backend
  const clean = md.replace(/\n\n<!-- SIGNATURE_DATA:.*?-->$/s, '');
  let html = clean
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-2">$1</h1>')
    .replace(/^---$/gm, '<hr class="my-4 border-slate-300" />')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-slate-100 px-1 rounded text-sm font-mono">$1</code>')
    .replace(/^\s*[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-slate-300 pl-3 italic text-slate-600 my-2">$1</blockquote>')
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br />');
  html = html.replace(/(<li[\s\S]+?<\/li>)/g, '<ul class="my-2">$1</ul>');
  return `<p class="mb-3">${html}</p>`;
}

// ─── Title extraction (handles both Markdown and HTML content) ───────────────
function getDocTitle(content: string): string {
  const clean = content.replace(/<!-- SIGNATURE_DATA:.*?-->$/s, '');
  if (/^\s*(<(!DOCTYPE|html|head|body|div|section|article)|<!DOCTYPE)/i.test(clean.trim())) {
    const h1 = clean.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) return h1[1].replace(/<[^>]+>/g, '').trim();
    const titleTag = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleTag) return titleTag[1].replace(/<[^>]+>/g, '').trim();
    return 'Documento';
  }
  return clean.split('\n')[0].replace(/^#+\s*/, '').trim() || 'Documento';
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Signature {
  id: number;
  created_at: string;
  template_id: number | null;
  psych_user_id: string;
  patient_user_id: string;
  content: string;
  signed: boolean;
  signature_date: string | null;
  external_document_url?: string;
}

interface PatientDocumentsPanelProps {
  patientId: string;
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────
interface SignatureCanvasProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [isEmpty, setIsEmpty] = useState(true);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    lastPos.current = getPos(e, canvas);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setIsEmpty(false);
  };

  const stopDraw = () => { isDrawing.current = false; };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-slate-500 text-center">Firma aquí con el dedo o el ratón</div>
      <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          className="w-full"
          style={{ cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={clear}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RotateCcw size={13} /> Borrar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={save}
          disabled={isEmpty}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          <Check size={14} /> Firmar
        </button>
      </div>
    </div>
  );
};

// ─── Variable & firma helpers ─────────────────────────────────────────────────
const KNOWN_VARS: Record<string, string> = {
  nombre: 'Nombre',
  cif: 'DNI / NIF / CIF',
  direccion: 'Dirección',
  email: 'Correo electrónico',
  telefono: 'Teléfono',
};

/** Extract unique non-firma variable names from template content */
function extractVarNames(content: string): string[] {
  const matches = content.matchAll(/\{\{([^}]+)\}\}/g);
  const names = new Set<string>();
  for (const m of matches) {
    if (!/^firma_\d+$/.test(m[1]) && !m[1].startsWith('psicologo_')) names.add(m[1]);
  }
  return Array.from(names);
}

/** Count firma markers in content */
function countFirmaMarkers(content: string): number {
  return (content.match(/\{\{firma_\d+\}\}/g) || []).length;
}

/** Render document HTML with variable substitution and firma zone placeholders */
function renderDocumentHtml(content: string, varValues: Record<string, string>): string {
  if (!content) return '';
  let md = content.replace(/\n\n<!-- SIGNATURE_DATA:.*?-->$/s, '');

  // Extract already-signed firma markers (inline images) before markdown processing
  const inlineSigs: Record<string, string> = {};
  md = md.replace(/<!-- SIGNATURE_INLINE:firma_(\d+):(data:.*?) -->/g, (_full, n, dataUrl) => {
    inlineSigs[n] = dataUrl;
    return `__FIRMASIGNED_${n}__`;
  });

  // Replace unsigned {{firma_X}} markers with zone token
  md = md.replace(/\{\{firma_(\d+)\}\}/g, (_full, n) => `__FIRMAZONE_${n}__`);

  // Replace {{variable}} with resolved value or a styled placeholder
  md = md.replace(/\{\{([^}]+)\}\}/g, (_full, varName) => {
    const val = varValues[varName];
    return val ? val : `[${varName}]`;
  });

  let html = markdownToHtml(md);

  // Replace signed firma tokens with inline signature image
  html = html.replace(/__FIRMASIGNED_(\d+)__/g, (_full, n) => {
    const dataUrl = inlineSigs[n];
    if (!dataUrl) return '';
    return `<div style="margin:16px 0;padding:12px 16px;border:1px solid #d1fae5;border-radius:10px;background:#f0fdf4;">`
      + `<p style="font-size:11px;font-weight:600;color:#16a34a;margin:0 0 8px;">✓ Firmado digitalmente</p>`
      + `<img src="${dataUrl}" style="max-width:240px;max-height:90px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;display:block;" alt="Firma" />`
      + `</div>`;
  });

  // Replace unsigned firma zone tokens with visual placeholder
  html = html.replace(/__FIRMAZONE_(\d+)__/g, (_full, n) =>
    `<div style="margin:16px 0;border:2px dashed #818cf8;border-radius:12px;padding:20px 16px;
      display:flex;align-items:center;justify-content:center;gap:8px;background:#eef2ff;
      color:#4f46e5;font-size:14px;font-weight:600;">` +
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>Firma aquí (posición ${n})</div>`
  );

  return html;
}

// ─── Document Viewer Modal ────────────────────────────────────────────────────
interface DocumentViewerProps {
  doc: Signature;
  onClose: () => void;
  onSigned: () => void;
  patientId: string;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ doc, onClose, onSigned, patientId }) => {
  const [showCanvas, setShowCanvas] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signError, setSignError] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const varNames = useMemo(() => extractVarNames(doc.content), [doc.content]);
  const firmaCount = useMemo(() => countFirmaMarkers(doc.content), [doc.content]);
  const hasVariables = varNames.length > 0 || firmaCount > 0;

  // Pre-fill from patient profile
  useEffect(() => {
    if (varNames.length === 0) return;
    setIsLoadingProfile(true);
    apiFetch(`${API_URL}/users/${patientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(user => {
        if (!user) return;
        const prefilled: Record<string, string> = {};
        if (varNames.includes('nombre') && user.name) prefilled['nombre'] = user.name;
        if (varNames.includes('cif') && (user.dni || user.cif)) prefilled['cif'] = user.dni || user.cif || '';
        if (varNames.includes('direccion') && user.address) prefilled['direccion'] = user.address;
        if (varNames.includes('email') && user.email) prefilled['email'] = user.email;
        if (varNames.includes('telefono') && user.phone) prefilled['telefono'] = user.phone;
        setVariableValues(prev => ({ ...prefilled, ...prev }));
      })
      .catch(() => {})
      .finally(() => setIsLoadingProfile(false));
  }, [patientId, varNames.join(',')]);

  const handleSign = async (dataUrl: string) => {
    setIsSigning(true);
    setSignError('');
    try {
      // Build resolved content: substitute variables, replace {{firma_X}} with inline markers
      let resolved = doc.content.replace(/\n\n<!-- SIGNATURE_DATA:.*?-->$/s, '');
      // Replace {{variable}} with actual values
      resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (_full, varName) => {
        if (/^firma_\d+$/.test(varName)) return `{{${varName}}}`; // keep for next step
        return variableValues[varName] || `{{${varName}}}`;
      });
      // Replace {{firma_X}} with inline signature marker
      resolved = resolved.replace(/\{\{firma_(\d+)\}\}/g, (_full, n) =>
        `<!-- SIGNATURE_INLINE:firma_${n}:${dataUrl} -->`
      );

      const res = await apiFetch(`${API_URL}/signatures/${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_user_id: patientId,
          signature_data: dataUrl,
          resolved_content: resolved,
        })
      });
      if (!res.ok) throw new Error(await res.text());
      onSigned();
    } catch (e: any) {
      setSignError('Error al firmar. Inténtalo de nuevo.');
    } finally {
      setIsSigning(false);
    }
  };

  const title = getDocTitle(doc.content);
  const missingVars = varNames.filter(v => !variableValues[v]?.trim());

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-stretch md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-screen md:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-900 text-base">{title}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Recibido: {new Date(doc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Status badge */}
        <div className="px-5 pt-3 flex-shrink-0 flex items-center gap-2 flex-wrap">
          {doc.signed ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
              <CheckCircle size={16} />
              <span>Firmado el {new Date(doc.signature_date!).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <Clock size={16} />
              <span>Pendiente de firma</span>
            </div>
          )}
          {firmaCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1.5">
              <PenLine size={12} />
              {firmaCount} zona{firmaCount > 1 ? 's' : ''} de firma
            </div>
          )}
        </div>

        {/* Variable fill-in section (only when there are vars and doc is not yet signed) */}
        {!doc.signed && varNames.length > 0 && (
          <div className="px-5 pt-3 flex-shrink-0">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <User size={13} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {isLoadingProfile ? 'Cargando datos…' : 'Datos del documento'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {varNames.map(varName => (
                  <div key={varName}>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      {KNOWN_VARS[varName] || varName}
                      {!variableValues[varName]?.trim() && (
                        <span className="ml-1 text-amber-600">*</span>
                      )}
                    </label>
                    <input
                      type={varName === 'email' ? 'email' : 'text'}
                      value={variableValues[varName] || ''}
                      onChange={e => setVariableValues(prev => ({ ...prev, [varName]: e.target.value }))}
                      placeholder={`Tu ${KNOWN_VARS[varName]?.toLowerCase() || varName}`}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    />
                  </div>
                ))}
              </div>
              {missingVars.length > 0 && (
                <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
                  <AlertCircle size={11} />
                  Rellena los campos marcados (*) antes de firmar
                </p>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        {doc.external_document_url ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {doc.external_document_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img
                src={doc.external_document_url}
                alt={title}
                className="flex-1 object-contain p-4 max-h-full"
              />
            ) : (
              <iframe
                src={doc.external_document_url}
                title={title}
                className="flex-1 w-full border-0"
                style={{ minHeight: '400px' }}
              />
            )}
            <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
              <a
                href={doc.external_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors font-medium"
              >
                <FileText size={15} /> Abrir / Descargar documento
              </a>
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto px-6 py-4 prose prose-slate max-w-none text-slate-800 leading-relaxed text-sm"
            dangerouslySetInnerHTML={{ __html: renderDocumentHtml(doc.content, variableValues) }}
          />
        )}

        {/* Sign area */}
        {!doc.signed && (
          <div className="px-5 pb-5 flex-shrink-0 border-t border-slate-200 pt-4">
            {!showCanvas ? (
              <button
                onClick={() => setShowCanvas(true)}
                disabled={missingVars.length > 0}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-sm shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pen size={16} />
                {missingVars.length > 0 ? 'Rellena los datos antes de firmar' : 'Firmar documento'}
              </button>
            ) : isSigning ? (
              <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
                <Loader2 size={20} className="animate-spin" /> Guardando firma…
              </div>
            ) : (
              <>
                {firmaCount > 0 && (
                  <p className="mb-3 text-xs text-indigo-600 flex items-center gap-1.5">
                    <PenLine size={13} />
                    Tu firma se colocará en las {firmaCount} zona{firmaCount > 1 ? 's' : ''} marcada{firmaCount > 1 ? 's' : ''} del documento
                  </p>
                )}
                <SignatureCanvas
                  onSave={handleSign}
                  onCancel={() => setShowCanvas(false)}
                />
                {signError && (
                  <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
                    <AlertCircle size={14} /> {signError}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────
const PatientDocumentsPanel: React.FC<PatientDocumentsPanelProps> = ({ patientId }) => {
  const [docs, setDocs] = useState<Signature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Signature | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed'>('all');

  const loadDocs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/signatures?patient_user_id=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch (e) {
      console.error('Error loading documents:', e);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleSigned = async () => {
    await loadDocs();
    // Refresh the selected doc from updated list
    setSelectedDoc(prev => {
      if (!prev) return null;
      return docs.find(d => d.id === prev.id) || prev;
    });
    setSelectedDoc(null);
  };

  const filtered = docs.filter(d => {
    if (filter === 'pending') return !d.signed;
    if (filter === 'signed') return d.signed;
    return true;
  });

  const pendingCount = docs.filter(d => !d.signed).length;
  const signedCount = docs.filter(d => d.signed).length;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { key: 'all', label: `Todos (${docs.length})` },
            { key: 'pending', label: `Pendientes (${pendingCount})` },
            { key: 'signed', label: `Firmados (${signedCount})` }
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key as any)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === item.key
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            <Clock size={11} />
            {pendingCount} pendiente{pendingCount > 1 ? 's' : ''} de firma
          </span>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {filter === 'pending' ? 'No hay documentos pendientes' :
             filter === 'signed' ? 'No hay documentos firmados' :
             'Tu psicólogo aún no ha enviado documentos'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(doc => {
            const title = getDocTitle(doc.content);
            const preview = doc.content.replace(/^.+\n/, '').replace(/[#*_`>-]/g, '').trim().slice(0, 100);

            return (
              <button
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    doc.signed ? 'bg-green-100' : 'bg-amber-100'
                  }`}>
                    {doc.signed
                      ? <CheckCircle size={20} className="text-green-600" />
                      : <Clock size={20} className="text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h3 className="font-semibold text-slate-900 text-sm group-hover:text-indigo-700 transition-colors truncate">{title}</h3>
                      <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        doc.signed
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {doc.signed ? 'Firmado' : 'Pendiente'}
                      </span>
                    </div>
                    {preview && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{preview}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      {doc.signed && doc.signature_date && (
                        <span className="text-[11px] text-green-600">
                          Firmado: {new Date(doc.signature_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {!doc.signed && (
                        <span className="text-[11px] text-indigo-600 font-medium group-hover:underline">
                          Leer y firmar →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Document viewer modal */}
      {selectedDoc && (
        <DocumentViewer
          doc={selectedDoc}
          patientId={patientId}
          onClose={() => setSelectedDoc(null)}
          onSigned={handleSigned}
        />
      )}
    </div>
  );
};

export default PatientDocumentsPanel;
