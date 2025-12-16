import React, { useEffect, useState } from 'react';
import { User } from '../types';
import * as AuthService from '../services/authService';

const SuperAdmin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [resetStates, setResetStates] = useState<Record<string, { newPassword: string; status: 'idle'|'pending'|'success'|'error'; msg?: string }>>({});

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

  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold mb-4">Superadmin — Gestionar usuarios</h1>
      <div className="mb-4 flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o email" className="flex-1 px-3 py-2 border rounded" />
        <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={async () => { setLoading(true); const us = await AuthService.getUsers(); setUsers(us); setLoading(false); }}>Refrescar</button>
      </div>

      <div className="bg-slate-50 rounded-lg p-4">
        {loading ? <div>Cargando usuarios…</div> : (
          <div className="space-y-3">
            {filtered.map(u => (
              <div key={u.id} className="p-3 bg-white border rounded flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">{u.name} <span className="text-xs text-slate-500">({u.role})</span></div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </div>
                <div className="w-64 flex items-center gap-2">
                  <input type="password" placeholder="Nueva contraseña" className="flex-1 px-3 py-2 border rounded" value={resetStates[u.id]?.newPassword || ''} onChange={(e)=>handleChangePw(u.id, e.target.value)} />
                  <button onClick={() => handleReset(u)} className="px-3 py-2 bg-rose-600 text-white rounded">Reset</button>
                </div>
                <div className="w-40 text-sm">
                  {resetStates[u.id]?.status === 'pending' && <span className="text-slate-500">Procesando…</span>}
                  {resetStates[u.id]?.status === 'success' && <span className="text-green-600">{resetStates[u.id].msg}</span>}
                  {resetStates[u.id]?.status === 'error' && <span className="text-red-600">{resetStates[u.id].msg}</span>}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-slate-500">No se encontraron usuarios</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdmin;
