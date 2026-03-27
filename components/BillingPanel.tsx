import React, { useState, useEffect } from 'react';
import { FileText, Plus, DollarSign, Check, Clock, ExternalLink, Download, Eye, Edit, Trash2, Send, CheckSquare, Square, Search, Building, User, X, ArrowUpDown, Archive } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import { AddressAutocomplete } from './AddressAutocomplete';

interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patient_user_id?: string;
  patientName: string;
  amount: number;
  tax?: number;
  total?: number;
  taxRate?: number;
  date: string;
  dueDate: string;
  invoice_date?: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled' | 'draft';
  stripePaymentLink?: string;
  description: string;
  items: InvoiceItem[];
  cancelledAt?: string;
  psychologist_user_id?: string;
  psychologistId?: string;
  invoice_type?: 'patient' | 'center';
  sessionIds?: string[];
  bonoIds?: string[];
  irpf?: number; // Porcentaje de IRPF (0-100), solo para facturas a centros
  
  // Datos de facturación del cliente
  billing_client_name?: string;
  billing_client_address?: string;
  billing_client_tax_id?: string;
  billing_client_postal_code?: string;
  billing_client_country?: string;
  
  // Datos de facturación del psicólogo
  billing_psychologist_name?: string;
  billing_psychologist_address?: string;
  billing_psychologist_tax_id?: string;
  
  // Notas de la factura
  notes?: string;

  // Bloque de firma al pie
  show_signature?: boolean;
  
  // Campos para facturas rectificativas
  is_rectificativa?: boolean;
  rectifies_invoice_id?: string;
  rectified_by_invoice_id?: string;
  rectification_type?: string;  // R1, R2, R3, R4, R5
  rectification_reason?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Session {
  id: string;
  date: string;
  starts_on: string;
  ends_on?: string;
  endTime?: string;
  status: string;
  notes?: string;
  price?: number;
  percent_psych?: number;
  invoice_id?: string;
  bonus_id?: string;
  patient_user_id?: string;
  patientName?: string;
}

const getSessionDurationHours = (session: Session): number => {
  if (session.starts_on && session.ends_on) {
    const durationMs = new Date(session.ends_on).getTime() - new Date(session.starts_on).getTime();
    const hours = durationMs / (1000 * 60 * 60);
    if (hours > 0 && hours <= 24) return hours;
  }
  return 1;
};

const getSessionBillingPrice = (session: Session): number => {
  return (session.price || 0) * getSessionDurationHours(session);
};

interface Bono {
  id: string;
  total_sessions_amount: number;
  total_price_bono_amount: number;
  used_sessions: number;
  remaining_sessions: number;
  paid: boolean;
  created_at: string;
  invoice_id?: string;
  percent_psych?: number;
  pacient_user_id?: string;
  patientName?: string;
}

interface Patient {
  id: string;
  name: string;
  email: string;
  billing_name?: string;
  billing_address?: string;
  billing_tax_id?: string;
  postalCode?: string;
  country?: string;
}

interface Center {
  id: string;
  center_name: string;
  cif: string;
  address: string;
  nombre_comercial?: string;
  direccion_comercial?: string;
  psychologist_user_id: string;
  created_at: string;
}

interface BillingPanelProps {
  psychologistId: string;
  patientId?: string;
  canCreate?: boolean;
  onNeedUpgrade?: () => void;
}

