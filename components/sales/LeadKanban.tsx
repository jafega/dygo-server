import React from 'react';
import { Lead, LEAD_STAGES, PIPELINE_STAGES, CLOSED_STAGES, LeadStage } from './types';
import { Mail, Phone, Smartphone, GripVertical, Building2, Loader2 } from 'lucide-react';

interface Props {
  leads: Lead[];
  stageCounts: Record<string, number>;
  onSelectLead: (lead: Lead) => void;
  onStageChange: (leadId: string, newStage: LeadStage) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
}

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
  leads: Lead[];
  totalCount: number;
  onSelectLead: (lead: Lead) => void;
  onDrop: (leadId: string, stage: LeadStage) => void;
}> = ({ stageId, label, color, bgColor, borderColor, leads, totalCount, onSelectLead, onDrop }) => {
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
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onClick={() => onSelectLead(lead)} />
        ))}
        {leads.length === 0 && (
          <div className="text-center py-8 text-xs text-slate-400">
            Arrastra leads aquí
          </div>
        )}
      </div>
    </div>
  );
};

export const LeadKanban: React.FC<Props> = ({ leads, stageCounts, onSelectLead, onStageChange, onLoadMore, hasMore, loadingMore, loading }) => {
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full mx-auto" />
        <p className="text-sm text-slate-500 mt-3">Cargando pipeline...</p>
      </div>
    );
  }

  const leadsByStage = (stageId: LeadStage) => leads.filter(l => l.stage === stageId);

  return (
    <div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {LEAD_STAGES.map(stage => (
          <KanbanColumn
            key={stage.id}
            stageId={stage.id}
            label={stage.label}
            color={stage.color}
            bgColor={stage.bgColor}
            borderColor={stage.borderColor}
            leads={leadsByStage(stage.id)}
            totalCount={stageCounts[stage.id] || leadsByStage(stage.id).length}
            onSelectLead={onSelectLead}
            onDrop={onStageChange}
          />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center mt-3">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? <><Loader2 size={14} className="animate-spin" /> Cargando...</> : 'Cargar más leads'}
          </button>
        </div>
      )}
    </div>
  );
};
