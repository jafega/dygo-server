import React, { useState, useEffect } from 'react';
import { X, User, Calendar, Phone, Mail, FileText, DollarSign, Settings, Tag, Trash2, Save, Edit2, CreditCard, MapPin, Cake, Clock as ClockIcon, BookOpen, Sparkles, CheckCircle, AlertCircle, Download, Loader2, Ticket } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'INFO' | 'SESSIONS' | 'TIMELINE' | 'BILLING' | 'BONOS' | 'RELATIONSHIP' | 'HISTORY'>('INFO');
  const [patientData, setPatientData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);
  const [relationshipSettings, setRelationshipSettings] = useState({
    defaultPrice: 0,
    defaultPercent: 70,
    tags: [] as string[],
    usesBonos: false
  });
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

  const patientUserId = patient.userId || patient.user_id || patient.id;
  const currentPsychologistId = psychologistId || patient.psychologistId || '';

  useEffect(() => {
    loadPatientData();
    loadRelationship();
    loadAllPsychologistTags();
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
          setRelationship(rel);
          setRelationshipSettings({
            defaultPrice: rel.defaultPrice || rel.default_session_price || 0,
            defaultPercent: rel.defaultPercent || rel.default_psych_percent || 70,
            tags: rel.tags || [],
            usesBonos: rel.usesBonos || rel.uses_bonos || false
          });
          setClinicalNotes(rel.data?.clinicalNotes || '');
        }
      }
    } catch (error) {
      console.error('Error loading relationship:', error);
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

      const response = await fetch(`${API_URL}/relationships/${relationship.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          default_session_price: relationshipSettings.defaultPrice,
          default_psych_percent: relationshipSettings.defaultPercent,
          tags: relationshipSettings.tags,
          uses_bonos: relationshipSettings.usesBonos
        })
      });

      if (response.ok) {
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