const BillingPanel: React.FC<BillingPanelProps> = ({ psychologistId, patientId, canCreate = true, onNeedUpgrade }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showRectificativas, setShowRectificativas] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<Invoice | null>(null);
  const [rectificationType, setRectificationType] = useState('R4');
  const [rectificationReason, setRectificationReason] = useState('');
  const [showInvoiceStartModal, setShowInvoiceStartModal] = useState(false);
  const [invoiceStartNumber, setInvoiceStartNumber] = useState<string>('');
  const [invoiceSeriesInput, setInvoiceSeriesInput] = useState<string>('');
  const [pendingInvoiceData, setPendingInvoiceData] = useState<any>(null);
  const [showRectSeriesModal, setShowRectSeriesModal] = useState(false);
  const [rectSeriesInput, setRectSeriesInput] = useState<string>('');
  const [rectStartNumber, setRectStartNumber] = useState<string>('');
  const [pendingRectData, setPendingRectData] = useState<{ rectificationType: string; rectificationReason: string } | null>(null);

  // Estado para advertencia de fecha retroactiva
  const [showBackdateWarning, setShowBackdateWarning] = useState(false);
  const [backdateWarningInfo, setBackdateWarningInfo] = useState<{ isDraft: boolean; lastInvoiceDate: string; lastInvoiceNumber: string } | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showZipPanel, setShowZipPanel] = useState(false);
  const [zipDateFrom, setZipDateFrom] = useState('');
  const [zipDateTo, setZipDateTo] = useState('');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Detalle de sesiones/bonos de la factura seleccionada
  const [invoiceItems, setInvoiceItems] = useState<{ sessions: any[], bonos: any[] } | null>(null);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  
  // Form state
  const [invoiceType, setInvoiceType] = useState<'patient' | 'center'>('patient');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedCenterId, setSelectedCenterId] = useState('');
  const [availableSessions, setAvailableSessions] = useState<Session[]>([]);
  const [availableBonos, setAvailableBonos] = useState<Bono[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedBonoIds, setSelectedBonoIds] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    description: '',
    notes: 'Servicio exento de IVA según el artículo 20 3a de la ley 37/1992 del Impuesto sobre el Valor Añadido.',
    taxRate: 21,
    irpf: 15,
    billing_client_name: '',
    billing_client_address: '',
    billing_client_tax_id: '',
    billing_client_postal_code: '',
    billing_client_country: '',
    billing_psychologist_name: '',
    billing_psychologist_address: '',
    billing_psychologist_tax_id: '',
    show_signature: false
  });
  
  const [psychologistProfile, setPsychologistProfile] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estado para búsqueda de pacientes/centros
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [centerSearchTerm, setCenterSearchTerm] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [showCenterDropdown, setShowCenterDropdown] = useState(false);
  const [patientCenterWarning, setPatientCenterWarning] = useState<{ centerName: string; centerId: string } | null>(null);
  const [contextPatient, setContextPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadInvoices();
    loadPsychologistProfile();
    if (!patientId) {
      loadPatients();
      loadCenters();
    } else {
      loadContextPatient();
    }
  }, [psychologistId, patientId]);

  // Cargar detalles de sesiones/bonos cuando se abre el modal de ver factura
  useEffect(() => {
    if (!selectedInvoice) {
      setInvoiceItems(null);
      return;
    }
    setIsLoadingItems(true);
    apiFetch(`${API_URL}/invoices/${selectedInvoice.id}/items`)
      .then(r => r.ok ? r.json() : { sessions: [], bonos: [] })
      .then(data => setInvoiceItems(data))
      .catch(() => setInvoiceItems({ sessions: [], bonos: [] }))
      .finally(() => setIsLoadingItems(false));
  }, [selectedInvoice?.id]);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const url = patientId 
        ? `${API_URL}/invoices?psychologist_user_id=${psychologistId}&patient_user_id=${patientId}`
        : `${API_URL}/invoices?psychologist_user_id=${psychologistId}`;
      const response = await apiFetch(url);
      if (response.ok) {
        const data = await response.json();
        setInvoices(data);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    }
    setIsLoading(false);
  };

  const loadPatients = async () => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadCenters = async () => {
    try {
      const response = await apiFetch(`${API_URL}/centers?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCenters(data);
      }
    } catch (error) {
      console.error('Error loading centers:', error);
    }
  };

  const loadContextPatient = async () => {
    if (!patientId) return;
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/patients`);
      if (response.ok) {
        const data = await response.json();
        const patient = data.find((p: Patient) => p.id === patientId);
        if (patient) setContextPatient(patient);
      }
    } catch (error) {
      console.error('Error loading context patient:', error);
    }
  };

  const loadPsychologistProfile = async () => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (response.ok) {
        const data = await response.json();
        console.log('[BillingPanel] Perfil del psicólogo cargado:', data);
        setPsychologistProfile(data);
        // Precargar datos del psicólogo siempre
        setFormData(prev => ({
          ...prev,
          billing_psychologist_name: data.businessName || data.name || '',
          billing_psychologist_address: data.address || '',
          billing_psychologist_tax_id: data.taxId || ''
        }));
      }
    } catch (error) {
      console.error('Error loading psychologist profile:', error);
    }
  };

  const loadUnbilledItems = async (patId: string) => {
    try {
      const response = await apiFetch(`${API_URL}/patient/${patId}/unbilled?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        // Deduplicar por ID por seguridad
        const sessions: Session[] = data.sessions || [];
        const uniqueSessions = sessions.filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);
        setAvailableSessions(uniqueSessions);
        setAvailableBonos(data.bonos || []);
      }
    } catch (error) {
      console.error('Error loading unbilled items:', error);
    }
  };

  const loadCenterUnbilledSessions = async (centerId: string) => {
    try {
      const response = await apiFetch(`${API_URL}/center/${centerId}/unbilled?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        // Deduplicar por ID por seguridad
        const sessions: Session[] = data.sessions || [];
        const uniqueSessions = sessions.filter((s, idx, arr) => arr.findIndex(x => x.id === s.id) === idx);
        setAvailableSessions(uniqueSessions);
        setAvailableBonos(data.bonos || []);
      }
    } catch (error) {
      console.error('Error loading center unbilled sessions:', error);
    }
  };

  const handlePatientSelect = async (patId: string) => {
    setSelectedPatientId(patId);
    setPatientCenterWarning(null);
    const patient = patients.find(p => p.id === patId);
    console.log('[BillingPanel] Paciente seleccionado:', patient);
    if (patient) {
      // Precargar datos del paciente
      setFormData(prev => ({
        ...prev,
        billing_client_name: patient.billing_name || patient.name || '',
        billing_client_address: patient.billing_address || '',
        billing_client_tax_id: patient.billing_tax_id || '',
        billing_client_postal_code: patient.postalCode || '',
        billing_client_country: patient.country || ''
      }));
      console.log('[BillingPanel] Datos de facturación del cliente precargados:', {
        billing_client_name: patient.billing_name || patient.name,
        billing_client_address: patient.billing_address,
        billing_client_tax_id: patient.billing_tax_id
      });

      // Comprobar si el paciente pertenece a un centro
      try {
        const relResp = await apiFetch(`${API_URL}/relationships?psychologistId=${psychologistId}&patientId=${patId}`);
        if (relResp.ok) {
          const rels = await relResp.json();
          const relWithCenter = rels.find((r: any) => r.center_id);
          if (relWithCenter) {
            const center = centers.find(c => c.id === relWithCenter.center_id);
            setPatientCenterWarning({
              centerName: center?.nombre_comercial || center?.center_name || relWithCenter.center_id,
              centerId: relWithCenter.center_id
            });
          }
        }
      } catch (err) {
        console.error('Error comprobando centro del paciente:', err);
      }

      // Cargar sesiones y bonos sin facturar
      await loadUnbilledItems(patId);
    }
  };

  const handleCenterSelect = async (centerId: string) => {
    setSelectedCenterId(centerId);
    const center = centers.find(c => c.id === centerId);
    console.log('[BillingPanel] Centro seleccionado:', center);
    if (center) {
      // Precargar datos del centro
      setFormData(prev => ({
        ...prev,
        billing_client_name: center.center_name || '',
        billing_client_address: center.address || '',
        billing_client_tax_id: center.cif || ''
      }));
      console.log('[BillingPanel] Datos de facturación del centro precargados:', {
        billing_client_name: center.center_name,
        billing_client_address: center.address,
        billing_client_tax_id: center.cif
      });
      
      // Cargar sesiones sin facturar del centro
      await loadCenterUnbilledSessions(centerId);
    }
  };

  const toggleSession = (sessionId: string) => {
    const newSet = new Set(selectedSessionIds);
    if (newSet.has(sessionId)) {
      newSet.delete(sessionId);
    } else {
      newSet.add(sessionId);
    }
    setSelectedSessionIds(newSet);
  };

  const toggleBono = (bonoId: string) => {
    const newSet = new Set(selectedBonoIds);
    if (newSet.has(bonoId)) {
      newSet.delete(bonoId);
    } else {
      newSet.add(bonoId);
    }
    setSelectedBonoIds(newSet);
  };

  const calculateTotal = () => {
    let subtotal = 0;
    
    // Sumar sesiones seleccionadas (para paciente y centro)
    selectedSessionIds.forEach(sessionId => {
      const session = availableSessions.find(s => s.id === sessionId);
      if (session && session.price) {
        const sessionTotal = getSessionBillingPrice(session);
        // Para centro, usar el porcentaje del psicólogo
        if (invoiceType === 'center' && session.percent_psych) {
          subtotal += (sessionTotal * session.percent_psych) / 100;
        } else {
          subtotal += sessionTotal;
        }
      }
    });
    
    // Sumar bonos seleccionados
    selectedBonoIds.forEach(bonoId => {
      const bono = availableBonos.find(b => b.id === bonoId);
      if (bono) {
        // Para centro, usar el porcentaje del psicólogo
        if (invoiceType === 'center' && bono.percent_psych) {
          subtotal += (bono.total_price_bono_amount * bono.percent_psych) / 100;
        } else {
          subtotal += bono.total_price_bono_amount;
        }
      }
    });
    
    const tax = subtotal * (formData.taxRate / 100);
    
    // Para facturas a centros, restar el IRPF
    let irpfAmount = 0;
    if (invoiceType === 'center') {
      irpfAmount = subtotal * (formData.irpf / 100);
    }
    
    const total = subtotal + tax - irpfAmount;
    return { subtotal, tax, total, irpf: irpfAmount };
  };

  const getInvoiceStartNumber = async (year: number): Promise<number | null> => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (!response.ok) return null;
      
      const profile = await response.json();
      const startNumbers = profile?.invoice_start_numbers;
      return startNumbers?.[year] || null;
    } catch (error) {
      console.error('Error getting invoice start number:', error);
      return null;
    }
  };

  const getInvoiceSeries = async (year: number): Promise<string | null> => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (!response.ok) return null;
      const profile = await response.json();
      return profile?.invoice_series?.[year] || null;
    } catch (error) {
      console.error('Error getting invoice series:', error);
      return null;
    }
  };

  const saveInvoiceStartNumber = async (year: number, startNumber: number, series?: string) => {
    try {
      // Obtener el perfil actual
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (!response.ok) throw new Error('Failed to fetch profile');
      
      const profile = await response.json();
      const startNumbers = profile.invoice_start_numbers || {};
      
      // Actualizar con el nuevo número inicial para este año
      startNumbers[year] = startNumber;

      // Guardar la serie personalizada si se proporcionó
      const invoiceSeriesMap = profile.invoice_series || {};
      if (series) invoiceSeriesMap[year] = series;
      
      // Guardar en el perfil
      const updateResponse = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          invoice_start_numbers: startNumbers,
          invoice_series: invoiceSeriesMap
        })
      });
      
      if (!updateResponse.ok) throw new Error('Failed to update profile');
      return true;
    } catch (error) {
      console.error('Error saving invoice start number:', error);
      return false;
    }
  };

  const getRectificativaSeries = async (year: number): Promise<string | null> => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (!response.ok) return null;
      const profile = await response.json();
      return profile?.rect_series?.[year] || null;
    } catch (error) {
      console.error('Error getting rectificativa series:', error);
      return null;
    }
  };

  const saveRectificativaConfig = async (year: number, startNumber: number, series: string): Promise<boolean> => {
    try {
      const response = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
      if (!response.ok) throw new Error('Failed to fetch profile');
      const profile = await response.json();

      const rectSeriesMap = profile.rect_series || {};
      rectSeriesMap[year] = series;

      const rectStartNumbers = profile.rect_start_numbers || {};
      rectStartNumbers[year] = startNumber;

      const updateResponse = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, rect_series: rectSeriesMap, rect_start_numbers: rectStartNumbers })
      });
      if (!updateResponse.ok) throw new Error('Failed to update profile');
      return true;
    } catch (error) {
      console.error('Error saving rectificativa config:', error);
      return false;
    }
  };

  const generateRectificativaNumber = async (): Promise<string | null> => {
    try {
      const response = await apiFetch(`${API_URL}/invoices?psychologist_user_id=${psychologistId}`);
      if (!response.ok) throw new Error('Failed to fetch invoices for rect numbering');
      const allInvoices = await response.json();
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2);

      const customSeries = await getRectificativaSeries(year);
      const prefix = customSeries || `R${yearSuffix}`;

      const rectInvoices = allInvoices.filter((inv: any) =>
        inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix) && inv.is_rectificativa
      );

      if (rectInvoices.length === 0) {
        // Primera rectificativa: ver si hay número inicial configurado
        if (!customSeries) {
          // No hay configuración todavía → pedir al usuario
          return null;
        }
        // Hay serie configurada, buscar número inicial
        try {
          const profileResp = await apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`);
          if (profileResp.ok) {
            const prof = await profileResp.json();
            const startNum = prof?.rect_start_numbers?.[year];
            if (startNum != null) return `${prefix}${startNum}`;
          }
        } catch {}
        return `${prefix}1`;
      }

      const numbers = rectInvoices.map((inv: any) => {
        const numPart = inv.invoiceNumber.slice(prefix.length);
        return parseInt(numPart || '0', 10);
      });
      const maxNumber = Math.max(...numbers, 0);
      return `${prefix}${maxNumber + 1}`;
    } catch (error) {
      console.error('Error generating rectificativa number:', error);
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2);
      return `R${yearSuffix}${String(Date.now()).slice(-6)}`;
    }
  };

  const generateInvoiceNumber = async (): Promise<string | null> => {
    try {
      const response = await apiFetch(`${API_URL}/invoices?psychologist_user_id=${psychologistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices for numbering');
      }
      
      const allInvoices = await response.json();
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2); // Últimos 2 dígitos del año (ej: 26)
      const defaultPrefix = `F${yearSuffix}`;
      
      // Comprobar si hay una serie personalizada configurada para este año
      const customSeries = await getInvoiceSeries(year);

      if (customSeries) {
        // --- Serie personalizada (sin padding fijo) ---
        const invoicesThisSeries = allInvoices.filter((inv: any) =>
          inv.invoiceNumber && inv.invoiceNumber.startsWith(customSeries)
        );

        if (invoicesThisSeries.length === 0) {
          const startNumber = await getInvoiceStartNumber(year);
          if (startNumber === null) return null;
          return `${customSeries}${startNumber}`;
        }

        const numbers = invoicesThisSeries.map((inv: any) => {
          const numPart = inv.invoiceNumber.slice(customSeries.length);
          return parseInt(numPart || '0', 10);
        });
        const maxNumber = Math.max(...numbers, 0);
        return `${customSeries}${maxNumber + 1}`;
      }

      // --- Sin serie personalizada: usar prefijo por defecto (F26 + 6 dígitos) ---
      const invoicesThisYear = allInvoices.filter((inv: any) => 
        inv.invoiceNumber && inv.invoiceNumber.startsWith(defaultPrefix)
      );
      
      // Si es la primera factura del año, verificar si hay un número inicial configurado
      if (invoicesThisYear.length === 0) {
        const startNumber = await getInvoiceStartNumber(year);
        
        // Si no hay número inicial configurado, pedir al usuario (mostrar modal)
        if (startNumber === null) {
          return null;
        }
        
        return `${defaultPrefix}${String(startNumber).padStart(6, '0')}`;
      }
      
      // Extraer los números de secuencia y buscar el siguiente
      const numbers = invoicesThisYear.map((inv: any) => {
        const numPart = inv.invoiceNumber.replace(defaultPrefix, '');
        return parseInt(numPart || '0', 10);
      });
      
      const maxNumber = Math.max(...numbers, 0);
      return `${defaultPrefix}${String(maxNumber + 1).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2);
      return `F${yearSuffix}${String(Date.now()).slice(-6)}`;
    }
  };

  const geocodeAddress = async (address: string): Promise<{ postalCode: string; country: string } | null> => {
    try {
      const res = await apiFetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&addressdetails=1&limit=1`,
        { headers: { 'Accept-Language': 'es', 'User-Agent': 'mainds-therapy-app/1.0' } }
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const a = data[0].address;
        return { postalCode: a.postcode || '', country: a.country || '' };
      }
    } catch (e) {
      // silently ignore
    }
    return null;
  };

  const handleSaveInvoice = async (isDraft: boolean, backdateConfirmed: boolean = false) => {
    if (isSubmitting) return;
    
    // Validar según el tipo de factura
    if (invoiceType === 'patient') {
      if (!selectedPatientId || !formData.date) {
        alert('Por favor completa todos los campos requeridos');
        return;
      }

      if (selectedSessionIds.size === 0 && selectedBonoIds.size === 0) {
        alert('Debes seleccionar al menos una sesión o un bono');
        return;
      }
    } else { // center
      if (!selectedCenterId || !formData.date) {
        alert('Por favor completa todos los campos requeridos');
        return;
      }
      
      if (selectedSessionIds.size === 0 && selectedBonoIds.size === 0) {
        alert('Debes seleccionar al menos una sesión o un bono del centro');
        return;
      }
    }

    const today = new Date().toISOString().split('T')[0];
    // Al convertir un borrador en factura real, usar siempre la fecha de hoy
    const isDraftConversion = !isDraft && editingInvoice?.status === 'draft';
    const effectiveDate = isDraftConversion ? today : formData.date;

    // No permitir fechas futuras
    if (!isDraft && effectiveDate > today) {
      alert('No se puede emitir una factura con fecha futura. La fecha se ha ajustado a hoy.');
      setFormData(prev => ({ ...prev, date: today }));
      return;
    }

    // Comprobar cronología respecto a la última factura emitida (solo para facturas reales, no borradores)
    if (!isDraft && !backdateConfirmed) {
      const lastInvoice = invoices
        .filter(inv =>
          inv.status !== 'draft' &&
          !inv.is_rectificativa &&
          inv.invoiceNumber &&
          // Excluir la factura que estamos editando (en caso de edición)
          (!editingInvoice || inv.id !== editingInvoice.id)
        )
        .sort((a, b) => {
          const dateA = a.invoice_date || a.date || '';
          const dateB = b.invoice_date || b.date || '';
          return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
        })[0];

      if (lastInvoice) {
        const lastDate = (lastInvoice.invoice_date || lastInvoice.date || '').split('T')[0];
        if (effectiveDate < lastDate) {
          setBackdateWarningInfo({
            isDraft,
            lastInvoiceDate: lastDate,
            lastInvoiceNumber: lastInvoice.invoiceNumber
          });
          setShowBackdateWarning(true);
          return;
        }
      }
    }

    setIsSubmitting(true);
    
    try {
      const invoiceNumber = await generateInvoiceNumber();
      
      // Si invoiceNumber es null, significa que es la primera factura del año y necesitamos preguntar
      if (invoiceNumber === null && !editingInvoice) {
        setIsSubmitting(false);
        setPendingInvoiceData({ isDraft });
        // Pre-rellenar la serie por defecto (F26) como sugerencia
        const yearSuffix = String(new Date().getFullYear()).slice(-2);
        setInvoiceSeriesInput(`F${yearSuffix}`);
        setInvoiceStartNumber('1');
        setShowInvoiceStartModal(true);
        return;
      }
      
      const totals = calculateTotal();

      // Si hay dirección pero faltan CP o país, geocodificar para completarlos
      let resolvedPostalCode = formData.billing_client_postal_code;
      let resolvedCountry = formData.billing_client_country;
      if (formData.billing_client_address && (!resolvedPostalCode || !resolvedCountry)) {
        const geo = await geocodeAddress(formData.billing_client_address);
        if (geo) {
          if (!resolvedPostalCode) resolvedPostalCode = geo.postalCode;
          if (!resolvedCountry) resolvedCountry = geo.country;
        }
      }

      // Datos base de la factura
      const newInvoice: any = {
        id: editingInvoice?.id || Date.now().toString(),
        invoiceNumber: editingInvoice?.invoiceNumber || invoiceNumber,
        amount: totals.subtotal,
        date: effectiveDate,
        invoice_date: effectiveDate,
        dueDate: formData.dueDate,
        status: isDraft ? 'draft' : 'pending',
        description: formData.description,
        notes: formData.notes,
        items: [],
        psychologist_user_id: psychologistId,
        psychologistId: psychologistId,
        tax: totals.tax,
        total: totals.total,
        taxRate: formData.taxRate,
        invoice_type: invoiceType,
        billing_client_name: formData.billing_client_name,
        billing_client_address: formData.billing_client_address,
        billing_client_tax_id: formData.billing_client_tax_id,
        billing_client_postal_code: resolvedPostalCode,
        billing_client_country: resolvedCountry,
        billing_psychologist_name: formData.billing_psychologist_name,
        billing_psychologist_address: formData.billing_psychologist_address,
        billing_psychologist_tax_id: formData.billing_psychologist_tax_id,
        show_signature: formData.show_signature
      };

      // Añadir IRPF solo para facturas a centros
      if (invoiceType === 'center') {
        newInvoice.irpf = formData.irpf || 0;
      }

      // Añadir datos específicos según el tipo
      if (invoiceType === 'patient') {
        const patient = patients.find(p => p.id === selectedPatientId) || contextPatient;
        if (!patient) return;
        
        newInvoice.patientId = selectedPatientId;
        newInvoice.patient_user_id = selectedPatientId;
        newInvoice.patientName = patient.name;
        newInvoice.sessionIds = Array.from(selectedSessionIds);
        newInvoice.bonoIds = Array.from(selectedBonoIds);
      } else {
        const center = centers.find(c => c.id === selectedCenterId);
        if (!center) return;
        
        newInvoice.centerId = selectedCenterId;
        newInvoice.patientName = center.center_name; // Usar el nombre del centro
        newInvoice.sessionIds = Array.from(selectedSessionIds); // Incluir sesiones del centro
        newInvoice.bonoIds = Array.from(selectedBonoIds); // Incluir bonos del centro
      }

      const method = editingInvoice ? 'PATCH' : 'POST';
      const url = editingInvoice ? `${API_URL}/invoices/${editingInvoice.id}` : `${API_URL}/invoices`;

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': psychologistId },
        body: JSON.stringify(newInvoice)
      });

      if (response.ok) {
        const savedInvoice = await response.json();
        await loadInvoices();
        handleCloseModal();
        alert(isDraft ? 'Borrador guardado correctamente' : 'Factura creada correctamente');
        // Enviar por email cuando se emite (no borradores)
        if (!isDraft && savedInvoice?.id) {
          apiFetch(`${API_URL}/invoices/${savedInvoice.id}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }).catch(() => {/* silencioso: el envío de email no bloquea el flujo */});
        }
      } else {
        const errorData = await response.json();
        alert('Error: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error saving invoice:', error);
      alert('Error al guardar la factura');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmInvoiceStart = async () => {
    const startNum = parseInt(invoiceStartNumber);
    if (isNaN(startNum) || startNum < 1) {
      alert('Por favor ingresa un número válido mayor a 0');
      return;
    }

    const trimmedSeries = invoiceSeriesInput.trim();
    if (!trimmedSeries) {
      alert('Por favor ingresa una serie de facturación (ej: F26)');
      return;
    }

    const year = new Date().getFullYear();
    const success = await saveInvoiceStartNumber(year, startNum, trimmedSeries);
    
    if (!success) {
      alert('Error al guardar la configuración. Inténtalo de nuevo.');
      return;
    }

    // Cerrar el modal y reintentar crear la factura
    setShowInvoiceStartModal(false);
    setInvoiceStartNumber('');
    setInvoiceSeriesInput('');
    
    // Llamar nuevamente a handleSaveInvoice con los datos pendientes
    if (pendingInvoiceData) {
      await handleSaveInvoice(pendingInvoiceData.isDraft);
      setPendingInvoiceData(null);
    }
  };

  const handleConfirmRectStart = async () => {
    const startNum = parseInt(rectStartNumber);
    if (isNaN(startNum) || startNum < 1) {
      alert('Por favor ingresa un número válido mayor a 0');
      return;
    }
    const trimmedSeries = rectSeriesInput.trim();
    if (!trimmedSeries) {
      alert('Por favor ingresa una serie para las rectificativas (ej: R26)');
      return;
    }

    const year = new Date().getFullYear();
    const success = await saveRectificativaConfig(year, startNum, trimmedSeries);
    if (!success) {
      alert('Error al guardar la configuración. Inténtalo de nuevo.');
      return;
    }

    setShowRectSeriesModal(false);
    setRectSeriesInput('');
    setRectStartNumber('');

    // Continuar con la rectificativa usando el número configurado
    if (pendingRectData) {
      const explicit = `${trimmedSeries}${startNum}`;
      setPendingRectData(null);
      await handleCancelInvoice(explicit);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este borrador?')) return;
    
    try {
      const response = await apiFetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadInvoices();
        alert('Borrador eliminado correctamente');
      } else {
        const errorData = await response.json();
        alert('Error: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      alert('Error al eliminar la factura');
    }
  };

  const handleStatusChange = async (invoiceId: string, newStatus: 'paid' | 'pending') => {
    try {
      const response = await apiFetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': psychologistId 
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        await loadInvoices();
        setSelectedInvoice(null);
        alert(`Factura marcada como ${newStatus === 'paid' ? 'pagada' : 'pendiente'}`);
      } else {
        const errorData = await response.json();
        alert('Error: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert('Error al actualizar el estado de la factura');
    }
  };

  const handleToggleSignature = async (invoice: Invoice) => {
    const newValue = !(invoice as any).show_signature;
    try {
      const response = await apiFetch(`${API_URL}/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': psychologistId
        },
        body: JSON.stringify({ show_signature: newValue })
      });
      if (response.ok) {
        const updated = { ...invoice, show_signature: newValue } as any;
        setSelectedInvoice(updated);
        setInvoices(prev => prev.map(inv => inv.id === invoice.id ? updated : inv));
      } else {
        alert('Error al actualizar la firma');
      }
    } catch (error) {
      console.error('Error toggling signature:', error);
      alert('Error al actualizar la firma');
    }
  };

  const handleCancelInvoice = async (explicitInvoiceNumber?: string) => {
    if (!invoiceToCancel) return;

    // Si no tenemos un número explícito, generarlo (o pedir configuración si es la primera)
    let rectNumber = explicitInvoiceNumber;
    if (!rectNumber) {
      rectNumber = (await generateRectificativaNumber()) ?? undefined;
      if (!rectNumber) {
        // Primera rectificativa sin configuración → mostrar modal de serie
        const yearSuffix = String(new Date().getFullYear()).slice(-2);
        setRectSeriesInput(`R${yearSuffix}`);
        setRectStartNumber('1');
        setPendingRectData({ rectificationType, rectificationReason });
        setShowRectSeriesModal(true);
        return;
      }
    }

    try {
      const response = await apiFetch(`${API_URL}/invoices/${invoiceToCancel.id}/rectify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': psychologistId 
        },
        body: JSON.stringify({
          rectification_type: rectificationType,
          rectification_reason: rectificationReason,
          invoiceNumber: rectNumber
        })
      });
      
      if (response.ok) {
        const rectData = await response.json();
        await loadInvoices();
        setShowCancelModal(false);
        setInvoiceToCancel(null);
        setSelectedInvoice(null);
        setRectificationType('R4');
        setRectificationReason('');
        alert('Factura cancelada y rectificativa creada correctamente');
        // Enviar rectificativa por email
        const rectId = rectData?.rectificativa?.id;
        if (rectId) {
          apiFetch(`${API_URL}/invoices/${rectId}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }).catch(() => {/* silencioso */});
        }
      } else {
        const errorData = await response.json();
        alert('Error: ' + (errorData.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      alert('Error al cancelar la factura');
    }
  };

  const handleEditInvoice = async (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setShowNewInvoice(true);
    setInvoiceType(invoice.invoice_type || 'patient');
    
    // Cargar datos del formulario
    setFormData({
      date: invoice.date,
      dueDate: invoice.dueDate,
      description: invoice.description || '',
      notes: (invoice as any).notes || '',
      taxRate: invoice.taxRate || 21,
      irpf: invoice.irpf || 15,
      billing_client_name: invoice.billing_client_name || '',
      billing_client_address: invoice.billing_client_address || '',
      billing_client_tax_id: invoice.billing_client_tax_id || '',
      billing_client_postal_code: invoice.billing_client_postal_code || '',
      billing_client_country: invoice.billing_client_country || '',
      billing_psychologist_name: invoice.billing_psychologist_name || '',
      billing_psychologist_address: invoice.billing_psychologist_address || '',
      billing_psychologist_tax_id: invoice.billing_psychologist_tax_id || '',
      show_signature: (invoice as any).show_signature || false
    });
    
    // Cargar sesiones según el tipo de factura
    if (invoice.invoice_type === 'center' && (invoice as any).centerId) {
      setSelectedCenterId((invoice as any).centerId);
      const center = centers.find(c => c.id === (invoice as any).centerId);
      if (center) {
        setCenterSearchTerm(center.nombre_comercial || center.center_name);
      }
      await loadCenterUnbilledSessions((invoice as any).centerId);
    } else {
      const patientId = invoice.patient_user_id || invoice.patientId || '';
      setSelectedPatientId(patientId);
      const patient = patients.find(p => p.id === patientId);
      if (patient) {
        setPatientSearchTerm(patient.name);
      }
      await loadUnbilledItems(patientId);
    }
    
    setSelectedSessionIds(new Set(invoice.sessionIds || []));
    setSelectedBonoIds(new Set(invoice.bonoIds || []));
  };

  const handleCloseModal = () => {
    setShowNewInvoice(false);
    setEditingInvoice(null);
    setInvoiceType('patient');
    setSelectedPatientId('');
    setSelectedCenterId('');
    setPatientSearchTerm('');
    setCenterSearchTerm('');
    setShowPatientDropdown(false);
    setShowCenterDropdown(false);
    setPatientCenterWarning(null);
    setAvailableSessions([]);
    setAvailableBonos([]);
    setSelectedSessionIds(new Set());
    setSelectedBonoIds(new Set());
    // Resetear con datos del psicólogo precargados
    const psychData = {
      billing_psychologist_name: psychologistProfile?.businessName || psychologistProfile?.name || '',
      billing_psychologist_address: psychologistProfile?.address || '',
      billing_psychologist_tax_id: psychologistProfile?.taxId || ''
    };
    console.log('[BillingPanel] Reseteando modal con datos del psicólogo:', psychData);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      dueDate: '',
      description: '',
      notes: invoiceType === 'patient' ? 'Servicio exento de IVA según el artículo 20 3a de la ley 37/1992 del Impuesto sobre el Valor Añadido.' : '',
      taxRate: invoiceType === 'center' ? 21 : 0,
      irpf: 15,
      billing_client_name: '',
      billing_client_address: '',
      billing_client_tax_id: '',
      show_signature: false,
      ...psychData
    });
  };

  const handleOpenNewInvoice = async () => {
    // Asegurar que los datos del psicólogo estén precargados al abrir nueva factura
    const psychData = {
      billing_psychologist_name: psychologistProfile?.businessName || psychologistProfile?.name || '',
      billing_psychologist_address: psychologistProfile?.address || '',
      billing_psychologist_tax_id: psychologistProfile?.taxId || ''
    };
    console.log('[BillingPanel] Perfil del psicólogo:', psychologistProfile);
    console.log('[BillingPanel] Abriendo nueva factura con datos del psicólogo:', psychData);
    
    let clientData = {
      billing_client_name: '',
      billing_client_address: '',
      billing_client_tax_id: '',
      billing_client_postal_code: '',
      billing_client_country: ''
    };
    
    // Si estamos dentro del detalle de un paciente, preseleccionarlo automáticamente
    if (patientId && contextPatient) {
      setSelectedPatientId(patientId);
      setPatientSearchTerm(contextPatient.name);
      setInvoiceType('patient');
      clientData = {
        billing_client_name: contextPatient.billing_name || contextPatient.name || '',
        billing_client_address: contextPatient.billing_address || '',
        billing_client_tax_id: contextPatient.billing_tax_id || ''
      };
      console.log('[BillingPanel] Paciente preseleccionado desde contexto:', contextPatient.name);
      await loadUnbilledItems(patientId);
    } else if (invoiceType === 'patient' && selectedPatientId) {
      const patient = patients.find(p => p.id === selectedPatientId);
      if (patient) {
        clientData = {
          billing_client_name: patient.billing_name || patient.name || '',
          billing_client_address: patient.billing_address || '',
          billing_client_tax_id: patient.billing_tax_id || '',
          billing_client_postal_code: patient.postalCode || '',
          billing_client_country: patient.country || ''
        };
        console.log('[BillingPanel] Manteniendo datos del paciente seleccionado:', clientData);
      }
    } else if (invoiceType === 'center' && selectedCenterId) {
      const center = centers.find(c => c.id === selectedCenterId);
      if (center) {
        clientData = {
          billing_client_name: center.center_name || '',
          billing_client_address: center.address || '',
          billing_client_tax_id: center.cif || ''
        };
        console.log('[BillingPanel] Manteniendo datos del centro seleccionado:', clientData);
      }
    }
    
    // Resetear el formulario con los datos del psicólogo y cliente precargados
    setFormData({
      date: new Date().toISOString().split('T')[0],
      dueDate: '',
      description: '',
      notes: invoiceType === 'patient' ? 'Servicio exento de IVA según el artículo 20 3a de la ley 37/1992 del Impuesto sobre el Valor Añadido.' : '',
      taxRate: invoiceType === 'center' ? 21 : 0,
      irpf: 15,
      ...clientData,
      ...psychData
    });
    setShowNewInvoice(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-50 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'overdue': return 'bg-red-50 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'draft': return 'bg-gray-50 text-gray-600 border-gray-300';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Pagada';
      case 'pending': return 'Pendiente';
      case 'overdue': return 'Vencida';
      case 'cancelled': return 'Cancelada';
      case 'draft': return 'Borrador';
      default: return status;
    }
  };

  const handleDownloadPDF = async (invoiceId: string) => {
    try {
      const response = await apiFetch(`${API_URL}/invoices/${invoiceId}/pdf`);
      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      console.error('Error opening PDF:', error);
      alert('Error al abrir la factura');
    }
  };

  const handleDownloadZIP = async () => {
    if (!zipDateFrom || !zipDateTo) {
      alert('Por favor selecciona una fecha de inicio y una fecha de fin.');
      return;
    }
    if (zipDateFrom > zipDateTo) {
      alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
      return;
    }
    setIsDownloadingZip(true);
    try {
      const params = new URLSearchParams({ startDate: zipDateFrom, endDate: zipDateTo });
      const response = await apiFetch(`${API_URL}/invoices/zip?${params}`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || `Error ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `facturas_${zipDateFrom}_${zipDateTo}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setShowZipPanel(false);
    } catch (error: any) {
      console.error('Error descargando ZIP:', error);
      alert(error.message || 'Error al descargar el ZIP de facturas');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Filtrado por draft/facturas/rectificativas
  const draftFilteredInvoices = showDrafts 
    ? invoices.filter(inv => inv.status === 'draft')
    : showRectificativas
    ? invoices.filter(inv => inv.is_rectificativa === true)
    : invoices.filter(inv => inv.status !== 'draft' && !inv.is_rectificativa);

  // Aplicar filtros adicionales (solo búsqueda y estado, NO fechas para el listado)
  const filteredInvoices = draftFilteredInvoices.filter(invoice => {
    // Filtro de búsqueda por nombre de paciente o número de factura
    const matchesSearch = searchTerm === '' || 
      invoice.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filtro de estado
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    
    // Filtro de fecha (solo si están activos los filtros de fecha)
    if (!showDrafts && !showRectificativas && (invoice.invoice_date || invoice.date)) {
      // Extraer solo la fecha (YYYY-MM-DD) sin hora para comparación precisa
      // Usar invoice_date primero, luego date como fallback
      const invoiceDateStr = (invoice.invoice_date || invoice.date).split('T')[0];
      
      const matchesDateFrom = !dateFrom || invoiceDateStr >= dateFrom;
      const matchesDateTo = !dateTo || invoiceDateStr <= dateTo;
      
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
    }
    
    return matchesSearch && matchesStatus;
  });

  // Ordenar facturas filtradas por número de factura (serie) de forma numérica
  const sortedFilteredInvoices = [...filteredInvoices].sort((a, b) => {
    const numA = a.invoiceNumber || '';
    const numB = b.invoiceNumber || '';
    const cmp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
    return sortOrder === 'desc' ? -cmp : cmp;
  });

  // Calcular estadísticas (sin filtros de fecha, todas las facturas)
  const totalEmitidas = invoices.filter(inv => inv.status !== 'draft' && !inv.is_rectificativa).length;
  const totalPendientes = invoices.filter(inv => (inv.status === 'pending' || inv.status === 'overdue') && !inv.is_rectificativa).length;
  const totalAmount = invoices
    .filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled' && !inv.is_rectificativa)
    .reduce((sum, inv) => sum + (inv.total || inv.amount * 1.21), 0);
  
  console.log('[BillingPanel] Invoices:', invoices.length, 'Filtered:', filteredInvoices.length);

  return (
    <div className={patientId ? "px-3 sm:px-6 md:px-8 pt-4 sm:pt-6 space-y-4" : "space-y-4"}>
      {/* Mensaje contextual cuando se está viendo desde el detalle del paciente */}
      {patientId && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <p className="text-sm text-indigo-700">
            <strong>Vista de facturación del paciente:</strong> Estás visualizando las facturas específicas de este paciente.
          </p>
        </div>
      )}
      
      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <FileText className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-600 font-medium">Facturas Emitidas</p>
              <p className="text-2xl font-bold text-indigo-600">{totalEmitidas}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-600 rounded-lg">
              <Clock className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-600 font-medium">Facturas Pendientes</p>
              <p className="text-2xl font-bold text-amber-600">{totalPendientes}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-600 rounded-lg">
              <DollarSign className="text-white" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-600 font-medium">Total Facturado</p>
              <p className="text-2xl font-bold text-green-600">€{totalAmount.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toggles Facturas/Borradores/Rectificativas y Botón Nueva Factura */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex w-full sm:w-auto">
          <button
            onClick={() => {
              setShowDrafts(false);
              setShowRectificativas(false);
              setStatusFilter('all');
            }}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-l-lg text-sm transition-colors font-medium border border-r-0 border-slate-200 ${
              !showDrafts && !showRectificativas ? 'bg-indigo-600 text-white shadow-sm border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Facturas
          </button>
          <button
            onClick={() => {
              setShowDrafts(true);
              setShowRectificativas(false);
              setStatusFilter('all');
            }}
            className={`flex-1 sm:flex-none px-3 py-2 text-sm transition-colors font-medium border border-r-0 border-slate-200 ${
              showDrafts ? 'bg-indigo-600 text-white shadow-sm border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Borradores
          </button>
          <button
            onClick={() => {
              setShowDrafts(false);
              setShowRectificativas(true);
              setStatusFilter('all');
            }}
            className={`flex-1 sm:flex-none px-3 py-2 rounded-r-lg text-sm transition-colors font-medium border border-slate-200 ${
              showRectificativas ? 'bg-indigo-600 text-white shadow-sm border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Rectificativas
          </button>
        </div>
        <button
          onClick={() => {
            if (!canCreate) { onNeedUpgrade?.(); return; }
            handleOpenNewInvoice();
          }}
          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-md font-medium text-sm"
        >
          <Plus size={18} />
          Nueva Factura
        </button>
      </div>

      {/* Filtros de búsqueda y estado */}
      {!showDrafts && !showRectificativas && (
        <div className="bg-white rounded-lg shadow p-4 border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            
            {/* Filtro por estado */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="paid">Pagadas</option>
                <option value="pending">Pendientes</option>
                <option value="overdue">Vencidas</option>
                <option value="cancelled">Canceladas</option>
              </select>
            </div>
            
            {/* Fecha desde */}
            <div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Desde"
              />
            </div>
            
            {/* Fecha hasta */}
            <div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Hasta"
              />
            </div>
          </div>
        </div>
      )}

      {/* ZIP Download Panel */}
      {!showDrafts && !showRectificativas && (
        <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowZipPanel(!showZipPanel)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Archive size={16} className="text-indigo-500" />
              Descargar facturas en ZIP
            </span>
            <span className="text-slate-400 text-xs">{showZipPanel ? '▲' : '▼'}</span>
          </button>
          {showZipPanel && (
            <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-500 mt-3 mb-3">
                Selecciona un rango de fechas para descargar todas las facturas emitidas en ese período como archivos HTML dentro de un ZIP.
              </p>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={zipDateFrom}
                    onChange={(e) => setZipDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fecha fin</label>
                  <input
                    type="date"
                    value={zipDateTo}
                    onChange={(e) => setZipDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  />
                </div>
                <button
                  onClick={handleDownloadZIP}
                  disabled={isDownloadingZip || !zipDateFrom || !zipDateTo}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
                >
                  {isDownloadingZip ? (
                    <>
                      <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Archive size={16} />
                      Descargar ZIP
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sort order toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          title={sortOrder === 'desc' ? 'Mayor número primero' : 'Menor número primero'}
        >
          <ArrowUpDown size={15} />
          {sortOrder === 'desc' ? '↓ Mayor número primero' : '↑ Menor número primero'}
        </button>
      </div>

      {/* Invoices List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : sortedFilteredInvoices.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No hay {showDrafts ? 'borradores' : showRectificativas ? 'facturas rectificativas' : 'facturas'}
          </div>
        ) : (
          sortedFilteredInvoices.map(invoice => (
        <div key={invoice.id} className="bg-white rounded-lg shadow p-4 sm:p-6 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900">{invoice.invoiceNumber}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-0.5">{invoice.patientName}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(invoice.invoice_date || invoice.date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                  <div className="text-xl font-bold text-indigo-600">€{(invoice.total || invoice.amount * 1.21).toFixed(2)}</div>
                  <div className="flex gap-2">
                    {invoice.status === 'draft' && (
                      <>
                        <button
                          onClick={() => handleEditInvoice(invoice)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                    {invoice.status !== 'draft' && (
                      <button
                        onClick={() => handleDownloadPDF(invoice.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Descargar PDF"
                      >
                        <Download size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedInvoice(invoice)}
                      className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Ver detalles"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New/Edit Invoice Modal */}
      {showNewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto" onClick={handleCloseModal}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">
                {editingInvoice ? 'Editar Borrador' : 'Nueva Factura'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Tipo de factura - ocultar cuando se viene del detalle de un paciente */}
              {!patientId && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Factura *</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setInvoiceType('patient')}
                    disabled={!!editingInvoice}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      invoiceType === 'patient'
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <User size={24} className="mx-auto mb-2" />
                    <div className="font-medium">Paciente</div>
                  </button>
                  <button
                    onClick={() => { setInvoiceType('center'); setPatientCenterWarning(null); }}
                    disabled={!!editingInvoice}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      invoiceType === 'center'
                        ? 'border-indigo-600 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <Building size={24} className="mx-auto mb-2" />
                    <div className="font-medium">Centro</div>
                  </button>
                </div>
              </div>
              )}

              {/* Seleccionar paciente o centro */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {invoiceType === 'patient' ? 'Paciente' : 'Centro'} *
                </label>
                {/* Si venimos del detalle de un paciente, mostrar el paciente fijo */}
                {patientId && contextPatient ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-indigo-600 bg-indigo-50">
                    <User size={20} className="text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-semibold text-slate-900">{contextPatient.name}</div>
                      <div className="text-sm text-slate-500">{contextPatient.email}</div>
                    </div>
                  </div>
                ) : invoiceType === 'patient' ? (
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={patientSearchTerm}
                        onChange={(e) => {
                          setPatientSearchTerm(e.target.value);
                          setShowPatientDropdown(true);
                          if (!e.target.value && selectedPatientId) {
                            setSelectedPatientId('');
                            handlePatientSelect('');
                          }
                        }}
                        onFocus={() => setShowPatientDropdown(true)}
                        placeholder="Buscar paciente por nombre..."
                        disabled={!!editingInvoice}
                        className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    </div>
                    {showPatientDropdown && !editingInvoice && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {patients
                          .filter(patient => 
                            patient.name.toLowerCase().includes(patientSearchTerm.toLowerCase()) ||
                            patient.email.toLowerCase().includes(patientSearchTerm.toLowerCase())
                          )
                          .map((patient) => (
                            <div
                              key={patient.id}
                              onClick={() => {
                                setSelectedPatientId(patient.id);
                                setPatientSearchTerm(patient.name);
                                setShowPatientDropdown(false);
                                handlePatientSelect(patient.id);
                              }}
                              className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 ${
                                selectedPatientId === patient.id ? 'bg-indigo-50' : ''
                              }`}
                            >
                              <div className="font-medium text-slate-900">{patient.name}</div>
                              <div className="text-sm text-slate-500">{patient.email}</div>
                            </div>
                          ))}
                        {patients.filter(patient => 
                          patient.name.toLowerCase().includes(patientSearchTerm.toLowerCase()) ||
                          patient.email.toLowerCase().includes(patientSearchTerm.toLowerCase())
                        ).length === 0 && (
                          <div className="px-4 py-3 text-slate-500 text-center">
                            No se encontraron pacientes
                          </div>
                        )}
                      </div>
                    )}
                    {/* Overlay para cerrar el dropdown al hacer clic fuera */}
                    {showPatientDropdown && (
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowPatientDropdown(false)}
                      />
                    )}
                    {/* Alerta si el paciente pertenece a un centro */}
                    {patientCenterWarning && (
                      <div className="mt-2 flex gap-2 items-start bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 text-sm">
                        <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
                        <div className="text-amber-800">
                          <span className="font-semibold">Atención:</span> Este paciente pertenece al centro <span className="font-semibold">{patientCenterWarning.centerName}</span>. Facturarle directamente puede provocar un descuadre en la facturación del centro.
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={centerSearchTerm}
                        onChange={(e) => {
                          setCenterSearchTerm(e.target.value);
                          setShowCenterDropdown(true);
                          if (!e.target.value && selectedCenterId) {
                            setSelectedCenterId('');
                            handleCenterSelect('');
                          }
                        }}
                        onFocus={() => setShowCenterDropdown(true)}
                        placeholder="Buscar centro..."
                        disabled={!!editingInvoice}
                        className="w-full px-4 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    </div>
                    {showCenterDropdown && !editingInvoice && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {centers
                          .filter(center => 
                            (center.nombre_comercial || center.center_name).toLowerCase().includes(centerSearchTerm.toLowerCase())
                          )
                          .map((center) => (
                            <div
                              key={center.id}
                              onClick={() => {
                                setSelectedCenterId(center.id);
                                setCenterSearchTerm(center.nombre_comercial || center.center_name);
                                setShowCenterDropdown(false);
                                handleCenterSelect(center.id);
                              }}
                              className={`px-4 py-3 cursor-pointer hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 ${
                                selectedCenterId === center.id ? 'bg-indigo-50' : ''
                              }`}
                            >
                              <div className="font-medium text-slate-900">{center.nombre_comercial || center.center_name}</div>
                            </div>
                          ))}
                        {centers.filter(center => 
                          (center.nombre_comercial || center.center_name).toLowerCase().includes(centerSearchTerm.toLowerCase())
                        ).length === 0 && (
                          <div className="px-4 py-3 text-slate-500 text-center">
                            No se encontraron centros
                          </div>
                        )}
                      </div>
                    )}
                    {/* Overlay para cerrar el dropdown al hacer clic fuera */}
                    {showCenterDropdown && (
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowCenterDropdown(false)}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Sesiones - para facturas de paciente y centro */}
              {((invoiceType === 'patient' && selectedPatientId) || (invoiceType === 'center' && selectedCenterId)) && (
                <div className="space-y-4">
                  {/* Sesiones */}
                  {availableSessions.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Sesiones sin facturar ({availableSessions.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = availableSessions.every(s => selectedSessionIds.has(s.id));
                            if (allSelected) {
                              setSelectedSessionIds(new Set());
                            } else {
                              setSelectedSessionIds(new Set(availableSessions.map(s => s.id)));
                            }
                          }}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                        >
                          {availableSessions.every(s => selectedSessionIds.has(s.id)) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3">
                        {availableSessions.map(session => {
                          const sessionPrice = getSessionBillingPrice(session);
                          const psychPercent = session.percent_psych || 100;
                          const amountToInvoice = invoiceType === 'center' 
                            ? (sessionPrice * psychPercent / 100)
                            : sessionPrice;
                          
                          return (
                            <div
                              key={session.id}
                              onClick={() => toggleSession(session.id)}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedSessionIds.has(session.id)
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-900">
                                    {new Date(session.starts_on).toLocaleString()}
                                  </div>
                                  {invoiceType === 'center' && session.patientName && (
                                    <div className="text-sm font-medium text-indigo-700 mt-0.5">👤 {session.patientName}</div>
                                  )}
                                  {session.notes && (
                                    <div className="text-sm text-slate-600 mt-1">{session.notes}</div>
                                  )}
                                  {invoiceType === 'center' && psychPercent < 100 && (
                                    <div className="text-xs text-slate-500 mt-1">
                                      Tu porcentaje: {psychPercent}% de €{sessionPrice.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <div className="font-semibold text-indigo-600">
                                    €{amountToInvoice.toFixed(2)}
                                  </div>
                                  {selectedSessionIds.has(session.id) && (
                                    <CheckSquare size={20} className="text-indigo-600 mt-1" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bonos */}
                  {availableBonos.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-slate-700">
                          Bonos sin facturar ({availableBonos.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = availableBonos.every(b => selectedBonoIds.has(b.id));
                            if (allSelected) {
                              setSelectedBonoIds(new Set());
                            } else {
                              setSelectedBonoIds(new Set(availableBonos.map(b => b.id)));
                            }
                          }}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                        >
                          {availableBonos.every(b => selectedBonoIds.has(b.id)) ? 'Deseleccionar todo' : 'Seleccionar todo'}
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3">
                        {availableBonos.map(bono => {
                          const bonoPrice = bono.total_price_bono_amount || 0;
                          const psychPercent = bono.percent_psych || 100;
                          const amountToInvoice = invoiceType === 'center' 
                            ? (bonoPrice * psychPercent / 100)
                            : bonoPrice;
                          
                          return (
                            <div
                              key={bono.id}
                              onClick={() => toggleBono(bono.id)}
                              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                                selectedBonoIds.has(bono.id)
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-slate-900">
                                    Bono de {bono.total_sessions_amount} sesiones
                                  </div>
                                  {invoiceType === 'center' && bono.patientName && (
                                    <div className="text-sm font-medium text-indigo-700 mt-0.5">👤 {bono.patientName}</div>
                                  )}
                                  <div className="text-sm text-slate-600">
                                    {bono.used_sessions} usadas, {bono.remaining_sessions} restantes
                                  </div>
                                  {invoiceType === 'center' && psychPercent < 100 && (
                                    <div className="text-xs text-slate-500 mt-1">
                                      Tu porcentaje: {psychPercent}% de €{bonoPrice.toFixed(2)}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right ml-4">
                                  <div className="font-semibold text-indigo-600">
                                    €{amountToInvoice.toFixed(2)}
                                  </div>
                                  {selectedBonoIds.has(bono.id) && (
                                    <CheckSquare size={20} className="text-indigo-600 mt-1" />
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {availableSessions.length === 0 && availableBonos.length === 0 && (
                    <div className="text-center py-4 text-slate-500">
                      No hay sesiones ni bonos sin facturar para este {invoiceType === 'patient' ? 'paciente' : 'centro'}
                    </div>
                  )}
                </div>
              )}

              {/* Datos de facturación del cliente */}
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                <h4 className="font-semibold text-slate-900">Datos de Facturación del Cliente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
                    <input
                      type="text"
                      value={formData.billing_client_name}
                      onChange={(e) => setFormData({ ...formData, billing_client_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">DNI/CIF</label>
                    <input
                      type="text"
                      value={formData.billing_client_tax_id}
                      onChange={(e) => setFormData({ ...formData, billing_client_tax_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                    <AddressAutocomplete
                      value={formData.billing_client_address}
                      onChange={(val) => setFormData({ ...formData, billing_client_address: val })}
                      onSelect={(sel) => setFormData((prev) => ({
                        ...prev,
                        billing_client_address: sel.streetAddress,
                        billing_client_postal_code: sel.postalCode,
                        billing_client_country: sel.country,
                      }))}
                      placeholder="Escribe la dirección del cliente…"
                    />
                  </div>
                </div>
              </div>

              {/* Datos de facturación del psicólogo */}
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                <h4 className="font-semibold text-slate-900">Datos de Facturación del Psicólogo</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo</label>
                    <input
                      type="text"
                      value={formData.billing_psychologist_name}
                      onChange={(e) => setFormData({ ...formData, billing_psychologist_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">DNI/CIF</label>
                    <input
                      type="text"
                      value={formData.billing_psychologist_tax_id}
                      onChange={(e) => setFormData({ ...formData, billing_psychologist_tax_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                    <AddressAutocomplete
                      value={formData.billing_psychologist_address}
                      onChange={(val) => setFormData({ ...formData, billing_psychologist_address: val })}
                      onSelect={(sel) => setFormData((prev) => ({
                        ...prev,
                        billing_psychologist_address: sel.fullAddress,
                      }))}
                      placeholder="Escribe la dirección del psicólogo…"
                    />
                  </div>
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de Factura *</label>
                  <input
                    type="date"
                    value={formData.date}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  {editingInvoice?.status === 'draft' && (
                    <p className="mt-1 text-xs text-indigo-500">
                      Al emitir el borrador como factura real, la fecha se actualizará automáticamente a hoy.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    min={formData.date}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Descripción global de la factura (aparece encima de los conceptos)..."
                />
              </div>

              {/* Configuración de impuestos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    IVA (%)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.taxRate === 0 ? '' : formData.taxRate}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '' || /^\d*\.?\d*$/.test(value)) {
                        const numValue = value === '' ? 0 : parseFloat(value) || 0;
                        setFormData({ ...formData, taxRate: Math.min(numValue, 100) });
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="21"
                  />
                </div>
                {invoiceType === 'center' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      IRPF (%) - Retención
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formData.irpf === 0 ? '' : formData.irpf}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          const numValue = value === '' ? 0 : parseFloat(value) || 0;
                          setFormData({ ...formData, irpf: Math.min(numValue, 100) });
                        }
                      }}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="15"
                    />
                  </div>
                )}
              </div>

              {/* Totales */}
              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Ej: Servicio exento de IVA según el artículo 20 3a de la ley 37/1992..."
                />
              </div>

              {/* Bloque de firma */}
              <div className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  id="show_signature"
                  checked={formData.show_signature}
                  onChange={(e) => setFormData({ ...formData, show_signature: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <label htmlFor="show_signature" className="block text-sm font-medium text-slate-700 cursor-pointer">
                    Incluir bloque de firma al pie
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Añade una línea de firma con tu nombre y especialidad al final del documento PDF.
                  </p>
                </div>
              </div>

              {((invoiceType === 'patient' && (selectedSessionIds.size > 0 || selectedBonoIds.size > 0)) || 
                (invoiceType === 'center' && (selectedSessionIds.size > 0 || selectedBonoIds.size > 0))) && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Vista Previa de la Factura</h4>
                  
                  {invoiceType === 'center' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <p className="text-xs text-blue-800">
                        💡 Solo se factura tu porcentaje como psicólogo de las sesiones/bonos seleccionados
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">
                        Base imponible:
                        {invoiceType === 'center' && (
                          <span className="text-xs text-slate-500 ml-1">(Tu porcentaje)</span>
                        )}
                      </span>
                      <span className="font-semibold text-slate-900">€{calculateTotal().subtotal.toFixed(2)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">IVA ({formData.taxRate}%):</span>
                      <span className="font-semibold text-green-600">+€{calculateTotal().tax.toFixed(2)}</span>
                    </div>
                    
                    {invoiceType === 'center' && formData.irpf > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-600">IRPF ({formData.irpf}%) - Retención:</span>
                        <span className="font-semibold text-red-600">-€{(calculateTotal().subtotal * (formData.irpf / 100)).toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                      <span className="text-lg font-semibold text-slate-900">Total a Cobrar:</span>
                      <span className="text-2xl font-bold text-indigo-600">€{calculateTotal().total.toFixed(2)}</span>
                    </div>
                    
                    {invoiceType === 'center' && (
                      <div className="bg-slate-50 rounded-lg p-3 mt-2">
                        <div className="text-xs text-slate-600 space-y-1">
                          <div className="flex justify-between">
                            <span>Sesiones seleccionadas:</span>
                            <span className="font-medium">{selectedSessionIds.size}</span>
                          </div>
                          {selectedBonoIds.size > 0 && (
                            <div className="flex justify-between">
                              <span>Bonos seleccionados:</span>
                              <span className="font-medium">{selectedBonoIds.size}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={handleCloseModal}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveInvoice(true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium shadow-md disabled:opacity-50"
              >
                {isSubmitting ? 'Guardando...' : 'Guardar Borrador'}
              </button>
              <button
                onClick={() => handleSaveInvoice(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md disabled:opacity-50"
              >
                {isSubmitting ? 'Creando...' : 'Crear Factura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de cancelación */}
      {showCancelModal && invoiceToCancel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" onClick={() => { setShowCancelModal(false); setInvoiceToCancel(null); setRectificationType('R4'); setRectificationReason(''); }}>
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Crear factura rectificativa</h3>
              <p className="text-sm text-slate-500 mb-4">
                Factura rectificada: <strong>{invoiceToCancel.invoiceNumber}</strong>
              </p>

              {/* Tipo de rectificación */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de rectificación *</label>
                <select
                  value={rectificationType}
                  onChange={(e) => setRectificationType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="R1">R1 — Error fundado en derecho</option>
                  <option value="R2">R2 — Concurso de acreedores</option>
                  <option value="R3">R3 — Crédito incobrable (impago)</option>
                  <option value="R4">R4 — Resto de causas</option>
                  <option value="R5">R5 — Facturas simplificadas</option>
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {rectificationType === 'R1' && 'Errores relacionados con la normativa fiscal: tipo de IVA incorrecto, errores en la base imponible u otras operaciones mal clasificadas.'}
                  {rectificationType === 'R2' && 'Aplica cuando el cliente se encuentra en concurso de acreedores, permitiendo modificar la base imponible del IVA.'}
                  {rectificationType === 'R3' && 'Ajuste de la base imponible del IVA en casos de impago total o parcial por parte del cliente.'}
                  {rectificationType === 'R4' && 'Otros motivos no contemplados: errores en datos del destinatario, descripción de servicios, numeración o condiciones de pago que no afectan al importe o al IVA.'}
                  {rectificationType === 'R5' && 'Solo para rectificar facturas simplificadas (tickets). No aplicable en facturas ordinarias.'}
                </p>
              </div>

              {/* Motivo / descripción */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo de la rectificación (opcional)</label>
                <textarea
                  value={rectificationReason}
                  onChange={(e) => setRectificationReason(e.target.value)}
                  rows={2}
                  placeholder="Ej: Error en los datos del cliente, corrección del tipo impositivo…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <p className="text-xs text-slate-400 mb-5">
                Se cancelará la factura original y se emitirá una rectificativa con todos los conceptos en negativo. Las sesiones y bonos asociados quedarán disponibles.
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setInvoiceToCancel(null);
                    setRectificationType('R4');
                    setRectificationReason('');
                  }}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCancelInvoice}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors font-medium"
                >
                  Emitir rectificativa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">Factura {selectedInvoice.invoiceNumber}</h3>
                  <div className="flex flex-wrap gap-4 mt-1 text-sm text-slate-500">
                    <span>Emisión: <span className="text-slate-700">{new Date(selectedInvoice.invoice_date || selectedInvoice.date).toLocaleDateString('es-ES')}</span></span>
                    {selectedInvoice.dueDate && (
                      <span>Vencimiento: <span className="text-slate-700">{new Date(selectedInvoice.dueDate).toLocaleDateString('es-ES')}</span></span>
                    )}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedInvoice.status)}`}>
                  {getStatusLabel(selectedInvoice.status)}
                </span>
              </div>
            </div>

            <div className="p-6 space-y-5">

              {/* Emisor / Receptor */}
              <div className="grid grid-cols-2 gap-0 border border-slate-200 rounded-lg overflow-hidden">
                <div className="p-4 bg-slate-50 border-r border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Emisor</div>
                  {selectedInvoice.billing_psychologist_name ? (
                    <>
                      <div className="font-semibold text-slate-900 text-sm leading-snug">{selectedInvoice.billing_psychologist_name}</div>
                      {selectedInvoice.billing_psychologist_address && (
                        <div className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">{selectedInvoice.billing_psychologist_address}</div>
                      )}
                      {selectedInvoice.billing_psychologist_tax_id && (
                        <div className="text-xs text-slate-500 mt-1">NIF/CIF: <span className="font-medium">{selectedInvoice.billing_psychologist_tax_id}</span></div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-slate-400 italic">Sin datos de emisor</div>
                  )}
                </div>
                <div className="p-4 bg-white">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Receptor</div>
                  {selectedInvoice.billing_client_name ? (
                    <>
                      <div className="font-semibold text-slate-900 text-sm leading-snug">{selectedInvoice.billing_client_name}</div>
                      {selectedInvoice.billing_client_address && (
                        <div className="text-xs text-slate-600 mt-1 whitespace-pre-line leading-relaxed">{selectedInvoice.billing_client_address}</div>
                      )}
                      {(selectedInvoice.billing_client_postal_code || selectedInvoice.billing_client_country) && (
                        <div className="text-xs text-slate-600 mt-1">{[selectedInvoice.billing_client_postal_code, selectedInvoice.billing_client_country].filter(Boolean).join(' - ')}</div>
                      )}
                      {selectedInvoice.billing_client_tax_id && (
                        <div className="text-xs text-slate-500 mt-1">NIF/CIF: <span className="font-medium">{selectedInvoice.billing_client_tax_id}</span></div>
                      )}
                    </>
                  ) : (
                    <div className="font-semibold text-slate-900 text-sm">{selectedInvoice.patientName}</div>
                  )}
                </div>
              </div>

              {/* Descripción global de la factura */}
              {selectedInvoice.description && (
                <div className="bg-slate-50 border-l-4 border-indigo-400 rounded-r-lg px-4 py-3">
                  <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Descripción</div>
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{selectedInvoice.description}</div>
                </div>
              )}

              {/* Conceptos */}
              {isLoadingItems && (
                <div className="pt-2 text-xs text-slate-400">Cargando detalle...</div>
              )}
              {!isLoadingItems && invoiceItems && (invoiceItems.sessions.length > 0 || invoiceItems.bonos.length > 0) && (() => {
                const taxRate = selectedInvoice.taxRate ?? 0;
                const irpfRate = selectedInvoice.irpf ?? 0;
                const showIva = taxRate > 0;
                const showIrpf = irpfRate > 0;
                return (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Conceptos</span>
                    </div>

                    {/* Sesiones */}
                    {invoiceItems.sessions.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-white text-xs text-slate-500 uppercase">
                            <th className="px-4 py-2 text-left font-semibold">Concepto</th>
                            <th className="px-4 py-2 text-center font-semibold w-10">Uds</th>
                            <th className="px-4 py-2 text-right font-semibold">Precio/ud</th>
                            {showIva  && <th className="px-4 py-2 text-right font-semibold">IVA</th>}
                            {showIrpf && <th className="px-4 py-2 text-right font-semibold">IRPF</th>}
                            <th className="px-4 py-2 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceItems.sessions.map((s: any, i: number) => {
                            const price    = Number(s.price || 0);
                            const ivaAmt   = showIva  ? price * taxRate  / 100 : 0;
                            const irpfAmt  = showIrpf ? price * irpfRate / 100 : 0;
                            const lineTotal = price + ivaAmt - irpfAmt;
                            const showPatient = selectedInvoice.invoice_type !== 'center' && s.patientName;
                            return (
                              <tr key={s.id || i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="px-4 py-2.5">
                                  <div className="text-slate-800 font-medium text-sm">Sesión de psicología</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {s.date}{s.time ? ` · ${s.time}` : ''}{showPatient ? ` — ${s.patientName}` : ''}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-center text-slate-600">1</td>
                                <td className="px-4 py-2.5 text-right text-slate-700">€{price.toFixed(2)}</td>
                                {showIva  && <td className="px-4 py-2.5 text-right text-slate-500">{taxRate}%</td>}
                                {showIrpf && <td className="px-4 py-2.5 text-right text-rose-500">−{irpfRate}%</td>}
                                <td className="px-4 py-2.5 text-right font-semibold text-slate-900">€{lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {/* Bonos */}
                    {invoiceItems.bonos.length > 0 && (
                      <div className={invoiceItems.sessions.length > 0 ? 'border-t border-slate-200' : ''}>
                        <div className="px-4 py-2 bg-emerald-50 border-b border-slate-200">
                          <span className="text-xs font-semibold text-emerald-700">Bonos ({invoiceItems.bonos.length})</span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-white text-xs text-slate-500 uppercase">
                              <th className="px-4 py-2 text-left font-semibold">Concepto</th>
                              <th className="px-4 py-2 text-center font-semibold w-10">Uds</th>
                              <th className="px-4 py-2 text-right font-semibold">Precio/ud</th>
                              {showIva  && <th className="px-4 py-2 text-right font-semibold">IVA</th>}
                              {showIrpf && <th className="px-4 py-2 text-right font-semibold">IRPF</th>}
                              <th className="px-4 py-2 text-right font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoiceItems.bonos.map((b: any, i: number) => {
                              const price    = Number(b.totalPrice || 0);
                              const ivaAmt   = showIva  ? price * taxRate  / 100 : 0;
                              const irpfAmt  = showIrpf ? price * irpfRate / 100 : 0;
                              const lineTotal = price + ivaAmt - irpfAmt;
                              const showPatient = selectedInvoice.invoice_type !== 'center' && b.patientName;
                              return (
                                <tr key={b.id || i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                  <td className="px-4 py-2.5">
                                    <div className="text-slate-800 font-medium text-sm">
                                      Bono de {b.totalSessions} sesiones{showPatient ? ` — ${b.patientName}` : ''}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      Creado: {b.createdAt || '—'} · {b.usedSessions} usadas · {b.remainingSessions} restantes
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-slate-600">1</td>
                                  <td className="px-4 py-2.5 text-right text-slate-700">€{price.toFixed(2)}</td>
                                  {showIva  && <td className="px-4 py-2.5 text-right text-slate-500">{taxRate}%</td>}
                                  {showIrpf && <td className="px-4 py-2.5 text-right text-rose-500">−{irpfRate}%</td>}
                                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900">€{lineTotal.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Totales */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-4 py-2.5 text-slate-600">Base imponible</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900">€{selectedInvoice.amount.toFixed(2)}</td>
                    </tr>
                    {(selectedInvoice.taxRate ?? 0) > 0 ? (
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-2.5 text-slate-600">IVA ({selectedInvoice.taxRate}%)</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900">€{(selectedInvoice.tax ?? selectedInvoice.amount * (selectedInvoice.taxRate ?? 0) / 100).toFixed(2)}</td>
                      </tr>
                    ) : (
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-2.5 text-slate-400 italic text-xs">Exento de IVA</td>
                        <td className="px-4 py-2.5 text-right text-slate-400 text-xs">€0,00</td>
                      </tr>
                    )}
                    {(selectedInvoice.irpf ?? 0) > 0 && (
                      <tr className="border-b border-slate-100">
                        <td className="px-4 py-2.5 text-slate-600">IRPF ({selectedInvoice.irpf}%)</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-rose-600">−€{(selectedInvoice.amount * (selectedInvoice.irpf ?? 0) / 100).toFixed(2)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50">
                      <td className="px-4 py-3 text-base font-bold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right text-2xl font-bold text-indigo-600">€{(selectedInvoice.total ?? selectedInvoice.amount).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Notas */}
              {(selectedInvoice as any).notes && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Notas</div>
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {(selectedInvoice as any).notes}
                  </div>
                </div>
              )}

              {/* Bloque de firma */}
              {(selectedInvoice as any).show_signature && selectedInvoice.billing_psychologist_name && (
                <div className="border border-slate-200 rounded-lg p-4 bg-white mt-2">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Firma</div>
                  <div className="border-b border-slate-400 w-48 mb-2" />
                  <div className="text-sm font-semibold text-slate-800">{selectedInvoice.billing_psychologist_name}</div>
                  {psychologistProfile?.specialty && (
                    <div className="text-xs text-slate-500 mt-0.5">{psychologistProfile.specialty}</div>
                  )}
                </div>
              )}

            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex flex-wrap gap-2 justify-between items-center">
              <div className="flex flex-wrap gap-2">
                {selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'cancelled' && !selectedInvoice.is_rectificativa && (
                  <>
                    {selectedInvoice.status === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(selectedInvoice.id, 'paid')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm shadow-emerald-200 transition-all duration-150"
                      >
                        <Check size={15} strokeWidth={2.5} />
                        Marcar como pagada
                      </button>
                    )}
                    {selectedInvoice.status === 'paid' && (
                      <button
                        onClick={() => handleStatusChange(selectedInvoice.id, 'pending')}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-white shadow-sm shadow-amber-200 transition-all duration-150"
                      >
                        <Clock size={15} strokeWidth={2.5} />
                        Marcar como pendiente
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setInvoiceToCancel(selectedInvoice);
                        setSelectedInvoice(null);
                        setShowCancelModal(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-600 border border-rose-200 shadow-sm transition-all duration-150"
                    >
                      <Trash2 size={15} strokeWidth={2.5} />
                      Cancelar factura
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'cancelled' && (
                  <button
                    onClick={() => handleDownloadPDF(selectedInvoice.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-sm shadow-indigo-200 transition-all duration-150"
                  >
                    <Download size={15} strokeWidth={2.5} />
                    Descargar PDF
                  </button>
                )}
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-600 border border-slate-200 shadow-sm transition-all duration-150"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para configurar serie y número inicial de factura */}
      {showInvoiceStartModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Configura tu serie de facturación</h3>
              <p className="text-sm text-slate-600 mt-2">
                Es tu primera factura de {new Date().getFullYear()}. Define la serie y el número con el que empezar.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Serie <span className="text-slate-400 font-normal">(prefijo)</span>
                </label>
                <input
                  type="text"
                  value={invoiceSeriesInput}
                  onChange={(e) => setInvoiceSeriesInput(e.target.value.toUpperCase())}
                  placeholder={`Ej: F${String(new Date().getFullYear()).slice(-2)}, FAC, ${new Date().getFullYear()}/`}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">
                  Serie por defecto: <span className="font-mono font-semibold">F{String(new Date().getFullYear()).slice(-2)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Número inicial
                </label>
                <input
                  type="number"
                  min="1"
                  value={invoiceStartNumber}
                  onChange={(e) => setInvoiceStartNumber(e.target.value)}
                  placeholder="Ej: 1, 15, 50..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleConfirmInvoiceStart();
                    }
                  }}
                />
              </div>

              {/* Vista previa */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wide mb-1">Vista previa</p>
                <p className="font-mono text-2xl font-bold text-indigo-800">
                  {(invoiceSeriesInput || `F${String(new Date().getFullYear()).slice(-2)}`) + (invoiceStartNumber || '1')}
                </p>
                <p className="text-xs text-indigo-400 mt-1">
                  La siguiente sería: <span className="font-mono font-medium">
                    {(invoiceSeriesInput || `F${String(new Date().getFullYear()).slice(-2)}`) + (parseInt(invoiceStartNumber || '1', 10) + 1)}
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-500">
                Esta configuración se guardará para {new Date().getFullYear()} y los números se incrementarán automáticamente.
              </p>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowInvoiceStartModal(false);
                  setInvoiceStartNumber('');
                  setInvoiceSeriesInput('');
                  setPendingInvoiceData(null);
                }}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmInvoiceStart}
                className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors font-medium"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para configurar serie y número inicial de facturas RECTIFICATIVAS */}
      {showRectSeriesModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Configura tu serie de rectificativas</h3>
              <p className="text-sm text-slate-600 mt-2">
                Es tu primera factura rectificativa de {new Date().getFullYear()}. Define la serie y el número con el que empezar.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Serie <span className="text-slate-400 font-normal">(prefijo)</span>
                </label>
                <input
                  type="text"
                  value={rectSeriesInput}
                  onChange={(e) => setRectSeriesInput(e.target.value.toUpperCase())}
                  placeholder={`Ej: R${String(new Date().getFullYear()).slice(-2)}, RECT, ${new Date().getFullYear()}-R/`}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">
                  Serie por defecto: <span className="font-mono font-semibold">R{String(new Date().getFullYear()).slice(-2)}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Número inicial
                </label>
                <input
                  type="number"
                  min="1"
                  value={rectStartNumber}
                  onChange={(e) => setRectStartNumber(e.target.value)}
                  placeholder="Ej: 1, 5, 10..."
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRectStart(); }}
                />
              </div>

              {/* Vista previa */}
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <p className="text-xs text-red-500 font-semibold uppercase tracking-wide mb-1">Vista previa</p>
                <p className="font-mono text-2xl font-bold text-red-800">
                  {(rectSeriesInput || `R${String(new Date().getFullYear()).slice(-2)}`) + (rectStartNumber || '1')}
                </p>
                <p className="text-xs text-red-400 mt-1">
                  La siguiente sería: <span className="font-mono font-medium">
                    {(rectSeriesInput || `R${String(new Date().getFullYear()).slice(-2)}`) + (parseInt(rectStartNumber || '1', 10) + 1)}
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-500">
                Esta configuración se guardará para {new Date().getFullYear()} y los números se incrementarán automáticamente.
              </p>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRectSeriesModal(false);
                  setRectSeriesInput('');
                  setRectStartNumber('');
                  setPendingRectData(null);
                }}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmRectStart}
                className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors font-medium"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de advertencia de fecha retroactiva */}
      {showBackdateWarning && backdateWarningInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70]" onClick={() => { setShowBackdateWarning(false); setBackdateWarningInfo(null); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 border border-amber-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Advertencia de cronología</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Posible incumplimiento de la normativa fiscal</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5 text-sm text-amber-800 space-y-1">
                <p>Estás intentando emitir una factura con una fecha anterior a la última registrada en la serie:</p>
                <ul className="mt-2 space-y-1 pl-2">
                  <li>• Última factura: <strong>{backdateWarningInfo.lastInvoiceNumber}</strong> ({new Date(backdateWarningInfo.lastInvoiceDate + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })})</li>
                  <li>• Fecha solicitada: <strong>{new Date((backdateWarningInfo.isDraft ? formData.date : formData.date) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</strong></li>
                </ul>
                <p className="mt-2 text-xs text-amber-700">En España, la numeración de facturas debe ser correlativa y cronológica. Emitir una factura con fecha retroactiva puede generar problemas ante una inspección de Hacienda.</p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowBackdateWarning(false);
                    setBackdateWarningInfo(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    setShowBackdateWarning(false);
                    const info = backdateWarningInfo;
                    setBackdateWarningInfo(null);
                    handleSaveInvoice(info.isDraft, true);
                  }}
                  className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700 rounded-lg transition-colors font-medium"
                >
                  Entiendo, crear igualmente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPanel;
