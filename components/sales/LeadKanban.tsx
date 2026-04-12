import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lead, LEAD_STAGES, PIPELINE_STAGES, CLOSED_STAGES, LeadStage } from './types';
import { Mail, Phone, Smartphone, GripVertical, Building2, Loader2 } from 'lucide-react';
import { API_URL } from '../../services/config';
import { apiFetch } from '../../services/authService';
import type { MultiFilters } from './SalesPipeline';

interface Props {
  stageCounts: Record<string, number>;
  search: string;
  filters: MultiFilters;
  onSelectLead: (lead: Lead) => void;
  onStageChange: (leadId: string, newStage: LeadStage) => void;
  loading: boolean;
  refreshKey: number;
}

const KANBAN_PAGE_SIZE = 30;

const stageMap = Object.fromEntries(LEAD_STAGES.map(s => [s.id, s]));

const LeadCard: React.FC<{ lead: Lead; onClick: () => void }> = ({ lead, onClick }) => (
  <div
    onClick={onClick}
    draggable
    onDragStart={e => { e.dataTransfer.setData('lead-id', lead.id); e.dataTransfer.effectAllowed = 'move'; }}
    className="bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all group"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900 text-sm truncate">{lead.name || lead.email}</p>
        {lead.name && (
          <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
            <Mail size={10} className="flex-shrink-0" /> {lead.email}
          </p>
        )}
      </div>
      <GripVertical size={14} className="text-slate-300 group-hover:text-slate-400 flex-shrink-0 mt-0.5" />
    </div>

    <div className="flex items-center gap-2 mt-2 flex-wrap">
      {lead.phone && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Phone size={10} /> {lead.phone}
        </span>
      )}
      {lead.company && (
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Building2 size={10} /> {lead.company}
        </span>
      )}
    </div>

    <div className="flex items-center gap-2 mt-2">
      {lead.app_user_id ? (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
          <Smartphone size={9} /> {lead.app_is_subscribed ? 'Suscrito' : 'En App'}
        </span>
      ) : null}
      {lead.source && lead.source !== 'manual' && (
        <span className="text-[10px] text-slate-400">{lead.source}</span>
      )}
      {lead.last_contacted_at && (
        <span className="text-[10px] text-slate-400 ml-auto">
          {new Date(lead.last_contacted_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </div>
  </div>
);

const KanbanColumn: React.FC<{
  stageId: LeadStage;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  totalCount: number;
  search: string;
  filters: MultiFilters;
  refreshKey: number;
  onSelectLead: (lead: Lead) => void;
  onDrop: (leadId: string, stage: LeadStage) => void;
}> = ({ stageId, label, color, bgColor, borderColor, totalCount, search, filters, refreshKey, onSelectLead, onDrop }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadLeads = useCallback(async (append = false) => {
    if (!append) setInitialLoading(true);
    else setLoadingMore(true);
    try {
      const offset = append ? leads.length : 0;
      const params = new URLSearchParams();
      params.set('stage', stageId);
      if (search) params.set('search', search);
      if (filters.sources.length) params.set('source', filters.sources.join(','));
      if (filters.assignees.length) params.set('assigned_to', filters.assignees.join(','));
      if (filters.appStatus.length) params.set('app_status', filters.appStatus.join(','));
      params.set('offset', String(offset));
      params.set('limit', String(KANBAN_PAGE_SIZE));
      const res = await apiFetch(`${API_URL}/admin/leads?${params}`);
      if (res.ok) {
        const result = await res.json();
        if (append) {
          setLeads(prev => [...prev, ...result.data]);
        } else {
          setLeads(result.data);
        }
        setHasMore(offset + result.data.length < result.total);
      }
    } catch (e) { console.error(`Error loading leads for ${stageId}:`, e); }
    if (!append) setInitialLoading(false);
    else setLoadingMore(false);
  }, [stageId, search, filters, leads.length]);

  // Reset when search, filters or refreshKey changes
  useEffect(() => {
    setLeads([]);
    setHasMore(true);
    loadLeads(false);
  }, [stageId, search, filters, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll within column
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || initialLoading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore) loadLeads(true);
    }, { root: scrollRef.current, rootMargin: '100px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, initialLoading, loadLeads]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('lead-id');
    if (leadId) onDrop(leadId, stageId);
  };

  return (
    <div
      className={`flex flex-col min-w-[260px] max-w-[300px] flex-1 rounded-xl border ${borderColor} ${bgColor}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-inherit">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm ${color}`}>{label}</span>
          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold ${bgColor} ${color} border ${borderColor}`}>
            {totalCount}
          </span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
        {initialLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className={`animate-spin ${color}`} />
          </div>
        ) : (
          <>
            {leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />
            ))}
            {leads.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">
                Arrastra leads aquí
              </div>
            )}
            {/* Sentinel for infinite scroll */}
            {hasMore && <div ref={sentinelRef} className="h-1" />}
            {loadingMore && (
              <div className="flex items-center justify-center py-2">
                <Loader2 size={14} className={`animate-spin ${color}`} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const LeadKanban: React.FC<Props> = ({ stageCounts, search, filters, onSelectLead, onStageChange, loading, refreshKey }) => {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full mx-auto" />
        <p className="text-sm text-slate-500 mt-3">Cargando pipeline...</p>
      </div>
    );
  }

  const visibleStages = filters.stages.length > 0
    ? LEAD_STAGES.filter(s => filters.stages.includes(s.id))
    : LEAD_STAGES;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visibleStages.map(stage => (
        <KanbanColumn
          key={stage.id}
          stageId={stage.id}
          label={stage.label}
          color={stage.color}
          bgColor={stage.bgColor}
          borderColor={stage.borderColor}
          totalCount={stageCounts[stage.id] || 0}
          search={search}
          filters={filters}
          refreshKey={refreshKey}
          onSelectLead={onSelectLead}
          onDrop={onStageChange}
        />
      ))}
    </div>
  );
};
