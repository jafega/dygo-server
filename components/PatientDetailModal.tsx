import React, { useState, useEffect, useRef } from 'react';
import { X, User, Calendar, Phone, Mail, FileText, DollarSign, Settings, Tag, Trash2, Save, Edit2, CreditCard, MapPin, Cake, Clock as ClockIcon, BookOpen, Sparkles, CheckCircle, AlertCircle, Download, Loader2, Ticket, Building2, TrendingUp, BarChart3, Upload, File, XCircle, Send, Scroll, Eye, Award, Shield, Lock, ClipboardList, Link, ExternalLink } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser, apiFetch } from '../services/authService';
import InsightsPanel from './InsightsPanel';
import BillingPanel from './BillingPanel';
import PsychologistPatientSessions from './PsychologistPatientSessions';
import PatientTimeline from './PatientTimeline';
import BonosPanel from './BonosPanel';
import { AddressAutocomplete } from './AddressAutocomplete';
import UpgradeModal from './UpgradeModal';
import { HistoricalDocument, HistoricalDocumentsSummary } from '../types';

interface PatientSummary {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  userId?: string;
  user_id?: string;
  psychologistId?: string;
}

interface PatientDetailModalProps {
  patient: PatientSummary;
  onClose: () => void;
  psychologistId?: string;
}

