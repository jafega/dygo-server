import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';
import { Trash2 } from 'lucide-react';

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
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold mb-4">Superadmin — Gestionar usuarios</h1>
      <div className="mb-4 flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o email" className="flex-1 px-3 py-2 border rounded-lg" />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg" onClick={async () => { setLoading(true); const us = await AuthService.getUsers(); setUsers(us); setLoading(false); }}>Refrescar</button>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 shadow-sm">
        {loading ? <div>Cargando usuarios…</div> : (
          <div className="space-y-3">
            {filtered.map(u => (
              <div key={u.id} className="p-3 bg-white border rounded-xl flex items-center justify-between gap-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex-1">
                  <div className="text-sm font-medium">{u.name} <span className="text-xs text-slate-500">({u.role})</span></div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="w-64 flex items-center gap-2">
                  <input type="password" placeholder="Nueva contraseña" className="flex-1 px-3 py-2 border rounded-lg" value={resetStates[u.id]?.newPassword || ''} onChange={(e)=>handleChangePw(u.id, e.target.value)} />
                  <button onClick={() => handleReset(u)} className="px-3 py-2 bg-rose-600 text-white rounded-lg">Reset</button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-40 text-sm">
                    {resetStates[u.id]?.status === 'pending' && <span className="text-slate-500">Procesando…</span>}
                    {resetStates[u.id]?.status === 'success' && <span className="text-green-600">{resetStates[u.id].msg}</span>}
                    {resetStates[u.id]?.status === 'error' && <span className="text-red-600">{resetStates[u.id].msg}</span>}
                  </div>
                  <button onClick={() => promptDelete(u)} className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-rose-600 border border-red-100 flex items-center gap-2"><Trash2 size={16} /> Eliminar</button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-slate-500">No se encontraron usuarios</div>}
          </div>
        )}
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
