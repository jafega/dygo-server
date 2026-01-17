import React from 'react';
import { Users, FileText, User as UserIcon, Calendar, Menu, X } from 'lucide-react';

interface PsychologistSidebarProps {
  activeView: 'patients' | 'billing' | 'profile' | 'calendar';
  onViewChange: (view: 'patients' | 'billing' | 'profile' | 'calendar') => void;
  isOpen: boolean;
  onToggle: () => void;
}

const PsychologistSidebar: React.FC<PsychologistSidebarProps> = ({ 
  activeView, 
  onViewChange,
  isOpen,
  onToggle 
}) => {
  const menuItems = [
    { id: 'patients' as const, label: 'Pacientes', icon: Users },
    { id: 'calendar' as const, label: 'Calendario', icon: Calendar },
    { id: 'billing' as const, label: 'Facturación', icon: FileText },
    { id: 'profile' as const, label: 'Mi Perfil', icon: UserIcon },
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
        <div className="p-4 border-t border-slate-200">
          <div className="text-xs text-slate-400 text-center">
            dygo Pro
          </div>
        </div>
      </aside>
    </>
  );
};

export default PsychologistSidebar;
