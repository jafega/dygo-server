import React, { useState, useEffect, useCallback } from 'react';
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
  Mail, Zap, X, Users, TrendingUp, Target, Ban, FileText, Loader2,
} from 'lucide-react';

const TemplatesPanel = React.lazy(() => import('./TemplatesPanel'));

type ViewMode = 'kanban' | 'table';
type SalesTab = 'pipeline' | 'templates';

const SalesPipeline: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<LeadEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [activeTab, setActiveTab] = useState<SalesTab>('pipeline');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LeadStage | ''>('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLead, setNewLead] = useState({ email: '', name: '', phone: '', company: '' });
  const [creating, setCreating] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stageFilter) params.set('stage', stageFilter);
      if (search) params.set('search', search);
      const res = await apiFetch(`${API_URL}/admin/leads?${params}`);
      if (res.ok) setLeads(await res.json());
    } catch (e) { console.error('Error loading leads:', e); }
    setLoading(false);
  }, [stageFilter, search]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/lead-templates`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.error('Error loading templates:', e); }
  }, []);

  useEffect(() => { loadLeads(); loadTemplates(); }, [loadLeads, loadTemplates]);

  const handleCreateLead = async () => {
    if (!newLead.email) return;
    setCreating(true);
    try {
      const res = await apiFetch(`${API_URL}/admin/leads`, {
        method: 'POST',
        body: JSON.stringify(newLead),
      });
      if (res.ok) {
        setShowCreateLead(false);
        setNewLead({ email: '', name: '', phone: '', company: '' });
        loadLeads();
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
        loadLeads();
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

  // KPI calculations
  const kpis = {
    total: leads.length,
    pipeline: leads.filter(l => ['new', 'prueba', 'contacted', 'demo'].includes(l.stage)).length,
    won: leads.filter(l => l.stage === 'won').length,
    lost: leads.filter(l => l.stage === 'lost').length,
    cancelled: leads.filter(l => l.stage === 'cancelled').length,
    inApp: leads.filter(l => l.app_user_id).length,
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'pipeline' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp size={15} /> Pipeline
        </button>
        <button
          onClick={() => { setActiveTab('templates'); loadTemplates(); }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'templates' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText size={15} /> Plantillas
        </button>
      </div>

      {/* Templates tab */}
      {activeTab === 'templates' && (
        <React.Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" /> Cargando...</div>}>
          <TemplatesPanel />
        </React.Suspense>
      )}

      {/* Pipeline tab */}
      {activeTab === 'pipeline' && (<>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline de Ventas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{leads.length} leads · {kpis.pipeline} en pipeline</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSyncAppStatus} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors" title="Sincronizar estado de leads con usuarios de la app">
            <Zap size={15} /> Sync App
          </button>
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <Upload size={15} /> Importar
          </button>
          {selectedLeadIds.size > 0 && (
            <button onClick={() => setShowBulkEmail(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors">
              <Mail size={15} /> Email ({selectedLeadIds.size})
            </button>
          )}
          <button onClick={() => setShowCreateLead(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Nuevo Lead
          </button>
          <button onClick={loadLeads} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
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
            type="text" placeholder="Buscar leads..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={stageFilter} onChange={e => setStageFilter(e.target.value as LeadStage | '')}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
          >
            <option value="">Todos los estados</option>
            {LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
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
          leads={leads}
          onSelectLead={setSelectedLead}
          onStageChange={handleStageChange}
          loading={loading}
        />
      ) : (
        <LeadTable
          leads={leads}
          selectedIds={selectedLeadIds}
          onSelectLead={setSelectedLead}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onDelete={handleDeleteLead}
          loading={loading}
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
          onRefresh={loadLeads}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <LeadImportModal
          onClose={() => setShowImport(false)}
          onImported={loadLeads}
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
          onSent={() => { setShowBulkEmail(false); setSelectedLeadIds(new Set()); loadLeads(); }}
        />
      )}

      </>)}

      {/* Create lead modal */}
      {showCreateLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateLead(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Nuevo Lead</h3>
              <button onClick={() => setShowCreateLead(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input type="email" placeholder="Email *" value={newLead.email} onChange={e => setNewLead(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
              <input type="text" placeholder="Nombre" value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
              <input type="tel" placeholder="Teléfono" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
              <input type="text" placeholder="Empresa / Clínica" value={newLead.company} onChange={e => setNewLead(p => ({ ...p, company: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
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
