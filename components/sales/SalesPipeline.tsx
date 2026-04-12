import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lead, LeadEmailTemplate, LEAD_STAGES, LeadStage } from './types';
import { LeadTable } from './LeadTable';
import { LeadKanban } from './LeadKanban';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { LeadImportModal } from './LeadImportModal';
import { LeadEmailComposer } from './LeadEmailComposer';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import {
  LayoutGrid, Table2, Upload, RefreshCcw, Plus, Search, Filter,
  Mail, Zap, X, Users, TrendingUp, Target, Ban, Loader2,
  ArrowRightLeft, UserCheck, ChevronDown,
} from 'lucide-react';

type ViewMode = 'kanban' | 'table';

const PAGE_SIZE = 50;

export interface MasterUser {
  id: string;
  email: string;
  name: string | null;
}

export interface MultiFilters {
  stages: LeadStage[];
  assignees: string[];
  appStatus: string[];
  sources: string[];
}

const emptyMultiFilters: MultiFilters = { stages: [], assignees: [], appStatus: [], sources: [] };

const MultiSelectDropdown: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors whitespace-nowrap ${
          selected.length > 0
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 max-h-64 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">Sin opciones</div>
          )}
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700">{opt.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors">
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SalesPipeline: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [templates, setTemplates] = useState<LeadEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [multiFilters, setMultiFilters] = useState<MultiFilters>(emptyMultiFilters);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLead, setNewLead] = useState({ email: '', name: '', phone: '', company: '', details: '' });
  const [creating, setCreating] = useState(false);
  const [counts, setCounts] = useState<{ counts: Record<string, number>; total: number; inApp: number }>({ counts: {}, total: 0, inApp: 0 });
  const [assignees, setAssignees] = useState<MasterUser[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'stage' | 'assign' | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const loadLeads = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    try {
      const offset = append ? leads.length : 0;
      const params = new URLSearchParams();
      if (multiFilters.stages.length) params.set('stage', multiFilters.stages.join(','));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (multiFilters.sources.length) params.set('source', multiFilters.sources.join(','));
      if (multiFilters.assignees.length) params.set('assigned_to', multiFilters.assignees.join(','));
      if (multiFilters.appStatus.length) params.set('app_status', multiFilters.appStatus.join(','));
      params.set('offset', String(offset));
      params.set('limit', String(PAGE_SIZE));
      const res = await apiFetch(`${API_URL}/admin/leads?${params}`);
      if (res.ok) {
        const result = await res.json();
        if (append) {
          setLeads(prev => [...prev, ...result.data]);
        } else {
          setLeads(result.data);
        }
        setTotalLeads(result.total);
        setHasMore(offset + result.data.length < result.total);
      }
    } catch (e) { console.error('Error loading leads:', e); }
    if (!append) setLoading(false);
    else setLoadingMore(false);
  }, [multiFilters, debouncedSearch, leads.length]);

  const loadCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await apiFetch(`${API_URL}/admin/leads/counts?${params}`);
      if (res.ok) setCounts(await res.json());
    } catch (e) { console.error('Error loading counts:', e); }
  }, [debouncedSearch]);

  const loadAssignees = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/assignees`);
      if (res.ok) setAssignees(await res.json());
    } catch (e) { console.error('Error loading assignees:', e); }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/sources`);
      if (res.ok) setSources(await res.json());
    } catch (e) { console.error('Error loading sources:', e); }
  }, []);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) loadLeads(true);
  }, [loadingMore, hasMore, loadLeads]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.error('Error loading templates:', e); }
  }, []);

  // Reset and reload when filters change
  useEffect(() => {
    setLeads([]);
    setHasMore(true);
    loadLeads(false);
    loadCounts();
  }, [multiFilters, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadTemplates(); loadAssignees(); loadSources(); }, [loadTemplates, loadAssignees, loadSources]);

  const refreshAll = () => {
    setLeads([]);
    setHasMore(true);
    loadLeads(false);
    loadCounts();
    loadAssignees();
    loadSources();
    setKanbanRefreshKey(k => k + 1);
  };

  const handleBulkUpdate = async (updates: Partial<Lead>) => {
    if (selectedLeadIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/bulk`, {
        method: 'PUT',
        body: JSON.stringify({ ids: Array.from(selectedLeadIds), updates }),
      });
      if (res.ok) {
        setSelectedLeadIds(new Set());
        setBulkAction(null);
        refreshAll();
      } else {
        const err = await res.json();
        alert(err.error || 'Error en actualización masiva');
      }
    } catch (e) { console.error('Error bulk updating:', e); }
    setBulkProcessing(false);
  };

  const hasActiveFilters = multiFilters.stages.length > 0 || multiFilters.assignees.length > 0 || multiFilters.appStatus.length > 0 || multiFilters.sources.length > 0;

  const handleCreateLead = async () => {
    if (!newLead.email || !newLead.name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/leads`, {
        method: 'POST',
        body: JSON.stringify(newLead),
      });
      if (res.ok) {
        setShowCreateLead(false);
        setNewLead({ email: '', name: '', phone: '', company: '', details: '' });
        refreshAll();
      } else {
        const err = await res.json();
        alert(err.error || 'Error creando lead');
      }
    } catch (e) { console.error('Error creating lead:', e); }
    setCreating(false);
  };

  const handleUpdateLead = async (id: string, updates: Partial<Lead>) => {
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setLeads(prev => prev.map(l => l.id === id ? updated : l));
        if (selectedLead?.id === id) setSelectedLead(updated);
      }
    } catch (e) { console.error('Error updating lead:', e); }
  };

  const handleDeleteLead = async (id: string) => {
    if (!confirm('¿Eliminar este lead?')) return;
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
        if (selectedLead?.id === id) setSelectedLead(null);
      }
    } catch (e) { console.error('Error deleting lead:', e); }
  };

  const handleSyncAppStatus = async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/leads/sync-app-status`, { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`Sincronizados: ${result.synced} leads`);
        refreshAll();
      }
    } catch (e) { console.error('Error syncing:', e); }
  };

  const handleStageChange = async (leadId: string, newStage: LeadStage) => {
    await handleUpdateLead(leadId, { stage: newStage });
  };

  const toggleSelect = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  // KPI calculations (from server counts)
  const kpis = {
    total: counts.total,
    pipeline: (counts.counts['new'] || 0) + (counts.counts['prueba'] || 0) + (counts.counts['contacted'] || 0) + (counts.counts['demo'] || 0),
    won: counts.counts['won'] || 0,
    lost: counts.counts['lost'] || 0,
    cancelled: counts.counts['cancelled'] || 0,
    inApp: counts.inApp || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline de Ventas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalLeads} leads · {kpis.pipeline} en pipeline{leads.length < totalLeads ? ` · mostrando ${leads.length}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSyncAppStatus} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" title="Sincronizar estado de leads con usuarios de la app">
            <Zap size={15} /> Sync App
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Upload size={15} /> Importar
          </button>
          {selectedLeadIds.size > 0 && (
            <>
              <button onClick={() => setShowBulkEmail(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors">
                <Mail size={15} /> Email ({selectedLeadIds.size})
              </button>
              <button onClick={() => setBulkAction('stage')} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors">
                <ArrowRightLeft size={15} /> Mover ({selectedLeadIds.size})
              </button>
              <button onClick={() => setBulkAction('assign')} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                <UserCheck size={15} /> Asignar ({selectedLeadIds.size})
              </button>
            </>
          )}
          <button onClick={() => setShowCreateLead(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Nuevo Lead
          </button>
          <button onClick={refreshAll} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-1"><Users size={13} /> Total</div>
          <p className="text-2xl font-bold text-slate-900">{kpis.total}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-600 text-xs font-semibold uppercase mb-1"><Target size={13} /> Pipeline</div>
          <p className="text-2xl font-bold text-blue-700">{kpis.pipeline}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-600 text-xs font-semibold uppercase mb-1"><TrendingUp size={13} /> Ganados</div>
          <p className="text-2xl font-bold text-emerald-700">{kpis.won}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-600 text-xs font-semibold uppercase mb-1"><Ban size={13} /> Perdidos</div>
          <p className="text-2xl font-bold text-red-700">{kpis.lost}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase mb-1"><Zap size={13} /> En App</div>
          <p className="text-2xl font-bold text-slate-700">{kpis.inApp}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" placeholder="Buscar por nombre, email, teléfono..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          <MultiSelectDropdown
            label="Estado"
            options={LEAD_STAGES.map(s => ({ value: s.id, label: s.label }))}
            selected={multiFilters.stages}
            onChange={stages => setMultiFilters(prev => ({ ...prev, stages: stages as LeadStage[] }))}
          />
          <MultiSelectDropdown
            label="Asignado"
            options={[
              { value: '__unassigned__', label: 'Sin asignar' },
              ...assignees.map(a => ({ value: a.email, label: a.name ? `${a.name} (${a.email})` : a.email })),
            ]}
            selected={multiFilters.assignees}
            onChange={assignees => setMultiFilters(prev => ({ ...prev, assignees }))}
          />
          <MultiSelectDropdown
            label="En App"
            options={[
              { value: 'registered', label: 'Registrado' },
              { value: 'subscribed', label: 'Suscrito' },
              { value: 'none', label: 'No registrado' },
            ]}
            selected={multiFilters.appStatus}
            onChange={appStatus => setMultiFilters(prev => ({ ...prev, appStatus }))}
          />
          <MultiSelectDropdown
            label="Fuente"
            options={sources.map(s => ({ value: s, label: s }))}
            selected={multiFilters.sources}
            onChange={sources => setMultiFilters(prev => ({ ...prev, sources }))}
          />
        </div>
        {hasActiveFilters && (
          <button onClick={() => setMultiFilters(emptyMultiFilters)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
            <X size={12} /> Limpiar filtros
          </button>
        )}
        <div className="flex items-center gap-1 ml-auto bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Table2 size={16} />
          </button>
        </div>
      </div>

      {/* Main view */}
      {viewMode === 'kanban' ? (
        <LeadKanban
          stageCounts={counts.counts}
          search={debouncedSearch}
          filters={multiFilters}
          onSelectLead={setSelectedLead}
          onStageChange={handleStageChange}
          loading={loading}
          refreshKey={kanbanRefreshKey}
        />
      ) : (
        <LeadTable
          leads={leads}
          selectedIds={selectedLeadIds}
          onSelectLead={setSelectedLead}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onDelete={handleDeleteLead}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loading={loading}
          total={totalLeads}
        />
      )}

      {/* Detail drawer */}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          templates={templates}
          onClose={() => setSelectedLead(null)}
          onUpdate={handleUpdateLead}
          onDelete={handleDeleteLead}
          onRefresh={refreshAll}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <LeadImportModal
          onClose={() => setShowImport(false)}
          onImported={refreshAll}
        />
      )}

      {/* Bulk email */}
      {showBulkEmail && (
        <LeadEmailComposer
          mode="bulk"
          leadIds={Array.from(selectedLeadIds)}
          leads={leads.filter(l => selectedLeadIds.has(l.id))}
          templates={templates}
          onClose={() => { setShowBulkEmail(false); setSelectedLeadIds(new Set()); }}
          onSent={() => { setShowBulkEmail(false); setSelectedLeadIds(new Set()); refreshAll(); }}
        />
      )}

      {/* Bulk stage change modal */}
      {bulkAction === 'stage' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBulkAction(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Mover {selectedLeadIds.size} leads</h3>
              <button onClick={() => setBulkAction(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Selecciona el nuevo estado para los {selectedLeadIds.size} leads seleccionados:</p>
            <div className="grid grid-cols-2 gap-2">
              {LEAD_STAGES.map(s => (
                <button
                  key={s.id}
                  disabled={bulkProcessing}
                  onClick={() => handleBulkUpdate({ stage: s.id } as Partial<Lead>)}
                  className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${s.bgColor} ${s.color} ${s.borderColor} hover:opacity-80`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {bulkProcessing && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Procesando...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk assign modal */}
      {bulkAction === 'assign' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBulkAction(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Asignar {selectedLeadIds.size} leads</h3>
              <button onClick={() => setBulkAction(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">Asigna un responsable de ventas:</p>
            <div className="space-y-2">
              {assignees.map(a => (
                <button
                  key={a.id}
                  disabled={bulkProcessing}
                  onClick={() => handleBulkUpdate({ assigned_to: a.email } as Partial<Lead>)}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-200 disabled:opacity-50 transition-colors"
                >
                  <UserCheck size={13} className="inline mr-2 text-slate-400" /> {a.name ? `${a.name} (${a.email})` : a.email}
                </button>
              ))}
              <button
                disabled={bulkProcessing}
                onClick={() => handleBulkUpdate({ assigned_to: null } as Partial<Lead>)}
                className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <X size={13} className="inline mr-2" /> Sin asignar
              </button>
            </div>
            {bulkProcessing && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" /> Procesando...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create lead modal */}
      {showCreateLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateLead(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Nuevo Lead</h3>
              <button onClick={() => setShowCreateLead(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input type="email" placeholder="Email *" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" required />
              <input type="text" placeholder="Nombre *" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" required />
              <input type="tel" placeholder="Teléfono" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
              <input type="text" placeholder="Empresa / Clínica" value={newLead.company} onChange={e => setNewLead(p => ({ ...p, company: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
              <textarea placeholder="Detalles (cargo, especialidad, notas...)" value={newLead.details} onChange={e => setNewLead(p => ({ ...p, details: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none resize-none h-16" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreateLead(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={handleCreateLead} disabled={creating || !newLead.email} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {creating ? 'Creando...' : 'Crear Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesPipeline;
