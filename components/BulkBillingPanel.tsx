import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building, User, ChevronDown, ChevronRight, CheckSquare, Square,
  Loader2, RefreshCw, FileText, AlertCircle, CheckCircle2, Layers
} from 'lucide-react';
import { API_URL } from '../services/config';
import { apiFetch } from '../services/authService';

// ── tipos locales ────────────────────────────────────────────────────────────

interface BulkSession {
  id: string;
  starts_on: string;
  ends_on?: string;
  status: string;
  price?: number;
  percent_psych?: number;
  patient_user_id?: string;
  patientName?: string | null;
}

interface BulkBono {
  id: string;
  created_at: string;
  total_sessions_amount: number;
  total_price_bono_amount: number;
  used_sessions: number;
  remaining_sessions: number;
  paid: boolean;
  percent_psych?: number;
  pacient_user_id?: string;
  patientName?: string | null;
}

interface CenterGroup {
  centerId: string;
  centerName: string;
  cif: string;
  address: string;
  nombre_comercial?: string;
  sessions: BulkSession[];
  bonos: BulkBono[];
  patientIds: string[];
}

interface PatientGroup {
  id: string;
  name: string;
  email: string;
  billing_name?: string;
  billing_address?: string;
  billing_tax_id?: string;
  dni?: string;
  postalCode?: string;
  country?: string;
  city?: string;
  province?: string;
  portal?: string;
  piso?: string;
  sessions: BulkSession[];
  bonos: BulkBono[];
}

interface BulkData {
  centers: CenterGroup[];
  patients: PatientGroup[];
}

interface BulkBillingPanelProps {
  psychologistId: string;
  onDraftsCreated?: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const sessionDurationHours = (s: BulkSession): number => {
  if (s.starts_on && s.ends_on) {
    const h = (new Date(s.ends_on).getTime() - new Date(s.starts_on).getTime()) / 3_600_000;
    if (h > 0 && h <= 24) return h;
  }
  return 1;
};

const sessionPrice = (s: BulkSession, forCenter = false): number => {
  const base = (s.price || 0) * sessionDurationHours(s);
  return forCenter && s.percent_psych ? (base * s.percent_psych) / 100 : base;
};

const bonoPrice = (b: BulkBono, forCenter = false): number => {
  const base = b.total_price_bono_amount;
  return forCenter && b.percent_psych ? (base * b.percent_psych) / 100 : base;
};

const formatDate = (iso: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatEUR = (n: number) => `€${n.toFixed(2)}`;

// ── componente: fila de sesión ────────────────────────────────────────────────

const SessionRow: React.FC<{
  session: BulkSession;
  forCenter: boolean;
  checked: boolean;
  onToggle: () => void;
}> = ({ session, forCenter, checked, onToggle }) => {
  const price = sessionPrice(session, forCenter);
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer transition-colors ${
        checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'
      }`}
      onClick={onToggle}
    >
      <button type="button" className="flex-none text-indigo-600" onClick={e => { e.stopPropagation(); onToggle(); }}>
        {checked ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700">{formatDate(session.starts_on)}</span>
        {session.patientName && (
          <span className="ml-2 text-xs text-slate-500">— {session.patientName}</span>
        )}
      </div>
      <span className="text-sm font-medium text-slate-700 flex-none">{formatEUR(price)}</span>
    </div>
  );
};

// ── componente: fila de bono ──────────────────────────────────────────────────

const BonoRow: React.FC<{
  bono: BulkBono;
  forCenter: boolean;
  checked: boolean;
  onToggle: () => void;
}> = ({ bono, forCenter, checked, onToggle }) => {
  const price = bonoPrice(bono, forCenter);
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer transition-colors ${
        checked ? 'bg-violet-50 border border-violet-200' : 'hover:bg-slate-50 border border-transparent'
      }`}
      onClick={onToggle}
    >
      <button type="button" className="flex-none text-violet-600" onClick={e => { e.stopPropagation(); onToggle(); }}>
        {checked ? <CheckSquare size={18} /> : <Square size={18} className="text-slate-400" />}
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-700">
          Bono {bono.total_sessions_amount} ses. · {formatDate(bono.created_at)}
        </span>
        {bono.patientName && (
          <span className="ml-2 text-xs text-slate-500">— {bono.patientName}</span>
        )}
      </div>
      <span className="text-sm font-medium text-slate-700 flex-none">{formatEUR(price)}</span>
    </div>
  );
};

