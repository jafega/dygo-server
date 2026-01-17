import React, { useState, useEffect } from 'react';
import { Users, FileText, User as UserIcon, Calendar, Menu, X, ArrowLeftRight, ShieldCheck, Link2, BarChart3 } from 'lucide-react';

const DygoLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface PsychologistSidebarProps {
  activeView: 'patients' | 'billing' | 'profile' | 'calendar' | 'connections' | 'dashboard';
  onViewChange: (view: 'patients' | 'billing' | 'profile' | 'calendar' | 'connections' | 'dashboard') => void;
  isOpen: boolean;
  onToggle: () => void;
  userName?: string;
  userEmail?: string;
  onSwitchToPersonal: () => void;
  onOpenSettings: () => void;
  isSuperAdmin?: boolean;
  onSuperAdminClick?: () => void;
}

const PsychologistSidebar: React.FC<PsychologistSidebarProps> = ({ 
  activeView, 
  onViewChange,
  isOpen,
  onToggle,
  userName = '',
  userEmail = '',
  onSwitchToPersonal,
  onOpenSettings,
  isSuperAdmin = false,
  onSuperAdminClick
}) => {
  const menuItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: BarChart3 },
    { id: 'patients' as const, label: 'Pacientes', icon: Users },
    { id: 'calendar' as const, label: 'Calendario', icon: Calendar },
    { id: 'billing' as const, label: 'Facturación', icon: FileText },
    { id: 'connections' as const, label: 'Conexiones', icon: Link2 },
    { id: 'profile' as const, label: 'Mi Perfil Profesional', icon: UserIcon },
  ];

  // State for draggable menu button position
  const [menuButtonPos, setMenuButtonPos] = useState(() => {
    const saved = localStorage.getItem('menuButtonPositionPro');
    return saved ? JSON.parse(saved) : { top: 16, right: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Save menu button position to localStorage
  useEffect(() => {
    localStorage.setItem('menuButtonPositionPro', JSON.stringify(menuButtonPos));
  }, [menuButtonPos]);

  return (
    <>
      {/* Mobile Toggle Button - Draggable */}
      {!isOpen && (
        <button
          onTouchStart={(e) => {
            const touch = e.touches[0];
            const rect = e.currentTarget.getBoundingClientRect();
            setDragOffset({
              x: touch.clientX - rect.left,
              y: touch.clientY - rect.top
            });
            setIsDragging(true);
          }}
          onTouchMove={(e) => {
            if (!isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            const newTop = touch.clientY - dragOffset.y;
            const newLeft = touch.clientX - dragOffset.x;
            
            // Keep within bounds
            const maxTop = window.innerHeight - 48;
            const maxLeft = window.innerWidth - 48;
            
            setMenuButtonPos({
              top: Math.max(16, Math.min(newTop, maxTop)),
              left: Math.max(16, Math.min(newLeft, maxLeft)),
              right: undefined
            });
          }}
          onTouchEnd={() => {
            if (isDragging) {
              setIsDragging(false);
            } else {
              onToggle();
            }
          }}
          onClick={(e) => {
            if (!isDragging) {
              onToggle();
            }
          }}
          style={{
            top: `${menuButtonPos.top}px`,
            right: menuButtonPos.right !== undefined ? `${menuButtonPos.right}px` : undefined,
            left: menuButtonPos.left !== undefined ? `${menuButtonPos.left}px` : undefined,
            touchAction: 'none',
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          className="lg:hidden fixed z-50 w-12 h-12 bg-white rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-all duration-300 flex items-center justify-center"
        >
          <DygoLogo className="w-7 h-7 text-indigo-600" />
        </button>
      )}

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
          fixed lg:sticky top-0 left-0 h-screen
          w-64 bg-white border-r border-slate-200 z-40
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <DygoLogo className="w-8 h-8 text-indigo-600" />
              <span className="font-dygo text-xl font-bold text-slate-900">dygo <span className="text-purple-600">pro</span></span>
            </div>
            {/* Close button for mobile - inside the menu */}
            <button
              onClick={onToggle}
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} className="text-slate-600" />
            </button>
          </div>
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
          
          {/* Superadmin Button */}
          {isSuperAdmin && onSuperAdminClick && (
            <button
              onClick={() => {
                onSuperAdminClick();
                if (window.innerWidth < 1024) {
                  onToggle();
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-t border-slate-200 mt-2 pt-3"
            >
              <ShieldCheck size={18} />
              <span>Superadmin</span>
            </button>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-700 font-semibold text-sm">
                {userName?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            </div>
          </button>
          <button
            onClick={onSwitchToPersonal}
            className="w-full px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors text-left flex items-center gap-2 border border-indigo-100"
          >
            <ArrowLeftRight size={16} />
            <span>Mi Diario Personal</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default PsychologistSidebar;
