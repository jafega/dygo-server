import React, { useState, useEffect } from 'react';
import { X, User, Calendar, Phone, Mail, FileText, DollarSign, Settings, Tag, Trash2, Save, Edit2, CreditCard, MapPin, Cake, Clock as ClockIcon } from 'lucide-react';
import { API_URL } from '../services/config';
import { getCurrentUser } from '../services/authService';
import InsightsPanel from './InsightsPanel';
import BillingPanel from './BillingPanel';
import PsychologistPatientSessions from './PsychologistPatientSessions';
import PatientTimeline from './PatientTimeline';

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
  const [activeTab, setActiveTab] = useState<'INFO' | 'SESSIONS' | 'TIMELINE' | 'BILLING' | 'RELATIONSHIP'>('INFO');
  const [patientData, setPatientData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [relationship, setRelationship] = useState<any>(null);
  const [relationshipSettings, setRelationshipSettings] = useState({
    defaultPrice: 0,
    defaultPercent: 70,
    tags: [] as string[]
  });
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editedPatientData, setEditedPatientData] = useState<any>({});
  const [allPsychologistTags, setAllPsychologistTags] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  const patientUserId = patient.userId || patient.user_id || patient.id;
  const currentPsychologistId = psychologistId || patient.psychologistId || '';

  useEffect(() => {
    loadPatientData();
    loadRelationship();
    loadAllPsychologistTags();
  }, [patientUserId]);

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
            tags: rel.tags || []
          });
        }
      }
    } catch (error) {
      console.error('Error loading relationship:', error);
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
          tags: relationshipSettings.tags
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
    { id: 'BILLING', label: 'Facturación', icon: DollarSign },
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
                        <span className="text-sm sm:text-base text-slate-900 font-medium">{editedPatientData.firstName || 'No especificado'}</span>
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
                        <span className="text-sm sm:text-base text-slate-900 font-medium">{editedPatientData.lastName || 'No especificado'}</span>
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
                        <span className="text-xs sm:text-sm md:text-base text-slate-900 font-medium break-all">{editedPatientData.email || patient.email || 'No especificado'}</span>
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
                        <span className="text-sm sm:text-base text-slate-900 font-medium">{editedPatientData.phone || patient.phone || 'No especificado'}</span>
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
                        <span className="text-sm sm:text-base text-slate-900 font-medium">{editedPatientData.dni || 'No especificado'}</span>
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
                        <span className="text-sm sm:text-base text-slate-900 font-medium">
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
                        <span className="text-xs sm:text-sm md:text-base text-slate-900 font-medium">{editedPatientData.address || 'No especificado'}</span>
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
