import React, { useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { PatientSummary } from '../types';
import { getPatientsForPsychologist } from '../services/storageService';
import { getCurrentUser } from '../services/authService';
import PatientDetailModal from './PatientDetailModal';
import { Users, Clock, Loader2, ToggleLeft, ToggleRight, Search, Filter, X, UserPlus } from 'lucide-react';
import { API_URL } from '../services/config';

export interface PatientDashboardHandle {
  closeModal: () => void;
}

const PatientDashboard = forwardRef<PatientDashboardHandle>((props, ref) => {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  // Modal de crear paciente
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPatient, setNewPatient] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Mantener referencia al paciente seleccionado incluso si no está en la lista filtrada actual
  const [selectedPatientData, setSelectedPatientData] = useState<PatientSummary | null>(null);
  
  // Buscar el paciente seleccionado por ID (useMemo mantiene referencia estable)
  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) return null;
    const found = patients.find(p => p.id === selectedPatientId);
    // Si se encuentra en la lista actual, actualizar y retornar
    if (found) {
      setSelectedPatientData(found);
      return found;
    }
    // Si no se encuentra pero tenemos datos previos, mantener esos datos
    // Esto previene que el modal se cierre al cambiar filtros o recargar datos
    return selectedPatientData;
  }, [selectedPatientId, patients, selectedPatientData]);

  // Obtener todas las tags únicas de los pacientes
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    patients.forEach(patient => {
      if (patient.tags && Array.isArray(patient.tags)) {
        patient.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet);
  }, [patients]);

  // Filtrar pacientes por búsqueda y tags
  const filteredPatients = useMemo(() => {
    return patients.filter(patient => {
      // Filtro por búsqueda (nombre)
      if (searchTerm) {
        const matchesSearch = patient.name.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
      }
      
      // Filtro por tags
      if (filterTags.length > 0) {
        const patientTags = patient.tags || [];
        const hasMatchingTag = filterTags.some(tag => patientTags.includes(tag));
        if (!hasMatchingTag) return false;
      }
      
      return true;
    });
  }, [patients, searchTerm, filterTags]);

  const loadData = async (showLoader = true) => {
    // Solo mostrar loader si no hay datos previos y se solicita
    if (showLoader && patients.length === 0) {
      setIsLoading(true);
    }
    try {
      const user = await getCurrentUser();
      if (user) {
        setCurrentUser(user);
        const pts = await getPatientsForPsychologist(user.id, showInactive);
        setPatients(pts);
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    // Refrescar cada 30 segundos solo si no hay modal abierto
    const intervalId = setInterval(() => {
      if (!selectedPatientId && document.visibilityState === 'visible') {
        loadData(false);
      }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [selectedPatientId, showInactive]);

  // Exponer método para cerrar el modal desde el componente padre
  useImperativeHandle(ref, () => ({
    closeModal: () => {
      setSelectedPatientId(null);
      setSelectedPatientData(null);
    }
  }));

  // Cerrar modal cuando el componente se desmonta (cambio de vista)
  useEffect(() => {
    return () => {
      if (selectedPatientId) {
        setSelectedPatientId(null);
        setSelectedPatientData(null);
      }
    };
  }, []);

  // Las invitaciones y conexiones con pacientes se manejan desde la pestaña Conexiones

  const getRiskColor = (level: string) => {
    switch (level) {
        case 'HIGH': return 'bg-red-50 text-red-700 border-red-200';
        case 'MEDIUM': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
        case 'LOW': return 'bg-green-50 text-green-700 border-green-200';
        default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  const getSentimentColor = (sentiment: number | undefined) => {
      if (!sentiment || isNaN(sentiment) || sentiment <= 0) return '';
      if (sentiment >= 8) return 'text-green-500';
      if (sentiment >= 6) return 'text-yellow-500';
      if (sentiment >= 4) return 'text-orange-500';
      if (sentiment >= 2) return 'text-red-400';
      return 'text-red-600';
  };

  const handleCreatePatient = async () => {
    if (!newPatient.firstName.trim() || !newPatient.email.trim()) {
      alert('Por favor, completa al menos el nombre y el email');
      return;
    }

    if (!currentUser) {
      alert('Error: Usuario no autenticado');
      return;
    }

    setIsCreating(true);
    try {
      const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim();
      
      const response = await fetch(`${API_URL}/admin/create-patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          name: fullName,
          email: newPatient.email.trim().toLowerCase(),
          phone: newPatient.phone.trim(),
          psychologistId: currentUser.id
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Paciente creado exitosamente: ${result.patient.name}`);
        setShowCreateModal(false);
        setNewPatient({ firstName: '', lastName: '', email: '', phone: '' });
        // Recargar la lista de pacientes
        await loadData();
      } else {
        const error = await response.json();
        alert(`Error al crear paciente: ${error.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error creating patient:', error);
      alert('Error al crear el paciente');
    }
    setIsCreating(false);
  };

  // Solo mostrar loader si no hay pacientes Y no hay modal abierto
  if (isLoading && patients.length === 0 && !selectedPatientId) {
    return <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline-block mr-2"/> Cargando pacientes...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
       {/* Header con botón de crear paciente */}
       <div className="flex justify-between items-center">
         <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Mis Pacientes</h2>
         <button
           onClick={() => setShowCreateModal(true)}
           className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg hover:shadow-indigo-500/30 transition-all"
         >
           <UserPlus size={18} />
           Crear Paciente
         </button>
       </div>

       {/* Todas las invitaciones y conexiones con pacientes se manejan desde la pestaña Conexiones */}
       
       {/* Sección de filtros */}
       <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
         <div className="flex items-center gap-2 mb-4">
           <Filter size={18} className="text-purple-600" />
           <h3 className="text-sm font-bold text-slate-700">Filtros</h3>
         </div>
         
         <div className="space-y-4">
           {/* Buscador */}
           <div className="relative">
             <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input
               type="text"
               placeholder="Buscar paciente por nombre..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full pl-10 pr-10 py-2.5 border-2 border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
             />
             {searchTerm && (
               <button
                 onClick={() => setSearchTerm('')}
                 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
               >
                 <X size={18} />
               </button>
             )}
           </div>

           {/* Filtro por Tags */}
           {allTags.length > 0 && (
             <div>
               <label className="block text-xs font-semibold text-slate-600 mb-2">Tags</label>
               <div className="flex flex-wrap items-center gap-2">
                 {allTags.map(tag => {
                   const isSelected = filterTags.includes(tag);
                   return (
                     <button
                       key={tag}
                       onClick={() => {
                         if (isSelected) {
                           setFilterTags(filterTags.filter(t => t !== tag));
                         } else {
                           setFilterTags([...filterTags, tag]);
                         }
                       }}
                       className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                         isSelected
                           ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700 hover:shadow-lg'
                           : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400'
                       }`}
                     >
                       <span className={isSelected ? 'text-purple-200' : 'text-slate-500'}>🏷️</span>
                       {tag}
                       {isSelected && (
                         <X size={12} className="ml-0.5" />
                       )}
                     </button>
                   );
                 })}
                 {filterTags.length > 0 && (
                   <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-1 rounded-full border border-purple-200">
                     {filterTags.length} seleccionada{filterTags.length !== 1 ? 's' : ''}
                   </span>
                 )}
               </div>
             </div>
           )}

           {/* Toggle de inactivos mejorado */}
           <div className="flex items-center justify-between pt-2 border-t border-slate-200">
             <div className="flex items-center gap-2">
               <Users size={16} className="text-slate-500" />
               <span className="text-sm font-semibold text-slate-700">Mostrar inactivos</span>
             </div>
             <button
               onClick={() => setShowInactive(!showInactive)}
               className={`relative inline-flex items-center h-7 w-12 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                 showInactive ? 'bg-indigo-600' : 'bg-slate-300'
               }`}
               aria-label="Toggle mostrar inactivos"
             >
               <span
                 className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-md ${
                   showInactive ? 'translate-x-6' : 'translate-x-1'
                 }`}
               />
             </button>
           </div>

           {/* Limpiar filtros */}
           {(searchTerm || filterTags.length > 0) && (
             <div className="flex justify-end">
               <button
                 onClick={() => {
                   setSearchTerm('');
                   setFilterTags([]);
                 }}
                 className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 hover:border-red-300 transition-colors"
               >
                 <X size={16} />
                 Limpiar filtros
               </button>
             </div>
           )}
         </div>
       </div>
       
       <div className="space-y-3">
          <div className="grid gap-3 sm:gap-4">
            {filteredPatients.length === 0 ? (
                <div className="text-center py-10 sm:py-12 bg-white rounded-xl sm:rounded-2xl border border-slate-100 border-dashed">
                    <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-2 sm:mb-3" />
                    <p className="text-sm sm:text-base text-slate-500">No tienes pacientes activos.</p>
                </div>
            ) : (
                filteredPatients.map(patient => (
                    <div key={patient.id} onClick={() => setSelectedPatientId(patient.id)} className="border border-slate-200 rounded-lg sm:rounded-xl p-2.5 sm:p-4 hover:shadow-md transition-shadow bg-white cursor-pointer group">
                        <div className="flex justify-between items-start sm:items-center gap-2 sm:gap-3">
                            <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                {/* Avatar del paciente */}
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-slate-200">
                                    {patient.avatarUrl ? (
                                        <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-indigo-700 font-semibold text-sm sm:text-base">
                                            {patient.name?.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-indigo-600 transition-colors truncate">{patient.name}</h4>
                                    <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-xs text-slate-400 mt-0.5">
                                        <Clock size={10} className="shrink-0" /> 
                                        <span className="truncate">{patient.lastUpdate}</span>
                                    </div>
                                    
                                    {/* Tags del paciente */}
                                    {patient.tags && patient.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 sm:gap-1.5 mt-1.5 sm:mt-2">
                                        {patient.tags.map((tag, idx) => (
                                          <span
                                            key={idx}
                                            className="inline-flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[9px] sm:text-[10px] font-medium"
                                          >
                                            🏷️ {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3 shrink-0">
                                <span className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-xs font-bold border ${getRiskColor(patient.riskLevel)} whitespace-nowrap`}>
                                    <span className="hidden sm:inline">Riesgo </span>{patient.riskLevel}
                                </span>
                                {(() => {
                                    const sentiment = patient.averageSentiment;
                                    const isValid = sentiment && !isNaN(sentiment) && sentiment > 0;
                                    const color = getSentimentColor(sentiment);
                                    return isValid && color ? (
                                        <div className={`font-bold text-base sm:text-lg md:text-xl ${color} min-w-[2rem] sm:min-w-[2.5rem] text-right`}>
                                            {sentiment}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        </div>
                    </div>
                ))
            )}
          </div>
       </div>

       {selectedPatient && currentUser && (
         <PatientDetailModal 
           key={selectedPatient.id}
           patient={selectedPatient} 
           onClose={() => {
             setSelectedPatientId(null);
             setSelectedPatientData(null);
           }} 
           psychologistId={currentUser.id}
         />
       )}
       {/* Modal de crear paciente */}
       {showCreateModal && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-2xl font-bold text-slate-800">Crear Nuevo Paciente</h2>
               <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                 <X size={24} />
               </button>
             </div>

             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">
                   Nombre *
                 </label>
                 <input
                   type="text"
                   value={newPatient.firstName}
                   onChange={(e) => setNewPatient({...newPatient, firstName: e.target.value})}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="Juan"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">
                   Apellidos
                 </label>
                 <input
                   type="text"
                   value={newPatient.lastName}
                   onChange={(e) => setNewPatient({...newPatient, lastName: e.target.value})}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="García López"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">
                   Email *
                 </label>
                 <input
                   type="email"
                   value={newPatient.email}
                   onChange={(e) => setNewPatient({...newPatient, email: e.target.value})}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="juan@example.com"
                 />
               </div>

               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">
                   Teléfono
                 </label>
                 <input
                   type="tel"
                   value={newPatient.phone}
                   onChange={(e) => setNewPatient({...newPatient, phone: e.target.value})}
                   className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                   placeholder="+34 600 123 456"
                 />
               </div>
             </div>

             <div className="flex gap-3 mt-6">
               <button
                 onClick={() => setShowCreateModal(false)}
                 className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
               >
                 Cancelar
               </button>
               <button
                 onClick={handleCreatePatient}
                 disabled={isCreating || !newPatient.firstName.trim() || !newPatient.email.trim()}
                 className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
               >
                 {isCreating ? (
                   <>
                     <Loader2 size={18} className="animate-spin" />
                     Creando...
                   </>
                 ) : (
                   'Crear Paciente'
                 )}
               </button>
             </div>
           </div>
         </div>
       )}    </div>
  );
});

export default PatientDashboard;