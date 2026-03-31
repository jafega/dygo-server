import React, { useState, useMemo, useEffect } from 'react';
import { X, Download, CheckSquare, Square, FileSpreadsheet, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import { isTempEmail } from '../services/textUtils';

interface PatientExportData {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  billing_name?: string;
  billing_address?: string;
  billing_tax_id?: string;
  postalCode?: string;
  country?: string;
  tags?: string[];
  active?: boolean;
  patientNumber?: number;
  // Care relationship fields
  default_session_price?: number | null;
  default_psych_percent?: number | null;
  relationship_created_at?: string | null;
}

interface ColumnDef {
  key: string;
  label: string;
  getValue: (p: PatientExportData) => string;
}

const PATIENT_COLUMNS: ColumnDef[] = [
  { key: 'patientNumber', label: 'Nº Paciente', getValue: p => p.patientNumber != null ? String(p.patientNumber) : '' },
  { key: 'name', label: 'Nombre', getValue: p => p.name || '' },
  { key: 'email', label: 'Email', getValue: p => (!isTempEmail(p.email) ? p.email : '') || '' },
  { key: 'phone', label: 'Teléfono', getValue: p => p.phone || '' },
  { key: 'active', label: 'Estado', getValue: p => p.active === false ? 'Inactivo' : 'Activo' },
  { key: 'tags', label: 'Tags', getValue: p => (p.tags || []).join(', ') },
  { key: 'billing_name', label: 'Razón Social Facturación', getValue: p => p.billing_name || '' },
  { key: 'billing_address', label: 'Dirección Facturación', getValue: p => p.billing_address || '' },
  { key: 'billing_tax_id', label: 'NIF / DNI', getValue: p => p.billing_tax_id || '' },
  { key: 'postalCode', label: 'Código Postal', getValue: p => p.postalCode || '' },
  { key: 'country', label: 'País', getValue: p => p.country || '' },
];

const RELATIONSHIP_COLUMNS: ColumnDef[] = [
  { key: 'default_session_price', label: 'Precio por Sesión (€)', getValue: p => p.default_session_price != null ? String(p.default_session_price) : '' },
  { key: 'default_psych_percent', label: 'Porcentaje Psicólogo (%)', getValue: p => p.default_psych_percent != null ? String(p.default_psych_percent) : '' },
  { key: 'relationship_created_at', label: 'Fecha Alta Relación', getValue: p => {
    if (!p.relationship_created_at) return '';
    try {
      return new Date(p.relationship_created_at).toLocaleDateString('es-ES');
    } catch {
      return p.relationship_created_at;
    }
  }},
];

const ALL_COLUMNS = [...PATIENT_COLUMNS, ...RELATIONSHIP_COLUMNS];

const DEFAULT_SELECTED = new Set(['patientNumber', 'name', 'email', 'phone', 'active', 'tags']);

interface ExportPatientsModalProps {
  psychologistId: string;
  onClose: () => void;
}

const ExportPatientsModal: React.FC<ExportPatientsModalProps> = ({ psychologistId, onClose }) => {
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set(DEFAULT_SELECTED));
  const [patientGroupOpen, setPatientGroupOpen] = useState(true);
  const [relationGroupOpen, setRelationGroupOpen] = useState(true);
  const [patients, setPatients] = useState<PatientExportData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const res = await apiFetch(`${API_URL}/psychologist/${psychologistId}/patients?showInactive=true`);
        if (!res.ok) throw new Error('Error al cargar pacientes');
        const data: PatientExportData[] = await res.json();
        setPatients(data);
      } catch (e) {
        setError('No se pudieron cargar los pacientes. Inténtalo de nuevo.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPatients();
  }, [psychologistId]);

  const toggleCol = (key: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (cols: ColumnDef[], allSelected: boolean) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      if (allSelected) {
        cols.forEach(c => next.delete(c.key));
      } else {
        cols.forEach(c => next.add(c.key));
      }
      return next;
    });
  };

  const orderedCols = useMemo(
    () => ALL_COLUMNS.filter(c => selectedCols.has(c.key)),
    [selectedCols]
  );

  const patientGroupAllSelected = PATIENT_COLUMNS.every(c => selectedCols.has(c.key));
  const relationGroupAllSelected = RELATIONSHIP_COLUMNS.every(c => selectedCols.has(c.key));

  const handleExport = () => {
    if (orderedCols.length === 0) return;

    const escapeCell = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = orderedCols.map(c => escapeCell(c.label)).join(',');
    const rows = patients.map(p =>
      orderedCols.map(c => escapeCell(c.getValue(p))).join(',')
    );

    const csvContent = '\uFEFF' + [header, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `pacientes_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Exportar Pacientes</h2>
              <p className="text-xs text-slate-500">
                {isLoading ? 'Cargando...' : `${patients.length} paciente${patients.length !== 1 ? 's' : ''} · formato CSV (Excel)`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Loading / Error states */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
          </div>
        )}
        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center py-12 px-6">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">{error}</p>
          </div>
        )}

        {/* Column picker */}
        {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-sm text-slate-600">Selecciona las columnas que quieres incluir en el archivo exportado:</p>

          {/* Grupo: Datos del paciente */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setPatientGroupOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {patientGroupOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <span className="text-sm font-semibold text-slate-700">Datos del paciente</span>
                <span className="text-xs text-slate-400">
                  ({PATIENT_COLUMNS.filter(c => selectedCols.has(c.key)).length}/{PATIENT_COLUMNS.length})
                </span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); toggleGroup(PATIENT_COLUMNS, patientGroupAllSelected); }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors"
              >
                {patientGroupAllSelected ? 'Quitar todos' : 'Seleccionar todos'}
              </button>
            </button>
            {patientGroupOpen && (
              <div className="divide-y divide-slate-100">
                {PATIENT_COLUMNS.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <span className={`flex-shrink-0 ${selectedCols.has(col.key) ? 'text-indigo-600' : 'text-slate-300'}`}>
                      {selectedCols.has(col.key) ? <CheckSquare size={18} /> : <Square size={18} />}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                    />
                    <span className="text-sm text-slate-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Grupo: Datos de la relación */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setRelationGroupOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {relationGroupOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                <span className="text-sm font-semibold text-slate-700">Datos de la relación terapéutica</span>
                <span className="text-xs text-slate-400">
                  ({RELATIONSHIP_COLUMNS.filter(c => selectedCols.has(c.key)).length}/{RELATIONSHIP_COLUMNS.length})
                </span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); toggleGroup(RELATIONSHIP_COLUMNS, relationGroupAllSelected); }}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors"
              >
                {relationGroupAllSelected ? 'Quitar todos' : 'Seleccionar todos'}
              </button>
            </button>
            {relationGroupOpen && (
              <div className="divide-y divide-slate-100">
                {RELATIONSHIP_COLUMNS.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <span className={`flex-shrink-0 ${selectedCols.has(col.key) ? 'text-indigo-600' : 'text-slate-300'}`}>
                      {selectedCols.has(col.key) ? <CheckSquare size={18} /> : <Square size={18} />}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                    />
                    <span className="text-sm text-slate-700">{col.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selectedCols.size === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Selecciona al menos una columna para exportar.
            </p>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {isLoading ? '' : `${orderedCols.length} columna${orderedCols.length !== 1 ? 's' : ''} seleccionada${orderedCols.length !== 1 ? 's' : ''}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleExport}
              disabled={orderedCols.length === 0 || isLoading || patients.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-200 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl shadow transition-colors"
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportPatientsModal;
