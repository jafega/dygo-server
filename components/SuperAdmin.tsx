import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';
import { Trash2, RefreshCcw, Shield, Users, Search } from 'lucide-react';

// Responsive: mobile-first layout using Tailwind — stacks controls on small screens and truncates long text
const SuperAdmin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resetStates, setResetStates] = useState<Record<string, { newPassword: string; status: 'idle'|'pending'|'success'|'error'; msg?: string }>>({});
  const [deleteStates, setDeleteStates] = useState<Record<string, { status: 'idle'|'pending'|'success'|'error'; msg?: string }>>({});
  const [confirmingUser, setConfirmingUser] = useState<User | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const us = await AuthService.getUsers();
        setUsers(us || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = users.filter(u => !query || u.name?.toLowerCase().includes(query.toLowerCase()) || u.email?.toLowerCase().includes(query.toLowerCase()));
  const totalUsers = users.length;
  const totalPsychs = users.filter(u => String(u.role).toUpperCase() === 'PSYCHOLOGIST' || u.isPsychologist).length;
  const totalPatients = users.filter(u => String(u.role).toUpperCase() === 'PATIENT' && !u.isPsychologist).length;

  const handleChangePw = (id: string, pw: string) => {
    setResetStates(prev => ({ ...prev, [id]: { ...(prev[id] || { newPassword: '' }), newPassword: pw, status: 'idle' } }));
  };

  const handleReset = async (user: User) => {
    const state = resetStates[user.id];
    if (!state || !state.newPassword) return setResetStates(prev => ({ ...prev, [user.id]: { ...(prev[user.id]||{}), status: 'error', msg: 'Introduce una nueva contraseña' } }));
    if (state.newPassword.length < 6) return setResetStates(prev => ({ ...prev, [user.id]: { ...(prev[user.id]||{}), status: 'error', msg: 'La contraseña debe tener al menos 6 caracteres' } }));

    setResetStates(prev => ({ ...prev, [user.id]: { ...(prev[user.id]||{}), status: 'pending' } }));
    try {
      await AuthService.adminResetUserPassword(user.email, state.newPassword);
      setResetStates(prev => ({ ...prev, [user.id]: { ...(prev[user.id]||{}), status: 'success', msg: 'Contraseña actualizada' } }));
    } catch (err: any) {
      setResetStates(prev => ({ ...prev, [user.id]: { ...(prev[user.id]||{}), status: 'error', msg: err?.message || 'Error' } }));
    }
  };

  const promptDelete = (u: User) => {
    setConfirmingUser(u);
  }

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
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                <Shield size={12} /> Panel Superadmin
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-2">Gestión de usuarios</h1>
              <p className="text-sm text-slate-500">Busca, restablece contraseñas y elimina cuentas.</p>
            </div>
            <button
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl w-full sm:w-auto flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-700"
              onClick={async () => { setLoading(true); const us = await AuthService.getUsers(); setUsers(us); setLoading(false); }}
            >
              <RefreshCcw size={16} /> Refrescar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total usuarios</p>
                <p className="text-2xl font-bold text-slate-800">{totalUsers}</p>
              </div>
              <div className="bg-indigo-50 text-indigo-600 p-2 rounded-full"><Users size={16} /></div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Psicólogos</p>
              <p className="text-2xl font-bold text-slate-800">{totalPsychs}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Pacientes</p>
              <p className="text-2xl font-bold text-slate-800">{totalPatients}</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre o email"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-white"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          {loading ? <div className="text-slate-500">Cargando usuarios…</div> : (
            <div className="space-y-3">
              {filtered.map(u => (
                <div key={u.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col gap-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {u.name} <span className="text-xs text-slate-500">({u.role})</span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{u.email}</div>
                    </div>
                    <div className="text-xs text-slate-500">ID: <span className="font-mono">{u.id.slice(0, 8)}…</span></div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <input type="password" placeholder="Nueva contraseña" className="flex-1 px-3 py-2.5 border border-slate-200 rounded-xl" value={resetStates[u.id]?.newPassword || ''} onChange={(e)=>handleChangePw(u.id, e.target.value)} />
                      <button onClick={() => handleReset(u)} className="px-4 py-2.5 bg-rose-600 text-white rounded-xl w-full sm:w-auto">Reset</button>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="min-w-[140px] text-xs">
                        {resetStates[u.id]?.status === 'pending' && <span className="text-slate-500">Procesando…</span>}
                        {resetStates[u.id]?.status === 'success' && <span className="text-green-600">{resetStates[u.id].msg}</span>}
                        {resetStates[u.id]?.status === 'error' && <span className="text-red-600">{resetStates[u.id].msg}</span>}
                      </div>
                      <button onClick={() => promptDelete(u)} className="px-3 py-2 bg-red-50 hover:bg-red-100 text-rose-600 border border-red-100 rounded-xl flex items-center gap-2">
                        <Trash2 size={16} /> Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-sm text-slate-500">No se encontraron usuarios</div>}
            </div>
          )}
        </div>
      </div>

      {confirmingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-bold mb-2">Eliminar usuario</h3>
            <p className="text-sm text-slate-600 mb-4">Vas a eliminar <strong>{confirmingUser.name}</strong> ({confirmingUser.email}). Esto eliminará todas sus entradas, metas, invitaciones y datos relacionados. Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmingUser(null)} className="px-4 py-2 rounded-xl border">Cancelar</button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-rose-600 text-white rounded-xl">Eliminar</button>
            </div>
            {confirmingUser && deleteStates[confirmingUser.id]?.status === 'pending' && <p className="mt-3 text-sm text-slate-500">Eliminando…</p>}
            {confirmingUser && deleteStates[confirmingUser.id]?.status === 'error' && <p className="mt-3 text-sm text-red-600">{deleteStates[confirmingUser.id].msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
