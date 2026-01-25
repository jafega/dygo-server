import React, { useState, useEffect } from 'react';
import { Ticket, Plus, Check, Clock, AlertCircle, DollarSign, Calendar, User, X, Edit2, Trash2, Mail } from 'lucide-react';
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
  patientName?: string;
  patientEmail?: string;
}

const BonosPanel: React.FC<BonosPanelProps> = ({ patientId, psychologistId, patientName, patientEmail }) => {
  const [bonos, setBonos] = useState<Bono[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBono, setSelectedBono] = useState<Bono | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newBono, setNewBono] = useState({
    total_sessions_amount: 1,
    total_price_bono_amount: 0,
    paid: false
  });
  const [editBono, setEditBono] = useState({
    total_price_bono_amount: 0,
    paid: false
  });

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

  const handleCreateBono = async () => {
    if (newBono.total_sessions_amount < 1) {
      alert('El número de sesiones debe ser al menos 1');
      return;
    }
    
    if (newBono.total_price_bono_amount <= 0) {
      alert('El precio del bono debe ser mayor a 0');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${API_URL}/bonos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          psychologist_user_id: psychologistId,
          pacient_user_id: patientId,
          total_sessions_amount: newBono.total_sessions_amount,
          total_price_bono_amount: newBono.total_price_bono_amount,
          paid: newBono.paid
        })
      });

      if (response.ok) {
        alert('Bono creado correctamente');
        setShowCreateModal(false);
        setNewBono({
          total_sessions_amount: 1,
          total_price_bono_amount: 0,
          paid: false
        });
        await loadBonos();
      } else {
        const errorData = await response.json();
        alert('Error al crear el bono: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error creating bono:', error);
      alert('Error al crear el bono');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteBono = async (bono: Bono) => {
    if (bono.used_sessions && bono.used_sessions > 0) {
      alert('No se puede eliminar un bono que tiene sesiones asignadas');
      return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar este bono?')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`${API_URL}/bonos/${bono.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al eliminar el bono');
      }

      alert('Bono eliminado correctamente');
      await loadBonos();
    } catch (error: any) {
      console.error('Error deleting bono:', error);
      alert(error.message || 'Error al eliminar el bono. Por favor, inténtalo de nuevo.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditBono = (bono: Bono) => {
    setSelectedBono(bono);
    setEditBono({
      total_price_bono_amount: bono.total_price_bono_amount,
      paid: bono.paid
    });
    setShowEditModal(true);
  };

  const handleUpdateBono = async () => {
    if (!selectedBono) return;

    if (editBono.total_price_bono_amount <= 0) {
      alert('El precio debe ser mayor a 0');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`${API_URL}/bonos/${selectedBono.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_price_bono_amount: editBono.total_price_bono_amount,
          paid: editBono.paid
        })
      });

      if (!response.ok) {
        throw new Error('Error al actualizar el bono');
      }

      alert('Bono actualizado correctamente');
      setShowEditModal(false);
      setSelectedBono(null);
      await loadBonos();
    } catch (error) {
      console.error('Error updating bono:', error);
      alert('Error al actualizar el bono. Por favor, inténtalo de nuevo.');
    } finally {
      setIsUpdating(false);
    }
  };

  const calculatePricePerSession = () => {
    if (newBono.total_sessions_amount === 0) return 0;
    return newBono.total_price_bono_amount / newBono.total_sessions_amount;
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Ticket className="text-purple-600" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Bonos del Paciente</h2>
                <p className="text-sm text-slate-600">Gestión de bonos de sesiones</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-md"
            >
              <Plus size={18} />
              Añadir Bono
            </button>
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
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-2xl font-bold text-purple-600">
                          €{bono.total_price_bono_amount.toFixed(2)}
                        </div>
                        <p className="text-xs text-slate-500">
                          €{(bono.total_price_bono_amount / bono.total_sessions_amount).toFixed(2)} / sesión
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditBono(bono)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar bono"
                        >
                          <Edit2 className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteBono(bono)}
                          disabled={isDeleting || (bono.used_sessions && bono.used_sessions > 0)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={bono.used_sessions && bono.used_sessions > 0 ? "No se puede eliminar un bono con sesiones asignadas" : "Eliminar bono"}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
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

      {/* Modal para crear bono */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Crear Nuevo Bono</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-1">Configura los detalles del bono de sesiones</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Número de sesiones */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Número de Sesiones *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={newBono.total_sessions_amount}
                  onChange={(e) => setNewBono({
                    ...newBono,
                    total_sessions_amount: parseInt(e.target.value) || 1
                  })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Ej: 10"
                />
                <p className="text-xs text-slate-500 mt-1">Cantidad de sesiones incluidas en este bono</p>
              </div>

              {/* Precio total del bono */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Precio Total del Bono (€) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newBono.total_price_bono_amount}
                  onChange={(e) => setNewBono({
                    ...newBono,
                    total_price_bono_amount: parseFloat(e.target.value) || 0
                  })}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Ej: 450.00"
                />
                <p className="text-xs text-slate-500 mt-1">Precio total que pagará el paciente por el bono</p>
              </div>

              {/* Estado de pago */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="paid"
                  checked={newBono.paid}
                  onChange={(e) => setNewBono({ ...newBono, paid: e.target.checked })}
                  className="w-4 h-4 text-purple-600 bg-slate-100 border-slate-300 rounded focus:ring-purple-500 focus:ring-2"
                />
                <label htmlFor="paid" className="text-sm font-medium text-slate-700">
                  Bono pagado
                </label>
              </div>

              {/* Cálculo automático */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-purple-900">Precio por sesión:</span>
                  <span className="text-xl font-bold text-purple-600">
                    €{calculatePricePerSession().toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-purple-700 mt-1">
                  Precio unitario calculado automáticamente
                </p>
              </div>

              {/* Información del paciente (no editable) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Información del Paciente</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-700">
                    <User size={16} className="text-purple-600" />
                    <span className="font-medium text-slate-900">{patientName || 'Paciente'}</span>
                  </div>
                  {patientEmail && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Mail size={14} className="text-slate-400" />
                      <span className="text-sm">{patientEmail}</span>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-200">El bono se asignará automáticamente a este paciente</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateBono}
                disabled={isCreating || newBono.total_sessions_amount < 1 || newBono.total_price_bono_amount <= 0}
                className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    Crear Bono
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Editar Bono */}
      {showEditModal && selectedBono && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-5 h-5" />
                Editar Bono
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedBono(null);
                }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Ticket className="w-4 h-4" />
                  <span>Bono #{selectedBono.id}</span>
                </div>
                <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {selectedBono.total_sessions_amount} sesiones
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Precio Total (€)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editBono.total_price_bono_amount}
                    onChange={(e) => setEditBono({ ...editBono, total_price_bono_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-paid"
                  checked={editBono.paid}
                  onChange={(e) => setEditBono({ ...editBono, paid: e.target.checked })}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="edit-paid" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Bono pagado
                </label>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Precio por sesión:</span>
                  <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {(editBono.total_price_bono_amount / selectedBono.total_sessions_amount).toFixed(2)}€
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedBono(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateBono}
                disabled={isUpdating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isUpdating ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BonosPanel;
