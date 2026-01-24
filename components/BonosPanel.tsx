import React, { useState, useEffect } from 'react';
import { Ticket, Plus, Check, Clock, AlertCircle, DollarSign, Calendar, User } from 'lucide-react';
import { API_URL } from '../services/config';

interface Bono {
  id: number;
  created_at: string;
  psychologist_user_id: string;
  pacient_user_id: string;
  total_sessions_amount: number;
  total_price_bono_amount: number;
  invoice_id?: string;
  paid: boolean;
  // Campos adicionales que pueden venir del join
  remaining_sessions?: number;
  used_sessions?: number;
}

interface BonosPanelProps {
  patientId: string;
  psychologistId: string;
}

const BonosPanel: React.FC<BonosPanelProps> = ({ patientId, psychologistId }) => {
  const [bonos, setBonos] = useState<Bono[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadBonos();
  }, [patientId, psychologistId]);

  const loadBonos = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${API_URL}/bonos?pacient_user_id=${patientId}&psychologist_user_id=${psychologistId}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setBonos(data);
      } else {
        console.error('Error loading bonos:', response.status);
      }
    } catch (error) {
      console.error('Error loading bonos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (bono: Bono) => {
    if (!bono.paid) {
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    }
    const remaining = bono.remaining_sessions || bono.total_sessions_amount;
    if (remaining === 0) {
      return 'bg-slate-50 text-slate-700 border-slate-200';
    }
    return 'bg-green-50 text-green-700 border-green-200';
  };

  const getStatusLabel = (bono: Bono) => {
    if (!bono.paid) return 'Pendiente de pago';
    const remaining = bono.remaining_sessions || bono.total_sessions_amount;
    if (remaining === 0) return 'Agotado';
    return 'Activo';
  };

  const getStatusIcon = (bono: Bono) => {
    if (!bono.paid) return <Clock size={14} />;
    const remaining = bono.remaining_sessions || bono.total_sessions_amount;
    if (remaining === 0) return <AlertCircle size={14} />;
    return <Check size={14} />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Ticket className="text-purple-600" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Bonos del Paciente</h2>
              <p className="text-sm text-slate-600">Gestión de bonos de sesiones</p>
            </div>
          </div>
        </div>

        {bonos.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Ticket className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500 font-medium">No hay bonos registrados</p>
            <p className="text-sm text-slate-400 mt-1">
              Los bonos de sesiones del paciente aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {bonos.map((bono) => {
              const remaining = bono.remaining_sessions ?? bono.total_sessions_amount;
              const used = bono.used_sessions ?? 0;
              const progress = ((used / bono.total_sessions_amount) * 100);

              return (
                <div key={bono.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-slate-900">
                          Bono #{bono.id}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(
                            bono
                          )}`}
                        >
                          {getStatusIcon(bono)}
                          {getStatusLabel(bono)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">
                        Creado el {new Date(bono.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-purple-600">
                        €{bono.total_price_bono_amount.toFixed(2)}
                      </div>
                      <p className="text-xs text-slate-500">
                        €{(bono.total_price_bono_amount / bono.total_sessions_amount).toFixed(2)} / sesión
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1">Total de sesiones</p>
                      <p className="text-lg font-bold text-slate-900">{bono.total_sessions_amount}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 mb-1">Sesiones restantes</p>
                      <p className="text-lg font-bold text-purple-600">{remaining}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span>Progreso</span>
                      <span>{used} de {bono.total_sessions_amount} usadas</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {bono.invoice_id && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                      <DollarSign size={14} />
                      <span>Factura asociada: {bono.invoice_id}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BonosPanel;
