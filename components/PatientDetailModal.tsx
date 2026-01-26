import React, { useState, useEffect } from 'react';
import { X, User, Calendar, Phone, Mail, FileText, DollarSign, Settings, Tag, Trash2, Save, Edit2, CreditCard, MapPin, Cake, Clock as ClockIcon, BookOpen, Sparkles, CheckCircle, AlertCircle, Download, Loader2, Ticket, Building2, TrendingUp, BarChart3 } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';
import InsightsPanel from './InsightsPanel';
import BillingPanel from './BillingPanel';
import PsychologistPatientSessions from './PsychologistPatientSessions';
import PatientTimeline from './PatientTimeline';
import BonosPanel from './BonosPanel';

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
  const [activeTab, setActiveTab] = useState<'PATIENT' | 'INFO' | 'SESSIONS' | 'TIMELINE' | 'BILLING' | 'BONOS' | 'RELATIONSHIP' | 'HISTORY'>('PATIENT');
  const [patientData, setPatientData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);
  const [relationshipSettings, setRelationshipSettings] = useState({
    defaultPrice: 0,
    defaultPercent: 70,
    tags: [] as string[],
    usesBonos: false,
    centerId: '' as string | null
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
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [patientStats, setPatientStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

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
    }
  }, [activeTab, patientUserId]);

  const loadPatientData = async () => {
    if (!patientUserId) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/${patientUserId}`);
      if (response.ok) {
        const data = await response.json();
        setPatientData(data);
        setEditedPatientData({
          name: data.name || patient.name,
          firstName: data.firstName || data.data?.firstName || '',
          lastName: data.lastName || data.data?.lastName || '',
          email: data.email || patient.email,
          phone: data.phone || patient.phone,
          dni: data.data?.dni || '',
          address: data.data?.address || '',
          birthDate: data.data?.birthDate || '',
          notes: data.data?.notes || ''
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
      const response = await fetch(`${API_URL}/relationships?psychologistId=${currentPsychologistId}&patientId=${patientUserId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const rel = data[0];
          console.log('[PatientDetailModal] Relationship loaded:', rel);
          console.log('[PatientDetailModal] uses_bonos:', rel.uses_bonos, 'usesBonos:', rel.usesBonos);
          setRelationship(rel);
          setRelationshipSettings({
            defaultPrice: rel.defaultPrice || rel.default_session_price || 0,
            defaultPercent: rel.defaultPercent || rel.default_psych_percent || 70,
            tags: rel.tags || [],
            usesBonos: rel.usesBonos || rel.uses_bonos || false,
            centerId: rel.centerId || rel.center_id || null
          });
          console.log('[PatientDetailModal] relationshipSettings.usesBonos:', rel.usesBonos || rel.uses_bonos || false);
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
      const response = await fetch(`${API_URL}/centers?psychologistId=${currentPsychologistId}`);
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
      const response = await fetch(`${API_URL}/session-entries?target_user_id=${patientUserId}`);
      if (response.ok) {
        const entries = await response.json();
        // Cargar las sesiones asociadas para obtener las fechas
        const entriesWithDates = await Promise.all(entries.map(async (entry: any) => {
          if (entry.data?.session_id) {
            try {
              const sessionResponse = await fetch(`${API_URL}/sessions/${entry.data.session_id}`);
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
      const response = await fetch(`${API_URL}/patient-stats/${patientUserId}?psychologistId=${currentPsychologistId}`);
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

      const response = await fetch(`${API_URL}/relationships/${relationship.id}`, {
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

  const loadAllPsychologistTags = async () => {
    if (!currentPsychologistId) return;
    
    try {
      const response = await fetch(`${API_URL}/relationships?psychologistId=${currentPsychologistId}`);
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
        center_id: relationshipSettings.centerId || null
      };
      
      console.log('[PatientDetailModal] Guardando configuración:', payload);

      const response = await fetch(`${API_URL}/relationships/${relationship.id}`, {
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

      const response = await fetch(`${API_URL}/users/${patientUserId}`, {
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
        await loadPatientData();
        setIsEditingInfo(false);
        alert('Información actualizada correctamente');
      } else {
        alert('Error al actualizar la información');
      }
    } catch (error) {
      console.error('Error saving patient data:', error);
      alert('Error al actualizar la información');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'PATIENT', label: 'Paciente', icon: FileText },
    { id: 'INFO', label: 'Información', icon: User },
    { id: 'SESSIONS', label: 'Sesiones', icon: Calendar },
    { id: 'TIMELINE', label: 'Timeline', icon: ClockIcon },
    { id: 'HISTORY', label: 'Historia Clínica', icon: BookOpen },
    { id: 'BILLING', label: 'Facturación', icon: DollarSign },
    ...(relationshipSettings.usesBonos ? [{ id: 'BONOS', label: 'Bonos', icon: Ticket }] : []),
    { id: 'RELATIONSHIP', label: 'Configuración', icon: Settings }
  ];

  return (
    <div className="fixed inset-0 sm:left-64 bg-black/60 backdrop-blur-sm z-50">
      <div className="bg-white w-full h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <User size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-xl font-bold truncate">{patient.name}</h2>
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
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 sm:flex-none px-3 sm:px-4 py-3 sm:py-3 font-medium text-xs sm:text-sm flex items-center justify-center sm:justify-start gap-1 sm:gap-2 border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-purple-600 text-purple-600'
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
                            {sessionsWithoutInvoice || 0}
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
                    </label>
                    {isEditingInfo && !patientData?.auth_user_id ? (
                      <input
                        type="email"
                        value={editedPatientData.email}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, email: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-4 bg-white border-2 border-slate-200 rounded-lg sm:rounded-xl">
                        <span className={`text-xs sm:text-sm md:text-base font-medium break-all ${(editedPatientData.email || patient.email) ? 'text-slate-900' : 'text-slate-400'}`}>{editedPatientData.email || patient.email || 'No especificado'}</span>
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
                      <input
                        type="text"
                        value={editedPatientData.address}
                        onChange={(e) => setEditedPatientData({ ...editedPatientData, address: e.target.value })}
                        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white border-2 border-slate-300 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-sm"
                        placeholder="Calle, número, ciudad, código postal..."
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
            </div>
          )}

          {activeTab === 'RELATIONSHIP' && (
            <div className="p-6 space-y-6">
              <div className="bg-slate-50 rounded-xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-slate-900">Configuración de la Relación</h3>
                
                {relationship ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600">Precio por Defecto (€/hora)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={relationshipSettings.defaultPrice}
                          onChange={(e) => setRelationshipSettings({
                            ...relationshipSettings,
                            defaultPrice: parseFloat(e.target.value) || 0
                          })}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-600">Porcentaje del Psicólogo (%)</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={relationshipSettings.defaultPercent}
                          onChange={(e) => setRelationshipSettings({
                            ...relationshipSettings,
                            defaultPercent: parseFloat(e.target.value) || 0
                          })}
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                          <button
                            onClick={addTag}
                            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                          >
                            <Tag size={20} />
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

                    <div className="bg-white border border-slate-200 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
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
    </div>
  );
};

export default PatientDetailModal;
