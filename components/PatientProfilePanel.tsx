import React, { useState, useEffect } from 'react';
import { Save, Phone, Mail, MapPin, User as UserIcon } from 'lucide-react';
import { API_URL } from '../services/config';

interface PatientProfile {
  // Personal Info
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  
  // Address
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

interface PatientProfilePanelProps {
  userId: string;
}

const PatientProfilePanel: React.FC<PatientProfilePanelProps> = ({ userId }) => {
  const [profile, setProfile] = useState<PatientProfile>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'España'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/patient/${userId}/profile`);
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/patient/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'Error al guardar el perfil. Comprueba la conexión con el servidor.');
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      alert(error?.message || 'Error al guardar el perfil. Comprueba la conexión con el servidor.');
    }
    setIsSaving(false);
  };

  const handleChange = (field: keyof PatientProfile, value: string) => {
    setProfile({ ...profile, [field]: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Cargando perfil...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Save size={18} />
          Perfil guardado correctamente
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <UserIcon className="text-indigo-600" size={20} />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">Información Personal</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nombre *</label>
            <input
              type="text"
              value={profile.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Juan"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Apellidos *</label>
            <input
              type="text"
              value={profile.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Pérez García"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Phone size={14} className="inline mr-1" />
              Teléfono
            </label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="+34 600 000 000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Mail size={14} className="inline mr-1" />
              Email
            </label>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="correo@ejemplo.com"
            />
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="text-indigo-600" size={20} />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">Dirección</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Dirección</label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Calle Principal, 123"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ciudad</label>
              <input
                type="text"
                value={profile.city}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Madrid"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Código Postal</label>
              <input
                type="text"
                value={profile.postalCode}
                onChange={(e) => handleChange('postalCode', e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="28001"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">País</label>
            <select
              value={profile.country}
              onChange={(e) => handleChange('country', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="España">España</option>
              <option value="México">México</option>
              <option value="Argentina">Argentina</option>
              <option value="Colombia">Colombia</option>
              <option value="Chile">Chile</option>
              <option value="Perú">Perú</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-slate-200">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Save size={18} />
          {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
};

export default PatientProfilePanel;
