import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';
import { Trash2, RefreshCcw, Shield, Users, Search, AlertTriangle, UserX } from 'lucide-react';

// Panel de administración integrado como pestaña
const SuperAdmin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [deleteStates, setDeleteStates] = useState<Record<string, { status: 'idle'|'pending'|'success'|'error'; msg?: string }>>({});
  const [confirmingUser, setConfirmingUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const us = await AuthService.getUsers();
      setUsers(us || []);
    } catch (e) {
      console.error('Error loading users:', e);
    }
    setLoading(false);
  };

  const filtered = users.filter(u => 
    !query || 
    u.name?.toLowerCase().includes(query.toLowerCase()) || 
    u.email?.toLowerCase().includes(query.toLowerCase())
  );

  const totalUsers = users.length;
  const totalPsychs = users.filter(u => u.is_psychologist === true).length;
  const totalPatients = users.filter(u => u.is_psychologist !== true).length;

  const promptDelete = (u: User) => {
    setConfirmingUser(u);
  };

  const confirmDelete = async () => {
    if (!confirmingUser) return;
    const u = confirmingUser;
    setDeleteStates(prev => ({ ...prev, [u.id]: { status: 'pending' } }));
    try {
      await AuthService.adminDeleteUser(u.email);
      setDeleteStates(prev => ({ ...prev, [u.id]: { status: 'success', msg: 'Eliminado' } }));
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setConfirmingUser(null);
    } catch (err: any) {
      setDeleteStates(prev => ({ ...prev, [u.id]: { status: 'error', msg: err?.message || 'Error eliminando' } }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header con stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Total Usuarios</p>
              <p className="text-3xl font-bold text-indigo-900 mt-1">{totalUsers}</p>
            </div>
            <div className="bg-white/80 text-indigo-600 p-3 rounded-xl shadow-sm">
              <Users size={24} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Psicólogos</p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">{totalPsychs}</p>
            </div>
            <div className="bg-white/80 text-emerald-600 p-3 rounded-xl shadow-sm">
              <Shield size={24} />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">Pacientes</p>
              <p className="text-3xl font-bold text-purple-900 mt-1">{totalPatients}</p>
            </div>
            <div className="bg-white/80 text-purple-600 p-3 rounded-xl shadow-sm">
              <Users size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Buscador y acciones */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 relative w-full">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          <button
            className="px-5 py-3 bg-indigo-600 text-white rounded-xl flex items-center gap-2 shadow-sm hover:bg-indigo-700 transition-colors whitespace-nowrap"
            onClick={loadUsers}
            disabled={loading}
          >
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
        </div>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <RefreshCcw className="animate-spin mx-auto text-indigo-600 mb-3" size={32} />
            <p className="text-slate-500">Cargando usuarios...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <UserX className="mx-auto text-slate-300 mb-3" size={48} />
            <p className="text-slate-500">No se encontraron usuarios</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(u => (
              <div key={u.id} className="p-5 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Info del usuario */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
                        {u.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-900 truncate">{u.name}</h3>
                          {u.is_psychologist === true ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                              <Shield size={12} /> Psicólogo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                              Paciente
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 truncate">{u.email}</p>
                        <p className="text-xs text-slate-400 font-mono">ID: {u.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => promptDelete(u)}
                      className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl flex items-center gap-2 transition-colors shadow-sm"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">Eliminar</span>
                    </button>
                  </div>
                </div>

                {/* Estado de eliminación */}
                {deleteStates[u.id]?.status === 'pending' && (
                  <div className="mt-3 text-sm text-slate-500">Eliminando...</div>
                )}
                {deleteStates[u.id]?.status === 'error' && (
                  <div className="mt-3 text-sm text-red-600">{deleteStates[u.id].msg}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmación */}
      {confirmingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmingUser(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 text-red-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Eliminar usuario</h3>
            </div>
            
            <p className="text-slate-600 mb-6">
              Estás a punto de eliminar a <strong className="text-slate-900">{confirmingUser.name}</strong> ({confirmingUser.email}).
            </p>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-800">
                <strong>⚠️ Advertencia:</strong> Esta acción eliminará permanentemente todas las entradas, metas, invitaciones y datos relacionados. 
                <strong className="block mt-1">No se puede deshacer.</strong>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingUser(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-300 hover:bg-slate-50 font-medium transition-colors"
                disabled={deleteStates[confirmingUser.id]?.status === 'pending'}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                disabled={deleteStates[confirmingUser.id]?.status === 'pending'}
              >
                {deleteStates[confirmingUser.id]?.status === 'pending' ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>

            {deleteStates[confirmingUser.id]?.status === 'error' && (
              <p className="mt-4 text-sm text-red-600 text-center">
                {deleteStates[confirmingUser.id].msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
