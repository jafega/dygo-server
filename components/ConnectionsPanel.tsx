import React, { useEffect, useMemo, useState } from 'react';
import { Invitation, PatientSummary, User } from '../types';
import {
  getPendingInvitationsForEmail,
  acceptInvitation,
  rejectInvitation,
  getPsychologistsForPatient,
  revokeAccess,
  endRelationship,
  getAllPsychologists,
  linkPatientToPsychologist,
  getSentInvitationsForPsychologist,
  getPendingPsychologistInvitationsForEmail,
  getPatientsForPsychologist,
  sendInvitation,
  clearConnectionsCache
} from '../services/storageService';
import { Shield, Loader2, Search, X, UserPlus, UserCheck, Trash2, Mail, Link2, Send } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import UpgradeModal from './UpgradeModal';

interface ConnectionsPanelProps {
  currentUser: User | null;
  onPendingInvitesChange?: (hasPending: boolean) => void;
}

interface SimplePatient {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

const ConnectionsPanel: React.FC<ConnectionsPanelProps> = ({ currentUser, onPendingInvitesChange }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Para PACIENTES
  const [receivedInvitations, setReceivedInvitations] = useState<Invitation[]>([]); // Invitaciones recibidas de psicólogos
  const [sentInvitationsAsPatient, setSentInvitationsAsPatient] = useState<Invitation[]>([]); // Solicitudes enviadas a psicólogos
  const [connectedPsychologists, setConnectedPsychologists] = useState<User[]>([]); // Psicólogos con relación activa

  // Para PSICÓLOGOS
  const [sentInvitationsAsPsych, setSentInvitationsAsPsych] = useState<Invitation[]>([]); // Invitaciones enviadas a pacientes
  const [receivedInvitationsAsPsych, setReceivedInvitationsAsPsych] = useState<Invitation[]>([]); // Solicitudes recibidas de pacientes
  const [connectedPatients, setConnectedPatients] = useState<SimplePatient[]>([]); // Pacientes con relación activa

  const [showDirectory, setShowDirectory] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [allPsychologists, setAllPsychologists] = useState<User[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<boolean>(false);

  useEffect(() => {
    if (!currentUser) return;
    loadConnections();

    // Refresh on stripe return
    const handleStripeSynced = () => loadConnections(false);
    window.addEventListener('mainds:stripe-synced', handleStripeSynced);
    sessionStorage.removeItem('mainds_stripe_return');

    return () => {
      window.removeEventListener('mainds:stripe-synced', handleStripeSynced);
    };
  }, [currentUser?.id]);

  const loadConnections = async (showLoader = true) => {
    if (!currentUser) return;
    
    // Limpiar caché al cargar conexiones para siempre obtener datos frescos
    clearConnectionsCache();
    
    if (showLoader) {
      setIsLoading(true);
    }
    setError('');
    try {
      // Cargar todas las invitaciones
      const allInvitations = await getPendingInvitationsForEmail(currentUser.email, currentUser.id);
      
      // Cargar relaciones activas
      const psychologists = await getPsychologistsForPatient(currentUser.id);
      
      // Categorizar invitaciones para PACIENTE
      // 1. Invitaciones RECIBIDAS: donde el initiatorEmail NO es el mío (psicólogo me invita)
      const receivedAsPatient = allInvitations.filter(inv => {
        const initiatorEmail = (inv.initiatorEmail || '').toLowerCase().trim();
        const myEmail = currentUser.email.toLowerCase().trim();
        return initiatorEmail !== myEmail;
      });
      
      // 2. Solicitudes ENVIADAS: donde el initiatorEmail ES el mío (yo invité al psicólogo)
      const sentAsPatient = allInvitations.filter(inv => {
        const initiatorEmail = (inv.initiatorEmail || '').toLowerCase().trim();
        const myEmail = currentUser.email.toLowerCase().trim();
        return initiatorEmail === myEmail;
      });
      
      setReceivedInvitations(receivedAsPatient);
      setSentInvitationsAsPatient(sentAsPatient);
      setConnectedPsychologists(psychologists);

      if (currentUser.is_psychologist === true) {
        // Para psicólogos, cargar AMBAS:
        // 1. Invitaciones ENVIADAS por mí (donde soy el psicólogo que invitó)
        const sentAsPsych = await getSentInvitationsForPsychologist(currentUser.id, currentUser.email);
        
        // 2. Solicitudes RECIBIDAS (donde me piden como psicólogo)
        const receivedAsPsych = await getPendingPsychologistInvitationsForEmail(currentUser.email);
        
        // 3. Pacientes conectados - usar endpoint directo del backend
        const patientsResponse = await apiFetch(`${API_URL}/psychologist/${currentUser.id}/patients`);
        const patientsData = patientsResponse.ok ? await patientsResponse.json() : [];
        
        setSentInvitationsAsPsych(sentAsPsych);
        setReceivedInvitationsAsPsych(receivedAsPsych);
        setConnectedPatients(patientsData);
        
        onPendingInvitesChange?.(receivedAsPatient.length > 0 || receivedAsPsych.length > 0);
      } else {
        onPendingInvitesChange?.(receivedAsPatient.length > 0);
      }
    } catch (err: any) {
      console.error('Error loading connections', err);
      setError(err?.message || 'No se pudieron cargar las conexiones');
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  };

  const ensureDirectory = async () => {
    if (allPsychologists.length > 0) return;
    setDirectoryLoading(true);
    try {
      const list = await getAllPsychologists(currentUser?.id);
      setAllPsychologists(list);
    } catch (err: any) {
      console.error('Error loading psychologists directory', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo cargar el directorio' });
    } finally {
      setDirectoryLoading(false);
    }
  };

  const handleAcceptInvitation = async (invId: string) => {
    if (!currentUser) return;
    try {
      await acceptInvitation(invId, currentUser.id);
      setToast({ type: 'success', text: 'Conexión aceptada correctamente' });
      await loadConnections();
    } catch (err: any) {
      console.error('Error accepting invitation', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo aceptar la invitación' });
    }
  };

  const handleRejectInvitation = async (invId: string) => {
    try {
      await rejectInvitation(invId);
      setToast({ type: 'success', text: 'Invitación rechazada' });
      await loadConnections();
    } catch (err: any) {
      console.error('Error rejecting invitation', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo rechazar la invitación' });
    }
  };

  const handleRevoke = async (targetUserId: string) => {
    if (!currentUser) return;
    if (!targetUserId) {
      setToast({ type: 'error', text: 'ID de usuario objetivo no válido' });
      return;
    }
    if (!window.confirm('¿Finalizar esta relación? El psicólogo ya no podrá crear nuevas entradas en tu perfil, pero seguirá viendo las entradas que creó anteriormente.')) return;
    try {
      // Necesitamos encontrar la relación real en care_relationships
      // Buscamos en ambas direcciones porque no sabemos quién es el psychologist y quién el patient en la BD
      console.log('[handleRevoke] Finalizando relación', { currentUserId: currentUser.id, targetUserId });
      
      // Intentar finalizar primero asumiendo que currentUser es patient y target es psychologist
      try {
        await endRelationship(targetUserId, currentUser.id);
        console.log('[handleRevoke] ✓ Relación finalizada (target=psychologist, currentUser=patient)');
        setToast({ type: 'success', text: 'Relación finalizada correctamente' });
        await loadConnections();
        return;
      } catch (firstErr: any) {
        console.log('[handleRevoke] Primera dirección falló, intentando inversa...', firstErr.message);
        // Si falla, intentar la dirección inversa
        try {
          await endRelationship(currentUser.id, targetUserId);
          console.log('[handleRevoke] ✓ Relación finalizada (currentUser=psychologist, target=patient)');
          setToast({ type: 'success', text: 'Relación finalizada correctamente' });
          await loadConnections();
          return;
        } catch (secondErr: any) {
          console.error('[handleRevoke] Ambas direcciones fallaron', { firstErr, secondErr });
          throw new Error('Relación no encontrada en la base de datos');
        }
      }
    } catch (err: any) {
      console.error('Error ending relationship', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo finalizar la relación' });
    }
  };

  const handleConnect = async (psychologistId: string) => {
    if (!currentUser) return;
    
    // Buscar el email del psicólogo
    const psychologist = allPsychologists.find(p => p.id === psychologistId);
    if (!psychologist) {
      setToast({ type: 'error', text: 'Psicólogo no encontrado' });
      return;
    }
    
    try {
      // Enviar invitación donde el destinatario es PSYCHOLOGIST y yo soy PATIENT
      await sendInvitation(
        currentUser.id,
        currentUser.email,
        currentUser.name || 'Usuario',
        psychologist.email,
        'PSYCHOLOGIST' // El destinatario será el psicólogo
      );
      setToast({ type: 'success', text: 'Solicitud enviada al psicólogo' });
      setShowDirectory(false);
      await loadConnections();
    } catch (err: any) {
      console.error('Error connecting to psychologist', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo enviar la solicitud' });
    }
  };

  const handleSendInvitation = async () => {
    if (!currentUser) return;
    const targetEmail = inviteEmail.trim();
    if (!targetEmail) {
      setToast({ type: 'error', text: 'Ingresa un correo válido' });
      return;
    }
    
    // Verificar que no se esté invitando a sí mismo
    if (targetEmail.toLowerCase() === currentUser.email.toLowerCase()) {
      setToast({ type: 'error', text: 'No puedes enviarte una invitación a ti mismo' });
      return;
    }
    
    setIsSendingInvite(true);
    try {
      // El usuario actual es PSYCHOLOGIST, así que invita a un paciente
      // El destinatario será PATIENT en esta relación
      await sendInvitation(
        currentUser.id,
        currentUser.email,
        currentUser.name || 'Psicólogo',
        targetEmail,
        'PATIENT' // El destinatario será el paciente
      );
      setToast({ type: 'success', text: 'Invitación enviada correctamente' });
      setInviteEmail('');
      await loadConnections();
    } catch (err: any) {
      console.error('Error sending invitation', err);
      if (err?.status === 402 || err?.error === 'subscription_required' || err?.error === 'patient_limit_reached') {
        setUpgradeModal(true);
      } else {
        setToast({ type: 'error', text: err?.message || 'No se pudo enviar la solicitud' });
      }
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeSentInvitation = async (invId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres revocar esta invitación? Esta acción no se puede deshacer.')) {
      return;
    }
    
    // Actualización optimista: eliminar inmediatamente de la UI
    setSentInvitationsAsPsych(prev => prev.filter(inv => inv.id !== invId));
    setSentInvitationsAsPatient(prev => prev.filter(inv => inv.id !== invId));
    
    try {
      await rejectInvitation(invId);
      setToast({ type: 'success', text: 'Solicitud revocada correctamente' });
      // Recargar para confirmar el estado desde el servidor
      await loadConnections(false);
    } catch (err: any) {
      console.error('Error revoking invitation', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo revocar la solicitud' });
      // Si falla, recargar para restaurar el estado correcto
      await loadConnections();
    }
  };

  const filteredDirectory = useMemo(() => {
    const query = directorySearch.trim().toLowerCase();
    
    // No mostrar resultados hasta que haya al menos 3 caracteres
    if (query.length < 3) {
      return [];
    }
    
    console.log('[ConnectionsPanel] Filtrando directorio. Query:', query);
    console.log('[ConnectionsPanel] Total psicólogos:', allPsychologists.length);
    
    const filtered = allPsychologists.filter(psych => {
      if (psych.id === currentUser?.id) return false;
      const alreadyLinked = connectedPsychologists.some(p => p.id === psych.id);
      if (alreadyLinked) return false;
      
      // Filtrar psicólogos con los que ya tengo una invitación pendiente (recibida o enviada)
      const hasPendingInvitation = [...receivedInvitations, ...sentInvitationsAsPatient].some(inv => {
        const invPsychEmail = inv.psych_user_email || inv.psychologistEmail || '';
        return invPsychEmail.toLowerCase().trim() === psych.email.toLowerCase().trim();
      });
      if (hasPendingInvitation) return false;
      
      // Buscar en nombre y email
      const psychName = (psych.name || '').toLowerCase();
      const psychEmail = (psych.email || psych.user_email || '').toLowerCase();
      
      const matchesName = psychName.includes(query);
      const matchesEmail = psychEmail.includes(query);
      
      console.log('[ConnectionsPanel] Psych:', psych.name, 'Email:', psychEmail, 'Matches:', matchesName || matchesEmail);
      
      return matchesName || matchesEmail;
    });
    
    console.log('[ConnectionsPanel] Resultados filtrados:', filtered.length);
    return filtered;
  }, [allPsychologists, directorySearch, connectedPsychologists, connectedPatients, currentUser?.id, receivedInvitations, sentInvitationsAsPatient]);

  if (!currentUser) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <Loader2 className="mx-auto mb-2 animate-spin text-indigo-600" />
        <p className="text-slate-500 text-sm">Cargando perfil…</p>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6 animate-in fade-in">

      {toast && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.type === 'success' ? '✅' : '⚠️'}
          <span>{toast.text}</span>
          <button className="ml-auto text-xs" onClick={() => setToast(null)}>Cerrar</button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white rounded-lg sm:rounded-2xl border border-slate-200 p-4 sm:p-8 text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-slate-500 text-xs sm:text-sm">Cargando conexiones…</p>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-6">
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between mb-4 sm:mb-6">
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-slate-900">Psicólogos con acceso a tu perfil</h3>
                <p className="text-xs sm:text-sm text-slate-500">Controla quién puede ver tu evolución y encuentra nuevos profesionales.</p>
              </div>
              <button
                onClick={async () => {
                  if (!showDirectory) {
                    await ensureDirectory();
                  }
                  setShowDirectory(!showDirectory);
                }}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg sm:rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2 whitespace-nowrap"
              >
                <Search size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{showDirectory ? 'Cerrar' : 'Buscar profesional'}</span>
                <span className="sm:hidden">{showDirectory ? 'Cerrar' : 'Buscar'}</span>
              </button>
            </div>

            {showDirectory && (
              <div className="mt-2 sm:mt-4 border border-slate-100 rounded-lg sm:rounded-2xl p-2 sm:p-4 bg-slate-50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    placeholder="Escribe al menos 3 letras..."
                    className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 bg-white text-xs sm:text-sm"
                  />
                  <button onClick={() => { setDirectorySearch(''); setShowDirectory(false); }} className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl text-slate-500 hover:bg-white">
                    <X size={14} className="sm:w-4 sm:h-4" />
                  </button>
                </div>
                <div className="mt-2 sm:mt-3 max-h-48 sm:max-h-56 overflow-y-auto space-y-1 sm:space-y-2">
                  {directoryLoading ? (
                    <div className="text-sm text-slate-500 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando directorio…</div>
                  ) : directorySearch.trim().length < 3 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Escribe al menos 3 letras para buscar especialistas</p>
                  ) : filteredDirectory.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No hay especialistas disponibles con ese criterio.</p>
                  ) : filteredDirectory.map(psych => (
                    <div key={psych.id} className="bg-white rounded-lg border border-slate-100 p-2 sm:p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900 text-xs sm:text-sm truncate">{psych.name}</p>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate">{psych.email}</p>
                      </div>
                      <button
                        onClick={() => handleConnect(psych.id)}
                        className="px-3 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1 whitespace-nowrap flex-shrink-0 touch-manipulation"
                        title="Enviar solicitud para que este psicólogo acceda a tu perfil"
                      >
                        <Mail size={14} className="sm:w-3.5 sm:h-3.5" />
                        <span>Solicitar</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invitaciones recibidas de psicólogos */}
            {receivedInvitations.length > 0 && (
              <div className="mt-4 sm:mt-6 pb-4 sm:pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h4 className="text-xs sm:text-sm font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                    <Mail size={12} className="sm:w-3.5 sm:h-3.5" /> Invitaciones Recibidas
                  </h4>
                  <span className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                    {receivedInvitations.length} pendiente{receivedInvitations.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Psicólogos que quieren acceder a tu perfil</p>
                <div className="space-y-3 sm:space-y-3">
                  {receivedInvitations.map(inv => (
                    <div key={inv.id} className="p-3 sm:p-4 rounded-lg sm:rounded-xl border border-amber-100 bg-amber-50/30 flex flex-col gap-3 sm:gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{inv.psychologistName || inv.fromPsychologistName || 'Psicólogo'}</p>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate">{inv.psychologistEmail || inv.initiatorEmail}</p>
                      </div>
                      <div className="flex gap-2 sm:gap-2 flex-shrink-0">
                        <button 
                          onClick={() => handleRejectInvitation(inv.id)} 
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap touch-manipulation"
                        >
                          <X size={14} className="sm:w-3.5 sm:h-3.5" />
                          <span>Rechazar</span>
                        </button>
                        <button 
                          onClick={() => handleAcceptInvitation(inv.id)} 
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2 sm:py-2 rounded-lg sm:rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs sm:text-sm flex items-center justify-center gap-1.5 whitespace-nowrap touch-manipulation"
                        >
                          <UserPlus size={14} className="sm:w-3.5 sm:h-3.5" />
                          <span>Aceptar</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Solicitudes enviadas por mí como paciente */}
            {sentInvitationsAsPatient.length > 0 && (
              <div className="mt-4 sm:mt-6 pb-4 sm:pb-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <h4 className="text-xs sm:text-sm font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                    <Send size={12} className="sm:w-3.5 sm:h-3.5" /> Solicitudes Enviadas
                  </h4>
                  <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                    {sentInvitationsAsPatient.length} pendiente{sentInvitationsAsPatient.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Psicólogos a los que has solicitado acceso</p>
                <div className="space-y-3 sm:space-y-3">
                  {sentInvitationsAsPatient.map(inv => (
                    <div key={inv.id} className="p-3 sm:p-4 rounded-lg sm:rounded-xl border border-blue-100 bg-blue-50/30 flex flex-col gap-3 sm:gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{inv.psychologistName || inv.fromPsychologistName || 'Psicólogo'}</p>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate">{inv.psychologistEmail}</p>
                        <p className="text-[10px] sm:text-xs text-blue-600 mt-0.5">Esperando confirmación</p>
                      </div>
                      <button 
                        onClick={() => handleRevokeSentInvitation(inv.id)} 
                        className="w-full sm:w-auto px-3 sm:px-3 py-2 sm:py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs sm:text-xs flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 touch-manipulation"
                      >
                        <X size={14} className="sm:w-3.5 sm:h-3.5" /> 
                        <span>Cancelar solicitud</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Psicólogos conectados */}
            <div className="mt-4 sm:mt-6">
              <div className="flex items-center justify-between mb-2 sm:mb-4">
                <h4 className="text-xs sm:text-sm font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                  <UserCheck size={12} className="sm:w-3.5 sm:h-3.5" /> Psicólogos Conectados
                </h4>
                <span className="text-[10px] sm:text-xs bg-green-100 text-green-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                  {connectedPsychologists.length} activo{connectedPsychologists.length !== 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Profesionales con acceso autorizado a tu perfil</p>
              {connectedPsychologists.length === 0 ? (
                <p className="text-xs sm:text-sm text-slate-500 py-3 sm:py-4 text-center bg-slate-50 rounded-lg sm:rounded-xl">Aún no has autorizado a ningún especialista.</p>
              ) : (
                <div className="space-y-3 sm:space-y-3">
                  {connectedPsychologists.map(psych => (
                    <div key={psych.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-green-100 bg-green-50/30 rounded-lg sm:rounded-xl p-3 sm:p-4">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{psych.name}</p>
                        <p className="text-[11px] sm:text-xs text-slate-500 truncate">{psych.email}</p>
                      </div>
                      <button 
                        onClick={() => handleRevoke(psych.id)} 
                        className="w-full sm:w-auto px-3 sm:px-3 py-2 sm:py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 text-xs sm:text-xs flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0 touch-manipulation"
                      >
                        <Trash2 size={14} className="sm:w-3.5 sm:h-3.5" /> 
                        <span>Finalizar relación</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {currentUser.is_psychologist === true && (
            <>
              <div className="bg-white rounded-lg sm:rounded-2xl border border-slate-200 p-3 sm:p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between mb-3 sm:mb-6">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-slate-900">Gestión de Pacientes</h3>
                    <p className="text-xs sm:text-sm text-slate-500">Invita y gestiona tus pacientes en mainds.</p>
                  </div>
                </div>

                {/* Invitar pacientes */}
                <div className="mb-3 sm:mb-6 pb-3 sm:pb-6 border-b border-slate-100">
                  <h4 className="text-xs sm:text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                    <UserPlus size={12} className="sm:w-3.5 sm:h-3.5" /> Invitar nuevo paciente
                  </h4>
                  <div className="flex flex-col gap-2 sm:gap-3 md:flex-row">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="correo@paciente.com"
                      className="flex-1 px-2.5 sm:px-4 py-1.5 sm:py-2 border border-slate-300 rounded-lg sm:rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                    <button
                      onClick={handleSendInvitation}
                      disabled={isSendingInvite || !inviteEmail.trim()}
                      className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-xs sm:text-sm font-medium"
                    >
                      {isSendingInvite ? (<Loader2 size={12} className="animate-spin sm:w-4 sm:h-4" />) : (<UserPlus size={12} className="sm:w-4 sm:h-4" />)}
                      <span className="hidden sm:inline">{isSendingInvite ? 'Enviando…' : 'Enviar invitación'}</span>
                      <span className="sm:hidden">{isSendingInvite ? 'Enviando' : 'Invitar'}</span>
                    </button>
                  </div>
                </div>

                {/* Solicitudes recibidas de pacientes */}
                {receivedInvitationsAsPsych.length > 0 && (
                  <div className="mb-3 sm:mb-6 pb-3 sm:pb-6 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-2 sm:mb-4">
                      <h4 className="text-xs sm:text-sm font-bold text-purple-600 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                        <Mail size={12} className="sm:w-3.5 sm:h-3.5" /> Solicitudes de Pacientes
                      </h4>
                      <span className="text-[10px] sm:text-xs bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                        {receivedInvitationsAsPsych.length} pendiente{receivedInvitationsAsPsych.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Pacientes que te han solicitado como psicólogo</p>
                    <div className="space-y-2 sm:space-y-3">
                      {receivedInvitationsAsPsych.map(inv => (
                        <div key={inv.id} className="p-2 sm:p-4 rounded-lg sm:rounded-xl border border-purple-100 bg-purple-50/30 flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{inv.patientName || inv.initiatorEmail}</p>
                            <p className="text-[11px] sm:text-xs text-slate-500 truncate">{inv.patientEmail || inv.initiatorEmail}</p>
                          </div>
                          <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
                            <button 
                              onClick={() => handleRejectInvitation(inv.id)} 
                              className="px-2.5 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-[11px] sm:text-sm flex items-center gap-1 whitespace-nowrap"
                            >
                              <X size={12} className="sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Rechazar</span>
                              <span className="sm:hidden">No</span>
                            </button>
                            <button 
                              onClick={() => handleAcceptInvitation(inv.id)} 
                              className="px-2.5 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl bg-purple-600 text-white hover:bg-purple-700 text-[11px] sm:text-sm flex items-center gap-1 whitespace-nowrap"
                            >
                              <UserPlus size={12} className="sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Aceptar</span>
                              <span className="sm:hidden">Sí</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invitaciones enviadas a pacientes */}
                {sentInvitationsAsPsych.length > 0 && (
                  <div className="mb-3 sm:mb-6 pb-3 sm:pb-6 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-2 sm:mb-4">
                      <h4 className="text-xs sm:text-sm font-bold text-amber-600 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                        <Mail size={12} className="sm:w-3.5 sm:h-3.5" /> Invitaciones Enviadas
                      </h4>
                      <span className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                        {sentInvitationsAsPsych.length} pendiente{sentInvitationsAsPsych.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Pacientes invitados esperando aceptación</p>
                    <div className="space-y-2 sm:space-y-3">
                      {sentInvitationsAsPsych.map(inv => {
                        const patientEmail = inv.patientEmail || inv.toUserEmail;
                        
                        const emailSubject = encodeURIComponent('¡Te invito a usar mainds! 🌱 La herramienta que usamos para tu seguimiento');
                        const emailBody = encodeURIComponent(
`¡Hola! 👋

Te escribo porque quiero invitarte a formar parte de mainds, la plataforma digital que utilizo para acompañar a mis pacientes en su proceso terapéutico.

💡 ¿Por qué es importante que te registres?

mainds es la herramienta que uso diariamente para hacer seguimiento de tu evolución, gestionar objetivos y preparar nuestras sesiones de forma más efectiva. No es solo una aplicación más, ¡es nuestra forma de trabajar juntos entre sesiones!

🌟 ¿Qué puedes hacer en mainds?

📝 Llevar un diario emocional - Registra cómo te sientes día a día, tus pensamientos y experiencias
🎯 Establecer objetivos personalizados - Define metas realistas y sigue tu progreso semana a semana  
📊 Visualizar tu evolución - Gráficos e insights que te ayudan a ver cómo avanzas
💬 Preparar nuestras sesiones - Anota lo que quieres trabajar conmigo antes de cada encuentro
🌙 Acceso 24/7 - Escribe cuando lo necesites, desde cualquier dispositivo
📈 Reportes semanales - Recibe resúmenes automáticos de tu progreso

✨ ¿Cómo empezar? (¡Solo te tomará 2 minutos!)

1️⃣ Entra en https://mi.mainds.app
2️⃣ Regístrate con ESTE email (${patientEmail}) - Es importante que uses este correo para que podamos conectarnos
3️⃣ Acepta el consentimiento informado para que pueda acceder a tus registros
4️⃣ ¡Ya está! Empieza a explorar y a registrar tu día a día

🔒 Tu privacidad es lo primero

Toda tu información está protegida por el secreto profesional y las normativas de protección de datos (RGPD). Tú decides qué compartes y tienes el control total sobre quién accede a tu información.

Créeme, usar mainds marcará una gran diferencia en nuestro trabajo conjunto. Muchos de mis pacientes me comentan que les ayuda a ser más conscientes de sus emociones y a aprovechar mejor las sesiones.

Si tienes cualquier duda sobre cómo registrarte o usar la plataforma, coméntamelo sin problema. ¡Estoy aquí para ayudarte! 😊

Nos vemos pronto,
${currentUser.name || 'Tu psicólogo/a'}
`);
                        const mailtoLink = `mailto:${patientEmail}?subject=${emailSubject}&body=${emailBody}`;

                        return (
                          <div key={inv.id} className="p-2 sm:p-4 rounded-lg sm:rounded-xl border border-amber-100 bg-amber-50/30 flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{patientEmail}</p>
                              <p className="text-[11px] sm:text-xs text-slate-500 truncate">Esperando aceptación</p>
                            </div>
                            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                              <a 
                                href={mailtoLink}
                                className="px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[11px] sm:text-sm flex items-center gap-1 justify-center whitespace-nowrap"
                                title="Enviar email de invitación"
                              >
                                <Mail size={12} className="sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Enviar Email</span>
                                <span className="sm:hidden">Email</span>
                              </a>
                              <button 
                                onClick={() => handleRevokeSentInvitation(inv.id)} 
                                className="px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-[11px] sm:text-sm flex items-center gap-1 justify-center whitespace-nowrap"
                              >
                                <X size={12} className="sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Revocar</span>
                                <span className="sm:hidden">Quitar</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pacientes conectados */}
                <div>
                  <div className="flex items-center justify-between mb-2 sm:mb-4">
                    <h4 className="text-xs sm:text-sm font-bold text-green-700 uppercase tracking-wide flex items-center gap-1.5 sm:gap-2">
                      <UserCheck size={12} className="sm:w-3.5 sm:h-3.5" /> Pacientes Conectados
                    </h4>
                    <span className="text-[10px] sm:text-xs bg-green-100 text-green-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                      {connectedPatients.length} activo{connectedPatients.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mb-2 sm:mb-3">Pacientes con relación de cuidado activa</p>
                  {connectedPatients.length === 0 ? (
                    <p className="text-xs sm:text-sm text-slate-500 py-3 sm:py-4 text-center bg-slate-50 rounded-lg sm:rounded-xl">Aún no tienes pacientes conectados.</p>
                  ) : (
                    <div className="space-y-2 sm:space-y-3">
                      {connectedPatients.map(patient => (
                        <div key={patient.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border border-green-100 bg-green-50/30 rounded-lg sm:rounded-xl p-2 sm:p-4">
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{patient.name}</p>
                            <p className="text-[11px] sm:text-xs text-slate-500 truncate">{patient.email}</p>
                          </div>
                          <button 
                            onClick={() => handleRevoke(patient.id)} 
                            className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 text-[11px] sm:text-xs flex items-center gap-1 whitespace-nowrap flex-shrink-0"
                          >
                            <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" /> 
                            <span className="hidden sm:inline">Finalizar relación</span>
                            <span className="sm:hidden">Finalizar</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>

    {upgradeModal && currentUser && (
      <UpgradeModal
        currentUser={currentUser}
        onClose={() => setUpgradeModal(false)}
        returnPanel="connections"
      />
    )}
    </>
  );
};

export default ConnectionsPanel;