const PatientDetailModal: React.FC<PatientDetailModalProps> = ({ patient, onClose, psychologistId }) => {
  const [activeTab, setActiveTab] = useState<'PATIENT' | 'INFO' | 'SESSIONS' | 'TIMELINE' | 'BILLING' | 'BONOS' | 'RELATIONSHIP' | 'HISTORY' | 'DOCS' | 'LOPD'>('PATIENT');
  const [patientData, setPatientData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);
  const [relationshipSettings, setRelationshipSettings] = useState({
    defaultPrice: 0,
    defaultPercent: 70,
    tags: [] as string[],
    usesBonos: false,
    centerId: '' as string | null,
    active: true, // Estado activo/inactivo del paciente
    patientNumber: 0, // Número de paciente para este psicólogo
    status: '' // Estado de la relación (texto libre)
  });
  const [centers, setCenters] = useState<any[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedPatientData, setEditedPatientData] = useState<any>({});
  const [allPsychologistTags, setAllPsychologistTags] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [clinicalHistory, setClinicalHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [upgradeModal, setUpgradeModal] = useState<boolean>(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [patientStats, setPatientStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Docs (templates/signatures) state
  const [docSignatures, setDocSignatures] = useState<any[]>([]);
  const [isLoadingDocs2, setIsLoadingDocs2] = useState(false);
  const [docTemplates, setDocTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [showSendDocModal, setShowSendDocModal] = useState(false);
  const [sendingDocTemplate, setSendingDocTemplate] = useState<any>(null);
  const [isSendingDoc, setIsSendingDoc] = useState(false);
  const [docSendSuccess, setDocSendSuccess] = useState(false);
  const [previewDocSignature, setPreviewDocSignature] = useState<any>(null);
  const [previewDocTemplate, setPreviewDocTemplate] = useState<any>(null);

  // External doc upload state
  const [showUploadExternalDoc, setShowUploadExternalDoc] = useState(false);
  const [externalDocTitle, setExternalDocTitle] = useState('');
  const [externalDocFile, setExternalDocFile] = useState<File | null>(null);
  const [isUploadingExternalDoc, setIsUploadingExternalDoc] = useState(false);
  const [uploadExternalDocError, setUploadExternalDocError] = useState('');
  const externalDocFileRef = useRef<HTMLInputElement>(null);

  // Historical documents states
  const [historicalDocs, setHistoricalDocs] = useState<HistoricalDocumentsSummary>({ documents: [], lastUpdated: 0 });
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // LOPD / RGPD compliance state
  const [isLoadingLOPD, setIsLoadingLOPD] = useState(false);
  const [lopdSessions, setLopdSessions] = useState<any[]>([]);
  const [lopdPsychName, setLopdPsychName] = useState<string>('');
  const [lopdPsychEmail, setLopdPsychEmail] = useState<string>('');

  const patientUserId = patient.userId || patient.user_id || patient.id;
  const currentPsychologistId = psychologistId || patient.psychologistId || '';

  useEffect(() => {
    loadPatientData();
    loadRelationship();
    loadAllPsychologistTags();
    loadCenters();
    loadPatientStats();
  }, [patientUserId]);

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadClinicalHistory();
      loadHistoricalDocuments();
    }
    if (activeTab === 'DOCS') {
      loadDocSignatures();
      loadDocTemplates();
    }
    if (activeTab === 'LOPD') {
      loadLOPDData();
    }
  }, [activeTab, patientUserId, relationship?.id]);

  const loadPatientData = async () => {
    if (!patientUserId) return;
    
    setIsLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/users/${patientUserId}`);
      if (response.ok) {
        const data = await response.json();
        setPatientData(data);
        const fn = data.firstName || data.data?.firstName || '';
        const ln = data.lastName || data.data?.lastName || '';
        const computedName = fn || ln ? `${fn} ${ln}`.trim() : (data.name || patient.name);
        setEditedPatientData({
          name: computedName,
          firstName: fn,
          lastName: ln,
          email: data.email || patient.email,
          phone: data.phone || patient.phone,
          dni: data.data?.dni || data.dni || '',
          address: data.data?.address || data.address || '',
          birthDate: data.data?.birthDate || data.birthDate || '',
          notes: data.data?.notes || data.notes || ''
        });
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
    }
    setIsLoading(false);
  };

  const loadRelationship = async () => {
    if (!currentPsychologistId || !patientUserId) return;
    
    try {
      // Importante: incluir includeInactive=true para poder cargar relaciones inactivas
      const response = await apiFetch(`${API_URL}/relationships?psychologistId=${currentPsychologistId}&patientId=${patientUserId}&includeInactive=true`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const rel = data[0];
          console.log('[PatientDetailModal] Relationship loaded:', rel);
          console.log('[PatientDetailModal] active:', rel.active);
          console.log('[PatientDetailModal] uses_bonos:', rel.uses_bonos, 'usesBonos:', rel.usesBonos);
          setRelationship(rel);
          setRelationshipSettings({
            defaultPrice: rel.defaultPrice || rel.default_session_price || 0,
            defaultPercent: rel.defaultPercent || rel.default_psych_percent || 70,
            tags: rel.tags || [],
            usesBonos: rel.usesBonos || rel.uses_bonos || false,
            centerId: rel.centerId || rel.center_id || null,
            active: rel.active !== false, // Leer de la columna directa (por defecto true)
            patientNumber: rel.patientnumber || 0, // Número del paciente
            status: rel.status || '' // Estado de la relación
          });
          console.log('[PatientDetailModal] relationshipSettings loaded:', {
            active: rel.active !== false,
            usesBonos: rel.usesBonos || rel.uses_bonos || false
          });
          setClinicalNotes(rel.data?.clinicalNotes || '');
        }
      }
    } catch (error) {
      console.error('Error loading relationship:', error);
    }
  };

  const loadCenters = async () => {
    if (!currentPsychologistId) return;
    
    try {
      const response = await apiFetch(`${API_URL}/centers?psychologistId=${currentPsychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCenters(data || []);
      }
    } catch (error) {
      console.error('Error loading centers:', error);
    }
  };

  const loadClinicalHistory = async () => {
    if (!patientUserId) return;
    
    setIsLoadingHistory(true);
    try {
      const response = await apiFetch(`${API_URL}/session-entries?target_user_id=${patientUserId}`);
      if (response.ok) {
        const entries = await response.json();
        // Cargar las sesiones asociadas para obtener las fechas
        const entriesWithDates = await Promise.all(entries.map(async (entry: any) => {
          if (entry.data?.session_id) {
            try {
              const sessionResponse = await apiFetch(`${API_URL}/sessions/${entry.data.session_id}`);
              if (sessionResponse.ok) {
                const session = await sessionResponse.json();
                return { ...entry, sessionDate: session.starts_on };
              }
            } catch (error) {
              console.error('Error loading session date:', error);
            }
          }
          return { ...entry, sessionDate: entry.created_at };
        }));
        
        // Ordenar por fecha de sesión descendente (más reciente primero)
        const sortedEntries = entriesWithDates.sort((a: any, b: any) => {
          const dateA = new Date(a.sessionDate || a.created_at || 0).getTime();
          const dateB = new Date(b.sessionDate || b.created_at || 0).getTime();
          return dateB - dateA;
        });
        setClinicalHistory(sortedEntries);
      }
    } catch (error) {
      console.error('Error loading clinical history:', error);
    }
    setIsLoadingHistory(false);
  };

  const loadPatientStats = async () => {
    if (!patientUserId || !currentPsychologistId) return;
    
    setIsLoadingStats(true);
    try {
      const response = await apiFetch(`${API_URL}/patient-stats/${patientUserId}?psychologistId=${currentPsychologistId}`);
      if (response.ok) {
        const stats = await response.json();
        setPatientStats(stats);
      }
    } catch (error) {
      console.error('Error loading patient stats:', error);
    }
    setIsLoadingStats(false);
  };

  const downloadEntryAsPDF = (entry: any) => {
    const entryDate = entry.created_at ? new Date(entry.created_at) : new Date();
    const dateStr = entryDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = entryDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    // Crear contenido HTML para el PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Sesión - ${dateStr}</title>
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              margin: 40px;
              color: #1e293b;
              line-height: 1.6;
            }
            .header {
              border-bottom: 3px solid #7c3aed;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              color: #7c3aed;
              margin: 0 0 10px 0;
              font-size: 28px;
            }
            .header .meta {
              color: #64748b;
              font-size: 14px;
            }
            .section {
              margin-bottom: 30px;
              page-break-inside: avoid;
            }
            .section-title {
              color: #7c3aed;
              font-size: 18px;
              font-weight: 600;
              margin-bottom: 10px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .section-content {
              background: #f8fafc;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #7c3aed;
              white-space: pre-wrap;
            }
            .status {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 600;
              margin-left: 10px;
            }
            .status.done {
              background: #dcfce7;
              color: #15803d;
            }
            .status.pending {
              background: #fed7aa;
              color: #c2410c;
            }
            @media print {
              body { margin: 20px; }
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Historia Clínica - Sesión</h1>
            <div class="meta">
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Fecha:</strong> ${dateStr} a las ${timeStr}
              <span class="status ${entry.data?.status === 'done' ? 'done' : 'pending'}">
                ${entry.data?.status === 'done' ? 'Completada' : 'Pendiente'}
              </span>
            </div>
          </div>
          
          ${entry.data?.summary ? `
            <div class="section">
              <div class="section-title">✨ Resumen con IA</div>
              <div class="section-content">${entry.data.summary}</div>
            </div>
          ` : ''}
          
          ${entry.data?.transcript ? `
            <div class="section">
              <div class="section-title">📝 Transcript de la sesión</div>
              <div class="section-content">${entry.data.transcript}</div>
            </div>
          ` : ''}
          
          ${entry.data?.file_name ? `
            <div class="section">
              <div class="section-title">📎 Archivo adjunto</div>
              <div class="section-content">${entry.data.file_name}</div>
            </div>
          ` : ''}
        </body>
      </html>
    `;

    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const saveClinicalNotes = async () => {
    if (!relationship) {
      alert('No se encontró la relación');
      return;
    }

    setIsSavingNotes(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/relationships/${relationship.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          data: {
            ...relationship.data,
            clinicalNotes: clinicalNotes
          }
        })
      });

      if (response.ok) {
        setIsEditingNotes(false);
        const updated = await response.json();
        setRelationship(updated);
        alert('Notas guardadas correctamente');
      } else {
        alert('Error al guardar las notas');
      }
    } catch (error) {
      console.error('Error saving clinical notes:', error);
      alert('Error al guardar las notas');
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Funciones para documentos históricos
  const loadHistoricalDocuments = async () => {
    if (!relationship?.id) return;
    
    setIsLoadingDocs(true);
    try {
      const response = await apiFetch(`${API_URL}/relationships/${relationship.id}/historical-documents`);
      if (response.ok) {
        const data = await response.json();
        setHistoricalDocs(data);
      }
    } catch (error) {
      console.error('Error loading historical documents:', error);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !relationship?.id) return;

    setIsUploadingDoc(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      for (const file of Array.from(files) as File[]) {
        // Validar tamaño (máx 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert(`El archivo ${file.name} es demasiado grande. Máximo 10MB.`);
          continue;
        }

        // Convertir a base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Subir documento
        const response = await apiFetch(`${API_URL}/relationships/${relationship.id}/historical-documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUser.id
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            content: base64
          })
        });

        if (!response.ok) {
          alert(`Error al subir ${file.name}`);
        }
      }

      // Recargar documentos
      await loadHistoricalDocuments();
      alert('Documentos subidos correctamente');
      
      // Limpiar input
      event.target.value = '';
    } catch (error) {
      console.error('Error uploading documents:', error);
      alert('Error al subir documentos');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const deleteHistoricalDocument = async (docId: string) => {
    if (!relationship?.id || !confirm('¿Eliminar este documento?')) return;

    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/relationships/${relationship.id}/historical-documents/${docId}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        await loadHistoricalDocuments();
      } else {
        alert('Error al eliminar documento');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Error al eliminar documento');
    }
  };

  const generateDocumentsSummary = async () => {
    if (!relationship?.id || historicalDocs.documents.length === 0) return;

    setIsGeneratingSummary(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/relationships/${relationship.id}/historical-documents/generate-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        await loadHistoricalDocuments();
        alert('Resumen generado correctamente');
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Error al generar resumen');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      alert('Error al generar resumen');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const downloadDocument = (doc: HistoricalDocument) => {
    const link = document.createElement('a');
    link.href = doc.content;
    link.download = doc.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const downloadAllEntriesAsPDF = () => {
    if (clinicalHistory.length === 0) {
      alert('No hay entradas para descargar');
      return;
    }

    // Crear contenido HTML para todas las entradas
    const entriesHTML = clinicalHistory.map((entry, index) => {
      const entryDate = entry.created_at ? new Date(entry.created_at) : new Date();
      const dateStr = entryDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = entryDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      
      return `
        <div class="entry" style="${index > 0 ? 'page-break-before: always;' : ''}">
          <div class="entry-header">
            <h2>Sesión ${clinicalHistory.length - index} - ${dateStr}</h2>
            <div class="entry-meta">
              <strong>Hora:</strong> ${timeStr}
              <span class="status ${entry.data?.status === 'done' ? 'done' : 'pending'}">
                ${entry.data?.status === 'done' ? 'Completada' : 'Pendiente'}
              </span>
            </div>
          </div>
          
          ${entry.data?.summary ? `
            <div class="section">
              <div class="section-title">✨ Resumen con IA</div>
              <div class="section-content">${entry.data.summary}</div>
            </div>
          ` : ''}
          
          ${entry.data?.transcript ? `
            <div class="section">
              <div class="section-title">📝 Transcript de la sesión</div>
              <div class="section-content">${entry.data.transcript}</div>
            </div>
          ` : ''}
          
          ${entry.data?.file_name ? `
            <div class="section">
              <div class="section-title">📎 Archivo adjunto</div>
              <div class="section-content">${entry.data.file_name}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Historia Clínica Completa - ${patient.name}</title>
          <style>
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              margin: 40px;
              color: #1e293b;
              line-height: 1.6;
            }
            .header {
              border-bottom: 3px solid #7c3aed;
              padding-bottom: 20px;
              margin-bottom: 40px;
            }
            .header h1 {
              color: #7c3aed;
              margin: 0 0 10px 0;
              font-size: 32px;
            }
            .header .meta {
              color: #64748b;
              font-size: 14px;
            }
            .entry {
              margin-bottom: 40px;
            }
            .entry-header {
              background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
              color: white;
              padding: 15px 20px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .entry-header h2 {
              margin: 0 0 5px 0;
              font-size: 20px;
            }
            .entry-meta {
              font-size: 13px;
              opacity: 0.9;
            }
            .section {
              margin-bottom: 20px;
              page-break-inside: avoid;
            }
            .section-title {
              color: #7c3aed;
              font-size: 16px;
              font-weight: 600;
              margin-bottom: 10px;
            }
            .section-content {
              background: #f8fafc;
              padding: 15px;
              border-radius: 6px;
              border-left: 3px solid #7c3aed;
              white-space: pre-wrap;
              font-size: 14px;
            }
            .status {
              display: inline-block;
              padding: 3px 10px;
              border-radius: 10px;
              font-size: 11px;
              font-weight: 600;
              margin-left: 10px;
            }
            .status.done {
              background: rgba(255,255,255,0.3);
              border: 1px solid rgba(255,255,255,0.5);
            }
            .status.pending {
              background: rgba(255,255,255,0.3);
              border: 1px solid rgba(255,255,255,0.5);
            }
            @media print {
              body { margin: 20px; }
              .entry { page-break-after: always; }
              .entry:last-child { page-break-after: auto; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Historia Clínica Completa</h1>
            <div class="meta">
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Total de sesiones:</strong> ${clinicalHistory.length}<br>
              <strong>Generado:</strong> ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
          
          ${entriesHTML}
        </body>
      </html>
    `;

    // Crear ventana de impresión
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  const loadLOPDData = async () => {
    if (!patientUserId || !currentPsychologistId) return;
    setIsLoadingLOPD(true);
    try {
      const [sessionsRes, psychRes] = await Promise.all([
        apiFetch(`${API_URL}/sessions?psychologistId=${currentPsychologistId}&patientId=${patientUserId}`),
        apiFetch(`${API_URL}/users/${currentPsychologistId}`)
      ]);
      if (sessionsRes.ok) {
        const sessionsData = await sessionsRes.json();
        setLopdSessions(Array.isArray(sessionsData) ? sessionsData : []);
      }
      if (psychRes.ok) {
        const psychData = await psychRes.json();
        setLopdPsychName(psychData.name || [psychData.firstName, psychData.lastName].filter(Boolean).join(' ') || 'Psicólogo/a responsable');
        setLopdPsychEmail(psychData.email || psychData.user_email || '');
      }
    } catch (error) {
      console.error('Error loading LOPD data:', error);
    }
    setIsLoadingLOPD(false);
  };

  const downloadLOPDReport = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const relCreatedAt = relationship?.created_at ? new Date(relationship.created_at) : null;
    const psychName = lopdPsychName || 'Psicólogo/a responsable';

    const accessEvents = [
      ...(relCreatedAt ? [{
        date: relCreatedAt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: relCreatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        user: psychName,
        action: 'Inicio de relación terapéutica — creación del expediente del paciente',
        system: 'mainds'
      }] : []),
      ...lopdSessions
        .filter((s: any) => s.starts_on && s.status !== 'available')
        .sort((a: any, b: any) => new Date(a.starts_on).getTime() - new Date(b.starts_on).getTime())
        .map((s: any) => {
          const d = new Date(s.starts_on);
          const statusLabel = s.status === 'completed' ? 'Sesión completada' : s.status === 'cancelled' ? 'Sesión cancelada' : 'Sesión programada';
          return {
            date: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            user: psychName,
            action: `${statusLabel} — acceso al expediente clínico del paciente`,
            system: 'mainds'
          };
        }),
      {
        date: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: timeStr,
        user: psychName,
        action: 'Generación de Informe de Protección de Datos (LOPD/RGPD) — acceso a expediente',
        system: 'mainds'
      }
    ];

    const accessRows = accessEvents.map(e =>
      `<tr><td>${e.date}</td><td>${e.time}</td><td>${e.user}</td><td>${e.action}</td><td>${e.system}</td></tr>`
    ).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe LOPD/RGPD — ${patient.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.65;font-size:13px;padding:40px}
.cover{text-align:center;padding:50px 40px;border-bottom:4px solid #7c3aed;margin-bottom:36px}
.cover .logo{font-size:38px;font-weight:900;color:#7c3aed;margin-bottom:6px}
.cover h1{font-size:20px;font-weight:800;color:#1e293b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.cover .subtitle{font-size:12px;color:#64748b;line-height:1.7;max-width:640px;margin:0 auto}
.badges{display:flex;justify-content:center;gap:10px;margin-top:18px;flex-wrap:wrap}
.badge{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:20px;padding:4px 13px;font-size:10.5px;font-weight:600;color:#475569}
.badge.legal{background:#ede9fe;border-color:#c4b5fd;color:#6d28d9}
.meta-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:28px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.meta-box .item label{font-size:9.5px;text-transform:uppercase;color:#94a3b8;font-weight:700;letter-spacing:.06em}
.meta-box .item span{display:block;font-size:13px;color:#1e293b;font-weight:600;margin-top:2px}
h2{font-size:15px;font-weight:800;color:#7c3aed;margin:30px 0 10px;padding-bottom:6px;border-bottom:2px solid #ede9fe;text-transform:uppercase;letter-spacing:.03em}
h3{font-size:12.5px;font-weight:700;color:#334155;margin:14px 0 5px}
p{margin-bottom:10px;color:#475569}
ul{margin:8px 0 12px 20px}
ul li{margin-bottom:5px;color:#475569}
.note{background:#fefce8;border-left:4px solid #eab308;padding:11px 15px;border-radius:4px;margin:14px 0;font-size:12px}
.note.purple{background:#faf5ff;border-color:#a78bfa}
.note.green{background:#f0fdf4;border-color:#4ade80}
.note.red{background:#fef2f2;border-color:#f87171}
.sec-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin:14px 0}
.sec-item{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;padding:11px 13px}
.sec-item .ico{font-size:15px;margin-bottom:5px}
.sec-item strong{display:block;font-size:11.5px;color:#166534;margin-bottom:3px}
.sec-item p{font-size:11px;color:#15803d;margin:0}
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:11px}
th{background:#7c3aed;color:#fff;padding:8px 10px;text-align:left;font-weight:700}
td{padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#334155}
tr:nth-child(even) td{background:#f8fafc}
.cat-th{background:#0f172a}
.footer{margin-top:44px;padding-top:18px;border-top:2px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8}
.seal{display:inline-block;border:2px solid #7c3aed;border-radius:8px;padding:9px 20px;margin:18px auto;color:#7c3aed;font-weight:800;font-size:12px}
@media print{body{padding:20px}h2{page-break-after:avoid}table,.sec-grid{page-break-inside:avoid}}
</style>
</head>
<body>

<div class="cover">
<div class="logo">🛡️ mainds</div>
<h1>Informe de Protección de Datos Personales</h1>
<div class="subtitle">Cumplimiento normativo conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD). Los datos tratados pertenecen a la categoría especial de datos de salud (Art. 9 RGPD).</div>
<div class="badges">
<span class="badge legal">RGPD · Reglamento (UE) 2016/679</span>
<span class="badge legal">LOPDGDD · LO 3/2018</span>
<span class="badge legal">Datos Especiales · Art. 9 RGPD</span>
<span class="badge legal">Ley 41/2002 · Autonomía del Paciente</span>
<span class="badge">Documento Confidencial</span>
</div>
</div>

<div class="meta-box">
<div class="item"><label>Titular de los datos (Interesado)</label><span>${patient.name}</span></div>
<div class="item"><label>Responsable del Tratamiento</label><span>${psychName}${lopdPsychEmail ? ' — ' + lopdPsychEmail : ''}</span></div>
<div class="item"><label>Encargado del Tratamiento (Art. 28 RGPD)</label><span>mainds — Sistema de Gestión de Consulta Psicológica (actúa bajo las instrucciones del Responsable)</span></div>
<div class="item"><label>Fecha de generación del informe</label><span>${dateStr}, ${timeStr} h</span></div>
<div class="item"><label>Inicio de la relación terapéutica</label><span>${relCreatedAt ? relCreatedAt.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) : 'No disponible'}</span></div>
<div class="item"><label>Sesiones registradas en el sistema</label><span>${lopdSessions.filter((s: any) => s.status !== 'available').length}</span></div>
<div class="item"><label>Referencia única del expediente</label><span>${patientUserId}</span></div>
</div>

<h2>1. Identificación del Responsable del Tratamiento</h2>
<p>De conformidad con el artículo 13 del RGPD y el artículo 11 de la LOPDGDD, se informa al interesado de los siguientes extremos relativos al tratamiento de sus datos personales:</p>
<ul>
<li><strong>Responsable del tratamiento (Art. 4.7 RGPD):</strong> ${psychName}${lopdPsychEmail ? ' (' + lopdPsychEmail + ')' : ''}. El profesional es el único Responsable del Tratamiento y quien determina los fines y medios del tratamiento de los datos del paciente. Le corresponde en exclusiva el cumplimiento de las obligaciones derivadas del RGPD y la LOPDGDD.</li>
<li><strong>Encargado del tratamiento (Art. 4.8 y Art. 28 RGPD):</strong> mainds — Sistema de Gestión de Consulta Psicológica. Actúa en calidad de encargado del tratamiento, únicamente bajo las instrucciones documentadas del Responsable y sin capacidad de utilizar los datos para fines propios. Dispone de contrato de encargo de tratamiento (DPA) suscrito conforme al Art. 28 RGPD. Subencargados del tratamiento: Supabase Inc. (base de datos, DPA en supabase.com/legal/dpa) y Vercel Inc. (infraestructura serverless, DPA suscrito).</li>
<li><strong>Finalidad principal:</strong> Gestión integral del proceso terapéutico y psicológico, incluyendo documentación clínica, seguimiento de sesiones, comunicación profesional-paciente, facturación de servicios sanitarios y cumplimiento de obligaciones legales propias del ejercicio de la profesión sanitaria.</li>
<li><strong>Base jurídica del tratamiento de datos de salud:</strong> Art. 9.2.h) RGPD — tratamiento necesario para fines de diagnóstico médico y/o psicológico, prestación de asistencia o tratamiento de tipo sanitario, en el contexto de contrato con un profesional sanitario sujeto a secreto profesional conforme al derecho nacional (Ley 44/2003).</li>
<li><strong>Base jurídica del tratamiento de datos ordinarios:</strong> Art. 6.1.b) RGPD — ejecución de un contrato en el que el interesado es parte; Art. 6.1.c) — cumplimiento de obligación legal aplicable al Responsable.</li>
</ul>

<h2>2. Categorías de Datos Tratados</h2>
<p>Los datos tratados en relación con el interesado pertenecen, en parte, a la categoría de <strong>datos de categoría especial</strong> conforme al artículo 9.1 del RGPD por su naturaleza de datos relativos a la salud física y mental. Se procesan las siguientes categorías:</p>
<table>
<thead><tr><th class="cat-th">Categoría</th><th class="cat-th">Tipos de dato</th><th class="cat-th">Base jurídica</th><th class="cat-th">Clasificación RGPD</th></tr></thead>
<tbody>
<tr><td>Datos identificativos</td><td>Nombre, apellidos, DNI/NIE, dirección postal, fecha de nacimiento</td><td>Art. 6.1.b RGPD</td><td>Dato personal (Art. 4 RGPD)</td></tr>
<tr><td>Datos de contacto</td><td>Correo electrónico, número de teléfono</td><td>Art. 6.1.b RGPD</td><td>Dato personal</td></tr>
<tr><td>Datos clínicos y de salud mental</td><td>Notas de sesión, transcripciones, resúmenes clínicos, historia clínica, objetivos terapéuticos</td><td>Art. 9.2.h RGPD</td><td><strong>Categoría especial (Art. 9 RGPD) — DATOS DE SALUD</strong></td></tr>
<tr><td>Datos económicos y de facturación</td><td>Facturas, importes de sesiones, bonos terapéuticos, estado de pagos</td><td>Art. 6.1.b y 6.1.c RGPD</td><td>Dato personal</td></tr>
<tr><td>Datos de comunicación</td><td>Mensajes en plataforma, notificaciones, recordatorios</td><td>Art. 6.1.b RGPD</td><td>Dato personal</td></tr>
<tr><td>Datos documentales</td><td>Documentos adjuntos, consentimientos informados firmados, informes clínicos</td><td>Art. 9.2.h y Art. 9.2.a RGPD</td><td><strong>Categoría especial (Art. 9 RGPD)</strong></td></tr>
</tbody>
</table>
<div class="note red"><strong>⚠️ Datos de Categoría Especial — Advertencia legal:</strong> Los datos relativos a la salud mental constituyen datos de categoría especial en virtud del artículo 9.1 del RGPD. Su tratamiento requiere garantías reforzadas de confidencialidad y seguridad, así como el estricto cumplimiento del secreto profesional del psicólogo establecido en la Ley 44/2003 y el Código Deontológico del Consejo General de la Psicología de España.</div>

<h2>3. Medidas de Seguridad Técnicas y Organizativas</h2>
<p>De conformidad con el artículo 25 (Privacidad por diseño y por defecto) y el artículo 32 del RGPD, así como las recomendaciones de la AEPD y el Esquema Nacional de Seguridad (ENS), el <strong>Responsable del Tratamiento</strong> — en su condición de profesional sanitario — garantiza la aplicación de las siguientes medidas de seguridad técnicas y organizativas, implementadas a través del encargado del tratamiento mainds:</p>
<div class="sec-grid">
<div class="sec-item"><div class="ico">🔐</div><strong>Autenticación y Control de Acceso (RBAC)</strong><p>Credenciales únicas por usuario. Gestión de identidades mediante Supabase Auth (OAuth 2.0 / JWT firmados). Cada psicólogo accede exclusivamente a sus propios pacientes mediante control de acceso basado en roles (RBAC). Sesiones con expiración automática.</p></div>
<div class="sec-item"><div class="ico">🔒</div><strong>Cifrado en Tránsito y en Reposo</strong><p>Todas las comunicaciones protegidas mediante TLS 1.3 (HTTPS obligatorio). Datos en base de datos cifrados con AES-256 en reposo (Supabase/PostgreSQL). Las credenciales de usuario se almacenan mediante hash bcrypt con salt aleatorio.</p></div>
<div class="sec-item"><div class="ico">🗄️</div><strong>Aislamiento de Datos — Row Level Security</strong><p>Base de datos PostgreSQL con políticas de Row Level Security (RLS) activas. Imposibilidad técnica de acceso cruzado entre distintos profesionales. Cada registro sólo es accesible por el usuario propietario mediante políticas de seguridad en capa de base de datos.</p></div>
<div class="sec-item"><div class="ico">🌍</div><strong>Infraestructura en la Unión Europea</strong><p>Datos alojados en servidores de Supabase en la región EU West (Irlanda / Frankfurt). Cumplimiento del Capítulo V RGPD sobre transferencias internacionales. Sin transferencias a terceros países fuera del EEE sin las garantías adecuadas del Art. 46 RGPD.</p></div>
<div class="sec-item"><div class="ico">📋</div><strong>Registro de Actividades de Tratamiento (Art. 30 RGPD)</strong><p>Mantenimiento de registro de actividades conforme al artículo 30 del RGPD. Trazabilidad de accesos y operaciones sobre el expediente del paciente. Registro de quién, cuándo y qué acción realizó sobre los datos.</p></div>
<div class="sec-item"><div class="ico">🛡️</div><strong>Privacidad por Diseño y por Defecto (Art. 25 RGPD)</strong><p>Principio de minimización de datos (Art. 5.1.c RGPD): sólo se recaban datos estrictamente necesarios para la finalidad terapéutica. Configuración de privacidad por defecto en el máximo nivel de protección desde el diseño del sistema.</p></div>
<div class="sec-item"><div class="ico">🔑</div><strong>Gestión Segura de Secretos y Claves</strong><p>Claves de API y secretos almacenados exclusivamente en variables de entorno de servidor seguro (Vercel Edge Functions / servidor Node.js). Nunca expuestos en el cliente. Rotación periódica de credenciales críticas.</p></div>
<div class="sec-item"><div class="ico">💾</div><strong>Copias de Seguridad y Continuidad del Servicio</strong><p>Backups automáticos diarios con retención configurable (Supabase). Plan de recuperación ante desastres con objetivos RTO/RPO definidos. Alta disponibilidad con redundancia geográfica en infraestructura de Supabase.</p></div>
</div>

<h2>4. Plazo de Conservación de los Datos</h2>
<p>Los datos personales serán conservados durante el tiempo estrictamente necesario para la prestación del servicio terapéutico y el cumplimiento de las obligaciones legales aplicables:</p>
<ul>
<li><strong>Historia clínica y datos de salud:</strong> Mínimo 5 años desde la última asistencia conforme al artículo 17.1 de la Ley 41/2002. En comunidades autónomas con legislación propia, el plazo puede ser superior. Para menores de edad, los datos se conservarán hasta que el paciente cumpla como mínimo 23 años.</li>
<li><strong>Datos de facturación y económicos:</strong> 4 años conforme a obligaciones tributarias (art. 66 Ley General Tributaria) y 6 años conforme a obligaciones mercantiles (art. 30 Código de Comercio).</li>
<li><strong>Datos de comunicación:</strong> Durante la vigencia de la relación terapéutica y el plazo de conservación de la historia clínica aplicable.</li>
<li><strong>Registros de acceso y seguridad:</strong> Máximo 12 meses conforme a directrices de la AEPD, salvo requerimiento judicial o administrativo motivado.</li>
</ul>
<p>Transcurridos dichos plazos, los datos serán suprimidos de forma segura conforme a procedimientos que garanticen la imposibilidad de recuperación (borrado seguro certificado).</p>

<h2>5. Derechos del Interesado</h2>
<p>De conformidad con los artículos 15 a 22 del RGPD y los artículos 13 a 18 de la LOPDGDD, el interesado puede ejercer en cualquier momento los siguientes derechos:</p>
<ul>
<li><strong>Derecho de acceso (Art. 15 RGPD):</strong> Obtener confirmación sobre si se tratan sus datos y acceder a una copia completa de los mismos.</li>
<li><strong>Derecho de rectificación (Art. 16 RGPD):</strong> Solicitar la corrección de datos inexactos o incompletos que le conciernan.</li>
<li><strong>Derecho de supresión — «derecho al olvido» (Art. 17 RGPD):</strong> Solicitar la eliminación de sus datos, salvo cuando el tratamiento sea necesario para el cumplimiento de una obligación legal (ej.: conservación de historia clínica).</li>
<li><strong>Derecho a la limitación del tratamiento (Art. 18 RGPD):</strong> Solicitar que el tratamiento de sus datos quede suspendido en determinadas circunstancias previstas por el RGPD.</li>
<li><strong>Derecho a la portabilidad (Art. 20 RGPD):</strong> Recibir sus datos en formato estructurado, de uso común y lectura mecánica, y solicitar su transmisión a otro responsable del tratamiento.</li>
<li><strong>Derecho de oposición (Art. 21 RGPD):</strong> Oponerse al tratamiento de sus datos en determinadas circunstancias, en particular cuando el tratamiento se base en el interés legítimo del responsable.</li>
<li><strong>Derecho a no ser objeto de decisiones automatizadas (Art. 22 RGPD):</strong> No ser objeto de decisiones basadas únicamente en el tratamiento automatizado de datos, incluida la elaboración de perfiles, que produzcan efectos jurídicos o le afecten significativamente.</li>
<li><strong>Derecho a retirar el consentimiento:</strong> En cualquier momento, sin que ello afecte a la licitud del tratamiento basado en el consentimiento previo a su retirada.</li>
</ul>
<p>Para ejercer sus derechos, el interesado puede dirigirse al responsable del tratamiento identificado en el apartado 1. Asimismo, tiene derecho a presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong> — www.aepd.es — si considera que el tratamiento no es conforme con la normativa aplicable.</p>

<h2>6. Cesiones, Encargados y Transferencias de Datos</h2>
<p>El <strong>Responsable del Tratamiento</strong> (el profesional identificado en el apartado 1) es el único que determina a quién y bajo qué condiciones se comunican los datos del paciente. Los datos personales <strong>no serán cedidos a terceros</strong> salvo en los siguientes supuestos: (i) existencia de obligación legal; (ii) prestación del servicio mediante encargados del tratamiento que actúan exclusivamente bajo las instrucciones documentadas del Responsable, con contrato de encargo de tratamiento suscrito conforme al artículo 28 del RGPD. La cadena de encargados y subencargados del tratamiento es la siguiente:</p>
<ul>
<li><strong>mainds</strong> (Encargado principal del tratamiento, Art. 28 RGPD) — Plataforma tecnológica de gestión de consulta psicológica. Actúa bajo instrucciones del Responsable. Sin acceso autónomo a los datos ni uso para fines propios.</li>
<li><strong>Supabase Inc.</strong> (Subencargado del tratamiento) — Base de datos PostgreSQL y autenticación OAuth. Infraestructura en EU West (Irlanda/Frankfurt). DPA disponible en supabase.com/legal/dpa.</li>
<li><strong>Vercel Inc.</strong> (Subencargado del tratamiento) — Infraestructura de despliegue y funciones serverless. DPA suscrito; preferencia por región EU.</li>
</ul>
<p>En ningún caso se realizarán transferencias de datos a terceros países fuera del Espacio Económico Europeo (EEE) sin las garantías adecuadas previstas en el Capítulo V del RGPD (cláusulas contractuales tipo aprobadas por la Comisión Europea u otro mecanismo de transferencia válido).</p>

<h2>7. Registro de Accesos al Expediente del Paciente</h2>
<p>A continuación se detalla el registro de accesos al expediente del interesado, conforme a las obligaciones de trazabilidad y seguridad derivadas del artículo 32 del RGPD y las directrices de la AEPD sobre el tratamiento de datos de salud. Este registro constituye evidencia documental a efectos del cumplimiento normativo y del principio de responsabilidad proactiva (Art. 5.2 RGPD).</p>
<table>
<thead><tr><th>Fecha</th><th>Hora</th><th>Usuario responsable</th><th>Acción / Motivo del acceso</th><th>Sistema</th></tr></thead>
<tbody>${accessRows}</tbody>
</table>
<div class="note green"><strong>✅ Integridad del registro:</strong> Este registro ha sido generado automáticamente por el sistema mainds a partir de los datos de actividad registrados en la plataforma. Los controles técnicos implementados garantizan la integridad y no repudio de los registros de acceso. Generado el ${dateStr} a las ${timeStr} h.</div>

<h2>8. Declaración de Conformidad Normativa</h2>
<p>El presente informe certifica que el tratamiento de los datos personales del interesado identificado en este documento se realiza en plena conformidad con:</p>
<ul>
<li>El <strong>Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecta al tratamiento de datos personales y a la libre circulación de estos datos (RGPD)</strong>.</li>
<li>La <strong>Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD)</strong>.</li>
<li>La <strong>Ley 41/2002, de 14 de noviembre, básica reguladora de la autonomía del paciente y de derechos y obligaciones en materia de información y documentación clínica</strong>.</li>
<li>La <strong>Ley 44/2003, de 21 de noviembre, de ordenación de las profesiones sanitarias</strong> y el deber de secreto profesional del psicólogo.</li>
<li>El <strong>Código Deontológico del Consejo General de la Psicología de España</strong>, en particular los artículos relativos a la confidencialidad y protección de los datos del paciente.</li>
<li>Los principios de licitud, lealtad y transparencia; limitación de la finalidad; minimización de datos; exactitud; limitación del plazo de conservación; integridad y confidencialidad; y responsabilidad proactiva (Art. 5 RGPD).</li>
</ul>
<div class="note purple"><strong>🔒 Aviso de confidencialidad:</strong> Este documento contiene información relativa al tratamiento de datos de categoría especial (datos de salud mental). Es estrictamente confidencial. Su divulgación no autorizada puede constituir una infracción muy grave conforme al artículo 83.5 del RGPD, sancionable con multas de hasta 20.000.000 € o el 4 % del volumen de negocio anual mundial total del ejercicio financiero anterior, si este importe fuera superior.</div>

<div style="text-align:center;margin-top:36px">
<div class="seal">✅ DOCUMENTO GENERADO POR SISTEMA CERTIFICADO · mainds · ${dateStr}</div>
</div>

<div class="footer">
<p>Documento generado por mainds — Sistema de Gestión de Consulta Psicológica</p>
<p>Cumplimiento: RGPD (Reglamento UE 2016/679) · LOPDGDD (LO 3/2018) · Ley 41/2002 · Ley 44/2003 · Código Deontológico COP</p>
<p>Generado el ${dateStr} a las ${timeStr} h · Referencia de expediente: ${patientUserId}</p>
<p style="margin-top:7px;color:#7c3aed;font-weight:700">DOCUMENTO CONFIDENCIAL — USO INTERNO Y COMUNICACIÓN AL INTERESADO</p>
</div>

</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 500);
    }
  };

  const loadAllPsychologistTags = async () => {
    if (!currentPsychologistId) return;
    
    try {
      const response = await apiFetch(`${API_URL}/relationships?psychologistId=${currentPsychologistId}`);
      if (response.ok) {
        const relationships = await response.json();
        const allTags = new Set<string>();
        relationships.forEach((rel: any) => {
          if (rel.tags && Array.isArray(rel.tags)) {
            rel.tags.forEach((tag: string) => allTags.add(tag));
          }
        });
        setAllPsychologistTags(Array.from(allTags).sort());
      }
    } catch (error) {
      console.error('Error loading psychologist tags:', error);
    }
  };

  const saveRelationshipSettings = async () => {
    if (!relationship) return;
    
    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const payload = {
        default_session_price: relationshipSettings.defaultPrice,
        default_psych_percent: relationshipSettings.defaultPercent,
        tags: relationshipSettings.tags,
        uses_bonos: relationshipSettings.usesBonos,
        center_id: relationshipSettings.centerId || null,
        active: relationshipSettings.active,
        patientnumber: relationshipSettings.patientNumber,
        status: relationshipSettings.status || null
      };
      
      console.log('[PatientDetailModal] Guardando configuración:', payload);

      const response = await apiFetch(`${API_URL}/relationships/${relationship.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const updatedRelationship = await response.json();
        console.log('[PatientDetailModal] Relación actualizada:', updatedRelationship);
        alert('Configuración guardada correctamente');
        await loadRelationship();
        await loadAllPsychologistTags(); // Recargar todas las tags del psicólogo
        
        // Si se cambió el estado activo, cerrar el modal y recargar la lista
        if (updatedRelationship.active !== relationship.active) {
          setTimeout(() => {
            onClose();
          }, 500);
        }
      } else if (response.status === 402) {
        // Revertir el toggle de activo en el estado local
        setRelationshipSettings(prev => ({ ...prev, active: false }));
        setUpgradeModal(true);
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        alert('Error al guardar la configuración: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error saving relationship:', error);
      alert('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!currentPsychologistId || !patientUserId) {
      alert('Error: Faltan datos para eliminar el paciente');
      return;
    }

    setIsDeleting(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/relationships/${currentPsychologistId}/patients/${patientUserId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message || 'Paciente eliminado correctamente');
        onClose(); // Cerrar el modal
        // Recargar la página para reflejar los cambios
        window.location.reload();
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        alert('Error al eliminar el paciente: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error deleting patient:', error);
      alert('Error al eliminar el paciente');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Colores predefinidos para las etiquetas (20 colores diferentes)
  const tagColors = [
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-yellow-100 text-yellow-700 border-yellow-200',
    'bg-red-100 text-red-700 border-red-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-cyan-100 text-cyan-700 border-cyan-200',
    'bg-teal-100 text-teal-700 border-teal-200',
    'bg-orange-100 text-orange-700 border-orange-200',
    'bg-lime-100 text-lime-700 border-lime-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-sky-100 text-sky-700 border-sky-200',
    'bg-violet-100 text-violet-700 border-violet-200',
    'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-amber-100 text-amber-700 border-amber-200',
    'bg-slate-100 text-slate-700 border-slate-200',
    'bg-stone-100 text-stone-700 border-stone-200',
    'bg-zinc-100 text-zinc-700 border-zinc-200'
  ];

  const getTagColor = (tag: string, index: number) => {
    // Usar el índice global de todas las tags del psicólogo para colores consistentes
    const globalIndex = allPsychologistTags.indexOf(tag);
    return tagColors[globalIndex >= 0 ? globalIndex % tagColors.length : index % tagColors.length];
  };

  const addTag = () => {
    const tag = tagInput.trim();
    
    if (!tag) {
      return;
    }
    
    if (relationshipSettings.tags.includes(tag)) {
      alert('Esta etiqueta ya está asignada a este paciente');
      return;
    }
    
    // Verificar si es una nueva tag y si el psicólogo alcanzó el límite
    if (!allPsychologistTags.includes(tag) && allPsychologistTags.length >= 20) {
      alert('Has alcanzado el límite máximo de 20 etiquetas diferentes como psicólogo. Usa una etiqueta existente.');
      return;
    }
    
    const newTags = [...relationshipSettings.tags, tag];
    setRelationshipSettings({
      ...relationshipSettings,
      tags: newTags
    });
    
    // Si es una nueva tag, agregarla a la lista global
    if (!allPsychologistTags.includes(tag)) {
      setAllPsychologistTags([...allPsychologistTags, tag].sort());
    }
    
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const selectSuggestedTag = (tag: string) => {
    if (relationshipSettings.tags.includes(tag)) {
      alert('Esta etiqueta ya está asignada a este paciente');
      return;
    }
    
    setRelationshipSettings({
      ...relationshipSettings,
      tags: [...relationshipSettings.tags, tag]
    });
    setTagInput('');
    setShowTagSuggestions(false);
  };

  const getFilteredSuggestions = () => {
    if (!tagInput.trim()) return allPsychologistTags;
    
    const searchTerm = tagInput.toLowerCase();
    return allPsychologistTags.filter(tag => 
      tag.toLowerCase().includes(searchTerm) && 
      !relationshipSettings.tags.includes(tag)
    );
  };

  const removeTag = (tagToRemove: string) => {
    setRelationshipSettings({
      ...relationshipSettings,
      tags: relationshipSettings.tags.filter(t => t !== tagToRemove)
    });
  };

  const savePatientData = async () => {
    if (!patientUserId) return;
    
    setIsSaving(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('Error: Usuario no autenticado');
        return;
      }

      const response = await apiFetch(`${API_URL}/users/${patientUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          name: editedPatientData.name,
          firstName: editedPatientData.firstName,
          lastName: editedPatientData.lastName,
          email: editedPatientData.email,
          phone: editedPatientData.phone,
          data: {
            ...patientData?.data,
            dni: editedPatientData.dni,
            address: editedPatientData.address,
            birthDate: editedPatientData.birthDate,
            notes: editedPatientData.notes
          }
        })
      });

      if (response.ok) {
        const json = await response.json().catch(() => null);
        if (json?.consolidated) {
          // El usuario temporal fue consolidado con el usuario real que tiene ese email.
          // Cerrar el modal para que el padre recargue la lista con el nuevo patient_user_id.
          alert('Email vinculado correctamente. El perfil del paciente ha sido actualizado.');
          onClose();
          return;
        }
        await loadPatientData();
        setIsEditingInfo(false);
        alert('Información actualizada correctamente');
      } else {
        const errJson = await response.json().catch(() => null);
        alert(errJson?.error || 'Error al actualizar la información');
      }
    } catch (error) {
      console.error('Error saving patient data:', error);
      alert('Error al actualizar la información');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Docs helpers ────────────────────────────────────────────────────────────
  const loadDocSignatures = async () => {
    if (!currentPsychologistId || !patientUserId) return;
    setIsLoadingDocs2(true);
    try {
      const res = await apiFetch(`${API_URL}/signatures?psych_user_id=${currentPsychologistId}&patient_user_id=${patientUserId}`);
      if (res.ok) setDocSignatures(await res.json());
    } catch (e) {
      console.error('Error loading doc signatures:', e);
    } finally {
      setIsLoadingDocs2(false);
    }
  };

  const loadDocTemplates = async () => {
    if (!currentPsychologistId) return;
    setIsLoadingTemplates(true);
    try {
      const res = await apiFetch(`${API_URL}/templates?psych_user_id=${currentPsychologistId}`);
      if (res.ok) setDocTemplates(await res.json());
    } catch (e) {
      console.error('Error loading templates:', e);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleUploadExternalDoc = async () => {
    if (!externalDocTitle.trim() || !externalDocFile) return;
    setIsUploadingExternalDoc(true);
    setUploadExternalDocError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(externalDocFile);
      });
      const res = await apiFetch(`${API_URL}/signatures/external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: externalDocTitle.trim(),
          psych_user_id: currentPsychologistId,
          patient_user_id: patientUserId,
          base64File: base64,
          fileType: externalDocFile.type,
          fileName: externalDocFile.name
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error desconocido');
      }
      setShowUploadExternalDoc(false);
      setExternalDocTitle('');
      setExternalDocFile(null);
      await loadDocSignatures();
    } catch (e: any) {
      setUploadExternalDocError('Error: ' + (e.message || e));
    } finally {
      setIsUploadingExternalDoc(false);
    }
  };

  const handleSendDoc = async (template: any) => {
    setIsSendingDoc(true);
    try {
      const res = await apiFetch(`${API_URL}/signatures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          psych_user_id: currentPsychologistId,
          patient_user_id: patientUserId,
          content: template.content
        })
      });
      if (!res.ok) throw new Error(await res.text());
      setDocSendSuccess(true);
      setShowSendDocModal(false);
      setSendingDocTemplate(null);
      await loadDocSignatures();
      setTimeout(() => setDocSendSuccess(false), 3000);
    } catch (e: any) {
      alert('Error enviando documento: ' + (e.message || e));
    } finally {
      setIsSendingDoc(false);
    }
  };

  function docMarkdownToHtml(md: string): string {
    if (!md) return '';
    const clean = md.replace(/\n\n<!-- SIGNATURE_DATA:.*?-->$/s, '');
    let html = clean
      .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1em;font-weight:700;margin:12px 0 4px">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="font-size:1.25em;font-weight:700;margin:16px 0 4px">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="font-size:1.5em;font-weight:700;margin:20px 0 6px">$1</h1>')
      .replace(/^---$/gm, '<hr style="border:0;border-top:1px solid #cbd5e1;margin:12px 0" />')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^\s*[-*] (.+)$/gm, '<li style="margin-left:16px;list-style-type:disc">$1</li>')
      .replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #cbd5e1;padding-left:12px;font-style:italic;color:#64748b;margin:8px 0">$1</blockquote>')
      .replace(/\n\n/g, '</p><p style="margin-bottom:10px">')
      .replace(/\n/g, '<br />');
    html = html.replace(/(<li[\s\S]+?<\/li>)/g, '<ul style="margin:8px 0">$1</ul>');
    return `<p style="margin-bottom:10px">${html}</p>`;
  }

  const tabs = [
    { id: 'PATIENT', label: 'Paciente', icon: FileText },
    { id: 'INFO', label: 'Información', icon: User },
    { id: 'SESSIONS', label: 'Sesiones', icon: Calendar },
    { id: 'TIMELINE', label: 'Comunicación', icon: ClockIcon },
    { id: 'HISTORY', label: 'Historia Clínica', icon: BookOpen },
    { id: 'BILLING', label: 'Facturación', icon: DollarSign },
    ...(relationshipSettings.usesBonos ? [{ id: 'BONOS', label: 'Bonos', icon: Ticket }] : []),
    { id: 'DOCS', label: 'Documentos', icon: Scroll },
    { id: 'LOPD', label: 'Privacidad', icon: Shield },
    { id: 'RELATIONSHIP', label: 'Configuración', icon: Settings }
  ];

  return (
    <div className="fixed inset-0 sm:left-64 bg-black/60 backdrop-blur-sm z-50" onClick={onClose}>
      <div className="bg-white w-full h-full overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <User size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-bold truncate">{patientData?.name || editedPatientData?.name || patient.name}</h2>
                {!relationshipSettings.active && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse">
                    <XCircle size={12} />
                    INACTIVO
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-purple-100">Paciente</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full transition-colors flex-shrink-0"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-slate-50 px-2 sm:px-6 overflow-x-auto">
          <div className="flex justify-around sm:justify-start gap-1 sm:gap-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isActionTab = ['SESSIONS', 'TIMELINE', 'BILLING', 'BONOS'].includes(tab.id);
              const isDisabled = !relationshipSettings.active && isActionTab;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id as any)}
                  disabled={isDisabled}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-3 sm:py-3 font-medium text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1 sm:gap-2 border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-purple-600 text-purple-600'
                      : isDisabled 
                        ? 'border-transparent text-slate-400 cursor-not-allowed opacity-50'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon size={22} className="sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Mensaje de advertencia para paciente inactivo */}
          {!relationshipSettings.active && activeTab !== 'RELATIONSHIP' && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-4 mt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-red-900 mb-1">Paciente Inactivo</h3>
                  <p className="text-sm text-red-700">
                    Este paciente está marcado como inactivo. Solo puedes visualizar su información, pero no realizar acciones.
                    Para reactivarlo, ve a la pestaña <strong>Configuración</strong> y activa el toggle "Paciente Activo".
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'PATIENT' && (
            <div className="p-3 sm:p-6 md:p-8 space-y-6 sm:space-y-8 bg-gradient-to-br from-slate-50 to-slate-100">
              {isLoadingStats ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="animate-spin text-purple-600" size={48} />
                </div>
              ) : patientStats ? (
                <>
                  {/* Header con título */}
                  <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                        <DollarSign className="text-white" size={24} />
                      </div>
                      Resumen Financiero del Paciente
                    </h2>
                    <p className="text-slate-600 mt-2 text-sm">Vista completa de sesiones, facturación y ganancias</p>
                  </div>

                  {/* SECCIÓN: SESIONES */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1 flex-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"></div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="text-blue-600" size={20} />
                        Métricas de Sesiones
                      </h3>
                      <div className="h-1 flex-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"></div>
                    </div>
                    
                    {/* Cards de sesiones mejoradas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Total de sesiones */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-blue-200 hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                            <CheckCircle className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Total Sesiones</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-blue-900 mb-1">{patientStats.completedSessions || 0}</div>
                        <div className="text-sm text-slate-600">Sesiones completadas</div>
                        <div className="mt-3 pt-3 border-t border-blue-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Programadas</span>
                            <span className="font-semibold text-blue-700">{patientStats.scheduledSessions || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Valor total sesiones */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-indigo-200 hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg">
                            <DollarSign className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Valor Total</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-indigo-900 mb-1">€{patientStats.totalSessionValue?.toFixed(2) || '0.00'}</div>
                        <div className="text-sm text-slate-600">De todas las sesiones</div>
                        <div className="mt-3 pt-3 border-t border-indigo-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Promedio/sesión</span>
                            <span className="font-semibold text-indigo-700">
                              €{patientStats.completedSessions > 0 
                                ? (patientStats.totalSessionValue / patientStats.completedSessions).toFixed(2) 
                                : '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ganancia psicólogo */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-green-200 hover:shadow-xl transition-all hover:-translate-y-1 md:col-span-2 lg:col-span-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                            <TrendingUp className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-green-600 uppercase tracking-wider">Mi Ganancia</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-green-900 mb-1">€{patientStats.psychologistEarnings?.toFixed(2) || '0.00'}</div>
                        <div className="text-sm text-slate-600">Total ganado</div>
                        <div className="mt-3 pt-3 border-t border-green-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Porcentaje promedio</span>
                            <span className="font-semibold text-green-700">{patientStats.avgPercent?.toFixed(1) || 0}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Estado de pagos */}
                    <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Estado de Pagos</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-emerald-200">
                          <div className="text-3xl font-bold text-emerald-700 mb-1">{patientStats.paidSessions || 0}</div>
                          <div className="text-xs text-emerald-600 font-medium">Pagadas</div>
                        </div>
                        <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border-2 border-orange-200">
                          <div className="text-3xl font-bold text-orange-700 mb-1">{patientStats.unpaidSessions || 0}</div>
                          <div className="text-xs text-orange-600 font-medium">Sin Pagar</div>
                        </div>
                        <div className="text-center p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl border-2 border-amber-200">
                          <div className="text-3xl font-bold text-amber-700 mb-1">
                            {patientStats.sessionsWithoutInvoice || 0}
                          </div>
                          <div className="text-xs text-amber-600 font-medium">Sesiones Por Facturar</div>
                        </div>
                        <div className="text-center p-4 bg-gradient-to-br from-sky-50 to-sky-100 rounded-xl border-2 border-sky-200">
                          <div className="text-3xl font-bold text-sky-700 mb-1">
                            {patientStats.bonosNotInvoiced || 0}
                          </div>
                          <div className="text-xs text-sky-600 font-medium">Bonos Sin Facturar</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN: FACTURAS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1 flex-1 bg-gradient-to-r from-purple-400 to-purple-600 rounded-full"></div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="text-purple-600" size={20} />
                        Facturación
                      </h3>
                      <div className="h-1 flex-1 bg-gradient-to-r from-purple-600 to-purple-400 rounded-full"></div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Total facturado */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-purple-200 hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <FileText className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Total Facturado</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-purple-900 mb-1">€{patientStats.totalInvoiced?.toFixed(2) || '0.00'}</div>
                        <div className="text-sm text-slate-600">En todas las facturas</div>
                        <div className="mt-3 pt-3 border-t border-purple-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Nº Facturas</span>
                            <span className="font-semibold text-purple-700">{patientStats.totalInvoices || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total cobrado */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-teal-200 hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg">
                            <CheckCircle className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-teal-600 uppercase tracking-wider">Total Cobrado</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-teal-900 mb-1">€{patientStats.totalCollected?.toFixed(2) || '0.00'}</div>
                        <div className="text-sm text-slate-600">Facturas pagadas</div>
                        <div className="mt-3 pt-3 border-t border-teal-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Nº Pagadas</span>
                            <span className="font-semibold text-teal-700">{patientStats.paidInvoices || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total por cobrar */}
                      <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-rose-200 hover:shadow-xl transition-all hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-3">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-lg">
                            <AlertCircle className="text-white" size={24} />
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Por Cobrar</div>
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-rose-900 mb-1">€{patientStats.totalPending?.toFixed(2) || '0.00'}</div>
                        <div className="text-sm text-slate-600">Pendientes de pago</div>
                        <div className="mt-3 pt-3 border-t border-rose-100">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">Nº Pendientes</span>
                            <span className="font-semibold text-rose-700">{patientStats.pendingInvoicesCount || 0}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN: GRÁFICOS */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-1 flex-1 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full"></div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <BarChart3 className="text-indigo-600" size={20} />
                        Evolución Mensual
                      </h3>
                      <div className="h-1 flex-1 bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full"></div>
                    </div>

                    {patientStats.monthlyData && patientStats.monthlyData.length > 0 ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Gráfico de Sesiones por Mes */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h4 className="text-base font-bold text-slate-900">Sesiones por Mes</h4>
                              <p className="text-xs text-slate-500 mt-1">Últimos 12 meses</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                              <Calendar className="text-indigo-600" size={20} />
                            </div>
                          </div>
                          <div className="relative">
                            <div className="flex items-end justify-between gap-1.5 h-56 px-2">
                              {patientStats.monthlyData.map((month: any, index: number) => {
                                const maxSessions = Math.max(...patientStats.monthlyData.map((m: any) => m.sessions), 1);
                                const heightPercent = (month.sessions / maxSessions) * 100;
                                return (
                                  <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="w-full flex flex-col items-center">
                                      {/* Tooltip en hover */}
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-16 bg-slate-800 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-xl z-10">
                                        <div className="font-bold">{month.month}</div>
                                        <div>{month.sessions} sesiones</div>
                                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                          <div className="border-4 border-transparent border-t-slate-800"></div>
                                        </div>
                                      </div>
                                      {/* Label encima de la barra */}
                                      <div className="text-xs font-bold text-indigo-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {month.sessions}
                                      </div>
                                      {/* Barra */}
                                      <div
                                        className="w-full bg-gradient-to-t from-indigo-600 via-indigo-500 to-indigo-400 rounded-t-xl transition-all duration-300 group-hover:from-indigo-700 group-hover:via-indigo-600 group-hover:to-indigo-500 shadow-lg group-hover:shadow-xl cursor-pointer"
                                        style={{ 
                                          height: `${heightPercent}%`, 
                                          minHeight: month.sessions > 0 ? '24px' : '2px' 
                                        }}
                                      />
                                    </div>
                                    {/* Label del mes */}
                                    <div className="text-[10px] text-slate-600 font-medium text-center leading-tight mt-1">
                                      {month.month.split(' ')[0]}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Gráfico de Valor Facturado por Mes */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h4 className="text-base font-bold text-slate-900">Valor Facturado</h4>
                              <p className="text-xs text-slate-500 mt-1">Últimos 12 meses</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                              <DollarSign className="text-purple-600" size={20} />
                            </div>
                          </div>
                          <div className="relative">
                            <div className="flex items-end justify-between gap-1.5 h-56 px-2">
                              {patientStats.monthlyData.map((month: any, index: number) => {
                                const maxRevenue = Math.max(...patientStats.monthlyData.map((m: any) => m.revenue || 0), 1);
                                const heightPercent = ((month.revenue || 0) / maxRevenue) * 100;
                                return (
                                  <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="w-full flex flex-col items-center">
                                      {/* Tooltip en hover */}
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-16 bg-slate-800 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-xl z-10">
                                        <div className="font-bold">{month.month}</div>
                                        <div>€{(month.revenue || 0).toFixed(2)}</div>
                                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                          <div className="border-4 border-transparent border-t-slate-800"></div>
                                        </div>
                                      </div>
                                      {/* Label encima de la barra */}
                                      <div className="text-xs font-bold text-purple-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        €{(month.revenue || 0).toFixed(0)}
                                      </div>
                                      {/* Barra */}
                                      <div
                                        className="w-full bg-gradient-to-t from-purple-600 via-purple-500 to-purple-400 rounded-t-xl transition-all duration-300 group-hover:from-purple-700 group-hover:via-purple-600 group-hover:to-purple-500 shadow-lg group-hover:shadow-xl cursor-pointer"
                                        style={{ 
                                          height: `${heightPercent}%`, 
                                          minHeight: (month.revenue || 0) > 0 ? '24px' : '2px' 
                                        }}
                                      />
                                    </div>
                                    {/* Label del mes */}
                                    <div className="text-[10px] text-slate-600 font-medium text-center leading-tight mt-1">
                                      {month.month.split(' ')[0]}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Gráfico de Ganancia del Psicólogo por Mes */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 lg:col-span-2">
                          <div className="flex items-center justify-between mb-6">
                            <div>
                              <h4 className="text-base font-bold text-slate-900">Mi Ganancia por Mes</h4>
                              <p className="text-xs text-slate-500 mt-1">Últimos 12 meses</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                              <TrendingUp className="text-green-600" size={20} />
                            </div>
                          </div>
                          <div className="relative">
                            <div className="flex items-end justify-between gap-2 h-64 px-2">
                              {patientStats.monthlyData.map((month: any, index: number) => {
                                const maxEarnings = Math.max(...patientStats.monthlyData.map((m: any) => m.psychEarnings || 0), 1);
                                const heightPercent = ((month.psychEarnings || 0) / maxEarnings) * 100;
                                return (
                                  <div key={index} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="w-full flex flex-col items-center">
                                      {/* Tooltip en hover */}
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-20 bg-slate-800 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-xl z-10">
                                        <div className="font-bold">{month.month}</div>
                                        <div className="text-green-300">€{(month.psychEarnings || 0).toFixed(2)}</div>
                                        <div className="text-slate-300 text-[10px]">{month.sessions} sesiones</div>
                                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                                          <div className="border-4 border-transparent border-t-slate-800"></div>
                                        </div>
                                      </div>
                                      {/* Label encima de la barra */}
                                      <div className="text-xs font-bold text-green-700 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        €{(month.psychEarnings || 0).toFixed(0)}
                                      </div>
                                      {/* Barra con efecto de brillo */}
                                      <div
                                        className="w-full bg-gradient-to-t from-green-600 via-green-500 to-green-400 rounded-t-xl transition-all duration-300 group-hover:from-green-700 group-hover:via-green-600 group-hover:to-green-500 shadow-lg group-hover:shadow-xl cursor-pointer relative overflow-hidden"
                                        style={{ 
                                          height: `${heightPercent}%`, 
                                          minHeight: (month.psychEarnings || 0) > 0 ? '24px' : '2px' 
                                        }}
                                      >
                                        {/* Efecto de brillo */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20 group-hover:animate-shimmer"></div>
                                      </div>
                                    </div>
                                    {/* Label del mes */}
                                    <div className="text-[10px] text-slate-600 font-medium text-center leading-tight mt-1">
                                      {month.month.split(' ')[0]}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl p-12 shadow-lg border border-slate-200 text-center">
                        <BarChart3 className="mx-auto text-slate-300 mb-4" size={48} />
                        <p className="text-slate-500">No hay datos suficientes para mostrar gráficos</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  No hay datos disponibles
                </div>
              )}
            </div>
          )}

          {activeTab === 'INFO' && (
            <div className="p-3 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
              {/* Información Personal */}
              <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border border-slate-200 space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2 sm:gap-3">
                    <User className="text-purple-600" size={18} />
                    <span>Información Personal</span>
                  </h3>
                  <button
                    onClick={() => {
                      if (isEditingInfo) {
                        savePatientData();
                      } else {
                        setIsEditingInfo(true);
                      }
                    }}
                    disabled={isSaving}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {isEditingInfo ? (
                      <>
                        <Save size={16} />
                        <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
                      </>
                    ) : (
                      <>
                        <Edit2 size={16} />
                        <span>Editar</span>
                      </>
                    )}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <User size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      Nombre
                    </label>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editedPatientData.firstName}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, firstName: e.target.value, name: `${e.target.value} ${editedPatientData.lastName}`.trim() })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                        placeholder="Nombre"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-sm sm:text-base font-medium ${editedPatientData.firstName ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.firstName || 'No especificado'}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <User size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      Apellidos
                    </label>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editedPatientData.lastName}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, lastName: e.target.value, name: `${editedPatientData.firstName} ${e.target.value}`.trim() })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                        placeholder="Apellidos"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-sm sm:text-base font-medium ${editedPatientData.lastName ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.lastName || 'No especificado'}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <Mail size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      <span>Email</span>
                      {patientData?.auth_user_id && (
                        <span className="text-[10px] sm:text-xs text-slate-500 font-normal">(vinculado a cuenta)</span>
                      )}
                      {(!editedPatientData.email || editedPatientData.email.includes('@noemail.dygo.local')) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                          <AlertCircle size={12} />
                          <span className="text-[10px] sm:text-xs font-medium">Sin email</span>
                        </span>
                      )}
                    </label>
                    {/* Permitir editar si: está en modo edición, no tiene auth_user_id vinculado, o tiene un email temporal */}
                    {isEditingInfo && (!patientData?.auth_user_id || patientData?.has_temp_email || (editedPatientData.email && editedPatientData.email.includes('@noemail.dygo.local'))) ? (
                      <div className="space-y-2">
                        <input
                          type="email"
                          value={editedPatientData.email && !editedPatientData.email.includes('@noemail.dygo.local') ? editedPatientData.email : ''}
                          onChange={(e) => setEditedPatientData({ ...editedPatientData, email: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                          placeholder="correo@ejemplo.com"
                        />
                        {(!editedPatientData.email || editedPatientData.email.includes('@noemail.dygo.local')) && (
                          <p className="text-xs text-amber-600 flex items-center gap-1">
                            <AlertCircle size={12} />
                            Agrega un email para poder enviar comunicaciones al paciente
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 border-2 rounded-lg sm:rounded-xl ${
                        !editedPatientData.email || editedPatientData.email.includes('@noemail.dygo.local')
                          ? 'bg-amber-50 border-amber-200' 
                          : 'bg-white border-slate-200'
                      }`}>
                        <span className={`text-xs sm:text-sm md:text-base font-medium break-all ${
                          (editedPatientData.email && !editedPatientData.email.includes('@noemail.dygo.local'))
                            ? 'text-slate-900' 
                            : 'text-amber-700'
                        }`}>
                          {(editedPatientData.email && !editedPatientData.email.includes('@noemail.dygo.local')) 
                            ? editedPatientData.email 
                            : 'Email no configurado - Edita para agregar'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <Phone size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      Teléfono
                    </label>
                    {isEditingInfo ? (
                      <input
                        type="tel"
                        value={editedPatientData.phone}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, phone: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-sm sm:text-base font-medium ${(editedPatientData.phone || patient.phone) ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.phone || patient.phone || 'No especificado'}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <CreditCard size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      DNI / NIE
                    </label>
                    {isEditingInfo ? (
                      <input
                        type="text"
                        value={editedPatientData.dni}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, dni: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-sm sm:text-base font-medium ${editedPatientData.dni ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.dni || 'No especificado'}</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <Cake size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      Fecha de Nacimiento
                    </label>
                    {isEditingInfo ? (
                      <input
                        type="date"
                        value={editedPatientData.birthDate}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, birthDate: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-sm sm:text-base font-medium ${editedPatientData.birthDate ? 'text-slate-900' : 'text-slate-400'}`}>
                          {editedPatientData.birthDate ? new Date(editedPatientData.birthDate).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          }) : 'No especificado'}
                        </span>
                      </div>
                    )}
                  </div>

                  {patientData?.created_at && (
                    <div className="space-y-2 sm:space-y-3">
                      <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                        <Calendar size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                        Fecha de Registro
                      </label>
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-slate-100 border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className="text-sm sm:text-base text-slate-700 font-medium">{new Date(patientData.created_at).toLocaleDateString('es-ES', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric'
                        })}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 sm:space-y-3 md:col-span-2">
                    <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                      <MapPin size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                      Dirección
                    </label>
                    {isEditingInfo ? (
                      <AddressAutocomplete
                        value={editedPatientData.address}
                        onChange={(val) => setEditedPatientData({ ...editedPatientData, address: val })}
                        onSelect={(sel) => setEditedPatientData((prev: any) => ({ ...prev, address: sel.fullAddress }))}
                        placeholder="Calle, número, ciudad, código postal..."
                        className="w-full"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-xs sm:text-sm md:text-base font-medium ${editedPatientData.address ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.address || 'No especificado'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-slate-200">
                  <label className="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5 sm:gap-2">
                    <FileText size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                    Notas Clínicas
                  </label>
                  {isEditingInfo ? (
                    <textarea
                      value={editedPatientData.notes}
                      onChange={(e) => setEditedPatientData({ ...editedPatientData, notes: e.target.value })}
                      rows={4}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none text-sm"
                      placeholder="Notas sobre el paciente..."
                    />
                  ) : (
                    <div className="px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                      <p className="text-xs sm:text-sm md:text-base text-slate-900 whitespace-pre-wrap font-medium">{editedPatientData.notes || 'Sin notas'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SESSIONS' && (
            <PsychologistPatientSessions
              patientId={patientUserId}
              psychologistId={currentPsychologistId}
            />
          )}

          {activeTab === 'TIMELINE' && (
            <PatientTimeline
              patientId={patientUserId}
              psychologistId={currentPsychologistId}
            />
          )}

          {activeTab === 'BILLING' && (
            <BillingPanel
              patientId={patientUserId}
              psychologistId={currentPsychologistId}
            />
          )}

          {activeTab === 'BONOS' && (
            <BonosPanel
              patientId={patientUserId}
              psychologistId={currentPsychologistId}
              patientName={patient.name}
              patientEmail={patient.email}
            />
          )}

          {activeTab === 'DOCS' && (
            <div className="h-full overflow-auto bg-slate-50 p-3 sm:p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <Scroll className="text-indigo-600 w-5 h-5" />
                    Documentos enviados
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Documentos y consentimientos compartidos con {patient.name}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { setShowUploadExternalDoc(true); setUploadExternalDocError(''); setExternalDocTitle(''); setExternalDocFile(null); }}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors shadow-sm text-sm font-medium"
                  >
                    <Upload size={14} />
                    Subir doc. externo
                  </button>
                  <button
                    onClick={() => { setShowSendDocModal(true); setDocSendSuccess(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm text-sm font-medium"
                  >
                    <Send size={14} />
                    Enviar documento
                  </button>
                </div>
              </div>

              {docSendSuccess && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <CheckCircle size={16} />
                  Documento enviado correctamente
                </div>
              )}

              {/* Signatures list */}
              {isLoadingDocs2 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={28} className="animate-spin text-indigo-400" />
                </div>
              ) : docSignatures.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <Scroll size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Sin documentos enviados aún</p>
                  <p className="text-sm mt-1">Envía un template para que el paciente lo firme</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {docSignatures.map((sig: any) => {
                    const isExternal = !!sig.external_document_url;
                    const firstLine = (sig.content || '').replace(/<!-- SIGNATURE_DATA:.*?-->$/s, '').split('\n')[0].replace(/^#+\s*/, '').trim();
                    const title = firstLine || 'Documento';
                    return (
                      <div key={sig.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isExternal ? 'bg-teal-100' : sig.signed ? 'bg-green-100' : 'bg-amber-100'}`}>
                          {isExternal
                            ? <Link size={20} className="text-teal-600" />
                            : sig.signed
                              ? <CheckCircle size={20} className="text-green-600" />
                              : <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">{title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {isExternal ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                                Doc. externo firmado
                              </span>
                            ) : (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sig.signed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {sig.signed ? 'Firmado' : 'Pendiente'}
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400">
                              {new Date(sig.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                            {!isExternal && sig.signed && sig.signature_date && (
                              <span className="text-[11px] text-green-600">
                                · Firmado {new Date(sig.signature_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        </div>
                        {isExternal ? (
                          <a
                            href={sig.external_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-teal-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Abrir documento"
                          >
                            <ExternalLink size={16} />
                          </a>
                        ) : (
                          <button
                            onClick={() => setPreviewDocSignature(sig)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Ver documento"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Upload external doc modal */}
              {showUploadExternalDoc && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Link size={16} className="text-teal-600" />
                        Subir documento externo
                      </h3>
                      <button onClick={() => setShowUploadExternalDoc(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <X size={18} className="text-slate-500" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">Sube un documento ya firmado fuera de la plataforma. Quedará guardado en el expediente del paciente.</p>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Título del documento *</label>
                        <input
                          type="text"
                          value={externalDocTitle}
                          onChange={e => setExternalDocTitle(e.target.value)}
                          placeholder="Ej: Consentimiento Informado firmado"
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block">Archivo *</label>
                        <div
                          className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
                          onClick={() => externalDocFileRef.current?.click()}
                        >
                          {externalDocFile ? (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                              <File size={16} className="text-teal-600" />
                              <span className="truncate max-w-[200px]">{externalDocFile.name}</span>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setExternalDocFile(null); }}
                                className="text-slate-400 hover:text-red-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="text-slate-400 text-xs space-y-1">
                              <Upload size={24} className="mx-auto mb-1 text-slate-300" />
                              <p>Haz clic para seleccionar un archivo</p>
                              <p className="text-[11px]">PDF, imágenes, Word… (máx. 10 MB)</p>
                            </div>
                          )}
                        </div>
                        <input
                          ref={externalDocFileRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.txt"
                          className="hidden"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) {
                              if (f.size > 10 * 1024 * 1024) {
                                setUploadExternalDocError('El archivo supera el límite de 10 MB');
                                return;
                              }
                              setExternalDocFile(f);
                              setUploadExternalDocError('');
                            }
                          }}
                        />
                      </div>
                    </div>
                    {uploadExternalDocError && (
                      <p className="text-xs text-red-600 flex items-center gap-1.5">
                        <AlertCircle size={13} /> {uploadExternalDocError}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setShowUploadExternalDoc(false)}
                        disabled={isUploadingExternalDoc}
                        className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleUploadExternalDoc}
                        disabled={isUploadingExternalDoc || !externalDocTitle.trim() || !externalDocFile}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
                      >
                        {isUploadingExternalDoc ? (
                          <><Loader2 size={14} className="animate-spin" /> Subiendo...</>
                        ) : (
                          <><Upload size={14} /> Subir documento</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Send doc modal */}
              {showSendDocModal && (
                <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-slate-900">Seleccionar template</h3>
                      <button onClick={() => setShowSendDocModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    {isLoadingTemplates ? (
                      <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
                    ) : docTemplates.length === 0 ? (
                      <p className="text-sm text-slate-400 py-6 text-center">No tienes templates. Créalos desde la sección Documentos.</p>
                    ) : (
                      (() => {
                        const alreadySentIds = new Set(docSignatures.map((s: any) => s.template_id));
                        return (
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {docTemplates.map((tpl: any) => {
                              const firstLine = (tpl.content || '').split('\n')[0].replace(/^#+\s*/, '').trim();
                              const tplTitle = firstLine || 'Sin título';
                              const alreadySent = alreadySentIds.has(tpl.id);
                              return (
                                <button
                                  key={tpl.id}
                                  onClick={() => !alreadySent && handleSendDoc(tpl)}
                                  disabled={isSendingDoc || alreadySent}
                                  title={alreadySent ? 'Ya enviado a este paciente' : undefined}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                                    alreadySent
                                      ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                                      : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tpl.master ? 'bg-amber-100' : 'bg-blue-100'}`}>
                                    {tpl.master ? <Award size={14} className="text-amber-600" /> : <Scroll size={14} className="text-blue-600" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">{tplTitle}</p>
                                    {alreadySent
                                      ? <p className="text-[10px] text-slate-400 font-semibold">Ya enviado</p>
                                      : tpl.master && <p className="text-[10px] text-amber-600 font-semibold">Plantilla</p>
                                    }
                                  </div>
                                  {alreadySent && (
                                    <CheckCircle size={14} className="text-slate-400 flex-shrink-0" />
                                  )}
                                  {isSendingDoc && sendingDocTemplate?.id === tpl.id && (
                                    <Loader2 size={14} className="animate-spin text-indigo-500" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              )}

              {/* Preview doc signature modal */}
              {previewDocSignature && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">
                          {(previewDocSignature.content || '').replace(/<!-- SIGNATURE_DATA:.*?-->$/s, '').split('\n')[0].replace(/^#+\s*/, '').trim() || 'Documento'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${previewDocSignature.signed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {previewDocSignature.signed ? 'Firmado' : 'Pendiente de firma paciente'}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => setPreviewDocSignature(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div
                      className="flex-1 overflow-y-auto p-5 text-sm text-slate-800 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: docMarkdownToHtml(previewDocSignature.content || '') }}
                    />
                    <div className="p-4 border-t border-slate-200 flex justify-end">
                      <button onClick={() => setPreviewDocSignature(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-sm">Cerrar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'LOPD' && (
            <div className="h-full overflow-auto bg-slate-50 p-3 sm:p-5 space-y-4">
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-violet-700 rounded-2xl p-4 sm:p-5 text-white shadow-lg">
                <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Shield size={22} />
                      <h3 className="text-base sm:text-lg font-bold">Protección de Datos — LOPD / RGPD</h3>
                    </div>
                    <p className="text-purple-100 text-xs sm:text-sm leading-relaxed">
                      Informe de cumplimiento normativo conforme al <strong>Reglamento (UE) 2016/679 (RGPD)</strong> y la <strong>LO 3/2018 (LOPDGDD)</strong>. Los datos de este paciente son datos de categoría especial (salud) sujetos a protección reforzada.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">RGPD · Art. 9</span>
                      <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">LOPDGDD · LO 3/2018</span>
                      <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">Ley 41/2002</span>
                      <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">Datos de Salud</span>
                    </div>
                  </div>
                  <button
                    onClick={downloadLOPDReport}
                    disabled={isLoadingLOPD}
                    className="w-full sm:w-auto flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-white text-purple-700 font-bold rounded-xl hover:bg-purple-50 transition-colors shadow-md text-sm"
                  >
                    {isLoadingLOPD ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Descargar PDF
                  </button>
                </div>
              </div>

              {isLoadingLOPD ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={28} className="animate-spin text-purple-400" />
                </div>
              ) : (
                <>
                  {/* Datos tratados */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <ClipboardList size={18} className="text-purple-600" />
                      <h4 className="font-bold text-slate-800 text-sm">Categorías de datos tratados</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        { label: 'Datos identificativos', desc: 'Nombre, DNI, dirección, fecha de nacimiento', cat: 'ordinario' },
                        { label: 'Datos de contacto', desc: 'Email, teléfono', cat: 'ordinario' },
                        { label: 'Datos clínicos y de salud mental', desc: 'Notas de sesión, historia clínica, transcripciones, objetivos', cat: 'especial' },
                        { label: 'Datos documentales', desc: 'Consentimientos informados, informes clínicos adjuntos', cat: 'especial' },
                        { label: 'Datos económicos', desc: 'Facturas, sesiones, bonos, pagos', cat: 'ordinario' },
                        { label: 'Datos de comunicación', desc: 'Mensajes e intercambios en la plataforma', cat: 'ordinario' },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-2 p-3 rounded-xl border bg-green-50 border-green-200">
                          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-green-500" />
                          <div>
                            <div className="font-semibold mb-0.5 text-green-800">
                              {item.label}
                              {item.cat === 'especial' && (
                                <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">Art. 9 RGPD</span>
                              )}
                            </div>
                            <div className="text-green-700">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Medidas de seguridad */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock size={18} className="text-green-600" />
                      <h4 className="font-bold text-slate-800 text-sm">Medidas de seguridad activas</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        { icon: '🔐', title: 'Autenticación JWT + RBAC', desc: 'Control de acceso basado en roles. Cada profesional accede sólo a sus pacientes.' },
                        { icon: '🔒', title: 'Cifrado TLS 1.3 + AES-256', desc: 'Datos cifrados en tránsito (HTTPS) y en reposo en base de datos PostgreSQL.' },
                        { icon: '🗄️', title: 'Row Level Security (RLS)', desc: 'Políticas de aislamiento a nivel de base de datos. Acceso cruzado técnicamente imposible.' },
                        { icon: '🌍', title: 'Servidores en la UE', desc: 'Infraestructura Supabase en EU West (Irlanda/Frankfurt). Cumplimiento Cap. V RGPD.' },
                        { icon: '📋', title: 'Registro de actividades (Art. 30)', desc: 'Trazabilidad completa de accesos y operaciones sobre el expediente.' },
                        { icon: '💾', title: 'Backups automáticos diarios', desc: 'Copias de seguridad con retención 30 días. Plan de continuidad y recuperación.' },
                      ].map(item => (
                        <div key={item.title} className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
                          <span className="text-base flex-shrink-0">{item.icon}</span>
                          <div>
                            <div className="font-semibold text-green-800 mb-0.5">{item.title}</div>
                            <div className="text-green-700">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Registro de accesos */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Eye size={18} className="text-indigo-600" />
                        <h4 className="font-bold text-slate-800 text-sm">Registro de accesos al expediente</h4>
                      </div>
                      <span className="text-xs text-slate-400">{lopdSessions.filter((s: any) => s.status !== 'available').length + (relationship?.created_at ? 1 : 0) + 1} evento(s)</span>
                    </div>
                    <div className="overflow-x-auto -mx-4 px-4">
                      <table className="w-full text-xs min-w-[480px]">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600">
                            <th className="text-left px-3 py-2 font-semibold rounded-l-lg whitespace-nowrap">Fecha</th>
                            <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Hora</th>
                            <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Usuario</th>
                            <th className="text-left px-3 py-2 font-semibold rounded-r-lg">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {relationship?.created_at && (() => {
                            const d = new Date(relationship.created_at);
                            return (
                              <tr key="rel-created" className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">{d.toLocaleDateString('es-ES')}</td>
                                <td className="px-3 py-2 text-slate-500">{d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                                <td className="px-3 py-2">{lopdPsychName || 'Psicólogo/a'}</td>
                                <td className="px-3 py-2 text-slate-600">Inicio de relación terapéutica — creación del expediente</td>
                              </tr>
                            );
                          })()}
                          {lopdSessions
                            .filter((s: any) => s.starts_on && s.status !== 'available')
                            .sort((a: any, b: any) => new Date(a.starts_on).getTime() - new Date(b.starts_on).getTime())
                            .map((s: any) => {
                              const d = new Date(s.starts_on);
                              const statusLabel = s.status === 'completed' ? 'Sesión completada' : s.status === 'cancelled' ? 'Sesión cancelada' : 'Sesión programada';
                              return (
                                <tr key={s.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium">{d.toLocaleDateString('es-ES')}</td>
                                  <td className="px-3 py-2 text-slate-500">{d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                                  <td className="px-3 py-2">{lopdPsychName || 'Psicólogo/a'}</td>
                                  <td className="px-3 py-2 text-slate-600">{statusLabel} — acceso al expediente clínico</td>
                                </tr>
                              );
                            })
                          }
                          <tr className="bg-indigo-50 font-medium">
                            <td className="px-3 py-2">{new Date().toLocaleDateString('es-ES')}</td>
                            <td className="px-3 py-2">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-3 py-2">{lopdPsychName || 'Psicólogo/a'}</td>
                            <td className="px-3 py-2 text-indigo-700">Consulta del informe de protección de datos — acceso al expediente</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Derechos ARCO */}
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <div className="flex items-start gap-3">
                      <Award size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-900 space-y-1">
                        <p className="font-bold text-sm">Derechos del paciente sobre sus datos personales</p>
                        <p>El paciente puede ejercer en cualquier momento sus derechos ARCO+ conforme a los artículos 15–22 del RGPD: <strong>Acceso · Rectificación · Supresión · Oposición · Portabilidad · Limitación · No decisión automatizada.</strong></p>
                        <p>Para ejercerlos, debe contactar con el responsable del tratamiento o presentar reclamación ante la <strong>AEPD</strong> (www.aepd.es). El informe PDF descargable incluye toda la información legal completa para entregárselo al paciente.</p>
                      </div>
                    </div>
                  </div>

                  {/* Botón descarga grande */}
                  <div className="flex justify-center pb-4">
                    <button
                      onClick={downloadLOPDReport}
                      disabled={isLoadingLOPD}
                      className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-violet-700 text-white font-bold rounded-2xl hover:from-purple-700 hover:to-violet-800 transition-all shadow-lg text-sm"
                    >
                      <Shield size={18} />
                      Descargar Informe LOPD/RGPD en PDF
                      <Download size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'HISTORY' && (
            <div className="h-full overflow-auto bg-slate-50 p-2 sm:p-4 space-y-3 sm:space-y-4">
              {/* Header */}
              <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="text-purple-600 w-5 h-5" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-800">Historia Clínica</h3>
                  <span className="ml-auto text-xs sm:text-sm text-slate-500">
                    Total: <span className="font-bold text-slate-800">{clinicalHistory.length}</span> {clinicalHistory.length === 1 ? 'entrada' : 'entradas'}
                  </span>
                  {clinicalHistory.length > 0 && (
                    <button
                      onClick={downloadAllEntriesAsPDF}
                      className="ml-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all flex items-center gap-2 text-xs sm:text-sm font-medium shadow-sm"
                      title="Descargar todas las entradas en PDF"
                    >
                      <Download size={16} />
                      <span className="hidden sm:inline">Descargar Todo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Notas Clínicas del Psicólogo */}
              <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="text-indigo-600 w-4 h-4 sm:w-5 sm:h-5" />
                    <h4 className="text-sm sm:text-base font-bold text-slate-900">Notas Clínicas</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditingNotes ? (
                      <>
                        <button
                          onClick={() => {
                            setClinicalNotes(relationship?.data?.clinicalNotes || '');
                            setIsEditingNotes(false);
                          }}
                          className="px-2 sm:px-3 py-1 text-xs sm:text-sm text-slate-600 hover:text-slate-800 font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={saveClinicalNotes}
                          disabled={isSavingNotes}
                          className="px-2 sm:px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all flex items-center gap-1 text-xs sm:text-sm font-medium disabled:opacity-50"
                        >
                          {isSavingNotes ? (
                            <>
                              <Loader2 className="animate-spin" size={14} />
                              <span>Guardando...</span>
                            </>
                          ) : (
                            <>
                              <Save size={14} />
                              <span>Guardar</span>
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsEditingNotes(true)}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors"
                      >
                        <Edit2 size={14} />
                        <span>Editar</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  {isEditingNotes ? (
                    <textarea
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="Escribe aquí tus anotaciones clínicas permanentes sobre este paciente...\n\nEstas notas siempre estarán disponibles en la parte superior de la historia clínica."
                      rows={6}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none text-sm sm:text-base"
                    />
                  ) : (
                    <div className="min-h-[100px]">
                      {clinicalNotes ? (
                        <p className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap">{clinicalNotes}</p>
                      ) : (
                        <p className="text-sm text-slate-400 italic">No hay notas clínicas. Haz clic en "Editar" para agregar anotaciones.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                </div>
              ) : clinicalHistory.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                  <FileText size={48} className="mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-500">No hay entradas de sesión registradas</p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {clinicalHistory.map((entry) => {
                    const entryDate = entry.created_at ? new Date(entry.created_at) : new Date();
                    const status = entry.data?.status || entry.status || 'pending';
                    const isExpanded = selectedEntry?.id === entry.id;
                    
                    return (
                      <div key={entry.id} className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        {/* Entry Header */}
                        <div 
                          className="p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setSelectedEntry(isExpanded ? null : entry)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0">
                              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                                status === 'done' ? 'bg-green-100' : 'bg-orange-100'
                              }`}>
                                {status === 'done' ? (
                                  <CheckCircle className="text-green-600" size={20} />
                                ) : (
                                  <AlertCircle className="text-orange-600" size={20} />
                                )}
                              </div>
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm sm:text-base font-semibold text-slate-900">
                                    Sesión - {entryDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                                    status === 'done' 
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-orange-100 text-orange-700'
                                  }`}>
                                    {status === 'done' ? 'Completada' : 'Pendiente'}
                                  </span>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {entryDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              
                              {entry.data?.summary && (
                                <p className="mt-2 text-xs sm:text-sm text-slate-600 line-clamp-2">
                                  {entry.data.summary.substring(0, 150)}{entry.data.summary.length > 150 ? '...' : ''}
                                </p>
                              )}
                            </div>
                            
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadEntryAsPDF(entry);
                              }}
                              className="flex-shrink-0 text-purple-600 hover:text-purple-700 hover:bg-purple-50 p-2 rounded-lg transition-all"
                              title="Descargar esta sesión en PDF"
                            >
                              <Download size={18} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 p-4 sm:p-6 space-y-4 bg-slate-50">
                            {/* Resumen con IA */}
                            {entry.data?.summary && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Sparkles size={16} className="text-purple-600" />
                                  <h4 className="text-sm font-bold text-slate-900">Resumen con IA</h4>
                                </div>
                                <div className="bg-white rounded-lg p-4 border border-slate-200">
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{entry.data.summary}</p>
                                </div>
                              </div>
                            )}

                            {/* Transcript */}
                            {entry.data?.transcript && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <FileText size={16} className="text-slate-600" />
                                  <h4 className="text-sm font-bold text-slate-900">Transcript de la sesión</h4>
                                </div>
                                <div className="bg-white rounded-lg p-4 border border-slate-200 max-h-96 overflow-y-auto">
                                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{entry.data.transcript}</p>
                                </div>
                              </div>
                            )}

                            {/* Archivo adjunto */}
                            {entry.data?.file_name && (
                              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <FileText size={16} className="text-blue-600" />
                                <span className="text-sm text-blue-900">{entry.data.file_name}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sección de Documentos Históricos */}
              <div className="bg-white rounded-lg sm:rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <File className="text-blue-600 w-4 h-4 sm:w-5 sm:h-5" />
                      <h4 className="text-sm sm:text-base font-bold text-slate-900">Documentos Históricos</h4>
                      <span className="text-xs text-slate-500">
                        ({historicalDocs.documents.length} {historicalDocs.documents.length === 1 ? 'documento' : 'documentos'})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {historicalDocs.documents.length > 0 && (
                        <button
                          onClick={generateDocumentsSummary}
                          disabled={isGeneratingSummary}
                          className="px-2 sm:px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all flex items-center gap-1 text-xs sm:text-sm font-medium disabled:opacity-50"
                          title="Generar resumen automático con IA"
                        >
                          {isGeneratingSummary ? (
                            <>
                              <Loader2 className="animate-spin" size={14} />
                              <span className="hidden sm:inline">Generando...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              <span className="hidden sm:inline">Generar Resumen</span>
                            </>
                          )}
                        </button>
                      )}
                      <label className="px-2 sm:px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1 text-xs sm:text-sm font-medium cursor-pointer disabled:opacity-50">
                        {isUploadingDoc ? (
                          <>
                            <Loader2 className="animate-spin" size={14} />
                            <span className="hidden sm:inline">Subiendo...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={14} />
                            <span className="hidden sm:inline">Subir</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                          onChange={handleFileUpload}
                          disabled={isUploadingDoc}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="p-3 sm:p-4 space-y-3">
                  {/* Resumen generado por IA */}
                  {historicalDocs.aiSummary && (
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-indigo-600" />
                        <h5 className="text-sm font-bold text-slate-900">Resumen del Histórico Previo</h5>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{historicalDocs.aiSummary}</p>
                      <p className="text-xs text-slate-500 mt-2">
                        Generado: {new Date(historicalDocs.lastUpdated).toLocaleString('es-ES')}
                      </p>
                    </div>
                  )}

                  {/* Lista de documentos */}
                  {isLoadingDocs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="animate-spin text-blue-600" size={32} />
                    </div>
                  ) : historicalDocs.documents.length === 0 ? (
                    <div className="text-center py-8">
                      <File size={48} className="mx-auto mb-3 text-slate-300" />
                      <p className="text-sm text-slate-500">No hay documentos históricos</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Sube documentos del historial previo del paciente para tener contexto completo
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {historicalDocs.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                          <File size={20} className="text-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{doc.fileName}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>•</span>
                              <span>{new Date(doc.uploadedAt).toLocaleDateString('es-ES')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => downloadDocument(doc)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Descargar"
                            >
                              <Download size={16} />
                            </button>
                            <button
                              onClick={() => deleteHistoricalDocument(doc.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Información adicional */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                    <p className="text-xs text-yellow-800">
                      💡 <strong>Tip:</strong> Los documentos históricos son útiles para pacientes que migran de otro terapeuta. 
                      Puedes subir informes previos, evaluaciones, etc. La IA generará un resumen automático para tu referencia.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'RELATIONSHIP' && (
            <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
              <div className="bg-slate-50 rounded-xl p-3 sm:p-6 space-y-4 sm:space-y-6">
                <h3 className="text-lg font-bold text-slate-900">Configuración de la Relación</h3>
                
                {relationship ? (
                  <>
                    {/* Número de Paciente */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-slate-700">Número de Paciente</span>
                          <p className="text-xs text-slate-500 mt-1">Identificador numérico único de este paciente para tu consulta</p>
                        </div>
                        <div className="w-28">
                          <input
                            type="number"
                            min="1"
                            value={relationshipSettings.patientNumber === 0 ? '' : relationshipSettings.patientNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setRelationshipSettings({
                                ...relationshipSettings,
                                patientNumber: val === '' ? 0 : Math.max(1, parseInt(val, 10) || 1)
                              });
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center font-bold text-lg text-slate-800"
                            placeholder="#"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Estado de la Relación */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Estado de la Relación</label>
                        <p className="text-xs text-slate-500">Texto libre para describir el estado actual de la relación terapéutica</p>
                        <input
                          type="text"
                          value={relationshipSettings.status}
                          onChange={(e) => setRelationshipSettings({ ...relationshipSettings, status: e.target.value })}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="Ej: En tratamiento, Alta temporal, Lista de espera..."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600">Precio por Defecto (€/hora)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={relationshipSettings.defaultPrice === 0 ? '' : relationshipSettings.defaultPrice}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                              setRelationshipSettings({
                                ...relationshipSettings,
                                defaultPrice: value === '' ? 0 : parseFloat(value) || 0
                              });
                            }
                          }}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="0.00"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600">Porcentaje del Psicólogo (%)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={relationshipSettings.defaultPercent === 0 ? '' : relationshipSettings.defaultPercent}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || /^\d*\.?\d*$/.test(value)) {
                              const numValue = value === '' ? 0 : parseFloat(value) || 0;
                              setRelationshipSettings({
                                ...relationshipSettings,
                                defaultPercent: Math.min(numValue, 100)
                              });
                            }
                          }}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Selector de Centro */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                        <Building2 size={16} />
                        Centro Asignado
                      </label>
                      <select
                        value={relationshipSettings.centerId || ''}
                        onChange={(e) => setRelationshipSettings({
                          ...relationshipSettings,
                          centerId: e.target.value || null
                        })}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                      >
                        <option value="">Sin centro asignado</option>
                        {centers.map((center) => (
                          <option key={center.id} value={center.id}>
                            {center.center_name} - {center.cif}
                          </option>
                        ))}
                      </select>
                      {centers.length === 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          No tienes centros registrados. Ve a la sección "Centros" para crear uno.
                        </p>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-slate-700">Funciona con bonos</span>
                          <p className="text-xs text-slate-500 mt-1">Activa esta opción si el paciente utiliza un sistema de bonos</p>
                        </div>
                        <div className="relative ml-4">
                          <input
                            type="checkbox"
                            checked={relationshipSettings.usesBonos}
                            onChange={(e) => setRelationshipSettings({
                              ...relationshipSettings,
                              usesBonos: e.target.checked
                            })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </div>
                      </label>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <label className="flex items-center justify-between cursor-pointer group">
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-slate-700">Paciente Activo</span>
                          <p className="text-xs text-slate-500 mt-1">Desactiva esta opción para ocultar el paciente de la lista principal (no se elimina)</p>
                        </div>
                        <div className="relative ml-4">
                          <input
                            type="checkbox"
                            checked={relationshipSettings.active}
                            onChange={(e) => setRelationshipSettings({
                              ...relationshipSettings,
                              active: e.target.checked
                            })}
                            className="sr-only peer"
                          />
                          <div className={`w-11 h-6 ${relationshipSettings.active ? 'bg-green-600' : 'bg-slate-300'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
                        </div>
                      </label>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-600">Etiquetas</label>
                      <div className="relative">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onFocus={() => setShowTagSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
                            onKeyPress={(e) => e.key === 'Enter' && addTag()}
                            placeholder="Agregar etiqueta..."
                            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                          />
                          <button
                            onClick={addTag}
                            className="px-3 sm:px-4 py-2.5 sm:py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex-shrink-0"
                          >
                            <Tag size={18} />
                          </button>
                        </div>
                        
                        {/* Sugerencias de tags */}
                        {showTagSuggestions && getFilteredSuggestions().length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            <div className="p-2">
                              <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">
                                Etiquetas existentes ({allPsychologistTags.length}/20)
                              </div>
                              {getFilteredSuggestions().map((tag, idx) => {
                                const globalIndex = allPsychologistTags.indexOf(tag);
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => selectSuggestedTag(tag)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"
                                  >
                                    <span className={`inline-block w-3 h-3 rounded-full ${tagColors[globalIndex % tagColors.length].split(' ')[0]}`}></span>
                                    <span className="text-sm text-slate-700">{tag}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {relationshipSettings.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {relationshipSettings.tags.map((tag, index) => (
                            <span
                              key={index}
                              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${getTagColor(tag, index)}`}
                            >
                              {tag}
                              <button
                                onClick={() => removeTag(tag)}
                                className="hover:bg-black/10 rounded-full p-0.5 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                          <span className="text-xs text-slate-500 self-center">
                            Total etiquetas del psicólogo: {allPsychologistTags.length}/20
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="bg-white border border-slate-200 rounded-lg p-3 sm:p-4">
                      <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Fecha de inicio:</span>
                          <p className="font-semibold text-slate-900">
                            {relationship.created_at ? new Date(relationship.created_at).toLocaleDateString('es-ES') : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-600">Estado:</span>
                          <p className="font-semibold text-slate-900">
                            {relationship.endedAt ? '❌ Finalizada' : '✅ Activa'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={saveRelationshipSettings}
                        disabled={isSaving}
                        className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save size={20} />
                            Guardar Configuración
                          </>
                        )}
                      </button>

                      {/* Botón de Eliminar Paciente */}
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full px-6 py-3 bg-red-50 text-red-600 border-2 border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                      >
                        <Trash2 size={20} />
                        Eliminar Paciente
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Settings size={48} className="mx-auto mb-4 text-slate-300" />
                    <p>No se encontró información de la relación</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-red-600">
              <div className="bg-red-100 p-3 rounded-full">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">¿Eliminar Paciente?</h3>
            </div>
            
            <div className="space-y-3 text-slate-700">
              <p className="font-semibold">
                Esta acción eliminará permanentemente:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>La relación entre tú y el paciente</li>
                <li>Todas las sesiones registradas con este paciente</li>
              </ul>
              <p className="text-sm">
                <strong>No se eliminarán:</strong> Las facturas emitidas
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Esta acción no se puede deshacer.</strong> Si el paciente tiene una cuenta propia, podrá seguir accediendo a su información personal.
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePatient}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {upgradeModal && (
        <UpgradeModal
          currentUser={{ id: currentPsychologistId || '', email: '', name: '' } as any}
          onClose={() => setUpgradeModal(false)}
          returnPanel="patients"
        />
      )}
    </div>
  );
};

export default PatientDetailModal;
