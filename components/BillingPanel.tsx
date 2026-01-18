import React, { useState, useEffect } from 'react';
import { FileText, Plus, DollarSign, Check, Clock, ExternalLink, Download, Eye, Edit, Trash2, Send, CheckSquare, Square } from 'lucide-react';
import { API_URL } from '../services/config';

interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  amount: number;
  date: string;
  dueDate: string;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  stripePaymentLink?: string;
  description: string;
  items: InvoiceItem[];
  cancelledAt?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface BillingPanelProps {
  psychologistId: string;
  patientId?: string;
}

const BillingPanel: React.FC<BillingPanelProps> = ({ psychologistId, patientId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isDownloadingBatch, setIsDownloadingBatch] = useState(false);
  
  // New invoice form
  const [formData, setFormData] = useState({
    patientId: '',
    date: new Date().toISOString().split('T')[0],
    dueDate: '',
    description: '',
    items: [{ description: 'Sesión de terapia', quantity: 1, unitPrice: 0 }]
  });

  useEffect(() => {
    loadInvoices();
    if (!patientId) {
      loadPatients();
    }
  }, [psychologistId, patientId]);

  const loadInvoices = async () => {
    setIsLoading(true);
    try {
      const url = patientId 
        ? `${API_URL}/invoices?psychologistId=${psychologistId}&patientId=${patientId}`
        : `${API_URL}/invoices?psychologistId=${psychologistId}`;
      console.log('[BillingPanel] Loading invoices from:', url);
      console.log('[BillingPanel] psychologistId:', psychologistId);
      console.log('[BillingPanel] patientId:', patientId);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log('[BillingPanel] Invoices loaded:', data.length, 'invoices');
        console.log('[BillingPanel] Invoices data:', data);
        setInvoices(data);
      } else {
        console.error('[BillingPanel] Error response:', response.status, response.statusText);
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

  const calculateTotal = () => {
    return formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  };

  const generateInvoiceNumber = async () => {
    try {
      // Fetch ALL invoices for this psychologist (not filtered by patient) to get correct numbering
      const response = await fetch(`${API_URL}/invoices?psychologistId=${psychologistId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch invoices for numbering');
      }
      
      const allInvoices = await response.json();
      const year = new Date().getFullYear();
      
      // Find the highest invoice number for the current year
      const yearPrefix = `${year}-`;
      const invoicesThisYear = allInvoices.filter((inv: any) => 
        inv.invoiceNumber && inv.invoiceNumber.startsWith(yearPrefix)
      );
      
      if (invoicesThisYear.length === 0) {
        return `${year}-0001`;
      }
      
      // Extract numbers and find max
      const numbers = invoicesThisYear.map((inv: any) => {
        const parts = inv.invoiceNumber.split('-');
        return parseInt(parts[1] || '0', 10);
      });
      
      const maxNumber = Math.max(...numbers);
      const nextNumber = maxNumber + 1;
      
      return `${year}-${String(nextNumber).padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      // Fallback to simple counting if fetch fails
      const year = new Date().getFullYear();
      return `${year}-${String(Date.now()).slice(-4)}`;
    }
  };

  const handleCreateInvoice = async () => {
    if (!formData.patientId || !formData.date || !formData.dueDate) {
      alert('Por favor completa todos los campos requeridos');
      return;
    }

    // Validar que la fecha de factura sea anterior a la fecha de vencimiento
    const invoiceDate = new Date(formData.date);
    const dueDate = new Date(formData.dueDate);
    
    if (invoiceDate >= dueDate) {
      alert('La fecha de factura debe ser anterior a la fecha de vencimiento');
      return;
    }

    const patient = patients.find(p => p.id === formData.patientId);
    if (!patient) return;

    // Generate invoice number asynchronously
    const invoiceNumber = await generateInvoiceNumber();

    const newInvoice: Invoice = {
      id: Date.now().toString(),
      invoiceNumber,
      patientId: formData.patientId,
      patientName: patient.name,
      amount: calculateTotal(),
      date: formData.date,
      dueDate: formData.dueDate,
      status: 'pending',
      description: formData.description,
      items: formData.items
    };

    try {
      const response = await fetch(`${API_URL}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newInvoice, psychologistId })
      });

      if (response.ok) {
        await loadInvoices();
        setShowNewInvoice(false);
        resetForm();
        alert('Factura creada correctamente');
      }
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Error al crear la factura');
    }
  };

  const handleGeneratePaymentLink = async (invoiceId: string) => {
    try {
      const response = await fetch(`${API_URL}/invoices/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId })
      });

      if (response.ok) {
        const { paymentLink } = await response.json();
        await loadInvoices();
        // Copy to clipboard
        navigator.clipboard.writeText(paymentLink);
        alert('Link de pago generado y copiado al portapapeles');
      }
    } catch (error) {
      console.error('Error generating payment link:', error);
      alert('Error al generar el link de pago');
    }
  };

  const resetForm = () => {
    setFormData({
      patientId: '',
      date: new Date().toISOString().split('T')[0],
      dueDate: '',
      description: '',
      items: [{ description: 'Sesión de terapia', quantity: 1, unitPrice: 0 }]
    });
  };

  const handleChangeStatus = async (invoiceId: string, newStatus: 'paid' | 'pending' | 'overdue' | 'cancelled') => {
    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        await loadInvoices();
        alert('Estado actualizado correctamente');
      }
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert('Error al actualizar el estado');
    }
  };

  const toggleSelectInvoice = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === invoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(invoices.map(inv => inv.id)));
    }
  };

  const handleDownloadSelectedPDFs = async () => {
    if (selectedInvoices.size === 0) {
      alert('Selecciona al menos una factura');
      return;
    }

    setIsDownloadingBatch(true);
    
    for (const invoiceId of Array.from(selectedInvoices)) {
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (invoice && typeof invoiceId === 'string') {
        handleDownloadPDF(invoiceId, invoice.invoiceNumber);
        // Pequeña pausa entre descargas
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsDownloadingBatch(false);
    setSelectedInvoices(new Set());
    alert(`${selectedInvoices.size} facturas descargadas`);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { description: '', quantity: 1, unitPrice: 0 }]
    });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <Check size={14} />;
      case 'pending': return <Clock size={14} />;
      case 'overdue': return <Clock size={14} />;
      case 'cancelled': return <Trash2 size={14} />;
      default: return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Pagada';
      case 'pending': return 'Pendiente';
      case 'overdue': return 'Vencida';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const handleUpdateStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        await loadInvoices();
        alert('Estado actualizado correctamente');
      }
    } catch (error) {
      console.error('Error updating invoice status:', error);
      alert('Error al actualizar el estado');
    }
  };

  const handleCancelInvoice = async (invoiceId: string) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta factura?')) return;

    try {
      const response = await fetch(`${API_URL}/invoices/${invoiceId}/cancel`, {
        method: 'POST'
      });

      if (response.ok) {
        await loadInvoices();
        alert('Factura cancelada correctamente');
      }
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      alert('Error al cancelar la factura');
    }
  };

  const handleDownloadPDF = (invoiceId: string, invoiceNumber: string) => {
    window.open(`${API_URL}/invoices/${invoiceId}/pdf`, '_blank');
  };

  return (
    <div className="space-y-6" data-billing-component ref={(el) => {
      if (el) {
        (el as any).openNewInvoice = () => setShowNewInvoice(true);
      }
    }}>
      {/* Header - Only visible on mobile */}
      <div className="flex items-center justify-end lg:hidden">
        {!patientId && (
          <button
            onClick={() => setShowNewInvoice(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
          >
            <Plus size={18} />
            Nueva Factura
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Total Facturas</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">{invoices.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Pagadas</div>
          <div className="text-2xl font-bold text-green-600 mt-2">
            {invoices.filter(inv => inv.status === 'paid').length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Pendientes</div>
          <div className="text-2xl font-bold text-yellow-600 mt-2">
            {invoices.filter(inv => inv.status === 'pending').length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase font-semibold">Total Ingresos</div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            €{invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {selectedInvoices.size > 0 && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-indigo-700">
              {selectedInvoices.size} factura{selectedInvoices.size !== 1 ? 's' : ''} seleccionada{selectedInvoices.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={handleDownloadSelectedPDFs}
              disabled={isDownloadingBatch}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Download size={16} />
              {isDownloadingBatch ? 'Descargando...' : 'Descargar PDFs'}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">
                  <button
                    onClick={toggleSelectAll}
                    className="p-1 hover:bg-slate-200 rounded transition-colors"
                  >
                    {selectedInvoices.size === invoices.length && invoices.length > 0 ? (
                      <CheckSquare size={18} className="text-indigo-600" />
                    ) : (
                      <Square size={18} className="text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Nº Factura</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Paciente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Vencimiento</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Importe</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Estado</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No hay facturas todavía. Crea tu primera factura.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className={`hover:bg-slate-50 transition-colors ${invoice.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleSelectInvoice(invoice.id)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                      >
                        {selectedInvoices.has(invoice.id) ? (
                          <CheckSquare size={18} className="text-indigo-600" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-slate-900 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>{invoice.invoiceNumber}</td>
                    <td className={`px-4 py-3 text-sm text-slate-700 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>{invoice.patientName}</td>
                    <td className={`px-4 py-3 text-sm text-slate-600 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>{new Date(invoice.date).toLocaleDateString()}</td>
                    <td className={`px-4 py-3 text-sm text-slate-600 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>{new Date(invoice.dueDate).toLocaleDateString()}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-slate-900 text-right ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>€{invoice.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <div className="relative group">
                          <select
                            value={invoice.status}
                            onChange={(e) => handleChangeStatus(invoice.id, e.target.value as any)}
                            className={`appearance-none text-xs font-semibold border rounded-lg pl-3 pr-8 py-2 cursor-pointer transition-all hover:shadow-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none ${getStatusColor(invoice.status)}`}
                            style={{ minWidth: '120px' }}
                          >
                            <option value="pending">⏱️ Pendiente</option>
                            <option value="paid">✅ Pagada</option>
                            <option value="overdue">⚠️ Vencida</option>
                            <option value="cancelled">❌ Cancelada</option>
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedInvoice(invoice)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Ver detalles"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(invoice.id, invoice.invoiceNumber)}
                          className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Descargar PDF"
                        >
                          <Download size={16} />
                        </button>
                        {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                          <>
                            <button
                              onClick={() => handleGeneratePaymentLink(invoice.id)}
                              className="p-1.5 text-slate-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Generar link de pago"
                            >
                              <ExternalLink size={16} />
                            </button>
                            <button
                              onClick={() => handleCancelInvoice(invoice.id)}
                              className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Cancelar factura"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Invoice Modal */}
      {showNewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900">Nueva Factura</h3>
              <p className="text-sm text-slate-500 mt-1">Crea una nueva factura para un paciente</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Patient Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Paciente *</label>
                <select
                  value={formData.patientId}
                  onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">-- Selecciona un paciente --</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name} ({patient.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {patients.length === 0 
                    ? 'No tienes pacientes asociados' 
                    : `${patients.length} paciente${patients.length !== 1 ? 's' : ''} disponible${patients.length !== 1 ? 's' : ''}`
                  }
                </p>
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de Factura *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha de Vencimiento *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  min={formData.date}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">Debe ser posterior a la fecha de factura</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Notas adicionales sobre la factura..."
                />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Conceptos *</label>
                  <button
                    onClick={addItem}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Añadir concepto
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        placeholder="Descripción"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        placeholder="Cant."
                        min="1"
                        className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        placeholder="Precio"
                        step="0.01"
                        className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      {formData.items.length > 1 && (
                        <button
                          onClick={() => removeItem(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-slate-900">Total:</span>
                  <span className="text-2xl font-bold text-indigo-600">€{calculateTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewInvoice(false);
                  resetForm();
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateInvoice}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md"
              >
                Crear Factura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Factura {selectedInvoice.invoiceNumber}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedInvoice.patientName}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedInvoice.status)}`}>
                  {getStatusIcon(selectedInvoice.status)}
                  {getStatusLabel(selectedInvoice.status)}
                </span>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Fecha de emisión</div>
                  <div className="text-sm text-slate-900">{new Date(selectedInvoice.date).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Fecha de vencimiento</div>
                  <div className="text-sm text-slate-900">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</div>
                </div>
              </div>

              {selectedInvoice.description && (
                <div>
                  <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Descripción</div>
                  <div className="text-sm text-slate-700">{selectedInvoice.description}</div>
                </div>
              )}

              <div>
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Conceptos</div>
                <div className="space-y-2">
                  {selectedInvoice.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{item.description}</div>
                        <div className="text-xs text-slate-500">{item.quantity} x €{item.unitPrice.toFixed(2)}</div>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">€{(item.quantity * item.unitPrice).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-slate-900">Total:</span>
                  <span className="text-2xl font-bold text-indigo-600">€{selectedInvoice.amount.toFixed(2)}</span>
                </div>
              </div>

              {selectedInvoice.stripePaymentLink && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <div className="text-xs text-indigo-700 uppercase font-semibold mb-2">Link de Pago</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedInvoice.stripePaymentLink}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedInvoice.stripePaymentLink!);
                        alert('Link copiado al portapapeles');
                      }}
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors font-medium"
              >
                Cerrar
              </button>
              {selectedInvoice.status !== 'paid' && !selectedInvoice.stripePaymentLink && (
                <button
                  onClick={() => {
                    handleGeneratePaymentLink(selectedInvoice.id);
                    setSelectedInvoice(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-md flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  Generar Link de Pago
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillingPanel;
