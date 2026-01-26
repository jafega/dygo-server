import React, { useState, useEffect } from 'react';
import { Users, FileText, User as UserIcon, Calendar, Menu, X, ArrowLeftRight, ShieldCheck, Link2, BarChart3, AlertCircle, ClipboardList, Building2 } from 'lucide-react';

const DygoLogo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M 82 15 Q 60 15 60 35 L 60 68 A 22 22 0 1 1 60 67.9" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface PsychologistSidebarProps {
  activeView: 'patients' | 'billing' | 'profile' | 'dashboard' | 'sessions' | 'schedule' | 'centros';
  onViewChange: (view: 'patients' | 'billing' | 'profile' | 'dashboard' | 'sessions' | 'schedule' | 'centros') => void;
  isOpen: boolean;
  onToggle: () => void;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
  onSwitchToPersonal: () => void;
  onOpenSettings: () => void;
  isProfileIncomplete?: boolean;
}

const PsychologistSidebar: React.FC<PsychologistSidebarProps> = ({ 
  activeView, 
  onViewChange,
  isOpen,
  onToggle,
  userName = '',
  userEmail = '',
  avatarUrl = '',
  onSwitchToPersonal,
  onOpenSettings,
  isProfileIncomplete = false
}) => {
  const menuItems = [
    { id: 'schedule' as const, label: 'Agenda', icon: Calendar },
    { id: 'patients' as const, label: 'Pacientes', icon: Users },
    { id: 'sessions' as const, label: 'Sesiones', icon: ClipboardList },
    { id: 'dashboard' as const, label: 'Métricas', icon: BarChart3 },
    { id: 'billing' as const, label: 'Facturación', icon: FileText },
    { id: 'centros' as const, label: 'Centros', icon: Building2 },
    { id: 'profile' as const, label: 'Mi Perfil Profesional', icon: UserIcon },
  ];

  // State for draggable menu button position (unified across personal/professional)
  const [menuButtonPos, setMenuButtonPos] = useState(() => {
    const saved = localStorage.getItem('dygoMenuButtonPos');
    if (saved) return JSON.parse(saved);
    // Default position: bottom-left (16px from edges)
    const defaultTop = typeof window !== 'undefined' ? window.innerHeight - 64 : 700;
    return { top: defaultTop, left: 16 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Save menu button position to localStorage
  useEffect(() => {
    localStorage.setItem('dygoMenuButtonPos', JSON.stringify(menuButtonPos));
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
            cursor: isDragging ? 'grabbing' : 'grab',
            transition: isDragging ? 'none' : 'all 0.3s'
          }}
          className="lg:hidden fixed z-50 w-12 h-12 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-full shadow-lg hover:shadow-xl hover:from-indigo-700 hover:to-blue-700 flex items-center justify-center transition-all"
        >
          <DygoLogo className="w-7 h-7 text-white" />
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
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-lg flex items-center justify-center">
                <DygoLogo className="w-6 h-6 text-white" />
              </div>
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
                  text-sm font-medium transition-all relative
                  ${isActive 
                    ? 'bg-indigo-50 text-indigo-700 shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }
                `}
              >
                <Icon size={18} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.id === 'profile' && isProfileIncomplete && (
                  <AlertCircle size={18} className="text-amber-500 animate-pulse" title="Perfil incompleto" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-indigo-700 font-semibold text-sm">
                  {userName?.charAt(0).toUpperCase() || '?'}
                </span>
              )}
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
