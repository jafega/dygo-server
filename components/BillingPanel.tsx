import React, { useState, useEffect } from 'react';
import { FileText, Plus, DollarSign, Check, Clock, ExternalLink, Download, Eye, Edit, Trash2, Send, CheckSquare, Square, Search, Building, User, X } from 'lucide-react';
import { API_URL } from '../services/config';

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
  
  // Datos de facturación del psicólogo
  billing_psychologist_name?: string;
  billing_psychologist_address?: string;
  billing_psychologist_tax_id?: string;
  
  // Campos para facturas rectificativas
  is_rectificativa?: boolean;
  rectifies_invoice_id?: string;
  rectified_by_invoice_id?: string;
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
  endTime: string;
  status: string;
  notes?: string;
  price?: number;
  percent_psych?: number;
  invoice_id?: string;
  bonus_id?: string;
}

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
}

interface Patient {
  id: string;
  name: string;
  email: string;
  billing_name?: string;
  billing_address?: string;
  billing_tax_id?: string;
}

interface Center {
  id: string;
  center_name: string;
  cif: string;
  address: string;
  psychologist_user_id: string;
  created_at: string;
}

interface BillingPanelProps {
  psychologistId: string;
  patientId?: string;
}

const BillingPanel: React.FC<BillingPanelProps> = ({ psychologistId, patientId }) => {
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
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
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
    taxRate: 21,
    irpf: 15,
    billing_client_name: '',
    billing_client_address: '',
    billing_client_tax_id: '',
    billing_psychologist_name: '',
    billing_psychologist_address: '',
    billing_psychologist_tax_id: ''
  });
  
  const [psychologistProfile, setPsychologistProfile] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadInvoices();
    loadPsychologistProfile();
    if (!patientId) {
      loadPatients();
      loadCenters();
    }
  }, [psychologistId, patientId]);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const url = patientId 
        ? `${API_URL}/invoices?psychologist_user_id=${psychologistId}&patient_user_id=${patientId}`
        : `${API_URL}/invoices?psychologist_user_id=${psychologistId}`;
      const response = await fetch(url);
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
      const response = await fetch(`${API_URL}/psychologist/${psychologistId}/patients`);
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
      const response = await fetch(`${API_URL}/centers?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setCenters(data);
      }
    } catch (error) {
      console.error('Error loading centers:', error);
    }
  };

  const loadPsychologistProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/psychologist/${psychologistId}/profile`);
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
      const response = await fetch(`${API_URL}/patient/${patId}/unbilled?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSessions(data.sessions || []);
        setAvailableBonos(data.bonos || []);
      }
    } catch (error) {
      console.error('Error loading unbilled items:', error);
    }
  };

  const loadCenterUnbilledSessions = async (centerId: string) => {
    try {
      const response = await fetch(`${API_URL}/center/${centerId}/unbilled?psychologistId=${psychologistId}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSessions(data.sessions || []);
        setAvailableBonos(data.bonos || []);
      }
    } catch (error) {
      console.error('Error loading center unbilled sessions:', error);
    }
  };

  const handlePatientSelect = async (patId: string) => {
    setSelectedPatientId(patId);
    const patient = patients.find(p => p.id === patId);
    console.log('[BillingPanel] Paciente seleccionado:', patient);
    if (patient) {
      // Precargar datos del paciente
      setFormData(prev => ({
        ...prev,
        billing_client_name: patient.billing_name || patient.name || '',
        billing_client_address: patient.billing_address || '',
        billing_client_tax_id: patient.billing_tax_id || ''
      }));
      console.log('[BillingPanel] Datos de facturación del cliente precargados:', {
        billing_client_name: patient.billing_name || patient.name,
        billing_client_address: patient.billing_address,
        billing_client_tax_id: patient.billing_tax_id
      });
      
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
        // Para centro, usar el porcentaje del psicólogo
        if (invoiceType === 'center' && session.percent_psych) {
          subtotal += (session.price * session.percent_psych) / 100;
        } else {
          subtotal += session.price;
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

  const generateInvoiceNumber = async () => {
    try {
      const response = await fetch(`${API_URL}/invoices?psychologist_user_id=${psychologistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices for numbering');
      }
      
      const allInvoices = await response.json();
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2); // Últimos 2 dígitos del año (26)
      const yearPrefix = `F${yearSuffix}`;
      
      // Filtrar facturas del año actual que empiecen con F26
      const invoicesThisYear = allInvoices.filter((inv: any) => 
        inv.invoiceNumber && inv.invoiceNumber.startsWith(yearPrefix)
      );
      
      if (invoicesThisYear.length === 0) {
        return `${yearPrefix}000001`;
      }
      
      // Extraer los números de secuencia (últimos 6 dígitos)
      const numbers = invoicesThisYear.map((inv: any) => {
        const numPart = inv.invoiceNumber.replace(yearPrefix, '');
        return parseInt(numPart || '0', 10);
      });
      
      const maxNumber = Math.max(...numbers);
      const nextNumber = maxNumber + 1;
      
      return `${yearPrefix}${String(nextNumber).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      const year = new Date().getFullYear();
      const yearSuffix = String(year).slice(-2);
      return `F${yearSuffix}${String(Date.now()).slice(-6)}`;
    }
  };

  const handleSaveInvoice = async (isDraft: boolean) => {
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
      
      if (selectedSessionIds.size === 0) {
        alert('Debes seleccionar al menos una sesión del centro');
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      const invoiceNumber = await generateInvoiceNumber();
      const totals = calculateTotal();

      // Datos base de la factura
      const newInvoice: any = {
        id: editingInvoice?.id || Date.now().toString(),
        invoiceNumber: editingInvoice?.invoiceNumber || invoiceNumber,
        amount: totals.subtotal,
        date: formData.date,
        invoice_date: formData.date,
        dueDate: formData.dueDate,
        status: isDraft ? 'draft' : 'pending',
        description: formData.description,
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
        billing_psychologist_name: formData.billing_psychologist_name,
        billing_psychologist_address: formData.billing_psychologist_address,
        billing_psychologist_tax_id: formData.billing_psychologist_tax_id
      };

      // Añadir IRPF solo para facturas a centros
      if (invoiceType === 'center') {
        newInvoice.irpf = formData.irpf || 0;
      }

      // Añadir datos específicos según el tipo
      if (invoiceType === 'patient') {
        const patient = patients.find(p => p.id === selectedPatientId);
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
      }

      const method = editingInvoice ? 'PATCH' : 'POST';
      const url = editingInvoice ? `${API_URL}/invoices/${editingInvoice.id}` : `${API_URL}/invoices`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-User-Id': psychologistId },
        body: JSON.stringify(newInvoice)
      });

      if (response.ok) {
        await loadInvoices();
        handleCloseModal();
        alert(isDraft ? 'Borrador guardado correctamente' : 'Factura creada correctamente');
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

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este borrador?')) return;
    
    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
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
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
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

  const handleCancelInvoice = async () => {
    if (!invoiceToCancel) return;
    
    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceToCancel.id}/rectify`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': psychologistId 
        }
      });
      
      if (response.ok) {
        await loadInvoices();
        setShowCancelModal(false);
        setInvoiceToCancel(null);
        setSelectedInvoice(null);
        alert('Factura cancelada y rectificativa creada correctamente');
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
      taxRate: invoice.taxRate || 21,
      irpf: invoice.irpf || 15,
      billing_client_name: invoice.billing_client_name || '',
      billing_client_address: invoice.billing_client_address || '',
      billing_client_tax_id: invoice.billing_client_tax_id || '',
      billing_psychologist_name: invoice.billing_psychologist_name || '',
      billing_psychologist_address: invoice.billing_psychologist_address || '',
      billing_psychologist_tax_id: invoice.billing_psychologist_tax_id || ''
    });
    
    // Cargar sesiones según el tipo de factura
    if (invoice.invoice_type === 'center' && (invoice as any).centerId) {
      setSelectedCenterId((invoice as any).centerId);
      await loadCenterUnbilledSessions((invoice as any).centerId);
    } else {
      setSelectedPatientId(invoice.patient_user_id || invoice.patientId || '');
      await loadUnbilledItems(invoice.patient_user_id || invoice.patientId || '');
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
      taxRate: invoiceType === 'center' ? 21 : 0,
      billing_client_name: '',
      billing_client_address: '',
      billing_client_tax_id: '',
      ...psychData
    });
  };

  const handleOpenNewInvoice = () => {
    // Asegurar que los datos del psicólogo estén precargados al abrir nueva factura
    const psychData = {
      billing_psychologist_name: psychologistProfile?.businessName || psychologistProfile?.name || '',
      billing_psychologist_address: psychologistProfile?.address || '',
      billing_psychologist_tax_id: psychologistProfile?.taxId || ''
    };
    console.log('[BillingPanel] Perfil del psicólogo:', psychologistProfile);
    console.log('[BillingPanel] Abriendo nueva factura con datos del psicólogo:', psychData);
    
    // Resetear todo el formulario con los datos del psicólogo precargados
    setFormData({
      date: new Date().toISOString().split('T')[0],
      dueDate: '',
      description: '',
      taxRate: invoiceType === 'center' ? 21 : 0,
      billing_client_name: '',
      billing_client_address: '',
      billing_client_tax_id: '',
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
      // Abrir la factura en una nueva ventana para visualizar/imprimir
      const pdfWindow = window.open(`${API_URL}/invoices/${invoiceId}/pdf`, '_blank');
      if (!pdfWindow) {
        alert('Por favor, permite ventanas emergentes para visualizar la factura');
      }
    } catch (error) {
      console.error('Error opening PDF:', error);
      alert('Error al abrir la factura');
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

  // Calcular estadísticas (sin filtros de fecha, todas las facturas)
  const totalEmitidas = invoices.filter(inv => inv.status !== 'draft' && !inv.is_rectificativa).length;
  const totalPendientes = invoices.filter(inv => (inv.status === 'pending' || inv.status === 'overdue') && !inv.is_rectificativa).length;
  const totalAmount = invoices
    .filter(inv => inv.status !== 'draft' && inv.status !== 'cancelled' && !inv.is_rectificativa)
    .reduce((sum, inv) => sum + (inv.total || inv.amount * 1.21), 0);
  
  console.log('[BillingPanel] Invoices:', invoices.length, 'Filtered:', filteredInvoices.length);

  return (
    <div className={patientId ? "px-8 pt-6 space-y-4" : "space-y-4"}>
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowDrafts(false);
              setShowRectificativas(false);
              setStatusFilter('all');
            }}
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              !showDrafts && !showRectificativas ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              showDrafts ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
            className={`px-4 py-2 rounded-lg transition-colors font-medium ${
              showRectificativas ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Rectificativas
          </button>
        </div>
        <button
          onClick={handleOpenNewInvoice}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-md font-medium"
        >
          <Plus size={20} />
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

      {/* Invoices List */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            No hay {showDrafts ? 'borradores' : showRectificativas ? 'facturas rectificativas' : 'facturas'}
          </div>
        ) : (
          filteredInvoices.map(invoice => (
            <div key={invoice.id} className="bg-white rounded-lg shadow p-6 border border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{invoice.invoiceNumber}</h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(invoice.status)}`}>
                      {getStatusLabel(invoice.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{invoice.patientName}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(invoice.invoice_date || invoice.date).toLocaleDateString()} - Vence: {new Date(invoice.dueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-indigo-600">€{(invoice.total || invoice.amount * 1.21).toFixed(2)}</div>
                  <div className="flex gap-2 mt-2">
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
              {/* Tipo de factura */}
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
                    onClick={() => setInvoiceType('center')}
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

              {/* Seleccionar paciente o centro */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {invoiceType === 'patient' ? 'Paciente' : 'Centro'} *
                </label>
                {invoiceType === 'patient' ? (
                  <select
                    value={selectedPatientId}
                    onChange={(e) => handlePatientSelect(e.target.value)}
                    disabled={!!editingInvoice}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Seleccionar paciente...</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} ({patient.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedCenterId}
                    onChange={(e) => handleCenterSelect(e.target.value)}
                    disabled={!!editingInvoice}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Seleccionar centro...</option>
                    {centers.map((center) => (
                      <option key={center.id} value={center.id}>
                        {center.center_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Sesiones - para facturas de paciente y centro */}
              {((invoiceType === 'patient' && selectedPatientId) || (invoiceType === 'center' && selectedCenterId)) && (
                <div className="space-y-4">
                  {/* Sesiones */}
                  {availableSessions.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Sesiones sin facturar ({availableSessions.length})
                      </label>
                      <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-3">
                        {availableSessions.map(session => {
                          const sessionPrice = session.price || 0;
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
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Bonos sin facturar ({availableBonos.length})
                      </label>
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
                    <textarea
                      value={formData.billing_client_address}
                      onChange={(e) => setFormData({ ...formData, billing_client_address: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
                    <textarea
                      value={formData.billing_psychologist_address}
                      onChange={(e) => setFormData({ ...formData, billing_psychologist_address: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de Vencimiento *</label>
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
                  placeholder="Notas adicionales sobre la factura..."
                />
              </div>

              {/* Configuración de impuestos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    IVA (%)
                  </label>
                  <input
                    type="number"
                    value={formData.taxRate}
                    onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                    min="0"
                    max="100"
                    step="0.1"
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
                      type="number"
                      value={formData.irpf}
                      onChange={(e) => setFormData({ ...formData, irpf: parseFloat(e.target.value) || 0 })}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      placeholder="15"
                    />
                  </div>
                )}
              </div>

              {/* Totales */}
              {((invoiceType === 'patient' && (selectedSessionIds.size > 0 || selectedBonoIds.size > 0)) || 
                (invoiceType === 'center' && selectedSessionIds.size > 0)) && (
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">¿Cancelar factura y crear rectificativa?</h3>
              <p className="text-slate-600 mb-2">
                Se cancelará la factura <strong>{invoiceToCancel.invoiceNumber}</strong> y se creará una factura rectificativa con el mismo valor en negativo.
              </p>
              <p className="text-slate-600 mb-6">
                Las sesiones y bonos asociados serán desasignados de esta factura.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setInvoiceToCancel(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                >
                  No, mantener factura
                </button>
                <button
                  onClick={handleCancelInvoice}
                  className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors font-medium"
                >
                  Sí, cancelar y rectificar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">Factura {selectedInvoice.invoiceNumber}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedInvoice.patientName}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedInvoice.status)}`}>
                  {getStatusLabel(selectedInvoice.status)}
                </span>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Emisión</div>
                  <div className="text-sm text-slate-900">{new Date(selectedInvoice.invoice_date || selectedInvoice.date).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Vencimiento</div>
                  <div className="text-sm text-slate-900">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</div>
                </div>
              </div>

              {selectedInvoice.description && (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Descripción</div>
                  <div className="text-sm text-slate-700">{selectedInvoice.description}</div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-semibold text-slate-900">€{selectedInvoice.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600">IVA ({selectedInvoice.taxRate || 21}%):</span>
                  <span className="font-semibold text-slate-900">€{(selectedInvoice.tax || (selectedInvoice.amount * 0.21)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-lg font-semibold text-slate-900">Total:</span>
                  <span className="text-2xl font-bold text-indigo-600">€{(selectedInvoice.total || (selectedInvoice.amount * 1.21)).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-between">
              <div className="flex gap-2">
                {selectedInvoice.status !== 'draft' && selectedInvoice.status !== 'cancelled' && !selectedInvoice.is_rectificativa && (
                  <>
                    {selectedInvoice.status === 'pending' && (
                      <button
                        onClick={() => handleStatusChange(selectedInvoice.id, 'paid')}
                        className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                      >
                        <Check size={16} />
                        Marcar como Pagada
                      </button>
                    )}
                    {selectedInvoice.status === 'paid' && (
                      <button
                        onClick={() => handleStatusChange(selectedInvoice.id, 'pending')}
                        className="px-4 py-2 text-sm bg-yellow-600 text-white hover:bg-yellow-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                      >
                        <Clock size={16} />
                        Marcar como Pendiente
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setInvoiceToCancel(selectedInvoice);
                        setSelectedInvoice(null);
                        setShowCancelModal(true);
                      }}
                      className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors font-medium flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Cancelar Factura
                    </button>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPanel;
