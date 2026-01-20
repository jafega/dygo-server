import React, { useEffect, useState, useMemo } from 'react';
import { PatientSummary } from '../types';
import { getPatientsForPsychologist } from '../services/storageService';
import { getCurrentUser } from '../services/authService';
import PatientDetailModal from './PatientDetailModal';
import { Users, Clock, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';

const PatientDashboard: React.FC = () => {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showInactive, setShowInactive] = useState(false);

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

  // Las invitaciones y conexiones con pacientes se manejan desde la pestaña Conexiones

  const getRiskColor = (level: string) => {
    switch (level) {
        case 'HIGH': return 'bg-red-50 text-red-700 border-red-200';
        case 'MEDIUM': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
        case 'LOW': return 'bg-green-50 text-green-700 border-green-200';
        default: return 'bg-slate-50 text-slate-700';
    }
  };

  const getSentimentColor = (score: number) => {
      if (score >= 7) return 'text-green-500';
      if (score >= 4) return 'text-yellow-500';
      return 'text-red-500';
  };

  // Solo mostrar loader si no hay pacientes Y no hay modal abierto
  if (isLoading && patients.length === 0 && !selectedPatientId) {
    return <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline-block mr-2"/> Cargando pacientes...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
       {/* Todas las invitaciones y conexiones con pacientes se manejan desde la pestaña Conexiones */}
       
       {/* Toggle para mostrar/ocultar relaciones inactivas */}
       <div className="flex items-center justify-end gap-2 sm:gap-3 bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 border border-slate-200">
         <span className="text-xs sm:text-sm text-slate-600 font-medium">Mostrar inactivos</span>
         <button
           onClick={() => setShowInactive(!showInactive)}
           className={`relative inline-flex items-center h-6 sm:h-7 w-11 sm:w-12 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
             showInactive ? 'bg-indigo-600' : 'bg-slate-300'
           }`}
           aria-label="Toggle mostrar inactivos"
         >
           <span
             className={`inline-block h-4 sm:h-5 w-4 sm:w-5 transform rounded-full bg-white transition-transform ${
               showInactive ? 'translate-x-6 sm:translate-x-7' : 'translate-x-1'
             }`}
           />
         </button>
       </div>
       
       <div className="space-y-3">
          <div className="grid gap-3 sm:gap-4">
            {patients.length === 0 ? (
                <div className="text-center py-10 sm:py-12 bg-white rounded-xl sm:rounded-2xl border border-slate-100 border-dashed">
                    <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-2 sm:mb-3" />
                    <p className="text-sm sm:text-base text-slate-500">No tienes pacientes activos.</p>
                </div>
            ) : (
                patients.map(patient => (
                    <div key={patient.id} onClick={() => setSelectedPatientId(patient.id)} className="border border-slate-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow bg-white cursor-pointer group">
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-2 sm:mb-3 gap-2">
                            <div className="min-w-0 flex-1 flex items-center gap-3">
                                {/* Avatar del paciente */}
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-slate-200">
                                    {patient.avatarUrl ? (
                                        <img src={patient.avatarUrl} alt={patient.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-indigo-700 font-semibold text-base sm:text-lg">
                                            {patient.name?.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h4 className="font-bold text-slate-800 text-base sm:text-lg group-hover:text-indigo-600 transition-colors truncate">{patient.name}</h4>
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                                        <Clock size={10} className="sm:w-3 sm:h-3 shrink-0" /> 
                                        <span className="truncate">Última Act: {patient.lastUpdate}</span>
                                    </div>
                                </div>
                            </div>
                            <span className={`px-2.5 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border ${getRiskColor(patient.riskLevel)} self-start shrink-0 whitespace-nowrap`}>
                                Riesgo {patient.riskLevel}
                            </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 sm:p-3 rounded-lg border border-slate-100 mb-3 sm:mb-4"><p className="text-slate-600 text-xs sm:text-sm leading-relaxed line-clamp-2">{patient.recentSummary}</p></div>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 sm:pt-3">
                            <div className="text-xs sm:text-sm text-slate-500">Bienestar</div>
                            <div className={`font-bold text-base sm:text-lg ${getSentimentColor(patient.averageSentiment)}`}>{patient.averageSentiment}</div>
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
    </div>
  );
};

export default PatientDashboard;