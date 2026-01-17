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

  useEffect(() => {
    if (!currentUser) return;
    loadConnections();
  }, [currentUser?.id]);

  const loadConnections = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setError('');
    try {
      if (currentUser.role === 'PATIENT') {
        const [pending, connected] = await Promise.all([
          getPendingInvitationsForEmail(currentUser.email),
          getPsychologistsForPatient(currentUser.id)
        ]);
        setInvitations(pending);
        setMyPsychologists(connected);
        onPendingInvitesChange?.(pending.length > 0);
      } else {
        const [sent, patients] = await Promise.all([
          getSentInvitationsForPsychologist(currentUser.id),
          getPatientsForPsychologist(currentUser.id)
        ]);
        setSentInvitations(sent);
        setMyPatients(patients.filter(p => !p.isSelf));
      }
    } catch (err: any) {
      console.error('Error loading connections', err);
      setError(err?.message || 'No se pudieron cargar las conexiones');
    } finally {
      setIsLoading(false);
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
    if (!window.confirm('¿Revocar acceso?')) return;
    try {
      await revokeAccess(currentUser.role === 'PATIENT' ? currentUser.id : targetUserId, currentUser.role === 'PATIENT' ? targetUserId : currentUser.id);
      setToast({ type: 'success', text: 'Acceso revocado' });
      await loadConnections();
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
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-indigo-50 rounded-full" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Link2 size={24} />
            </div>
            <div>
              <p className="text-xs uppercase font-semibold text-indigo-600 tracking-wide">Conexiones</p>
              <h2 className="text-2xl font-bold text-slate-900">Gestiona quién puede verte y a quién acompañas</h2>
            </div>
          </div>
          <div className="text-sm text-slate-500 flex items-center gap-2">
            <Shield size={16} />
            Datos protegidos bajo tu consentimiento
          </div>
        </div>
      </div>

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
      ) : currentUser.role === 'PATIENT' ? (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Tu red de especialistas</h3>
                <p className="text-sm text-slate-500">Invita o acepta a profesionales para que puedan acompañarte.</p>
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
                {showDirectory ? 'Cerrar directorio' : 'Buscar especialista'}
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
          </div>

          {invitations.length > 0 && (
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

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                <UserCheck size={14} /> Profesionales conectados
              </h4>
              <span className="text-xs text-slate-400">{myPsychologists.length} activos</span>
            </div>
            {myPsychologists.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no has conectado con un especialista.</p>
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
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col gap-2 mb-4">
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                <UserPlus size={14} /> Invitar paciente
              </h4>
              <p className="text-sm text-slate-500">Envía una solicitud a tus pacientes para acceder a su diario.</p>
            </div>
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
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingInvite ? (<Loader2 size={16} className="animate-spin" />) : (<UserPlus size={16} />)}
                {isSendingInvite ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Mail size={14} /> Solicitudes enviadas
            </h4>
            {sentInvitations.length === 0 ? (
              <p className="text-sm text-slate-500">Aún no has enviado solicitudes.</p>
            ) : (
              <div className="space-y-3">
                {sentInvitations.map(inv => (
                  <div key={inv.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{inv.toUserEmail}</p>
                      <p className="text-xs text-slate-500">{new Date(inv.timestamp).toLocaleString()}</p>
                    </div>
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-200">{inv.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
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
      )}
    </div>
  );
};

export default ConnectionsPanel;
