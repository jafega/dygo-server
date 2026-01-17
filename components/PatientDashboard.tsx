import React, { useEffect, useState } from 'react';
import { PatientSummary, Invitation, User } from '../types';
import { getPatientsForPsychologist, sendInvitation, getSentInvitationsForPsychologist, hasCareRelationship } from '../services/storageService';
import { getCurrentUser, getUserByEmail } from '../services/authService';
import PatientDetailModal from './PatientDetailModal';
import { Users, AlertCircle, CheckCircle, Clock, UserPlus, Send, Mail, Hourglass, Search, UserCheck, UserX, ArrowLeft, Loader2 } from 'lucide-react';

const PatientDashboard: React.FC = () => {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Invite Flow State
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteStep, setInviteStep] = useState<'INPUT' | 'DECISION'>('INPUT');
    const [foundUser, setFoundUser] = useState<User | null>(null);
    const [foundUserAlreadyLinked, setFoundUserAlreadyLinked] = useState(false);

  const [inviteStatus, setInviteStatus] = useState<'idle'|'success'|'error'>('idle');
  const [msg, setMsg] = useState('');

  const [currentUser, setCurrentUser] = useState<any>(null);

  const loadData = async () => {
    setIsLoading(true);
    const user = await getCurrentUser();
    if (user) {
        setCurrentUser(user);
        const [pts, invs] = await Promise.all([
            getPatientsForPsychologist(user.id),
            getSentInvitationsForPsychologist(user.id)
        ]);
        setPatients(pts);
        setPendingInvites(invs);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

    useEffect(() => {
        const handleFocus = () => {
            loadData();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadData();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

  const openInviteModal = () => {
      setShowInvite(true);
      setInviteEmail('');
      setInviteStep('INPUT');
      setFoundUser(null);
      setFoundUserAlreadyLinked(false);
      setInviteStatus('idle');
      setMsg('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !currentUser) return;

    const existingUser = await getUserByEmail(inviteEmail.trim());
    setFoundUser(existingUser || null);
    setInviteStep('DECISION');
    setInviteStatus('idle');
    setMsg('');

    let alreadyLinked = false;
    if (existingUser && currentUser) {
        try {
            alreadyLinked = await hasCareRelationship(currentUser.id, existingUser.id);
        } catch (err) {
            console.warn('No se pudo verificar la relación existente', err);
        }
    }

    const inPatients = existingUser ? patients.some(p => p.id === existingUser.id) : false;
    const userAlreadyInList = alreadyLinked || inPatients;
    setFoundUserAlreadyLinked(userAlreadyInList);

    if (userAlreadyInList) {
        setInviteStatus('error');
        setMsg('Este paciente ya está en tu lista.');
    }
  };

  const handleSendRequest = async () => {
    if (!currentUser || !inviteEmail) return;

    // Re-check if the patient is already added to avoid race conditions
    if (foundUser) {
        try {
            const alreadyLinked = await hasCareRelationship(currentUser.id, foundUser.id);
            if (alreadyLinked || patients.some(p => p.id === foundUser.id)) {
                setFoundUserAlreadyLinked(true);
                setInviteStatus('error');
                setMsg('Este paciente ya está en tu lista.');
                return;
            }
        } catch (err) {
            console.warn('No se pudo verificar la relación antes de enviar la invitación', err);
        }
    }

    try {
        await sendInvitation(currentUser.id, currentUser.name, inviteEmail.trim());
        setInviteStatus('success');
        setMsg('Solicitud enviada. El paciente debe aceptarla en su perfil (Privacidad).');
        await loadData();
        setTimeout(() => setShowInvite(false), 3000);
    } catch (err: any) {
        setInviteStatus('error');
        setMsg(err.message);
    }
  };

  const handleSendEmail = async () => {
      if (!currentUser || !inviteEmail) return;
      
      try {
          // Create invitation which will auto-create the patient user in backend
          await sendInvitation(currentUser.id, currentUser.name, inviteEmail.trim());
          
          // Open email client
          const registerLink = window.location.origin;
          const subject = encodeURIComponent("Invitación a dygo - Tu diario de bienestar");
          const body = encodeURIComponent(`Hola,\n\nTe invito a utilizar dygo.\nRegístrate aquí: ${registerLink}\n\nUn saludo,\n${currentUser.name}`);
          window.open(`mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`, '_blank');
          
          setInviteStatus('success');
          setMsg('Usuario creado y email abierto. Ya puedes empezar a trabajar con este paciente.');
          
          // Reload data to show the new patient
          await loadData();
          
          setTimeout(() => setShowInvite(false), 4000);
      } catch (err: any) {
          setInviteStatus('error');
          setMsg(err.message || 'Error al crear el paciente');
      }
  };

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

  if (isLoading) return <div className="p-8 text-center text-slate-400"><Loader2 className="animate-spin inline-block mr-2"/> Cargando pacientes...</div>;

  return (
    <div className="space-y-4 sm:space-y-6">
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
            <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-500" />
                Panel de Pacientes
            </h3>
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={openInviteModal} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 transition-colors shadow-sm">
                    <UserPlus size={14} className="sm:w-4 sm:h-4" /> <span className="sm:hidden">Nuevo</span><span className="hidden sm:inline">Añadir Paciente</span>
                </button>
            </div>
       </div>

       {showInvite && (
         <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl animate-in fade-in slide-in-from-top-2 shadow-sm relative">
             <button onClick={() => setShowInvite(false)} className="absolute top-4 right-4 text-indigo-300 hover:text-indigo-800"><ArrowLeft size={20} className="rotate-180" /></button>
             <h4 className="text-indigo-900 font-bold mb-3 flex items-center gap-2"><Mail size={18} /> Invitar Paciente</h4>
             {inviteStep === 'INPUT' ? (
                 <>
                    <p className="text-sm text-indigo-700 mb-4">Introduce el email para buscar si el paciente ya tiene cuenta.</p>
                    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
                        <input type="email" placeholder="paciente@email.com" className="flex-1 px-4 py-3 rounded-lg bg-white border border-slate-300 outline-none" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required autoFocus />
                        <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 flex items-center gap-2"><Search size={16} /> Buscar</button>
                    </form>
                 </>
             ) : (
                 <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                     <div className="flex items-center justify-between bg-white/50 p-2 px-3 rounded-lg border border-indigo-100">
                         <span className="text-indigo-900 font-medium text-sm">{inviteEmail}</span>
                         <button onClick={() => setInviteStep('INPUT')} className="text-xs text-indigo-600 hover:underline flex items-center gap-1"><ArrowLeft size={12} /> Cambiar</button>
                     </div>
                     {foundUser ? (
                        // If the found user is already added, show an informative state and disable the send button
                        (() => {
                            const alreadyAdded = foundUserAlreadyLinked || patients.some(p => p.id === foundUser.id);
                            if (alreadyAdded) {
                                return (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 bg-yellow-100 text-yellow-700 rounded-full flex items-center justify-center mx-auto mb-3"><UserCheck size={24} /></div>
                                        <h5 className="font-bold text-yellow-900 text-lg mb-1">Paciente Ya Añadido</h5>
                                        <p className="text-sm text-yellow-800 mb-4"><strong>{foundUser.name}</strong> ya forma parte de tus pacientes.</p>
                                        <button disabled className="w-full py-2.5 bg-yellow-400 text-white rounded-lg flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"><UserCheck size={16} /> Añadido</button>
                                    </div>
                                );
                            }

                            return (
                                <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center shadow-sm">
                                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3"><UserCheck size={24} /></div>
                                    <h5 className="font-bold text-green-900 text-lg mb-1">Usuario Encontrado</h5>
                                    <p className="text-sm text-green-800 mb-4"><strong>{foundUser.name}</strong> ya tiene cuenta.</p>
                                    <button onClick={handleSendRequest} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center gap-2"><Send size={16} /> Enviar Solicitud</button>
                                </div>
                            );
                        })()
                     ) : (
                         <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center shadow-sm">
                             <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3"><UserX size={24} /></div>
                             <h5 className="font-bold text-amber-900 text-lg mb-1">No Registrado</h5>
                             <p className="text-sm text-amber-800 mb-4">Se creará automáticamente una cuenta para este paciente.</p>
                             <button onClick={handleSendEmail} className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg flex items-center justify-center gap-2"><UserPlus size={16} /> Crear y Enviar Email</button>
                         </div>
                     )}
                 </div>
             )}
             {inviteStatus !== 'idle' && <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 animate-in fade-in ${inviteStatus === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{inviteStatus === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}<p>{msg}</p></div>}
         </div>
       )}

       {pendingInvites.length > 0 && (
           <div className="space-y-3">
               <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2"><Hourglass size={14} /> Solicitudes Pendientes</h4>
               <div className="grid gap-3 opacity-80">
                   {pendingInvites.map(inv => (
                       <div key={inv.id} className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-4 flex items-center justify-between">
                           <div><h4 className="font-bold text-slate-700">{inv.toUserEmail}</h4></div>
                           <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-medium border border-orange-200">Esperando</span>
                       </div>
                   ))}
               </div>
           </div>
       )}

       <div className="space-y-3">
          {pendingInvites.length > 0 && <h4 className="text-xs sm:text-sm font-bold text-slate-400 uppercase tracking-wide mt-3 sm:mt-4">Pacientes Activos</h4>}
          <div className="grid gap-3 sm:gap-4">
            {patients.length === 0 ? (
                <div className="text-center py-10 sm:py-12 bg-white rounded-xl sm:rounded-2xl border border-slate-100 border-dashed">
                    <Users className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-2 sm:mb-3" />
                    <p className="text-sm sm:text-base text-slate-500">No tienes pacientes activos.</p>
                </div>
            ) : (
                patients.map(patient => (
                    <div key={patient.id} onClick={() => setSelectedPatient(patient)} className="border border-slate-200 rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow bg-white cursor-pointer group">
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-2 sm:mb-3 gap-2">
                            <div className="min-w-0 flex-1">
                                <h4 className="font-bold text-slate-800 text-base sm:text-lg group-hover:text-indigo-600 transition-colors truncate">{patient.name}</h4>
                                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                                    <Clock size={10} className="sm:w-3 sm:h-3 shrink-0" /> 
                                    <span className="truncate">Última Act: {patient.lastUpdate}</span>
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
           patient={selectedPatient} 
           onClose={() => setSelectedPatient(null)} 
           psychologistId={currentUser.id}
         />
       )}
    </div>
  );
};

export default PatientDashboard;