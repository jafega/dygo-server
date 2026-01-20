import React, { useState, useEffect } from 'react';
import { Download, FileText, Check, Clock, AlertCircle, X } from 'lucide-react';
import { getCurrentUser } from '../services/authService';
import { API_URL } from '../services/config';

interface Invoice {
  id: string;
  psychologistId: string;
  psychologistName: string;
  patientId: string;
  patientName: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  tax?: number; // IVA
  total?: number; // Total con IVA
  taxRate?: number; // Porcentaje de IVA aplicado
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  description?: string;
  stripePaymentLink?: string;
}

export default function PatientBillingPanel() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setIsLoading(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) return;

      console.log('[PatientBillingPanel] Loading invoices for patientId:', currentUser.id);
      const response = await fetch(`${API_URL}/invoices?patientId=${currentUser.id}`);
      console.log('[PatientBillingPanel] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        setInvoices(data);
      }
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setIsLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-50 text-green-700 border-green-200';
      case 'pending': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'overdue': return 'bg-red-50 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-100 text-slate-600 border-slate-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <Check size={14} />;
      case 'pending': return <Clock size={14} />;
      case 'overdue': return <AlertCircle size={14} />;
      case 'cancelled': return <X size={14} />;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <FileText className="text-indigo-600" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Mis Facturas</h2>
              <p className="text-sm text-slate-600">Consulta y descarga tus facturas</p>
            </div>
          </div>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Nº Factura</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Psicólogo</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Fecha</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Vencimiento</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Importe</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Estado</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <FileText className="mx-auto text-slate-300 mb-3" size={48} />
                    <p className="text-slate-500 font-medium">No tienes facturas todavía</p>
                    <p className="text-sm text-slate-400 mt-1">Las facturas de tus sesiones aparecerán aquí</p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className={`hover:bg-slate-50 transition-colors ${invoice.status === 'cancelled' ? 'opacity-60' : ''}`}>
                    <td className={`px-6 py-4 text-sm font-semibold text-slate-900 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {invoice.invoiceNumber}
                    </td>
                    <td className={`px-6 py-4 text-sm text-slate-700 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {invoice.psychologistName}
                    </td>
                    <td className={`px-6 py-4 text-sm text-slate-600 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {new Date(invoice.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className={`px-6 py-4 text-sm text-slate-600 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {new Date(invoice.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold text-slate-900 text-right ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      €{(invoice.total || invoice.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${getStatusColor(invoice.status)}`}>
                          {getStatusIcon(invoice.status)}
                          {getStatusLabel(invoice.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDownloadPDF(invoice.id)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Descargar PDF"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {invoices.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="mx-auto text-slate-300 mb-3" size={48} />
              <p className="text-slate-500 font-medium">No tienes facturas todavía</p>
              <p className="text-sm text-slate-400 mt-1">Las facturas de tus sesiones aparecerán aquí</p>
            </div>
          ) : (
            invoices.map((invoice) => (
              <div key={invoice.id} className={`p-4 hover:bg-slate-50 transition-colors ${invoice.status === 'cancelled' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className={`font-semibold text-slate-900 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {invoice.invoiceNumber}
                    </p>
                    <p className={`text-sm text-slate-600 mt-1 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {invoice.psychologistName}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getStatusColor(invoice.status)}`}>
                    {getStatusIcon(invoice.status)}
                    {getStatusLabel(invoice.status)}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Fecha</p>
                    <p className={`text-sm font-medium text-slate-700 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {new Date(invoice.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Vencimiento</p>
                    <p className={`text-sm font-medium text-slate-700 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                      {new Date(invoice.dueDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <p className={`text-lg font-bold text-slate-900 ${invoice.status === 'cancelled' ? 'line-through' : ''}`}>
                    €{(invoice.total || invoice.amount).toFixed(2)}
                  </p>
                  <button
                    onClick={() => handleDownloadPDF(invoice.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                  >
                    <Download size={16} />
                    Descargar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
