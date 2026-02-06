import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Building2, Plus, Edit2, Trash2, X, MapPin, FileText } from 'lucide-react';
import { API_URL } from '../services/config';

interface Centro {
  id: string;
  psychologist_user_id: string;
  center_name: string;
  cif: string;
  address: string;
  created_at: string;
}

interface CentrosPanelProps {
  psychologistId: string;
}

export interface CentrosPanelRef {
  openNewCenter: () => void;
}

const CentrosPanel = forwardRef<CentrosPanelRef, CentrosPanelProps>(({ psychologistId }, ref) => {
  const [centros, setCentros] = useState<Centro[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCentro, setEditingCentro] = useState<Centro | null>(null);
  const [formData, setFormData] = useState({
    center_name: '',
    cif: '',
    address: ''
  });

  useImperativeHandle(ref, () => ({
    openNewCenter: () => {
      setEditingCentro(null);
      setFormData({ center_name: '', cif: '', address: '' });
      setShowModal(true);
    }
  }));

  useEffect(() => {
    loadCentros();
  }, [psychologistId]);

  const loadCentros = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/centers?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCentros(data);
      }
    } catch (error) {
      console.error('Error loading centers:', error);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingCentro) {
        // Update existing center
        const response = await fetch(`${API_URL}/centers/${editingCentro.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            psychologistId
          })
        });

        if (response.ok) {
          await loadCentros();
          setShowModal(false);
          setFormData({ center_name: '', cif: '', address: '' });
          setEditingCentro(null);
        }
      } else {
        // Create new center
        const response = await fetch(`${API_URL}/centers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            psychologistId
          })
        });

        if (response.ok) {
          await loadCentros();
          setShowModal(false);
          setFormData({ center_name: '', cif: '', address: '' });
        }
      }
    } catch (error) {
      console.error('Error saving center:', error);
    }
  };

  const handleEdit = (centro: Centro) => {
    setEditingCentro(centro);
    setFormData({
      center_name: centro.center_name,
      cif: centro.cif,
      address: centro.address
    });
    setShowModal(true);
  };

  const handleDelete = async (centroId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este centro?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/centers/${centroId}?psychologistId=${psychologistId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadCentros();
      }
    } catch (error) {
      console.error('Error deleting center:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-centros-component>
      {/* Empty State */}
      {centros.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <Building2 className="mx-auto h-12 w-12 text-slate-400" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No hay centros registrados</h3>
          <p className="mt-2 text-sm text-slate-500">
            Comienza agregando un centro donde ofreces tus servicios
          </p>
          <button
            onClick={() => {
              setEditingCentro(null);
              setFormData({ center_name: '', cif: '', address: '' });
              setShowModal(true);
            }}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={18} />
            Añadir Centro
          </button>
        </div>
      )}

      {/* Centers Grid */}
      {centros.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {centros.map((centro) => (
            <div
              key={centro.id}
              className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{centro.center_name}</h3>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(centro)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit2 size={16} className="text-slate-600" />
                  </button>
                  <button
                    onClick={() => handleDelete(centro.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <FileText size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-slate-500">CIF:</span>
                    <span className="ml-1 text-slate-700 font-medium">{centro.cif}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-600">{centro.address}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowModal(false); setEditingCentro(null); setFormData({ center_name: '', cif: '', address: '' }); }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center rounded-t-2xl">
              <h3 className="text-xl font-bold text-slate-900">
                {editingCentro ? 'Editar Centro' : 'Nuevo Centro'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingCentro(null);
                  setFormData({ center_name: '', cif: '', address: '' });
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Nombre del Centro */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre del Centro *
                </label>
                <input
                  type="text"
                  required
                  value={formData.center_name}
                  onChange={(e) => setFormData({ ...formData, center_name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Centro de Psicología Integral"
                />
              </div>

              {/* CIF */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  CIF *
                </label>
                <input
                  type="text"
                  required
                  value={formData.cif}
                  onChange={(e) => setFormData({ ...formData, cif: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: B12345678"
                />
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Dirección *
                </label>
                <textarea
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Calle Mayor 123, 28001 Madrid"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingCentro(null);
                    setFormData({ center_name: '', cif: '', address: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {editingCentro ? 'Guardar Cambios' : 'Crear Centro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

CentrosPanel.displayName = 'CentrosPanel';

export default CentrosPanel;
