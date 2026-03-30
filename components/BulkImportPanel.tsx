import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, Plus, Trash2, AlertCircle, CheckCircle2,
  Loader2, X, RefreshCw, Download, FileText, Users,
  ChevronDown, ChevronUp, Info
} from 'lucide-react';
import { ai } from '../services/genaiService';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';
import { Type } from '@google/genai';
import * as XLSX from 'xlsx';
import UpgradeModal from './UpgradeModal';
import { User } from '../types';
import { normalizePhone } from '../services/phoneUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type RowStatus = 'pending' | 'importing' | 'success' | 'error' | 'duplicate' | 'skipped' | 'inactive';

interface ImportRow {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dni: string;
  address: string;
  date_of_birth: string;
  file_number: string;
  default_session_price: string;
  default_psych_percent: string;
  tags: string;
  _status: RowStatus;
  _error?: string;
  _patientId?: string;
}

interface BulkImportPanelProps {
  psychologistId: string;
  currentUser?: User;
  canCreate?: boolean;
  onNeedUpgrade?: () => void;
  onImportComplete?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function emptyRow(): ImportRow {
  return {
    _id: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dni: '',
    address: '',
    date_of_birth: '',
    file_number: '',
    default_session_price: '',
    default_psych_percent: '',
    tags: '',
    _status: 'pending',
  };
}

function validateRow(row: ImportRow): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!row.firstName.trim()) errors.firstName = 'Nombre obligatorio';
  if (row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.email = 'Email no válido';
  }
  if (row.default_session_price !== '') {
    const v = parseFloat(row.default_session_price);
    if (isNaN(v) || v < 0) errors.default_session_price = 'Precio inválido';
  }
  if (row.default_psych_percent !== '') {
    const v = parseFloat(row.default_psych_percent);
    if (isNaN(v) || v < 0 || v > 100) errors.default_psych_percent = '0–100';
  }
  if (row.date_of_birth.trim()) {
    const d = new Date(row.date_of_birth.trim());
    if (isNaN(d.getTime())) errors.date_of_birth = 'Fecha no válida';
  }
  if (row.file_number !== '') {
    const v = parseInt(row.file_number, 10);
    if (isNaN(v) || v < 0) errors.file_number = 'Nº inválido';
  }
  return errors;
}

const STATUS_CONFIG: Record<RowStatus, { label: string; classes: string }> = {
  pending:   { label: 'Pendiente', classes: 'bg-slate-100 text-slate-600' },
  importing: { label: 'Importando…', classes: 'bg-indigo-100 text-indigo-700' },
  success:   { label: '✓ Creado', classes: 'bg-emerald-100 text-emerald-700' },
  error:     { label: 'Error', classes: 'bg-red-100 text-red-700' },
  duplicate: { label: 'Duplicado', classes: 'bg-amber-100 text-amber-700' },
  skipped:   { label: 'Omitido', classes: 'bg-slate-100 text-slate-500' },
  inactive:  { label: 'Inactivo', classes: 'bg-orange-100 text-orange-700' },
};

const ACCEPTED_EXTS = '.csv,.xlsx,.xls,.pdf,.ods';
const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Component ────────────────────────────────────────────────────────────────

