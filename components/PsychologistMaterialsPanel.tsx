import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Upload, Search, Trash2, Send, X, FileText,
  Image, File, Loader2, Plus, User, ChevronDown, AlertCircle, CheckCircle2
} from 'lucide-react';
import { includesNormalized, isTempEmail } from '../services/textUtils';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Material {
  id: string;
  created_at: string;
  psychologist_user_id: string;
  name: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface Patient {
  id: string;
  name: string;
  email?: string;
}

interface PsychologistMaterialsPanelProps {
  psychologistId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAttachmentType(mimeType: string): 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  return 'DOCUMENT';
}

function FileIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }) {
  if (mimeType.startsWith('image/')) return <Image size={size} className="text-emerald-500" />;
  return <FileText size={size} className="text-blue-500" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PsychologistMaterialsPanel: React.FC<PsychologistMaterialsPanelProps> = ({ psychologistId }) => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Send-as-feedback state
  const [sendMaterial, setSendMaterial] = useState<Material | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Load materials ─────────────────────────────────────────────────────────

  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/materials?psychologist_user_id=${psychologistId}`);
      if (res.ok) {
        const data = await res.json();
        setMaterials(data);
      }
    } catch (e) {
      console.error('Error loading materials:', e);
    } finally {
      setIsLoading(false);
    }
  }, [psychologistId]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  // ─── Load patients ───────────────────────────────────────────────────────────

  const loadPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const res = await apiFetch(`${API_URL}/psychologist/${psychologistId}/patients`);
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

  // ─── Upload ──────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    if (!uploadName.trim()) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setUploadName(nameWithoutExt);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) {
      setUploadError('Selecciona un archivo y escribe un nombre.');
      return;
    }
    setIsUploading(true);
    setUploadError('');
    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      // Upload file to storage
      const uploadRes = await apiFetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: uploadFile.name,
          fileType: uploadFile.type,
          fileSize: uploadFile.size,
          fileData: base64,
          userId: psychologistId,
          folder: 'psychologist-materials'
        })
      });

      if (!uploadRes.ok) {
        throw new Error('Error subiendo archivo');
      }
      const { url: file_url } = await uploadRes.json();

      // Save material record
      const saveRes = await apiFetch(`${API_URL}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          psychologist_user_id: psychologistId,
          name: uploadName.trim(),
          file_url,
          file_name: uploadFile.name,
          file_type: uploadFile.type
        })
      });

      if (!saveRes.ok) {
        throw new Error('Error guardando material');
      }

      setShowUploadModal(false);
      setUploadFile(null);
      setUploadName('');
      await loadMaterials();
    } catch (e: any) {
      setUploadError(e?.message || 'Error al subir el archivo');
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async (material: Material) => {
    if (!window.confirm(`¿Eliminar el material "${material.name}"?`)) return;
    setDeletingId(material.id);
    try {
      const res = await apiFetch(`${API_URL}/materials/${material.id}`, { method: 'DELETE' });
      if (res.ok) {
        setMaterials(prev => prev.filter(m => m.id !== material.id));
      }
    } catch (e) {
      console.error('Error deleting material:', e);
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Send as feedback ─────────────────────────────────────────────────────────

  const openSendModal = async (material: Material) => {
    setSendMaterial(material);
    setSelectedPatient(null);
    setPatientSearch('');
    setFeedbackComment('');
    setSendError('');
    setSendSuccess(false);
    setShowPatientDropdown(false);
    await loadPatients();
  };

  const closeSendModal = () => {
    setSendMaterial(null);
    setSendSuccess(false);
  };

  const handleSendFeedback = async () => {
    if (!sendMaterial || !selectedPatient) {
      setSendError('Selecciona un paciente.');
      return;
    }
    setIsSendingFeedback(true);
    setSendError('');
    try {
      const newEntry = {
        id: crypto.randomUUID(),
        content: feedbackComment.trim(),
        timestamp: new Date().toISOString(),
        creator_user_id: psychologistId,
        target_user_id: selectedPatient.id,
        createdBy: 'PSYCHOLOGIST',
        createdByPsychologistId: psychologistId,
        entryType: 'feedback',
        sentiment: 'neutral',
        attachments: [
          {
            id: crypto.randomUUID(),
            name: sendMaterial.name,
            type: getAttachmentType(sendMaterial.file_type),
            url: sendMaterial.file_url,
            size: 0
          }
        ]
      };

      const res = await apiFetch(`${API_URL}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });

      if (!res.ok) throw new Error('Error enviando feedback');
      setSendSuccess(true);
    } catch (e: any) {
      setSendError(e?.message || 'Error al enviar');
    } finally {
      setIsSendingFeedback(false);
    }
  };

  // ─── Filter ──────────────────────────────────────────────────────────────────

  const filteredMaterials = materials.filter(m =>
    includesNormalized(m.name, searchQuery) ||
    includesNormalized(m.file_name, searchQuery)
  );

  const filteredPatients = patients.filter(p =>
    (p.name ? includesNormalized(p.name, patientSearch) : false) ||
    (p.email ? includesNormalized(p.email, patientSearch) : false)
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar materiales..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <button
          onClick={() => { setShowUploadModal(true); setUploadFile(null); setUploadName(''); setUploadError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
        >
          <Plus size={16} />
          Nuevo material
        </button>
      </div>

      {/* Materials list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <FolderOpen size={40} className="text-slate-300" />
          <p className="text-sm font-medium">
            {searchQuery ? 'No se encontraron materiales' : 'Aún no hay materiales. Sube el primero.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMaterials.map(material => (
            <div
              key={material.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                  <FileIcon mimeType={material.file_type} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{material.name}</p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{material.file_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(material.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-1 border-t border-slate-100">
                <a
                  href={material.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <File size={13} />
                  Ver
                </a>
                <button
                  onClick={() => openSendModal(material)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                >
                  <Send size={13} />
                  Enviar
                </button>
                <button
                  onClick={() => handleDelete(material)}
                  disabled={deletingId === material.id}
                  className="flex items-center justify-center w-8 h-8 text-red-400 border border-red-100 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deletingId === material.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Upload Modal ──────────────────────────────────────────────────────── */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Subir material</h2>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* File picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo</label>
              <label className="flex items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                {uploadFile ? (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <FileIcon mimeType={uploadFile.type} size={18} />
                    <span className="truncate max-w-[200px]">{uploadFile.name}</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-400">
                    <Upload size={20} />
                    <span className="text-xs">Haz clic para seleccionar</span>
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mp3,.wav"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del material</label>
              <input
                type="text"
                placeholder="Ej: Ejercicios de respiración"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={15} />
                {uploadError}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowUploadModal(false)}
                className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading || !uploadFile || !uploadName.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {isUploading ? <><Loader2 size={15} className="animate-spin" /> Subiendo...</> : <><Upload size={15} /> Subir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send as Feedback Modal ────────────────────────────────────────────── */}
      {sendMaterial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Enviar como feedback</h2>
              <button onClick={closeSendModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {sendSuccess ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 size={40} className="text-emerald-500" />
                <p className="text-base font-semibold text-slate-800">¡Feedback enviado!</p>
                <p className="text-sm text-slate-500 text-center">
                  El material <strong>{sendMaterial.name}</strong> fue enviado como feedback al paciente seleccionado.
                </p>
                <button
                  onClick={closeSendModal}
                  className="mt-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                {/* Material preview */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center flex-shrink-0">
                    <FileIcon mimeType={sendMaterial.file_type} size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{sendMaterial.name}</p>
                    <p className="text-xs text-slate-400 truncate">{sendMaterial.file_name}</p>
                  </div>
                </div>

                {/* Patient selector */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Paciente</label>
                  <div className="relative">
                    {selectedPatient ? (
                      <button
                        type="button"
                        onClick={() => { setSelectedPatient(null); setPatientSearch(''); setShowPatientDropdown(true); }}
                        className="w-full flex items-center gap-2 px-3 py-2 border border-indigo-300 rounded-lg bg-indigo-50 text-sm font-medium text-indigo-800"
                      >
                        <User size={15} className="text-indigo-500" />
                        {selectedPatient.name}
                        <X size={14} className="ml-auto text-indigo-400" />
                      </button>
                    ) : (
                      <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar paciente..."
                          value={patientSearch}
                          onChange={e => { setPatientSearch(e.target.value); setShowPatientDropdown(true); }}
                          onFocus={() => setShowPatientDropdown(true)}
                          className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    )}

                    {showPatientDropdown && !selectedPatient && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {isLoadingPatients ? (
                          <div className="flex justify-center py-4">
                            <Loader2 size={18} className="animate-spin text-slate-400" />
                          </div>
                        ) : filteredPatients.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
                        ) : (
                          filteredPatients.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => { setSelectedPatient(p); setShowPatientDropdown(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 transition-colors text-left"
                            >
                              <User size={14} className="text-slate-400 flex-shrink-0" />
                              <div>
                                <span className="font-medium">{p.name}</span>
                                {p.email && !isTempEmail(p.email) && <span className="text-slate-400 ml-1 text-xs">{p.email}</span>}
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Comentario <span className="text-slate-400 font-normal">(opcional)</span>
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Escribe un mensaje para acompañar el material..."
                    value={feedbackComment}
                    onChange={e => setFeedbackComment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  />
                </div>

                {sendError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    <AlertCircle size={15} />
                    {sendError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={closeSendModal}
                    className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendFeedback}
                    disabled={isSendingFeedback || !selectedPatient}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isSendingFeedback ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : <><Send size={15} /> Enviar feedback</>}
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

export default PsychologistMaterialsPanel;
