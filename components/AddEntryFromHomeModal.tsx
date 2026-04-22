import React, { useState, useMemo } from 'react';
import { X, Search, Users, FileText, Calendar, ArrowRight, ArrowLeft, Loader } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import SessionDetailsModal from './SessionDetailsModal';
import NonSessionEntryModal from './NonSessionEntryModal';

interface PatientLike {
  id?: string;
  user_id?: string;
  userId?: string;
  name?: string;
  email?: string;
}

interface AddEntryFromHomeModalProps {
  psychologistId: string;
  patients: PatientLike[];
  onClose: () => void;
  onSaved?: () => void;
}

type Step = 'patient' | 'type' | 'pick-session' | 'session-editor' | 'non-session-editor';

const getPatientUserId = (p: PatientLike): string =>
  (p.userId || p.user_id || p.id || '') as string;

const AddEntryFromHomeModal: React.FC<AddEntryFromHomeModalProps> = ({
  psychologistId,
  patients,
  onClose,
  onSaved,
}) => {
  const [step, setStep] = useState<Step>('patient');
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientLike | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...patients].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
    );
  }, [patients, search]);

  const loadSessions = async (patient: PatientLike) => {
    setIsLoadingSessions(true);
    const patientUserId = getPatientUserId(patient);
    try {
      const res = await apiFetch(`${API_URL}/sessions?psychologistId=${psychologistId}`);
      if (res.ok) {
        const all: any[] = await res.json();
        const pickable = all
          .filter(
            (s) =>
              s.status === 'completed' &&
              (s.patient_user_id === patientUserId || s.patientId === patientUserId) &&
              !s.session_entry_id
          )
          .sort((a, b) => {
            const da = new Date(a.starts_on || a.date || 0).getTime();
            const db = new Date(b.starts_on || b.date || 0).getTime();
            return db - da;
          });
        setSessions(pickable);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.error('Error loading sessions for entry:', err);
      setSessions([]);
    }
    setIsLoadingSessions(false);
  };

  const handleSelectPatient = (p: PatientLike) => {
    setSelectedPatient(p);
    setStep('type');
  };

  const handleChooseWithSession = async () => {
    if (!selectedPatient) return;
    setStep('pick-session');
    await loadSessions(selectedPatient);
  };

  const handleChooseWithoutSession = () => {
    setStep('non-session-editor');
  };

  const handleSelectSession = async (session: any) => {
    try {
      const res = await apiFetch(`${API_URL}/sessions/${session.id}`);
      if (res.ok) {
        setSelectedSession(await res.json());
      } else {
        setSelectedSession(session);
      }
    } catch {
      setSelectedSession(session);
    }
    setStep('session-editor');
  };

  const handleBack = () => {
    if (step === 'type') setStep('patient');
    else if (step === 'pick-session') setStep('type');
  };

  const handleSaved = () => {
    if (onSaved) onSaved();
    onClose();
  };

  // Render child editors directly (they are themselves full-screen modals)
  if (step === 'session-editor' && selectedSession) {
    return (
      <SessionDetailsModal
        session={selectedSession}
        onClose={onClose}
        onSave={handleSaved}
      />
    );
  }

  if (step === 'non-session-editor' && selectedPatient) {
    return (
      <NonSessionEntryModal
        patientUserId={getPatientUserId(selectedPatient)}
        patientName={selectedPatient.name}
        psychologistUserId={psychologistId}
        onClose={onClose}
        onSave={handleSaved}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {step !== 'patient' && (
              <button
                onClick={handleBack}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Volver"
              >
                <ArrowLeft size={18} className="text-slate-600" />
              </button>
            )}
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                {step === 'patient' && 'Selecciona un paciente'}
                {step === 'type' && 'Tipo de entrada'}
                {step === 'pick-session' && 'Selecciona una sesión'}
              </h2>
              {selectedPatient && step !== 'patient' && (
                <p className="text-xs text-slate-500 truncate">{selectedPatient.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 'patient' && (
            <div className="p-4 sm:p-5">
              <div className="relative mb-4">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar paciente por nombre o email..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  autoFocus
                />
              </div>

              {filteredPatients.length === 0 ? (
                <div className="text-center py-10">
                  <Users className="text-slate-300 mx-auto mb-2" size={36} />
                  <p className="text-sm text-slate-500">
                    {patients.length === 0
                      ? 'No tienes pacientes registrados todavía'
                      : 'No se encontraron pacientes'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {filteredPatients.map((p) => {
                    const pid = getPatientUserId(p);
                    return (
                      <button
                        key={pid}
                        onClick={() => handleSelectPatient(p)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors text-left"
                      >
                        <div className="shrink-0 w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center text-sm">
                          {(p.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {p.name || 'Sin nombre'}
                          </p>
                          {p.email && (
                            <p className="text-xs text-slate-500 truncate">{p.email}</p>
                          )}
                        </div>
                        <ArrowRight size={14} className="text-slate-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'type' && (
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-sm text-slate-600 mb-1">
                ¿Qué tipo de entrada quieres añadir al historial clínico?
              </p>

              <button
                onClick={handleChooseWithSession}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="shrink-0 p-2 bg-indigo-100 rounded-lg">
                  <Calendar className="text-indigo-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Añadir entrada a una sesión
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Vincula la entrada a una sesión completada (session_entry).
                  </p>
                </div>
                <ArrowRight size={14} className="text-slate-400 mt-1 shrink-0" />
              </button>

              <button
                onClick={handleChooseWithoutSession}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left"
              >
                <div className="shrink-0 p-2 bg-purple-100 rounded-lg">
                  <FileText className="text-purple-600" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    Entrada sin sesión
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Añade una nota clínica independiente (non_session_entry).
                  </p>
                </div>
                <ArrowRight size={14} className="text-slate-400 mt-1 shrink-0" />
              </button>
            </div>
          )}

          {step === 'pick-session' && (
            <div className="p-4 sm:p-5">
              {isLoadingSessions ? (
                <div className="flex items-center justify-center py-10">
                  <Loader className="animate-spin text-indigo-500" size={24} />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-10">
                  <Calendar className="text-slate-300 mx-auto mb-2" size={36} />
                  <p className="text-sm text-slate-500 mb-1">
                    No hay sesiones completadas disponibles
                  </p>
                  <p className="text-xs text-slate-400">
                    Solo se muestran sesiones completadas sin entrada asociada.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                  {sessions.map((s) => {
                    const dateStr = s.starts_on || s.date || '';
                    const d = dateStr ? new Date(dateStr) : null;
                    const dateLabel = d
                      ? d.toLocaleDateString('es-ES', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Sin fecha';
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSelectSession(s)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors text-left"
                      >
                        <div className="shrink-0 p-2 bg-indigo-100 rounded-lg">
                          <Calendar className="text-indigo-600" size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {dateLabel}
                          </p>
                          <p className="text-xs text-slate-500">
                            {s.startTime || ''}
                            {s.endTime ? ` - ${s.endTime}` : ''}
                            {s.type
                              ? ` · ${
                                  s.type === 'online'
                                    ? '🎥 Online'
                                    : s.type === 'home-visit'
                                    ? '🏠 Domicilio'
                                    : '🏥 Consulta'
                                }`
                              : ''}
                          </p>
                        </div>
                        <ArrowRight size={14} className="text-slate-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddEntryFromHomeModal;
