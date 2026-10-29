import React from 'react';
import { Building2, User as UserIcon, Mail } from 'lucide-react';
import type { BusinessMe } from '../../services/businessService';

interface WorkspaceSwitcherProps {
  me: BusinessMe;
  /** 'personal' o el id de la clínica activa. */
  current: string;
  personalLabel: string;
  onSelect: (workspace: string) => void;
  onOpenInvitations?: () => void;
}

/**
 * Selector de espacio de trabajo (mi consulta / clínicas). Solo se monta si el
 * usuario tiene alguna clínica o una invitación pendiente: para el resto de
 * psicólogos la interfaz de mainds pro no cambia. Las clínicas se crean desde
 * Ajustes (SettingsModal).
 */
const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ me, current, personalLabel, onSelect, onOpenInvitations }) => {
  const pending = me.pendingInvitations?.length || 0;
  const itemClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
      active ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <div data-testid="workspace-switcher" className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
      <p className="px-2 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Espacio de trabajo</p>
      <button type="button" className={itemClass(current === 'personal')} onClick={() => onSelect('personal')}>
        <UserIcon size={15} className="flex-shrink-0" />
        <span className="truncate">{personalLabel}</span>
      </button>
      {me.memberships.map(m => (
        <button
          key={m.orgId}
          type="button"
          className={itemClass(current === m.orgId)}
          onClick={() => onSelect(m.orgId)}
          title={m.name}
        >
          {m.logo_url
            ? <img src={m.logo_url} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
            : <Building2 size={15} className="flex-shrink-0" />}
          <span className="truncate flex-1">{m.name}</span>
          {m.access === 'read_only' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${current === m.orgId ? 'bg-white/20' : m.closed ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{m.closed ? 'cerrada' : 'pausada'}</span>
          )}
        </button>
      ))}
      {pending > 0 && onOpenInvitations && (
        <button type="button" onClick={onOpenInvitations} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-amber-800 bg-amber-50 hover:bg-amber-100">
          <Mail size={15} className="flex-shrink-0" />
          <span className="truncate">{pending === 1 ? '1 invitación pendiente' : `${pending} invitaciones pendientes`}</span>
        </button>
      )}
    </div>
  );
};

export default WorkspaceSwitcher;
