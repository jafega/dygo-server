import React, { useRef, useEffect } from 'react';
import { Lead, LEAD_STAGES, LeadStage } from './types';
import { Mail, Phone, Building2, Calendar, Smartphone, Trash2, Loader2, UserCheck } from 'lucide-react';
import type { ColumnFilters } from './SalesPipeline';

interface Props {
  leads: Lead[];
  selectedIds: Set<string>;
  onSelectLead: (lead: Lead) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  total: number;
  columnFilters: ColumnFilters;
  onColumnFilterChange: (key: keyof ColumnFilters, value: string) => void;
  assignees: string[];
  stageFilter: LeadStage | '';
}

const stageMap = Object.fromEntries(LEAD_STAGES.map(s => [s.id, s]));
const filterInputClass = 'w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-indigo-200 focus:border-indigo-300 outline-none bg-white placeholder-slate-300';

export const LeadTable: React.FC<Props> = ({ leads, selectedIds, onSelectLead, onToggleSelect, onSelectAll, onDelete, loading, onLoadMore, hasMore, loadingMore, total, columnFilters, onColumnFilterChange, assignees, stageFilter }) => {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) onLoadMore();
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full mx-auto" />
        <p className="text-sm text-slate-500 mt-3">Cargando leads...</p>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
        <p className="text-slate-500">No se encontraron leads</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === leads.length && leads.length > 0}
                  onChange={onSelectAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Nombre</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Teléfono</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Empresa</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Asignado</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">En App</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Fuente</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Creado</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide w-10"></th>
            </tr>
            {/* Column filter row */}
            <tr className="border-b border-slate-100 bg-slate-25">
              <td className="px-4 py-1.5"></td>
              <td className="px-4 py-1.5">
                <input type="text" placeholder="Filtrar..." value={columnFilters.name} onChange={e => onColumnFilterChange('name', e.target.value)} className={filterInputClass} />
              </td>
              <td className="px-4 py-1.5">
                <input type="text" placeholder="Filtrar..." value={columnFilters.email} onChange={e => onColumnFilterChange('email', e.target.value)} className={filterInputClass} />
              </td>
              <td className="px-4 py-1.5 hidden md:table-cell">
                <input type="text" placeholder="Filtrar..." value={columnFilters.phone} onChange={e => onColumnFilterChange('phone', e.target.value)} className={filterInputClass} />
              </td>
              <td className="px-4 py-1.5 hidden lg:table-cell">
                <input type="text" placeholder="Filtrar..." value={columnFilters.company} onChange={e => onColumnFilterChange('company', e.target.value)} className={filterInputClass} />
              </td>
              <td className="px-4 py-1.5">
                {!stageFilter && (
                  <select value="" onChange={e => { /* stage filter is in parent toolbar */ }} disabled className={`${filterInputClass} opacity-40`}>
                    <option value="">Toolbar</option>
                  </select>
                )}
              </td>
              <td className="px-4 py-1.5 hidden md:table-cell">
                <select value={columnFilters.assigned_to} onChange={e => onColumnFilterChange('assigned_to', e.target.value)} className={filterInputClass}>
                  <option value="">Todos</option>
                  <option value="__unassigned__">Sin asignar</option>
                  {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
              <td className="px-4 py-1.5 hidden md:table-cell">
                <select value={columnFilters.app_status} onChange={e => onColumnFilterChange('app_status', e.target.value)} className={filterInputClass}>
                  <option value="">Todos</option>
                  <option value="registered">Registrado</option>
                  <option value="subscribed">Suscrito</option>
                  <option value="none">No</option>
                </select>
              </td>
              <td className="px-4 py-1.5 hidden lg:table-cell">
                <input type="text" placeholder="Filtrar..." value={columnFilters.source} onChange={e => onColumnFilterChange('source', e.target.value)} className={filterInputClass} />
              </td>
              <td className="px-4 py-1.5 hidden lg:table-cell"></td>
              <td className="px-4 py-1.5"></td>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map(lead => {
              const st = stageMap[lead.stage];
              return (
                <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => onSelectLead(lead)}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => onToggleSelect(lead.id)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-900">{lead.name || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Mail size={13} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate max-w-[200px]">{lead.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {lead.phone ? (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Phone size={13} className="text-slate-400" />
                        <span>{lead.phone}</span>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {lead.company ? (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Building2 size={13} className="text-slate-400" />
                        <span className="truncate max-w-[150px]">{lead.company}</span>
                      </div>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {st && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${st.bgColor} ${st.color}`}>
                        {st.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {lead.assigned_to ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <UserCheck size={10} /> {lead.assigned_to}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {lead.app_user_id ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        <Smartphone size={10} /> {lead.app_is_subscribed ? 'Suscrito' : 'Registrado'}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-slate-500">{lead.source || '—'}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Calendar size={12} />
                      {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onDelete(lead.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} />
      {loadingMore && (
        <div className="flex items-center justify-center py-3 text-slate-400 text-sm gap-2">
          <Loader2 size={14} className="animate-spin" /> Cargando más...
        </div>
      )}
      {!hasMore && leads.length > 0 && (
        <div className="text-center py-2 text-xs text-slate-400">
          {leads.length} de {total} leads cargados
        </div>
      )}
    </div>
  );
};
