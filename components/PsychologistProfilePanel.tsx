import React, { useState, useEffect } from 'react';
import { Save, Building, Phone, Mail, MapPin, CreditCard, User as UserIcon, FileText } from 'lucide-react';
import { API_URL } from '../services/config';

interface PsychologistProfile {
  // Personal Info
  name: string;
  professionalId: string;
  specialty: string;
  phone: string;
  email: string;
  
  // Address
  address: string;
  city: string;
  postalCode: string;
  country: string;
  
  // Billing Info
  businessName: string;
  taxId: string;
  iban: string;
  
  // Session Info
  sessionPrice: number;
  currency: string;
}

interface PsychologistProfileProps {
  userId: string;
  userEmail: string;
}

const PsychologistProfilePanel: React.FC<PsychologistProfileProps> = ({ userId, userEmail }) => {
  const [profile, setProfile] = useState<PsychologistProfile>({
    name: '',
    professionalId: '',
    specialty: '',
    phone: '',
    email: userEmail,
    address: '',
    city: '',
    postalCode: '',
    country: 'España',
    businessName: '',
    taxId: '',
    iban: '',
    sessionPrice: 0,
    currency: 'EUR'
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  useEffect(() => {
    setProfile(prev => ({ ...prev, email: userEmail }));
  }, [userEmail]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/psychologist/${userId}/profile`);
      if (response.ok) {
        const data = await response.json();
        setProfile({
          name: data.name || '',
          professionalId: data.professionalId || '',
          specialty: data.specialty || '',
          phone: data.phone || '',
          email: userEmail,
          address: data.address || '',
          city: data.city || '',
          postalCode: data.postalCode || '',
          country: data.country || 'España',
          businessName: data.businessName || '',
          taxId: data.taxId || '',
          iban: data.iban || '',
          sessionPrice: data.sessionPrice || 0,
          currency: data.currency || 'EUR'
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/psychologist/${userId}/profile`, {
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

  const handleChange = (field: keyof PsychologistProfile, value: string | number) => {
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
            <label className="block text-sm font-medium text-slate-700 mb-2">Nombre Completo *</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Dr. Juan Pérez"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nº Colegiado</label>
            <input
              type="text"
              value={profile.professionalId}
              onChange={(e) => handleChange('professionalId', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="M-12345"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Especialidad</label>
            <input
              type="text"
              value={profile.specialty}
              onChange={(e) => handleChange('specialty', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Psicología Clínica"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Phone size={14} className="inline mr-1" />
              Teléfono *
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
              Email *
            </label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 cursor-not-allowed"
              placeholder="correo@ejemplo.com"
            />
            <p className="text-xs text-slate-500 mt-1">El email está vinculado a tu cuenta y no se puede modificar</p>
          </div>
        </div>

        {/* Address Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="text-indigo-600" size={20} />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">Dirección</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Dirección de Consulta</label>
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

        {/* Billing Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Building className="text-indigo-600" size={20} />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">Datos de Facturación</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nombre Fiscal / Empresa</label>
            <input
              type="text"
              value={profile.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Nombre que aparecerá en las facturas"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <FileText size={14} className="inline mr-1" />
              NIF / CIF
            </label>
            <input
              type="text"
              value={profile.taxId}
              onChange={(e) => handleChange('taxId', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="12345678A"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <CreditCard size={14} className="inline mr-1" />
              IBAN
            </label>
            <input
              type="text"
              value={profile.iban}
              onChange={(e) => handleChange('iban', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="ES00 0000 0000 0000 0000 0000"
            />
          </div>
        </div>

        {/* Session Pricing */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="text-indigo-600" size={20} />
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">Tarifas de Sesión</h3>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Precio por Sesión</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="number"
                value={profile.sessionPrice}
                onChange={(e) => handleChange('sessionPrice', parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="0.00"
              />
              <select
                value={profile.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
                className="w-full sm:w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-1">Este precio se usará por defecto al crear facturas</p>
          </div>

          {/* Preview Card */}
          <div className="mt-6 p-3 sm:p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
            <div className="text-xs text-indigo-700 uppercase font-semibold mb-2">Vista Previa de Factura</div>
            <div className="bg-white rounded-lg p-3 sm:p-4 space-y-2">
              <div className="font-semibold text-sm sm:text-base text-slate-900 break-words">{profile.businessName || 'Nombre Fiscal'}</div>
              <div className="text-xs text-slate-600 break-words">{profile.taxId || 'NIF/CIF'}</div>
              <div className="text-xs text-slate-600 break-words">
                {profile.address && `${profile.address}, `}
                {profile.postalCode && `${profile.postalCode} `}
                {profile.city}
              </div>
              <div className="pt-2 border-t border-slate-200">
                <div className="flex justify-between items-center gap-2 text-sm flex-wrap">
                  <span className="text-slate-600 text-xs sm:text-sm">Sesión de terapia</span>
                  <span className="font-semibold text-slate-900 text-sm sm:text-base whitespace-nowrap">
                    {profile.sessionPrice > 0 ? `${profile.sessionPrice.toFixed(2)} ${profile.currency}` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button (Bottom) */}
      <div className="flex justify-end pt-4 border-t border-slate-200">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          <Save size={18} />
          {isSaving ? 'Guardando...' : 'Guardar Todos los Cambios'}
        </button>
      </div>
    </div>
  );
};

export default PsychologistProfilePanel;