const BulkImportPanel: React.FC<BulkImportPanelProps> = ({ psychologistId, currentUser, canCreate = true, onNeedUpgrade, onImportComplete }) => {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importCurrent, setImportCurrent] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [upgradeModal, setUpgradeModal] = useState<boolean>(false);
  const [parseStep, setParseStep] = useState<string>('');
  const [parseProgress, setParseProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expectedRowCount, setExpectedRowCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseStartRef = useRef<number>(0);

  // Timer for elapsed seconds during parsing
  useEffect(() => {
    if (!isParsing) { setElapsedTime(0); return; }
    parseStartRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - parseStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isParsing]);

  // ── File parsing ─────────────────────────────────────────────────────────

  const parseFile = useCallback(async (file: File) => {
    if (!ai) {
      setParseError(
        'La clave API de Gemini (VITE_GEMINI_API_KEY) no está configurada. ' +
        'Puedes añadir pacientes manualmente usando el botón "+ Añadir fila".'
      );
      setRows([emptyRow()]);
      setFileName(file.name);
      return;
    }

    setIsParsing(true);
    setParseError(null);
    setRows([]);
    setImportDone(false);
    setFileName(file.name);
    setParseStep('Leyendo archivo…');
    setParseProgress(10);
    setExpectedRowCount(null);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const isTextFile = ext === 'csv' || file.type === 'text/csv';
      const isSpreadsheet = ['xlsx', 'xls', 'ods'].includes(ext);

      let contentParts: any[];

      if (isTextFile) {
        setParseStep('Procesando archivo CSV…');
        setParseProgress(20);
        const text = await file.text();
        // Count data rows (skip header and empty lines)
        const csvLines = text.split('\n').filter(l => l.trim().length > 0);
        if (csvLines.length > 1) setExpectedRowCount(csvLines.length - 1);
        contentParts = [
          { text: `Contenido del archivo (CSV):\n\`\`\`\n${text.substring(0, 60000)}\n\`\`\`` },
        ];
      } else if (isSpreadsheet) {
        setParseStep('Convirtiendo hoja de cálculo a texto…');
        setParseProgress(20);
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const csvParts: string[] = [];
        let totalDataRows = 0;
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (csv.trim()) {
            csvParts.push(`Hoja "${sheetName}":\n${csv}`);
            // Count data rows in this sheet (skip header and empty lines)
            const sheetRows = csv.split('\n').filter(l => l.trim().replace(/,/g, '').trim().length > 0);
            if (sheetRows.length > 1) totalDataRows += sheetRows.length - 1;
          }
        }
        if (totalDataRows > 0) setExpectedRowCount(totalDataRows);
        const csvText = csvParts.join('\n\n').substring(0, 60000);
        contentParts = [
          { text: `Contenido del archivo (${ext.toUpperCase()} convertido a CSV):\n\`\`\`\n${csvText}\n\`\`\`` },
        ];
        setParseProgress(35);
      } else {
        setParseStep('Codificando archivo PDF…');
        setParseProgress(20);
        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const mimeType = ext === 'pdf' ? 'application/pdf' : (file.type || 'application/octet-stream');
        contentParts = [
          { inlineData: { mimeType, data: base64 } },
        ];
      }
      setParseStep('Enviando datos a la IA…');
      setParseProgress(40);

      contentParts.push({
        text: `Eres un asistente experto en extracción de datos para software de psicología clínica.

Analiza cuidadosamente el contenido del archivo y extrae la información de TODOS los pacientes que aparezcan.

Para cada paciente, extrae:
- firstName: Nombre de pila del paciente (OBLIGATORIO). Si el nombre completo es "María García López", el firstName es "María".
- lastName: Apellidos del paciente (null si no se pueden separar). Si el nombre completo es "María García López", el lastName es "García López".
- email: Correo electrónico (null si no aparece)
- phone: Teléfono de contacto (null si no aparece)
- dni: DNI, NIF, NIE o documento de identidad (null si no aparece)
- address: Dirección completa del paciente (null si no aparece)
- date_of_birth: Fecha de nacimiento en formato YYYY-MM-DD (null si no aparece)
- file_number: Número de paciente, número de ficha, número de historial o número de expediente (null si no aparece). CRÍTICO: lee el valor EXACTO de la columna — no lo inventes, no autogeneres números secuenciales. Si el paciente 15 tiene el número 15, extrae 15; si el paciente 27 tiene el número 27, extrae 27.
- default_session_price: Precio de la sesión en euros como número (null si no aparece)
- default_psych_percent: Porcentaje que retiene el psicólogo, entre 0 y 100 (null si no aparece)
- tags: Lista de etiquetas, categorías o diagnósticos mencionados (array vacío si no hay)

REGLAS CRÍTICAS — LEE ESTO CON ATENCIÓN ANTES DE RESPONDER:

1. CUENTA PRIMERO: Antes de generar el JSON, cuenta explícitamente cuántas filas de datos (excluyendo cabeceras) existen en el documento. Ese número es N. Tu array "patients" DEBE tener exactamente N elementos. Si N=30, debes devolver 30 pacientes. Si N=15, debes devolver 15. NO puedes devolver más ni menos.

2. SIN OMISIONES: No saltes ni omitas ningún paciente por ningún motivo. No importa si una fila tiene datos incompletos, si parece un duplicado, si el nombre es poco común o si algún campo está vacío — inclúyela siempre. Es preferible incluir una fila con firstName vacío a omitir a un paciente.

3. NÚMERO DE PACIENTE EXACTO (file_number): Si en el documento hay una columna con el número de paciente, número de historia, número de derecho, número de ficha, código de paciente, o similar (sea cual sea el nombre exacto de esa columna), extrae el valor tal cual aparece para cada paciente. NO generes números secuenciales automáticos. El paciente cuyo número en el documento es 15 debe tener file_number: 15; el que tiene 27 debe tener file_number: 27. No confundas el número de fila con el número de paciente.

4. MAPEO DE COLUMNAS: 
   - Columnas de nombre de paciente: "Nº Paciente", "Nº Historia", "Nº Historial", "Nº Derecho", "Número de paciente", "Código", "ID Paciente", "Número" → file_number
   - Columnas de precio: "Tarifa", "Precio", "Fee", "Coste" → default_session_price
   - Columnas de identidad: "DNI", "NIF", "NIE", "Documento" → dni
   - Dirección: "Dirección", "Domicilio", "Address" → address
   - Fecha nacimiento: "Fecha nacimiento", "F. Nac.", "Nacimiento", "Date of birth", "F.Nacimiento" → date_of_birth
   - Expediente: "Nº Ficha", "Expediente", "Ficha", "File number" → file_number

5. Si el archivo contiene cabeceras de columna, úsalas para identificar los campos. Si hay una sola columna de nombre completo, separa firstName (primera palabra) de lastName (el resto).

6. Los números de teléfono deben incluir el prefijo +34 si no lo tienen ya.

7. Responde ÚNICAMENTE con el JSON, sin texto adicional.`,
      });

      setParseStep('Esperando respuesta de la IA… esto puede tardar unos segundos');
      setParseProgress(55);

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: contentParts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    firstName:              { type: Type.STRING },
                    lastName:               { type: Type.STRING, nullable: true },
                    email:                  { type: Type.STRING, nullable: true },
                    phone:                  { type: Type.STRING, nullable: true },
                    dni:                    { type: Type.STRING, nullable: true },
                    address:                { type: Type.STRING, nullable: true },
                    date_of_birth:          { type: Type.STRING, nullable: true },
                    file_number:            { type: Type.NUMBER, nullable: true },
                    default_session_price:  { type: Type.NUMBER, nullable: true },
                    default_psych_percent:  { type: Type.NUMBER, nullable: true },
                    tags:                   { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['firstName'],
                },
              },
            },
            required: ['patients'],
          },
        },
      });

      setParseStep('Procesando respuesta de la IA…');
      setParseProgress(85);

      const parsed = JSON.parse(response.text ?? '{"patients":[]}');
      const extracted: ImportRow[] = (parsed.patients ?? []).map((p: any) => ({
        _id: crypto.randomUUID(),
        firstName:             String(p.firstName ?? '').trim(),
        lastName:              String(p.lastName ?? '').trim(),
        email:                 String(p.email ?? '').trim(),
        phone:                 normalizePhone(String(p.phone ?? '').trim()),
        dni:                   String(p.dni ?? '').trim(),
        address:               String(p.address ?? '').trim(),
        date_of_birth:         String(p.date_of_birth ?? '').trim(),
        file_number:           p.file_number != null ? String(p.file_number) : '',
        default_session_price: p.default_session_price != null ? String(p.default_session_price) : '',
        default_psych_percent: p.default_psych_percent != null ? String(p.default_psych_percent) : '',
        tags:                  (p.tags ?? []).join(', '),
        _status:               'pending' as RowStatus,
      }));

      if (extracted.length === 0) {
        setParseError(
          'No se encontraron pacientes en el archivo. ' +
          'Verifica que el documento contiene datos de pacientes y vuelve a intentarlo.'
        );
      } else {
        setParseStep(`¡Listo! Se encontraron ${extracted.length} pacientes`);
        setParseProgress(100);
        setRows(extracted);
        // Warn if AI returned fewer patients than the file actually contained
        setExpectedRowCount(prev => {
          if (prev !== null && extracted.length < prev) {
            setParseError(
              `⚠️ Atención: el archivo contiene ${prev} pacientes pero la IA solo extrajo ${extracted.length}. ` +
              `Pueden faltar ${prev - extracted.length} paciente(s). Revisa la lista y añade los que falten manualmente antes de importar.`
            );
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error('[BulkImportPanel] Error parsing file:', err);
      setParseError(
        `Error al analizar el archivo: ${err.message ?? 'Error desconocido'}. ` +
        'Puedes introducir los datos manualmente.'
      );
      setRows([emptyRow()]);
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    parseFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  // ── Row editing ───────────────────────────────────────────────────────────

  const updateRow = (id: string, field: keyof ImportRow, value: string) => {
    setRows(prev =>
      prev.map(r =>
        r._id === id
          ? { ...r, [field]: value, _status: 'pending', _error: undefined }
          : r
      )
    );
  };

  const deleteRow = (id: string) => setRows(prev => prev.filter(r => r._id !== id));

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const toggleError = (id: string) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!canCreate) { onNeedUpgrade?.(); return; }
    setIsImporting(true);
    setImportDone(false);
    setShowImportModal(true);
    setImportCurrent(0);
    const total = rows.filter(r =>
      r._status !== 'success' &&
      r._status !== 'skipped' &&
      Object.keys(validateRow(r)).length === 0
    ).length;
    setImportTotal(total);
    let processed = 0;
    let errorCountLocal = 0;

    for (const row of rows) {
      if (row._status === 'success' || row._status === 'skipped') continue;

      // Skip rows with validation errors
      if (Object.keys(validateRow(row)).length > 0) {
        setRows(prev =>
          prev.map(r =>
            r._id === row._id
              ? { ...r, _status: 'error', _error: 'Corrige los errores antes de importar' }
              : r
          )
        );
        errorCountLocal++;
        continue;
      }

      setRows(prev => prev.map(r => r._id === row._id ? { ...r, _status: 'importing' } : r));
      processed++;
      setImportCurrent(processed);
      const fullName = [row.firstName.trim(), row.lastName.trim()].filter(Boolean).join(' ');
      setImportStep(`Creando paciente ${processed}/${total}: ${fullName}…`);

      try {
        const createRes = await apiFetch(`${API_URL}/admin/create-patient`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': psychologistId,
          },
          body: JSON.stringify({
            name:      fullName,
            firstName: row.firstName.trim(),
            lastName:  row.lastName.trim(),
            email: row.email.trim() || undefined,
            phone: normalizePhone(row.phone.trim()) || undefined,
            dni:   row.dni.trim() || undefined,
            address: row.address.trim() || undefined,
            dateOfBirth: row.date_of_birth.trim() || undefined,
          }),
        });

        const createData = await createRes.json();

        if (!createRes.ok) {
          if (createRes.status === 402) {
            // Subscription required — stop import and show upgrade modal
            setRows(prev =>
              prev.map(r =>
                r._status === 'importing' || r._status === 'pending'
                  ? { ...r, _status: 'error', _error: 'Suscripción requerida' }
                  : r
              )
            );
            setUpgradeModal(true);
            break;
          }
          const isDuplicate = (createData.error ?? '').includes('Ya existe una relación');
          const isInactive = createData.error === 'RELATIONSHIP_INACTIVE';
          setRows(prev =>
            prev.map(r =>
              r._id === row._id
                ? {
                    ...r,
                    _status: isInactive ? 'inactive' : isDuplicate ? 'duplicate' : 'error',
                    _error: isInactive ? 'Relación inactiva' : createData.error ?? `HTTP ${createRes.status}`,
                    _patientId: isInactive ? createData.patientId : r._patientId,
                  }
                : r
            )
          );
          if (!isDuplicate && !isInactive) errorCountLocal++;
          continue;
        }

        // Update relationship with extra fields if provided
        const relId: string | undefined = createData.relationship?.id;
        const hasRelFields = row.default_session_price || row.default_psych_percent || row.tags.trim() || row.file_number;
        if (relId && hasRelFields) {
          const patch: Record<string, any> = {};
          if (row.default_session_price) patch.default_session_price = parseFloat(row.default_session_price);
          if (row.default_psych_percent) patch.default_psych_percent = parseFloat(row.default_psych_percent);
          if (row.tags.trim()) {
            patch.tags = row.tags.split(',').map(t => t.trim()).filter(Boolean);
          }
          if (row.file_number) patch.patientnumber = parseInt(row.file_number, 10);
          try {
            await apiFetch(`${API_URL}/relationships/${relId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(patch),
            });
          } catch {
            // Fields update failed but patient was created — still mark as success
            console.warn('[BulkImportPanel] Failed to update relationship extra fields for:', relId);
          }
        }

        setRows(prev =>
          prev.map(r => r._id === row._id ? { ...r, _status: 'success', _error: undefined } : r)
        );
      } catch (err: any) {
        errorCountLocal++;
        setRows(prev =>
          prev.map(r =>
            r._id === row._id
              ? { ...r, _status: 'error', _error: err.message ?? 'Error de red' }
              : r
          )
        );
      }
    }

    setIsImporting(false);
    setImportDone(true);
    setImportStep('¡Importación completada!');

    // Auto-redirect only when all imports succeeded (no errors)
    if (onImportComplete && errorCountLocal === 0) {
      setTimeout(() => {
        setShowImportModal(false);
        onImportComplete();
      }, 3000);
    }
  };

  const handleReactivateRow = async (row: ImportRow) => {
    if (!row._patientId) return;
    setRows(prev => prev.map(r => r._id === row._id ? { ...r, _status: 'importing', _error: undefined } : r));
    try {
      const response = await apiFetch(`${API_URL}/relationships/${psychologistId}/patients/${row._patientId}/reactivate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-user-id': psychologistId },
      });
      if (response.ok) {
        setRows(prev => prev.map(r => r._id === row._id ? { ...r, _status: 'success', _error: undefined } : r));
      } else {
        const errData = await response.json();
        setRows(prev => prev.map(r => r._id === row._id ? { ...r, _status: 'error', _error: errData.error || 'Error al reactivar' } : r));
      }
    } catch (err: any) {
      setRows(prev => prev.map(r => r._id === row._id ? { ...r, _status: 'error', _error: err.message || 'Error de red' } : r));
    }
  };

  const resetPanel = () => {
    setRows([]);
    setParseError(null);
    setImportDone(false);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Derived state ─────────────────────────────────────────────────────────

  const successCount   = rows.filter(r => r._status === 'success').length;
  const errorCount     = rows.filter(r => r._status === 'error').length;
  const duplicateCount = rows.filter(r => r._status === 'duplicate').length;
  const inactiveCount  = rows.filter(r => r._status === 'inactive').length;
  const pendingCount   = rows.filter(r => r._status === 'pending').length;

  // Rows that are valid AND not yet successfully imported
  const importableCount = rows.filter(r =>
    (r._status === 'pending' || r._status === 'error') &&
    Object.keys(validateRow(r)).length === 0
  ).length;

  const canImport = importableCount > 0 && !isImporting;

  // ── Render helpers ────────────────────────────────────────────────────────

  const cellClass = (error?: string) =>
    `w-full px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
      error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
    }`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-6">

      {/* ── Header info ── */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
        <div className="text-sm text-indigo-800 space-y-1">
          <p className="font-semibold">¿Cómo funciona la importación masiva?</p>
          <ol className="list-decimal list-inside space-y-0.5 text-indigo-700">
            <li>Sube un archivo CSV, Excel o PDF con los datos de tus pacientes.</li>
            <li>La IA extrae automáticamente la información y muestra la previsualización.</li>
            <li>Revisa y edita la tabla, añade o elimina filas si lo necesitas.</li>
            <li>Pulsa <strong>Importar pacientes</strong> para crear todos los registros.</li>
          </ol>
        </div>
      </div>

      {/* ── Upload zone ── */}
      {rows.length === 0 && !isParsing && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all
            ${dragOver
              ? 'border-indigo-400 bg-indigo-50 scale-[1.01]'
              : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50'}`}
        >
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
            <Upload className="w-8 h-8 text-indigo-500" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-slate-700">
              Arrastra tu archivo aquí o haz clic para seleccionar
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Formatos admitidos: CSV, Excel (.xlsx, .xls), PDF, ODS
            </p>
          </div>
          <div className="flex gap-3 text-xs text-slate-400">
            <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">CSV</span>
            <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">XLSX</span>
            <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">XLS</span>
            <span className="px-2 py-1 bg-white border border-slate-200 rounded-md">PDF</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTS}
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* ── Parsing progress ── */}
      {isParsing && (
        <div className="border-2 border-dashed border-indigo-300 rounded-xl p-8 bg-indigo-50 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3 justify-center">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <p className="text-lg font-semibold text-indigo-700">Analizando archivo con IA…</p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md mx-auto">
            <div className="h-2.5 bg-indigo-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${parseProgress}%` }}
              />
            </div>
            <div className="flex justify-center mt-1.5">
              <span className="text-xs text-indigo-500 font-medium">{parseProgress}%</span>
            </div>
          </div>

          {/* Step description */}
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-indigo-600">{parseStep}</p>
            <p className="text-xs text-indigo-400">
              Archivo: <strong>{fileName}</strong>
            </p>
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 max-w-sm mx-auto">
            {[
              { label: 'Lectura', threshold: 10 },
              { label: 'Conversión', threshold: 35 },
              { label: 'Análisis IA', threshold: 55 },
              { label: 'Extracción', threshold: 85 },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                  parseProgress >= s.threshold ? 'bg-indigo-500' : 'bg-indigo-200'
                }`} />
                <span className={`text-xs transition-colors duration-500 ${
                  parseProgress >= s.threshold ? 'text-indigo-700 font-medium' : 'text-indigo-300'
                }`}>{s.label}</span>
                {s.label !== 'Extracción' && <span className="text-indigo-200 mx-1">›</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Parse error ── */}
      {parseError && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-amber-800">
            <p className="font-semibold mb-1">Aviso al analizar el archivo</p>
            <p>{parseError}</p>
          </div>
          <button onClick={() => setParseError(null)} className="text-amber-500 hover:text-amber-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Preview table ── */}
      {rows.length > 0 && (
        <div className="space-y-4">

          {/* Table toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                {fileName ? (
                  <>Archivo: <strong>{fileName}</strong> — </>
                ) : null}
                <strong>{rows.length}</strong> {rows.length === 1 ? 'paciente' : 'pacientes'}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={addRow}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Añadir fila
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Cambiar archivo
              </button>
              <button
                onClick={resetPanel}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Limpiar
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTS}
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          </div>

          {/* The table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm min-w-[1550px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 w-6">#</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[130px]">
                    Nombre <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[140px]">Apellidos</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[180px]">Email</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[130px]">Teléfono</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[110px]">DNI</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[160px]">Dirección</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[120px]">F. Nacimiento</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[80px]">Nº Ficha</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[110px]">
                    Precio (€)
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[100px]">
                    % Psic.
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 min-w-[160px]">
                    Etiquetas
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-600 w-[110px]">Estado</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, idx) => {
                  const errors = validateRow(row);
                  const isLocked = row._status === 'success' || row._status === 'importing';
                  const cfg = STATUS_CONFIG[row._status];

                  return (
                    <React.Fragment key={row._id}>
                      <tr className={`transition-colors ${
                        row._status === 'success'   ? 'bg-emerald-50/40' :
                        row._status === 'error'     ? 'bg-red-50/40' :
                        row._status === 'duplicate' ? 'bg-amber-50/40' :
                        row._status === 'inactive'  ? 'bg-orange-50/40' :
                        row._status === 'importing' ? 'bg-indigo-50/40' :
                        'bg-white hover:bg-slate-50'
                      }`}>
                        <td className="px-3 py-2 text-slate-400 text-xs select-none">{idx + 1}</td>

                        {/* Nombre */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              value={row.firstName}
                              disabled={isLocked}
                              placeholder="Nombre"
                              onChange={e => updateRow(row._id, 'firstName', e.target.value)}
                              className={cellClass(errors.firstName)}
                            />
                            {errors.firstName && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.firstName}</p>
                            )}
                          </div>
                        </td>

                        {/* Apellidos */}
                        <td className="px-3 py-2">
                          <input
                            value={row.lastName}
                            disabled={isLocked}
                            placeholder="Apellidos"
                            onChange={e => updateRow(row._id, 'lastName', e.target.value)}
                            className={cellClass()}
                          />
                        </td>

                        {/* Email */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              type="email"
                              value={row.email}
                              disabled={isLocked}
                              placeholder="correo@ejemplo.com"
                              onChange={e => updateRow(row._id, 'email', e.target.value)}
                              className={cellClass(errors.email)}
                            />
                            {errors.email && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.email}</p>
                            )}
                          </div>
                        </td>

                        {/* Teléfono */}
                        <td className="px-3 py-2">
                          <input
                            value={row.phone}
                            disabled={isLocked}
                            placeholder="+34 000 000 000"
                            onChange={e => updateRow(row._id, 'phone', e.target.value)}
                            className={cellClass()}
                          />
                        </td>

                        {/* DNI */}
                        <td className="px-3 py-2">
                          <input
                            value={row.dni}
                            disabled={isLocked}
                            placeholder="12345678A"
                            onChange={e => updateRow(row._id, 'dni', e.target.value)}
                            className={cellClass()}
                          />
                        </td>

                        {/* Dirección */}
                        <td className="px-3 py-2">
                          <input
                            value={row.address}
                            disabled={isLocked}
                            placeholder="Calle, Ciudad"
                            onChange={e => updateRow(row._id, 'address', e.target.value)}
                            className={cellClass()}
                          />
                        </td>

                        {/* Fecha de nacimiento */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              type="date"
                              value={row.date_of_birth}
                              disabled={isLocked}
                              onChange={e => updateRow(row._id, 'date_of_birth', e.target.value)}
                              className={cellClass(errors.date_of_birth)}
                            />
                            {errors.date_of_birth && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.date_of_birth}</p>
                            )}
                          </div>
                        </td>

                        {/* Nº Ficha (patientnumber) */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.file_number}
                              disabled={isLocked}
                              placeholder="1"
                              onChange={e => updateRow(row._id, 'file_number', e.target.value)}
                              className={cellClass(errors.file_number)}
                            />
                            {errors.file_number && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.file_number}</p>
                            )}
                          </div>
                        </td>

                        {/* Precio */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.default_session_price}
                              disabled={isLocked}
                              placeholder="60"
                              onChange={e => updateRow(row._id, 'default_session_price', e.target.value)}
                              className={cellClass(errors.default_session_price)}
                            />
                            {errors.default_session_price && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.default_session_price}</p>
                            )}
                          </div>
                        </td>

                        {/* % Psicólogo */}
                        <td className="px-3 py-2">
                          <div>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={row.default_psych_percent}
                              disabled={isLocked}
                              placeholder="100"
                              onChange={e => updateRow(row._id, 'default_psych_percent', e.target.value)}
                              className={cellClass(errors.default_psych_percent)}
                            />
                            {errors.default_psych_percent && (
                              <p className="text-xs text-red-500 mt-0.5">{errors.default_psych_percent}</p>
                            )}
                          </div>
                        </td>

                        {/* Etiquetas */}
                        <td className="px-3 py-2">
                          <input
                            value={row.tags}
                            disabled={isLocked}
                            placeholder="tag1, tag2"
                            onChange={e => updateRow(row._id, 'tags', e.target.value)}
                            className={cellClass()}
                          />
                        </td>

                        {/* Estado */}
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
                              {row._status === 'importing' && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              {cfg.label}
                            </span>
                            {row._status === 'inactive' && row._patientId && (
                              <button
                                onClick={() => handleReactivateRow(row)}
                                disabled={isImporting}
                                className="text-xs text-blue-600 hover:underline font-medium"
                              >
                                Reactivar
                              </button>
                            )}
                            {row._error && row._status !== 'inactive' && (
                              <button
                                onClick={() => toggleError(row._id)}
                                className="text-xs text-red-500 hover:underline flex items-center gap-0.5"
                              >
                                Ver error
                                {expandedErrors.has(row._id)
                                  ? <ChevronUp className="w-3 h-3" />
                                  : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Delete */}
                        <td className="px-3 py-2">
                          {!isLocked && (
                            <button
                              onClick={() => deleteRow(row._id)}
                              disabled={isImporting}
                              title="Eliminar fila"
                              className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded error row */}
                      {row._error && expandedErrors.has(row._id) && (
                        <tr className="bg-red-50">
                          <td colSpan={14} className="px-4 py-2">
                            <p className="text-xs text-red-700">
                              <strong>Error:</strong> {row._error}
                            </p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row footer */}
          <button
            onClick={addRow}
            disabled={isImporting}
            className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Añadir paciente manualmente
          </button>

          {/* Validation summary */}
          {rows.some(r => Object.keys(validateRow(r)).length > 0 && r._status !== 'success') && (
            <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Hay filas con errores de validación (marcadas en rojo). Corrígelas antes de importar.
              </span>
            </div>
          )}

          {/* Import result summary */}
          {importDone && (
            <div className={`rounded-xl p-4 flex gap-3 border ${
              errorCount > 0
                ? 'bg-amber-50 border-amber-300'
                : 'bg-emerald-50 border-emerald-300'
            }`}>
              <CheckCircle2 className={`w-5 h-5 mt-0.5 shrink-0 ${errorCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
              <div className="text-sm">
                <p className="font-semibold text-slate-800 mb-1">Importación completada</p>
                <div className="flex flex-wrap gap-3 text-slate-600">
                  {successCount > 0 && (
                    <span className="text-emerald-700">✓ {successCount} creados correctamente</span>
                  )}
                  {duplicateCount > 0 && (
                    <span className="text-amber-700">⚠ {duplicateCount} ya existían (relación duplicada)</span>
                  )}
                  {inactiveCount > 0 && (
                    <span className="text-orange-700 flex items-center gap-2">
                      ⏸ {inactiveCount} con relación inactiva
                      <button
                        onClick={async () => {
                          const inactiveRows = rows.filter(r => r._status === 'inactive' && r._patientId);
                          for (const row of inactiveRows) await handleReactivateRow(row);
                        }}
                        disabled={isImporting}
                        className="text-blue-600 hover:underline text-xs font-medium"
                      >
                        Reactivar todos
                      </button>
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="text-red-700">✗ {errorCount} con errores</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Import action bar */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="text-sm text-slate-500">
              {pendingCount > 0 && !importDone && (
                <span>{pendingCount} {pendingCount === 1 ? 'paciente listo' : 'pacientes listos'} para importar</span>
              )}
              {importDone && errorCount === 0 && (
                <button
                  onClick={resetPanel}
                  className="text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Nueva importación
                </button>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={!canImport}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all
                ${canImport
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importando…
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  Importar {importableCount > 0 ? `${importableCount} ` : ''}
                  {importableCount === 1 ? 'paciente' : 'pacientes'}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Empty manual start (no file) ── */}
      {rows.length === 0 && !isParsing && (
        <div className="text-center">
          <p className="text-sm text-slate-500 mb-3">
            ¿Prefieres introducir los datos sin archivo?
          </p>
          <button
            onClick={() => { setRows([emptyRow()]); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
          >
            <Plus className="w-4 h-4" />
            Introducir pacientes manualmente
          </button>
        </div>
      )}
    </div>

    {/* ── Import progress modal ── */}
    {showImportModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-6">
          {/* Header */}
          <div className="text-center">
            {importDone ? (
              errorCount > 0
                ? <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                : <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            ) : (
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-3" />
            )}
            <h3 className="text-xl font-bold text-slate-800">
              {importDone ? 'Importación completada' : 'Importando pacientes…'}
            </h3>
          </div>

          {/* Progress bar */}
          <div>
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  importDone ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${importTotal > 0 ? (importCurrent / importTotal) * 100 : 0}%` }}
              />
            </div>
            <p className="text-sm text-slate-500 mt-2 text-center font-medium">
              {importCurrent} de {importTotal} pacientes
            </p>
          </div>

          {/* Current step */}
          <p className="text-sm text-center text-slate-600">{importStep}</p>

          {/* Summary when done */}
          {importDone && (
            <div className="space-y-2 text-sm">
              {rows.filter(r => r._status === 'success').length > 0 && (
                <p className="text-emerald-700">✓ {rows.filter(r => r._status === 'success').length} creados correctamente</p>
              )}
              {rows.filter(r => r._status === 'duplicate').length > 0 && (
                <p className="text-amber-700">⚠ {rows.filter(r => r._status === 'duplicate').length} ya tenían relación activa (omitidos)</p>
              )}
              {rows.filter(r => r._status === 'inactive').length > 0 && (
                <p className="text-orange-700">⏸ {rows.filter(r => r._status === 'inactive').length} con relación inactiva — usa el botón "Reactivar" en la tabla</p>
              )}
              {rows.filter(r => r._status === 'error').length > 0 && (
                <>
                  <p className="text-red-700 font-semibold">✗ {rows.filter(r => r._status === 'error').length} con errores — detalle:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1 bg-red-50 rounded-lg p-2 border border-red-200">
                    {rows.filter(r => r._status === 'error').map((r, i) => (
                      <div key={r._id} className="text-xs text-red-700">
                        <span className="font-medium">
                          {[r.firstName, r.lastName].filter(Boolean).join(' ') || `Fila ${rows.indexOf(r) + 1}`}:
                        </span>{' '}
                        <span>{r._error || 'Error desconocido'}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 text-center">Cierra esta ventana, corrige los errores en la tabla y vuelve a importar.</p>
                </>
              )}
              {onImportComplete && rows.filter(r => r._status === 'error').length === 0 && (
                <p className="text-sm text-indigo-700 font-medium text-center">Todos los pacientes han sido importados correctamente.</p>
              )}
            </div>
          )}

          {/* Warning */}
          {!importDone && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                No cierres esta página ni refresques el navegador mientras se importan los pacientes.
              </p>
            </div>
          )}

          {/* Close button when done */}
          {importDone && (
            <button
              onClick={() => {
                setShowImportModal(false);
                if (onImportComplete) onImportComplete();
              }}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              {onImportComplete ? 'Ir a pacientes' : 'Cerrar'}
            </button>
          )}
        </div>
      </div>
    )}

    {upgradeModal && currentUser && (
      <UpgradeModal
        currentUser={currentUser}
        onClose={() => setUpgradeModal(false)}
        returnPanel="import"
      />
    )}
    </>
  );
};

export default BulkImportPanel;
