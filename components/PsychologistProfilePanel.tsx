import React, { useState, useEffect } from 'react';
import { Save, Building, Phone, Mail, MapPin, CreditCard, User as UserIcon, FileText, Calendar, CheckCircle, AlertCircle, Link2 } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import { normalizePhone, detectDefaultPrefix } from '../services/phoneUtils';

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
  email_reminders_enabled?: boolean;
  whatsapp_reminders_enabled?: boolean;
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
    currency: 'EUR',
    email_reminders_enabled: false,
    whatsapp_reminders_enabled: false
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'professional' | 'connections'>('professional');

  // Google Calendar connection state
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(false);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleCalendarMsg, setGoogleCalendarMsg] = useState('');

  // Gestor emails state
  const [gestorEmails, setGestorEmails] = useState<string[]>([]);
  const [gestorEmailInput, setGestorEmailInput] = useState('');
  const [gestorSaving, setGestorSaving] = useState(false);
  const [gestorMsg, setGestorMsg] = useState('');

  useEffect(() => {
    loadProfile();
    checkConnections();
  }, [userId]);

  useEffect(() => {
    setProfile(prev => ({ ...prev, email: userEmail }));
  }, [userEmail]);

  const checkConnections = async () => {
    if (!userId) return;
    // Check Google Calendar
    try {
      const res = await apiFetch(`${API_URL}/google/status?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setGoogleCalendarConnected(data.connected);
      }
    } catch (_) {}
    // Check Google Calendar callback result in URL
    const params = new URLSearchParams(window.location.search);
    const gcResult = params.get('google_calendar');
    if (gcResult === 'success') {
      setGoogleCalendarConnected(true);
      setGoogleCalendarMsg('¡Google Calendar conectado correctamente!');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gcResult === 'error') {
      setGoogleCalendarMsg('Error al conectar Google Calendar. Inténtalo de nuevo.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleConnectGoogleCalendar = async () => {
    setGoogleCalendarLoading(true);
    setGoogleCalendarMsg('');
    try {
      const emailParam = userEmail ? `&email=${encodeURIComponent(userEmail)}` : '';
      const res = await apiFetch(`${API_URL}/google/auth-url?userId=${userId}${emailParam}`);
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      } else {
        setGoogleCalendarMsg('No se pudo iniciar la conexión. Inténtalo más tarde.');
      }
    } catch (_) {
      setGoogleCalendarMsg('Error de conexión con el servidor.');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!window.confirm('¿Desconectar Google Calendar? Las sesiones futuras no se sincronizarán.')) return;
    setGoogleCalendarLoading(true);
    setGoogleCalendarMsg('');
    try {
      const res = await apiFetch(`${API_URL}/google/disconnect?userId=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setGoogleCalendarConnected(false);
        setGoogleCalendarMsg('Google Calendar desconectado.');
      }
    } catch (_) {
      setGoogleCalendarMsg('Error al desconectar.');
    } finally {
      setGoogleCalendarLoading(false);
    }
  };

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${userId}/profile`);
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
          currency: data.currency || 'EUR',
          email_reminders_enabled: data.email_reminders_enabled ?? false,
          whatsapp_reminders_enabled: data.whatsapp_reminders_enabled ?? false
        });
        setGestorEmails(Array.isArray(data.gestor_emails) ? data.gestor_emails : []);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const prefix = detectDefaultPrefix();
      const payload = { ...profile, phone: normalizePhone(String(profile.phone || ''), prefix) };
      const response = await apiFetch(`${API_URL}/psychologist/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('professional')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'professional'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <UserIcon size={15} />
          Información profesional
        </button>
        <button
          onClick={() => setActiveTab('connections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'connections'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Link2 size={15} />
          Conexiones
        </button>
      </div>

      {/* Professional Information Tab */}
      {activeTab === 'professional' && (
        <div className="space-y-6">
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
                  onBlur={(e) => { const n = normalizePhone(e.target.value, detectDefaultPrefix()); if (n !== e.target.value) handleChange('phone', n); }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder={`${detectDefaultPrefix()} 600 000 000`}
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
                    type="text"
                    inputMode="decimal"
                    value={profile.sessionPrice === 0 ? '' : profile.sessionPrice}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        handleChange('sessionPrice', value === '' ? 0 : parseFloat(value) || 0);
                      }
                    }}
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

              {/* Recordatorios automáticos */}
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={profile.email_reminders_enabled ?? false}
                    onChange={(e) => handleChange('email_reminders_enabled' as any, e.target.checked as any)}
                    className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-semibold text-blue-700">Recordatorios automáticos por email</div>
                    <div className="text-xs text-blue-600">
                      Envía un email a tus pacientes el día antes y el mismo día de cada sesión que tenga el recordatorio activado.
                      Al activar esta opción, las nuevas sesiones tendrán el recordatorio activado por defecto.
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg cursor-pointer hover:bg-green-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={profile.whatsapp_reminders_enabled ?? false}
                    onChange={(e) => handleChange('whatsapp_reminders_enabled' as any, e.target.checked as any)}
                    className="w-5 h-5 rounded border-green-300 text-green-600 focus:ring-2 focus:ring-green-500"
                  />
                  <div>
                    <div className="font-semibold text-green-700">Recordatorios automáticos por WhatsApp</div>
                    <div className="text-xs text-green-600">
                      Envía un WhatsApp a tus pacientes el día antes y el mismo día de la sesión (requiere Twilio configurado y que el paciente tenga teléfono registrado).
                    </div>
                  </div>
                </label>
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
              {isSaving ? 'Guardando...' : 'Guardar Todos los Cambios'}
            </button>
          </div>
        </div>
      )}

      {/* Connections Tab */}
      {activeTab === 'connections' && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-slate-500">Conecta herramientas externas para ampliar las funcionalidades de tu consulta.</p>

          {/* Google Calendar Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${googleCalendarConnected ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                <Calendar size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-slate-900">Google Calendar</h4>
                  {googleCalendarConnected ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle size={11} /> Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      <AlertCircle size={11} /> No conectado
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {googleCalendarConnected
                    ? 'Las sesiones se sincronizan automáticamente con tu calendario y se generan enlaces de Google Meet reales.'
                    : 'Sincroniza tus sesiones con Google Calendar y genera enlaces de Meet automáticamente.'}
                </p>
                {googleCalendarMsg && (
                  <p className={`text-xs mt-2 ${googleCalendarMsg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>
                    {googleCalendarMsg}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4">
              {googleCalendarConnected ? (
                <button
                  onClick={handleDisconnectGoogleCalendar}
                  disabled={googleCalendarLoading}
                  className="w-full py-2 px-4 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {googleCalendarLoading ? 'Desconectando...' : 'Desconectar Google Calendar'}
                </button>
              ) : (
                <button
                  onClick={handleConnectGoogleCalendar}
                  disabled={googleCalendarLoading}
                  className="w-full py-2 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Calendar size={15} />
                  {googleCalendarLoading ? 'Redirigiendo...' : 'Conectar Google Calendar'}
                </button>
              )}
            </div>
          </div>

          {/* Gestor / Asesor Emails Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-indigo-50 text-indigo-600">
                <Mail size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 mb-1">Emails del gestor / asesor</h4>
                <p className="text-xs text-slate-500">
                  Añade los emails de tu gestor o asesor fiscal. Cada vez que emitas o rectifiques una factura, se enviará automáticamente a estas direcciones (y a ti mismo) en formato PDF.
                </p>
              </div>
            </div>

            {/* Lista de emails guardados */}
            {gestorEmails.length > 0 && (
              <div className="mb-3 space-y-2">
                {gestorEmails.map((email, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-sm text-slate-700 truncate">{email}</span>
                    <button
                      onClick={() => {
                        const updated = gestorEmails.filter((_, i) => i !== idx);
                        setGestorEmails(updated);
                      }}
                      className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0"
                      title="Eliminar"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input para añadir nuevo email */}
            <div className="flex gap-2">
              <input
                type="email"
                value={gestorEmailInput}
                onChange={(e) => setGestorEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = gestorEmailInput.trim().toLowerCase();
                    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !gestorEmails.includes(trimmed)) {
                      setGestorEmails([...gestorEmails, trimmed]);
                      setGestorEmailInput('');
                    }
                  }
                }}
                placeholder="gestor@ejemplo.com"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
              <button
                onClick={() => {
                  const trimmed = gestorEmailInput.trim().toLowerCase();
                  if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !gestorEmails.includes(trimmed)) {
                    setGestorEmails([...gestorEmails, trimmed]);
                    setGestorEmailInput('');
                  }
                }}
                disabled={!gestorEmailInput.trim()}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 text-sm font-medium"
              >
                Añadir
              </button>
            </div>

            {/* Guardar */}
            <div className="mt-4">
              <button
                onClick={async () => {
                  setGestorSaving(true);
                  setGestorMsg('');
                  try {
                    const res = await apiFetch(`${API_URL}/psychologist/${userId}/profile`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...profile, gestor_emails: gestorEmails })
                    });
                    if (res.ok) {
                      setGestorMsg('✓ Emails guardados correctamente');
                      setTimeout(() => setGestorMsg(''), 3000);
                    } else {
                      setGestorMsg('Error al guardar. Inténtalo de nuevo.');
                    }
                  } catch (_) {
                    setGestorMsg('Error de conexión.');
                  } finally {
                    setGestorSaving(false);
                  }
                }}
                disabled={gestorSaving}
                className="w-full py-2 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {gestorSaving ? 'Guardando...' : 'Guardar emails del gestor'}
              </button>
              {gestorMsg && (
                <p className={`text-xs mt-2 text-center ${gestorMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{gestorMsg}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PsychologistProfilePanel;