// ── componente: tarjeta de grupo ─────────────────────────────────────────────

interface GroupCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  sessions: BulkSession[];
  bonos: BulkBono[];
  forCenter: boolean;
  selectedSessionIds: Set<string>;
  selectedBonoIds: Set<string>;
  onToggleSession: (id: string) => void;
  onToggleBono: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

const GroupCard: React.FC<GroupCardProps> = ({
  icon, title, subtitle,
  sessions, bonos, forCenter,
  selectedSessionIds, selectedBonoIds,
  onToggleSession, onToggleBono, onSelectAll, onClearAll
}) => {
  const [expanded, setExpanded] = useState(true);

  const allIds = [
    ...sessions.map(s => s.id),
    ...bonos.map(b => b.id)
  ];
  const selectedCount = allIds.filter(id =>
    selectedSessionIds.has(id) || selectedBonoIds.has(id)
  ).length;
  const allSelected = selectedCount === allIds.length && allIds.length > 0;

  const subtotal = sessions.reduce((acc, s) => acc + sessionPrice(s, forCenter), 0)
    + bonos.reduce((acc, b) => acc + bonoPrice(b, forCenter), 0);
  const selectedSubtotal = sessions
    .filter(s => selectedSessionIds.has(s.id))
    .reduce((acc, s) => acc + sessionPrice(s, forCenter), 0)
    + bonos
    .filter(b => selectedBonoIds.has(b.id))
    .reduce((acc, b) => acc + bonoPrice(b, forCenter), 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex-none text-slate-400 hover:text-slate-600 transition-colors"
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        <div className="flex-none">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 text-sm truncate">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
        <div className="flex-none text-right">
          <p className="text-xs text-slate-400">
            {selectedCount}/{allIds.length} seleccionados
          </p>
          <p className="text-sm font-semibold text-slate-700">
            {selectedCount > 0 ? formatEUR(selectedSubtotal) : formatEUR(subtotal)}
          </p>
        </div>
        <button
          type="button"
          onClick={allSelected ? onClearAll : onSelectAll}
          className="flex-none text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          {allSelected ? 'Quitar todo' : 'Seleccionar todo'}
        </button>
      </div>

      {/* Items */}
      {expanded && (
        <div className="p-3 space-y-1">
          {sessions.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 pt-1">
                Sesiones ({sessions.length})
              </p>
              {sessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  forCenter={forCenter}
                  checked={selectedSessionIds.has(s.id)}
                  onToggle={() => onToggleSession(s.id)}
                />
              ))}
            </>
          )}
          {bonos.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 pt-2">
                Bonos ({bonos.length})
              </p>
              {bonos.map(b => (
                <BonoRow
                  key={b.id}
                  bono={b}
                  forCenter={forCenter}
                  checked={selectedBonoIds.has(b.id)}
                  onToggle={() => onToggleBono(b.id)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ── componente principal ─────────────────────────────────────────────────────

const BulkBillingPanel: React.FC<BulkBillingPanelProps> = ({ psychologistId, onDraftsCreated }) => {
  const [bulkData, setBulkData] = useState<BulkData | null>(null);
  const [psychProfile, setPsychProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState<string[]>([]);
  const [creationResult, setCreationResult] = useState<{ created: number; errors: string[] } | null>(null);

  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedBonoIds, setSelectedBonoIds] = useState<Set<string>>(new Set());
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const filteredBulkData = useMemo<BulkData | null>(() => {
    if (!bulkData) return null;
    const inRange = (dateStr: string) => {
      const d = dateStr.slice(0, 10);
      if (filterFrom && d < filterFrom) return false;
      if (filterTo && d > filterTo) return false;
      return true;
    };
    const centers = bulkData.centers
      .map(c => ({
        ...c,
        sessions: c.sessions.filter(s => inRange(s.starts_on)),
        bonos: c.bonos.filter(b => inRange(b.created_at))
      }))
      .filter(c => c.sessions.length > 0 || c.bonos.length > 0);
    const patients = bulkData.patients
      .map(p => ({
        ...p,
        sessions: p.sessions.filter(s => inRange(s.starts_on)),
        bonos: p.bonos.filter(b => inRange(b.created_at))
      }))
      .filter(p => p.sessions.length > 0 || p.bonos.length > 0);
    return { centers, patients };
  }, [bulkData, filterFrom, filterTo]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setCreationResult(null);
    try {
      const [bulkRes, profileRes] = await Promise.all([
        apiFetch(`${API_URL}/psychologist/${psychologistId}/bulk-unbilled`),
        apiFetch(`${API_URL}/psychologist/${psychologistId}/profile`)
      ]);
      if (bulkRes.ok) {
        const data = await bulkRes.json();
        setBulkData(data);
        // Start with nothing selected
        setSelectedSessionIds(new Set());
        setSelectedBonoIds(new Set());
      }
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setPsychProfile(profileData);
      }
    } catch (e) {
      console.error('Error loading bulk unbilled data:', e);
    } finally {
      setIsLoading(false);
    }
  }, [psychologistId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSession = (id: string) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleBono = (id: string) => {
    setSelectedBonoIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllInGroup = (sessions: BulkSession[], bonos: BulkBono[]) => {
    setSelectedSessionIds(prev => { const s = new Set(prev); sessions.forEach(x => s.add(x.id)); return s; });
    setSelectedBonoIds(prev => { const s = new Set(prev); bonos.forEach(x => s.add(x.id)); return s; });
  };

  const clearAllInGroup = (sessions: BulkSession[], bonos: BulkBono[]) => {
    setSelectedSessionIds(prev => { const s = new Set(prev); sessions.forEach(x => s.delete(x.id)); return s; });
    setSelectedBonoIds(prev => { const s = new Set(prev); bonos.forEach(x => s.delete(x.id)); return s; });
  };

  const selectAllGlobal = () => {
    if (!filteredBulkData) return;
    const allSessions = new Set<string>([
      ...filteredBulkData.centers.flatMap(c => c.sessions.map(s => s.id)),
      ...filteredBulkData.patients.flatMap(p => p.sessions.map(s => s.id))
    ]);
    const allBonos = new Set<string>([
      ...filteredBulkData.centers.flatMap(c => c.bonos.map(b => b.id)),
      ...filteredBulkData.patients.flatMap(p => p.bonos.map(b => b.id))
    ]);
    setSelectedSessionIds(allSessions);
    setSelectedBonoIds(allBonos);
  };

  const clearAllGlobal = () => {
    setSelectedSessionIds(new Set());
    setSelectedBonoIds(new Set());
  };

  const totalSelectedItems = selectedSessionIds.size + selectedBonoIds.size;

  const totalSelectedAmount = (() => {
    if (!bulkData) return 0;
    let total = 0;
    bulkData.centers.forEach(c => {
      c.sessions.filter(s => selectedSessionIds.has(s.id)).forEach(s => { total += sessionPrice(s, true); });
      c.bonos.filter(b => selectedBonoIds.has(b.id)).forEach(b => { total += bonoPrice(b, true); });
    });
    bulkData.patients.forEach(p => {
      p.sessions.filter(s => selectedSessionIds.has(s.id)).forEach(s => { total += sessionPrice(s, false); });
      p.bonos.filter(b => selectedBonoIds.has(b.id)).forEach(b => { total += bonoPrice(b, false); });
    });
    return total;
  })();

  // ── crear borradores ────────────────────────────────────────────────────────

  const buildPsychBillingFields = () => ({
    billing_psychologist_name: psychProfile?.businessName || psychProfile?.name || '',
    billing_psychologist_address: psychProfile?.address || '',
    billing_psychologist_tax_id: psychProfile?.taxId || ''
  });

  /** Generate next draft number BORR000001, BORR000002, etc. */
  const generateNextDraftNumber = async (): Promise<{ next: () => string }> => {
    try {
      const response = await apiFetch(`${API_URL}/invoices?psychologist_user_id=${psychologistId}`);
      if (!response.ok) throw new Error('Failed to fetch invoices');
      const allInvoices = await response.json();
      const prefix = 'BORR';
      const draftInvoices = allInvoices.filter((inv: any) =>
        inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)
      );
      const numbers = draftInvoices.map((inv: any) => {
        const numPart = inv.invoiceNumber.slice(prefix.length);
        return parseInt(numPart || '0', 10);
      });
      let maxNumber = numbers.length > 0 ? Math.max(...numbers, 0) : 0;
      return { next: () => `${prefix}${String(++maxNumber).padStart(6, '0')}` };
    } catch {
      let fallback = 0;
      return { next: () => `BORR${String(++fallback).padStart(6, '0')}` };
    }
  };

  const handleCreateDrafts = async () => {
    if (!bulkData || totalSelectedItems === 0) return;
    setIsCreating(true);
    setCreationProgress([]);
    const errors: string[] = [];
    let created = 0;

    const today = new Date().toISOString().split('T')[0];
    const psychFields = buildPsychBillingFields();
    let counter = 0;
    const draftNumberGen = await generateNextDraftNumber();

    // ── facturas por centro ───────────────────────────────────────────────────
    for (const center of bulkData.centers) {
      const sessionIds = center.sessions.filter(s => selectedSessionIds.has(s.id)).map(s => s.id);
      const bonoIds = center.bonos.filter(b => selectedBonoIds.has(b.id)).map(b => b.id);
      if (sessionIds.length === 0 && bonoIds.length === 0) continue;

      // Calcular importes
      const subtotal = center.sessions
        .filter(s => sessionIds.includes(s.id))
        .reduce((a, s) => a + sessionPrice(s, true), 0)
        + center.bonos
        .filter(b => bonoIds.includes(b.id))
        .reduce((a, b) => a + bonoPrice(b, true), 0);

      const taxRate = 21;
      const irpf = 15;
      const tax = subtotal * (taxRate / 100);
      const irpfAmount = subtotal * (irpf / 100);
      const total = subtotal + tax - irpfAmount;

      const label = center.nombre_comercial || center.centerName;
      setCreationProgress(prev => [...prev, `Creando borrador para centro: ${label}…`]);

      const payload = {
        id: `${Date.now()}_${++counter}_c${center.centerId.slice(-4)}`,
        invoiceNumber: draftNumberGen.next(),
        invoice_type: 'center',
        centerId: center.centerId,
        patientName: center.centerName,
        status: 'draft',
        date: today,
        invoice_date: today,
        dueDate: '',
        description: '',
        notes: '',
        amount: subtotal,
        tax,
        total,
        taxRate,
        irpf,
        sessionIds,
        bonoIds,
        psychologistId,
        psychologist_user_id: psychologistId,
        billing_client_name: center.nombre_comercial || center.centerName,
        billing_client_address: center.address,
        billing_client_tax_id: center.cif,
        billing_client_postal_code: '',
        billing_client_country: '',
        billing_client_city: '',
        billing_client_province: '',
        items: [],
        ...psychFields
      };

      try {
        const res = await apiFetch(`${API_URL}/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': psychologistId },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          created++;
          setCreationProgress(prev => [...prev, `✓ Borrador creado para ${label}`]);
        } else if (res.status === 409) {
          setCreationProgress(prev => [...prev, `⚠ Ya existe un borrador para ${label} — se ha omitido`]);
        } else {
          const err = await res.json().catch(() => ({}));
          const msg = `Error en ${label}: ${err.error || res.statusText}`;
          errors.push(msg);
          setCreationProgress(prev => [...prev, `✗ ${msg}`]);
        }
      } catch (e: any) {
        const msg = `Error en ${label}: ${e.message}`;
        errors.push(msg);
        setCreationProgress(prev => [...prev, `✗ ${msg}`]);
      }
    }

    // ── facturas por paciente individual ─────────────────────────────────────
    for (const patient of bulkData.patients) {
      const sessionIds = patient.sessions.filter(s => selectedSessionIds.has(s.id)).map(s => s.id);
      const bonoIds = patient.bonos.filter(b => selectedBonoIds.has(b.id)).map(b => b.id);
      if (sessionIds.length === 0 && bonoIds.length === 0) continue;

      const subtotal = patient.sessions
        .filter(s => sessionIds.includes(s.id))
        .reduce((a, s) => a + sessionPrice(s, false), 0)
        + patient.bonos
        .filter(b => bonoIds.includes(b.id))
        .reduce((a, b) => a + bonoPrice(b, false), 0);

      // Sesiones de psicología están exentas de IVA (art. 20 LIVA)
      const taxRate = 0;
      const tax = 0;
      const total = subtotal;

      setCreationProgress(prev => [...prev, `Creando borrador para paciente: ${patient.name}…`]);

      const payload = {
        id: `${Date.now()}_${++counter}_p${patient.id.slice(-4)}`,
        invoiceNumber: draftNumberGen.next(),
        invoice_type: 'patient',
        patientId: patient.id,
        patient_user_id: patient.id,
        patientName: patient.name,
        status: 'draft',
        date: today,
        invoice_date: today,
        dueDate: '',
        description: '',
        notes: 'Servicio exento de IVA según el artículo 20 3a de la ley 37/1992 del Impuesto sobre el Valor Añadido.',
        amount: subtotal,
        tax,
        total,
        taxRate,
        sessionIds,
        bonoIds,
        psychologistId,
        psychologist_user_id: psychologistId,
        billing_client_name: patient.billing_name || patient.name,
        billing_client_address: patient.billing_address || '',
        billing_client_tax_id: patient.billing_tax_id || patient.dni || '',
        billing_client_postal_code: patient.postalCode || '',
        billing_client_country: patient.country || '',
        billing_client_city: patient.city || '',
        billing_client_province: patient.province || '',
        items: [],
        ...psychFields
      };

      try {
        const res = await apiFetch(`${API_URL}/invoices`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Id': psychologistId },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          created++;
          setCreationProgress(prev => [...prev, `✓ Borrador creado para ${patient.name}`]);
        } else if (res.status === 409) {
          setCreationProgress(prev => [...prev, `⚠ Ya existe un borrador para ${patient.name} — se ha omitido`]);
        } else {
          const err = await res.json().catch(() => ({}));
          const msg = `Error en ${patient.name}: ${err.error || res.statusText}`;
          errors.push(msg);
          setCreationProgress(prev => [...prev, `✗ ${msg}`]);
        }
      } catch (e: any) {
        const msg = `Error en ${patient.name}: ${e.message}`;
        errors.push(msg);
        setCreationProgress(prev => [...prev, `✗ ${msg}`]);
      }
    }

    setIsCreating(false);
    setCreationResult({ created, errors });
    if (created > 0) {
      onDraftsCreated?.();
      // Recargar para limpiar los items ya encolados en borradores
      await loadData();
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <Loader2 className="animate-spin mr-3" size={28} />
        <span>Cargando elementos sin facturar…</span>
      </div>
    );
  }

  const hasData = bulkData && (bulkData.centers.length > 0 || bulkData.patients.length > 0);

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers size={20} className="text-indigo-600" />
            Facturación Masiva
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Selecciona las sesiones y bonos pendientes y crea todos los borradores de un solo clic.
          </p>
        </div>

        {/* Filtro por rango de fechas */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-500 font-medium">Desde:</label>
          <input
            type="date"
            value={filterFrom}
            onChange={e => { setFilterFrom(e.target.value); setSelectedSessionIds(new Set()); setSelectedBonoIds(new Set()); }}
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <label className="text-xs text-slate-500 font-medium">Hasta:</label>
          <input
            type="date"
            value={filterTo}
            onChange={e => { setFilterTo(e.target.value); setSelectedSessionIds(new Set()); setSelectedBonoIds(new Set()); }}
            className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {(filterFrom || filterTo) && (
            <button
              type="button"
              onClick={() => { setFilterFrom(''); setFilterTo(''); setSelectedSessionIds(new Set()); setSelectedBonoIds(new Set()); }}
              className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Limpiar filtro
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasData && (
            <>
              <button
                type="button"
                onClick={selectAllGlobal}
                className="flex-none text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors font-medium"
              >
                Seleccionar todo
              </button>
              <button
                type="button"
                onClick={clearAllGlobal}
                className="flex-none text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Quitar todo
              </button>
            </>
          )}
          <button
            type="button"
            onClick={loadData}
            className="flex-none flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Resultado de creación */}
      {creationResult && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${
          creationResult.errors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
        }`}>
          {creationResult.errors.length === 0
            ? <CheckCircle2 size={20} className="text-green-600 flex-none mt-0.5" />
            : <AlertCircle size={20} className="text-amber-600 flex-none mt-0.5" />}
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {creationResult.created} borrador{creationResult.created !== 1 ? 'es' : ''} creado{creationResult.created !== 1 ? 's' : ''} correctamente.
            </p>
            {creationResult.errors.map((e, i) => (
              <p key={i} className="text-xs text-red-600 mt-1">{e}</p>
            ))}
            {creationResult.created > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Los borradores aparecen en la pestaña <strong>Borradores</strong> para que puedas revisarlos y emitirlos.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Log de progreso durante creación */}
      {isCreating && creationProgress.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-1 text-xs font-mono max-h-32 overflow-y-auto">
          {creationProgress.map((line, i) => (
            <p key={i} className={line.startsWith('✓') ? 'text-green-400' : line.startsWith('✗') ? 'text-red-400' : 'text-slate-300'}>
              {line}
            </p>
          ))}
        </div>
      )}

      {/* Sin datos */}
      {!hasData && !isLoading && (
        <div className="text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay sesiones ni bonos pendientes de facturar.</p>
          <p className="text-sm mt-1">¡Estás al día con la facturación!</p>
        </div>
      )}

      {/* Sin resultados tras filtrar */}
      {hasData && filteredBulkData && filteredBulkData.centers.length === 0 && filteredBulkData.patients.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <FileText size={36} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No hay elementos en el rango de fechas seleccionado.</p>
          <p className="text-sm mt-1">Ajusta el filtro o limpia las fechas para ver todos los pendientes.</p>
        </div>
      )}

      {/* Grupos por centro */}
      {filteredBulkData && filteredBulkData.centers.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <Building size={15} />
            Centros ({filteredBulkData.centers.length})
          </h3>
          {filteredBulkData.centers.map(center => (
            <GroupCard
              key={center.centerId}
              icon={<Building size={18} className="text-indigo-600" />}
              title={center.nombre_comercial || center.centerName}
              subtitle={center.cif ? `CIF: ${center.cif}` : undefined}
              sessions={center.sessions}
              bonos={center.bonos}
              forCenter={true}
              selectedSessionIds={selectedSessionIds}
              selectedBonoIds={selectedBonoIds}
              onToggleSession={toggleSession}
              onToggleBono={toggleBono}
              onSelectAll={() => selectAllInGroup(center.sessions, center.bonos)}
              onClearAll={() => clearAllInGroup(center.sessions, center.bonos)}
            />
          ))}
        </section>
      )}

      {/* Grupos por paciente individual */}
      {filteredBulkData && filteredBulkData.patients.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <User size={15} />
            Pacientes individuales ({filteredBulkData.patients.length})
          </h3>
          {filteredBulkData.patients.map(patient => (
            <GroupCard
              key={patient.id}
              icon={<User size={18} className="text-violet-600" />}
              title={patient.name}
              subtitle={patient.billing_tax_id ? `DNI/NIF: ${patient.billing_tax_id}` : patient.email || undefined}
              sessions={patient.sessions}
              bonos={patient.bonos}
              forCenter={false}
              selectedSessionIds={selectedSessionIds}
              selectedBonoIds={selectedBonoIds}
              onToggleSession={toggleSession}
              onToggleBono={toggleBono}
              onSelectAll={() => selectAllInGroup(patient.sessions, patient.bonos)}
              onClearAll={() => clearAllInGroup(patient.sessions, patient.bonos)}
            />
          ))}
        </section>
      )}

      {/* Barra de acción fija inferior */}
      {hasData && (
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {totalSelectedItems} elemento{totalSelectedItems !== 1 ? 's' : ''} seleccionado{totalSelectedItems !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-slate-500">
              Importe total: <span className="font-semibold text-slate-700">{formatEUR(totalSelectedAmount)}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={totalSelectedItems === 0 || isCreating}
            onClick={handleCreateDrafts}
            className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex items-center justify-center gap-2 shadow-md"
          >
            {isCreating ? (
              <><Loader2 size={16} className="animate-spin" /> Creando borradores…</>
            ) : (
              <><FileText size={16} /> Crear borradores seleccionados</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkBillingPanel;
