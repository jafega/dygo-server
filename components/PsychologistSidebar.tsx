import React from 'react';
import { Users, FileText, User as UserIcon, Calendar, Menu, X, ArrowLeftRight } from 'lucide-react';

interface PsychologistSidebarProps {
  activeView: 'patients' | 'billing' | 'profile' | 'calendar';
  onViewChange: (view: 'patients' | 'billing' | 'profile' | 'calendar') => void;
  isOpen: boolean;
  onToggle: () => void;
  userName?: string;
  userEmail?: string;
  onSwitchToPersonal: () => void;
  onOpenSettings: () => void;
}

const PsychologistSidebar: React.FC<PsychologistSidebarProps> = ({ 
  activeView, 
  onViewChange,
  isOpen,
  onToggle,
  userName = '',
  userEmail = '',
  onSwitchToPersonal,
  onOpenSettings
}) => {
  const menuItems = [
    { id: 'patients' as const, label: 'Pacientes', icon: Users },
    { id: 'calendar' as const, label: 'Calendario', icon: Calendar },
    { id: 'billing' as const, label: 'Facturación', icon: FileText },
    { id: 'profile' as const, label: 'Mi Perfil Profesional', icon: UserIcon },
  ];

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-slate-200 hover:bg-slate-50"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen lg:h-[calc(100vh-2rem)]
          w-64 bg-white border-r border-slate-200 z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Panel Profesional</h2>
          <p className="text-xs text-slate-500 mt-1">Gestiona tu práctica</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  if (window.innerWidth < 1024) {
                    onToggle();
                  }
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  text-sm font-medium transition-all
                  ${isActive 
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-700 font-semibold text-sm">
                {userName?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={onSwitchToPersonal}
            className="w-full px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-left flex items-center gap-2 border border-indigo-100"
          >
            <ArrowLeftRight size={16} />
            <span>Mi Diario Personal</span>
          </button>
          <button
            onClick={onOpenSettings}
            className="w-full px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors text-left"
          >
            Configuración
          </button>
        </div>
      </aside>
    </>
  );
};

export default PsychologistSidebar;
