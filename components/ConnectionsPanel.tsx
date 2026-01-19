import React, { useEffect, useMemo, useState } from 'react';
import { Invitation, PatientSummary, User } from '../types';
import {
  getPendingInvitationsForEmail,
  acceptInvitation,
  rejectInvitation,
  getPsychologistsForPatient,
  revokeAccess,
  getAllPsychologists,
  linkPatientToPsychologist,
  getSentInvitationsForPsychologist,
  getPatientsForPsychologist,
  sendInvitation
} from '../services/storageService';
import { getUserByEmail } from '../services/authService';
import { Shield, Loader2, Search, X, UserPlus, UserCheck, Trash2, Mail, Link2 } from 'lucide-react';

interface ConnectionsPanelProps {
  currentUser: User | null;
  onPendingInvitesChange?: (hasPending: boolean) => void;
}

const ConnectionsPanel: React.FC<ConnectionsPanelProps> = ({ currentUser, onPendingInvitesChange }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Invitation[]>([]);
  const [myPsychologists, setMyPsychologists] = useState<User[]>([]);
  const [myPatients, setMyPatients] = useState<PatientSummary[]>([]);

  const [showDirectory, setShowDirectory] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [allPsychologists, setAllPsychologists] = useState<User[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  
  // Nuevo estado para el modal de información del paciente
  const [showPatientInfoModal, setShowPatientInfoModal] = useState(false);
  const [patientFirstName, setPatientFirstName] = useState('');
  const [patientLastName, setPatientLastName] = useState('');
  const [pendingInviteEmail, setPendingInviteEmail] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    loadConnections();
    
    // Recargar invitaciones cada 10 segundos para detectar cambios en tiempo real
    const interval = setInterval(() => {
      loadConnections(false); // No mostrar loader en recargas automáticas
    }, 10000);
    
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const loadConnections = async (showLoader = true) => {
    if (!currentUser) return;
    if (showLoader) {
      setIsLoading(true);
    }
    setError('');
    try {
      const basePromise = getPsychologistsForPatient(currentUser.id);

      if (currentUser.role === 'PATIENT') {
        const [connected, pending] = await Promise.all([
          basePromise,
          getPendingInvitationsForEmail(currentUser.email)
        ]);
        setMyPsychologists(connected);
        setInvitations(pending);
        onPendingInvitesChange?.(pending.length > 0);
      } else {
        const [connected, sent, patients] = await Promise.all([
          basePromise,
          getSentInvitationsForPsychologist(currentUser.id),
          getPatientsForPsychologist(currentUser.id)
        ]);
        setMyPsychologists(connected);
        setSentInvitations(sent);
        setMyPatients(patients.filter(p => !p.isSelf));
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
      const list = await getAllPsychologists();
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
    if (!window.confirm('¿Revocar acceso?')) return;
    try {
      // Necesitamos encontrar la relación real en care_relationships
      // Buscamos en ambas direcciones porque no sabemos quién es el psychologist y quién el patient en la BD
      console.log('[handleRevoke] Buscando relación para eliminar', { currentUserId: currentUser.id, targetUserId });
      
      // Intentar eliminar primero asumiendo que currentUser es patient y target es psychologist
      try {
        await revokeAccess(currentUser.id, targetUserId);
        console.log('[handleRevoke] ✓ Relación eliminada (currentUser=patient, target=psychologist)');
        setToast({ type: 'success', text: 'Acceso revocado' });
        await loadConnections();
        return;
      } catch (firstErr: any) {
        console.log('[handleRevoke] Primera dirección falló, intentando inversa...', firstErr.message);
        // Si falla, intentar la dirección inversa
        try {
          await revokeAccess(targetUserId, currentUser.id);
          console.log('[handleRevoke] ✓ Relación eliminada (target=patient, currentUser=psychologist)');
          setToast({ type: 'success', text: 'Acceso revocado' });
          await loadConnections();
          return;
        } catch (secondErr: any) {
          console.error('[handleRevoke] Ambas direcciones fallaron', { firstErr, secondErr });
          throw new Error('Relación no encontrada en la base de datos');
        }
      }
    } catch (err: any) {
      console.error('Error revoking access', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo revocar el acceso' });
    }
  };

  const handleConnect = async (psychologistId: string) => {
    if (!currentUser) return;
    try {
      await linkPatientToPsychologist(currentUser.id, psychologistId);
      setToast({ type: 'success', text: 'Has solicitado conectar con este especialista' });
      await loadConnections();
    } catch (err: any) {
      console.error('Error connecting to psychologist', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo crear la conexión' });
    }
  };

  const handleSendInvitation = async () => {
    if (!currentUser) return;
    const targetEmail = inviteEmail.trim();
    if (!targetEmail) {
      setToast({ type: 'error', text: 'Ingresa un correo válido' });
      return;
    }
    
    // Verificar si el usuario existe
    try {
      const existingUser = await getUserByEmail(targetEmail);
      if (!existingUser) {
        // Usuario no existe, abrir modal para pedir información del paciente
        setPendingInviteEmail(targetEmail);
        setShowPatientInfoModal(true);
        return;
      }
    } catch (err) {
      console.log('Usuario no existe, mostrar modal');
      setPendingInviteEmail(targetEmail);
      setShowPatientInfoModal(true);
      return;
    }
    
    // Usuario existe, enviar invitación directamente
    setIsSendingInvite(true);
    try {
      await sendInvitation(currentUser.id, currentUser.name || 'Psicólogo', targetEmail);
      setToast({ type: 'success', text: 'Solicitud enviada correctamente' });
      setInviteEmail('');
      await loadConnections();
    } catch (err: any) {
      console.error('Error sending invitation', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo enviar la solicitud' });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleSendInvitationWithPatientInfo = async () => {
    if (!currentUser) return;
    if (!patientFirstName.trim() || !patientLastName.trim()) {
      setToast({ type: 'error', text: 'Por favor completa nombre y apellidos del paciente' });
      return;
    }
    
    setIsSendingInvite(true);
    try {
      await sendInvitation(
        currentUser.id, 
        currentUser.name || 'Psicólogo', 
        pendingInviteEmail,
        patientFirstName.trim(),
        patientLastName.trim()
      );
      
      setToast({ type: 'success', text: `Invitación enviada a ${patientFirstName} ${patientLastName}. Se ha enviado un email de bienvenida.` });
      setInviteEmail('');
      setShowPatientInfoModal(false);
      setPatientFirstName('');
      setPatientLastName('');
      setPendingInviteEmail('');
      await loadConnections();
    } catch (err: any) {
      console.error('Error sending invitation', err);
      setToast({ type: 'error', text: err?.message || 'No se pudo enviar la solicitud' });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeSentInvitation = async (invId: string) => {
    if (!window.confirm('¿Estás seguro de que quieres revocar esta invitación? Esta acción no se puede deshacer.')) {
      return;
    }
    
    // Actualización optimista: eliminar inmediatamente de la UI
    setSentInvitations(prev => prev.filter(inv => inv.id !== invId));
    
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
    return allPsychologists.filter(psych => {
      if (psych.id === currentUser?.id) return false;
      const alreadyLinked = myPsychologists.some(p => p.id === psych.id);
      if (alreadyLinked) return false;
      if (!query) return true;
      return psych.name.toLowerCase().includes(query) || psych.email.toLowerCase().includes(query);
    });
  }, [allPsychologists, directorySearch, myPsychologists, currentUser?.id]);

  if (!currentUser) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <Loader2 className="mx-auto mb-2 animate-spin text-indigo-600" />
        <p className="text-slate-500 text-sm">Cargando perfil…</p>
      </div>
    );
  }

  return (
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
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Cargando conexiones…</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Psicólogos con acceso a tu perfil</h3>
                <p className="text-sm text-slate-500">Controla quién puede ver tu evolución y encuentra nuevos profesionales.</p>
              </div>
              <button
                onClick={async () => {
                  if (!showDirectory) {
                    await ensureDirectory();
                  }
                  setShowDirectory(!showDirectory);
                }}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2"
              >
                <Search size={16} />
                {showDirectory ? 'Cerrar directorio' : 'Buscar profesional'}
              </button>
            </div>

            {showDirectory && (
              <div className="mt-4 border border-slate-100 rounded-2xl p-4 bg-slate-50">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={directorySearch}
                    onChange={(e) => setDirectorySearch(e.target.value)}
                    placeholder="Nombre o email"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm"
                  />
                  <button onClick={() => { setDirectorySearch(''); setShowDirectory(false); }} className="p-2 rounded-xl text-slate-500 hover:bg-white">
                    <X size={16} />
                  </button>
                </div>
                <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                  {directoryLoading ? (
                    <div className="text-sm text-slate-500 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Cargando directorio…</div>
                  ) : filteredDirectory.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">No hay especialistas disponibles.</p>
                  ) : filteredDirectory.map(psych => (
                    <div key={psych.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{psych.name}</p>
                        <p className="text-xs text-slate-500">{psych.email}</p>
                      </div>
                      <button
                        onClick={() => handleConnect(psych.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1"
                      >
                        <UserPlus size={14} />
                        Conectar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                  <UserCheck size={14} /> Psicólogos conectados
                </h4>
                <span className="text-xs text-slate-400">{myPsychologists.length} activos</span>
              </div>
              {myPsychologists.length === 0 ? (
                <p className="text-sm text-slate-500">Aún no has autorizado a ningún especialista.</p>
              ) : (
                <div className="space-y-3">
                  {myPsychologists.map(psych => (
                    <div key={psych.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-4">
                      <div>
                        <p className="font-semibold text-slate-900">{psych.name}</p>
                        <p className="text-xs text-slate-500">{psych.email}</p>
                      </div>
                      <button onClick={() => handleRevoke(psych.id)} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                        <Trash2 size={14} /> Revocar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {currentUser.role === 'PATIENT' && invitations.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Mail size={14} /> Invitaciones pendientes
              </h4>
              <div className="space-y-3">
                {invitations.map(inv => (
                  <div key={inv.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{inv.fromPsychologistName}</p>
                      <p className="text-xs text-slate-500">{inv.toUserEmail}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleRejectInvitation(inv.id)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-white text-sm">Rechazar</button>
                      <button onClick={() => handleAcceptInvitation(inv.id)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-sm">Aceptar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentUser.role === 'PSYCHOLOGIST' && (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Pacientes bajo tu cuidado</h3>
                    <p className="text-sm text-slate-500">Invita y gestiona tus pacientes en dygo.</p>
                  </div>
                </div>

                {/* Invitar pacientes */}
                <div className="mb-6 pb-6 border-b border-slate-100">
                  <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-3">
                    <UserPlus size={14} /> Invitar pacientes
                  </h4>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="correo@paciente.com"
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleSendInvitation}
                      disabled={isSendingInvite || !inviteEmail.trim()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isSendingInvite ? (<Loader2 size={16} className="animate-spin" />) : (<UserPlus size={16} />)}
                      {isSendingInvite ? 'Enviando…' : 'Enviar invitación'}
                    </button>
                  </div>
                </div>

                {/* Solicitudes pendientes enviadas */}
                {sentInvitations.length > 0 && (
                  <div className="mb-6 pb-6 border-b border-slate-100">
                    <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                      <Mail size={14} /> Solicitudes pendientes enviadas
                    </h4>
                    <div className="space-y-3">
                      {sentInvitations.map(inv => (
                        <div key={inv.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{inv.toUserEmail}</p>
                            <p className="text-xs text-slate-500">Enviada por {inv.fromPsychologistName}</p>
                          </div>
                          <button 
                            onClick={() => handleRevokeSentInvitation(inv.id)} 
                            className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm flex items-center gap-1"
                          >
                            <X size={14} />
                            Revocar solicitud
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pacientes conectados */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                      <UserCheck size={14} /> Pacientes conectados
                    </h4>
                    <span className="text-xs text-slate-400">{myPatients.length} activos</span>
                  </div>
                  {myPatients.length === 0 ? (
                    <p className="text-sm text-slate-500">Aún no tienes pacientes con acceso.</p>
                  ) : (
                    <div className="space-y-3">
                      {myPatients.map(patient => (
                        <div key={patient.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-4">
                          <div>
                            <p className="font-semibold text-slate-900">{patient.name}</p>
                            <p className="text-xs text-slate-500">{patient.email}</p>
                          </div>
                          <button onClick={() => handleRevoke(patient.id)} className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                            <Trash2 size={14} /> Revocar
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

      {/* Modal para información del paciente */}
      {showPatientInfoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Información del Paciente
              </h3>
              <p className="text-sm text-slate-600">
                El usuario <strong>{pendingInviteEmail}</strong> no existe aún en la plataforma.
                Por favor, proporciona la información básica del paciente para enviar la invitación.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={patientFirstName}
                  onChange={(e) => setPatientFirstName(e.target.value)}
                  placeholder="Ej: María"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Apellidos <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={patientLastName}
                  onChange={(e) => setPatientLastName(e.target.value)}
                  placeholder="Ej: García López"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>📧 Email de bienvenida:</strong> Se enviará automáticamente un correo a {pendingInviteEmail} con:
                </p>
                <ul className="text-xs text-blue-700 mt-2 ml-4 list-disc space-y-1">
                  <li>Instrucciones para registrarse</li>
                  <li>Información sobre la plataforma</li>
                  <li>Recordatorio del consentimiento informado</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPatientInfoModal(false);
                  setPatientFirstName('');
                  setPatientLastName('');
                  setPendingInviteEmail('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                disabled={isSendingInvite}
              >
                Cancelar
              </button>
              <button
                onClick={handleSendInvitationWithPatientInfo}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={isSendingInvite || !patientFirstName.trim() || !patientLastName.trim()}
              >
                {isSendingInvite ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    Enviar Invitación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionsPanel;
