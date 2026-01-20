import { User } from '../types';
import { API_URL, USE_BACKEND, ALLOW_LOCAL_FALLBACK } from './config';

const USERS_KEY = 'ai_diary_users_v1';
const CURRENT_USER_KEY = 'ai_diary_current_user_id';

// --- Helper for LocalStorage Fallback ---
const getLocalUsers = (): User[] => {
  const stored = localStorage.getItem(USERS_KEY);
  return stored ? JSON.parse(stored) : [];
};
const saveLocalUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

// --- Async API Methods ---

export const getUsers = async (): Promise<User[]> => {
  if (USE_BACKEND) {
    try {
      const res = await fetch(`${API_URL}/users`);
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      }
      throw new Error(`Server error: ${res.status}`);
    } catch (e) {
      // If explicit fallback is allowed we use local users, otherwise surface an error
      if (ALLOW_LOCAL_FALLBACK) {
        console.warn("Backend offline, falling back to local (ALLOW_LOCAL_FALLBACK=true).", e);
        return getLocalUsers();
      }
      throw new Error("No se puede conectar con el servidor. Asegúrate de ejecutar 'node server.js' y que el backend esté disponible.");
    }
  }
  return getLocalUsers();
};

export const initializeDemoData = async () => {
    const users = await getUsers();
    const hasPsych = users.some(u => u.role === 'PSYCHOLOGIST');
    
    if (!hasPsych && !USE_BACKEND) {
        const demoPsychs: User[] = [
            { id: 'psych-demo-1', name: 'Dra. Elena Foster', email: 'elena@dygo.health', password: '123', role: 'PSYCHOLOGIST' },
            { id: 'psych-demo-2', name: 'Dr. Marc Spector', email: 'marc@dygo.health', password: '123', role: 'PSYCHOLOGIST' }
        ];
        const updated = [...users, ...demoPsychs];
        saveLocalUsers(updated);
    }
};

export const register = async (name: string, email: string, password: string, role: 'PATIENT' | 'PSYCHOLOGIST'): Promise<User> => {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = role.trim().toUpperCase() as 'PATIENT' | 'PSYCHOLOGIST';

  if (USE_BACKEND) {
      try {
          const res = await fetch(`${API_URL}/auth/register`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, email: normalizedEmail, password, role: normalizedRole })
          });
          
          if (!res.ok) {
              let errMsg = 'Error al registrar';
              try {
                  const err = await res.json();
                  errMsg = err.error || errMsg;
              } catch {
                  errMsg = `Error del servidor (${res.status}). Asegúrate de que 'node server.js' esté corriendo sin errores.`;
              }
              throw new Error(errMsg);
          }
          
          const user = await res.json();
          localStorage.setItem(CURRENT_USER_KEY, user.id);
          return user;
      } catch (e) {
          console.error(e);
          // If allowed, fall back to local registration (development)
          if (ALLOW_LOCAL_FALLBACK) {
              const users = getLocalUsers();
              if (users.find(u => u.email === normalizedEmail)) throw new Error("El email ya está registrado (Local fallback).");
              const newUser: User = { id: crypto.randomUUID(), name, email: normalizedEmail, password, role: normalizedRole };
              users.push(newUser); saveLocalUsers(users); localStorage.setItem(CURRENT_USER_KEY, newUser.id); return newUser;
          }
          if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))) {
             throw new Error("No se puede conectar con el servidor. ¿Has ejecutado 'node server.js'?");
          }
          throw e;
      }
  }

  // Local Fallback when backend usage is disabled entirely
  const users = getLocalUsers();
  if (users.find(u => u.email === normalizedEmail)) throw new Error("El email ya está registrado (Local).");
  
  const newUser: User = {
        id: crypto.randomUUID(),
        name, email: normalizedEmail, password, role: normalizedRole
  };
  users.push(newUser);
  saveLocalUsers(users);
  localStorage.setItem(CURRENT_USER_KEY, newUser.id);
  return newUser;
};

export const login = async (email: string, password: string): Promise<User> => {
  const normalizedEmail = email.trim().toLowerCase();

  if (USE_BACKEND) {
      try {
          const res = await fetch(`${API_URL}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: normalizedEmail, password })
          });
          if (!res.ok) {
               if (res.status === 401) throw new Error("Credenciales inválidas");
               throw new Error(`Error del servidor (${res.status})`);
          }
          const user = await res.json();
          localStorage.setItem(CURRENT_USER_KEY, user.id);
          return user;
      } catch (e) {
          // If allowed, try a local login fallback (development only)
          if (ALLOW_LOCAL_FALLBACK) {
              const users = getLocalUsers();
              const user = users.find(u => u.email === normalizedEmail && u.password === password);
              if (!user) throw new Error("Credenciales inválidas (Local fallback).");
              localStorage.setItem(CURRENT_USER_KEY, user.id);
              return user;
          }
          if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))) {
             throw new Error("No se puede conectar con el servidor. ¿Has ejecutado 'node server.js'?");
          }
          throw e;
      }
  }

  const users = getLocalUsers();
  const user = users.find(u => u.email === normalizedEmail && u.password === password);
  if (!user) throw new Error("Credenciales inválidas (Local).");
  
  localStorage.setItem(CURRENT_USER_KEY, user.id);
  return user;
};

// Sign in with Supabase (exchange Supabase access token with backend)
export const signInWithSupabase = async (accessToken: string): Promise<User> => {
    if (USE_BACKEND) {
        const res = await fetch(`${API_URL}/supabase-auth`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: accessToken })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('❌ Supabase auth failed:', err);
            throw new Error(err.error || 'Error signing in with Supabase');
        }
        const user = await res.json();
        localStorage.setItem(CURRENT_USER_KEY, user.id);
        return user;
    }

    throw new Error('Supabase Sign-in is only supported when USE_BACKEND is true');
};

export const logout = () => {
  localStorage.removeItem(CURRENT_USER_KEY);
};

export const getCurrentUser = async (): Promise<User | null> => {
  const id = localStorage.getItem(CURRENT_USER_KEY);
  if (!id) return null;
  return await getUserById(id);
};

export const getUserById = async (id: string): Promise<User | undefined> => {
  if (USE_BACKEND) {
      try {
          console.log('Fetching user by ID:', id);
          const res = await fetch(`${API_URL}/users?id=${id}`);
          console.log('getUserById response:', res.status);
          if (res.ok) {
              const user = await res.json();
              console.log('User found:', user);
              return user;
          }
          if (res.status === 404) {
              console.warn('User not found:', id);
              return undefined;
          }
          throw new Error(`Server error: ${res.status}`);
      } catch(e) {
          console.error('Error in getUserById:', e);
          if (ALLOW_LOCAL_FALLBACK) { 
              console.warn("Fetch error, using local fallback.", e); 
              return getLocalUsers().find(u => u.id === id); 
          }
          throw new Error(`No se puede conectar con el servidor para obtener el usuario: ${e instanceof Error ? e.message : 'Error desconocido'}`);
      }
  }
  return getLocalUsers().find(u => u.id === id);
};

export const getUserByEmail = async (email: string): Promise<User | undefined> => {
    const normalized = email.trim().toLowerCase();
    const users = await getUsers();
    return users.find(u => u.email && u.email.trim().toLowerCase() === normalized);
};

export const updateUser = async (updatedUser: User) => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/users?id=${updatedUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Error updating user (${res.status})`);
            }
            return;
        } catch (e) {
            if (ALLOW_LOCAL_FALLBACK) {
                console.warn('Update user failed, using local fallback.', e);
            } else {
                throw e instanceof Error ? e : new Error('Error updating user and no local fallback allowed.');
            }
        }
    }

    const users = getLocalUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if(index !== -1) {
        users[index] = updatedUser;
        saveLocalUsers(users);
    }
};

// Change password for the current user. If a current password is stored, it must match.
export const changePassword = async (currentPassword: string, newPassword: string) => {
    const current = await getCurrentUser();
    if (!current) throw new Error('No hay usuario autenticado.');

    const stored = await getUserById(current.id);
    if (!stored) throw new Error('Usuario no encontrado.');

    // If a password exists, verify it. Otherwise allow setting a new password.
    if (stored.password && stored.password !== currentPassword) {
        throw new Error('Contraseña actual incorrecta.');
    }

    const updated = { ...stored, password: newPassword } as User;
    await updateUser(updated);
};

// Demo reset endpoint (for forgot password button): calls backend /auth/reset-password-demo
export const resetPasswordDemo = async (email: string, newPassword: string, secret?: string) => {
    if (USE_BACKEND) {
        const res = await fetch(`${API_URL}/reset-password-demo`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, newPassword, secret })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error resetting password');
        }
        return;
    }

    // Local fallback: update user directly
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.email && u.email.trim().toLowerCase() === email.trim().toLowerCase());
    if (idx === -1) throw new Error('Usuario no encontrado (Local).');
    users[idx] = { ...users[idx], password: newPassword } as User;
    saveLocalUsers(users);
};

// Superadmin reset for any user
export const adminResetUserPassword = async (targetEmail: string, newPassword: string) => {
    if (USE_BACKEND) {
        // send header with current user id so backend can authorize
        const current = await getCurrentUser();
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (current?.id) headers['x-user-id'] = current.id;
        const res = await fetch(`${API_URL}/admin-reset-user-password`, {
            method: 'POST', headers, body: JSON.stringify({ targetEmail, newPassword })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error resetting user password');
        }
        return;
    }

    // Local fallback: only allow if current user is the superadmin
    const current = await getCurrentUser();
    if (!current || String(current.email).toLowerCase() !== 'garryjavi@gmail.com') throw new Error('Forbidden (local)');
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.email && u.email.trim().toLowerCase() === targetEmail.trim().toLowerCase());
    if (idx === -1) throw new Error('Usuario no encontrado (Local).');
    users[idx] = { ...users[idx], password: newPassword } as User;
    saveLocalUsers(users);
};

// Delete a user and all their local data (or call backend admin delete endpoint)
export const adminDeleteUser = async (targetEmail: string) => {
    if (USE_BACKEND) {
        const current = await getCurrentUser();
        const headers: Record<string,string> = { 'Content-Type': 'application/json' };
        if (current?.id) headers['x-user-id'] = current.id;
        const res = await fetch(`${API_URL}/admin-delete-user`, {
            method: 'DELETE', headers, body: JSON.stringify({ targetEmail })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error deleting user');
        }
        return;
    }

    // Local fallback: only allow if current user is the superadmin
    const current = await getCurrentUser();
    if (!current || String(current.email).toLowerCase() !== 'garryjavi@gmail.com') throw new Error('Forbidden (local)');

    // Remove user from local users
    const users = getLocalUsers();
    const idx = users.findIndex(u => u.email && u.email.trim().toLowerCase() === targetEmail.trim().toLowerCase());
    if (idx === -1) throw new Error('Usuario no encontrado (Local).');
    const user = users[idx];
    users.splice(idx, 1);

    // Remove entries
    const entriesKey = 'ai_diary_entries_v2';
    const entries = JSON.parse(localStorage.getItem(entriesKey) || '[]');
    const filteredEntries = entries.filter((e:any) => String(e.userId) !== String(user.id));
    localStorage.setItem(entriesKey, JSON.stringify(filteredEntries));

    // Remove goals
    const goalsKey = 'ai_diary_goals_v2';
    const goals = JSON.parse(localStorage.getItem(goalsKey) || '[]');
    const filteredGoals = goals.filter((g:any) => String(g.userId) !== String(user.id));
    localStorage.setItem(goalsKey, JSON.stringify(filteredGoals));

    // Remove invitations
    const invKey = 'ai_diary_invitations_v1';
    const invs = JSON.parse(localStorage.getItem(invKey) || '[]');
    const filteredInvs = invs.filter((i:any) => {
        const fromMatch = i.fromPsychologistId && String(i.fromPsychologistId) === String(user.id);
        const toMatch = i.toUserEmail && String(i.toUserEmail).toLowerCase() === String(user.email).toLowerCase();
        return !(fromMatch || toMatch);
    });
    localStorage.setItem(invKey, JSON.stringify(filteredInvs));

    // Remove settings
    const settingsKey = 'ai_diary_settings_v3';
    const allSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    if (allSettings[user.id]) { delete allSettings[user.id]; localStorage.setItem(settingsKey, JSON.stringify(allSettings)); }

    // Clean up any other user metadata referencing this user (handled by relationship store)

    saveLocalUsers(users);
};

// Stripe: create a Checkout session (redirect to Stripe hosted checkout)
export const createCheckoutSession = async () => {
    if (!USE_BACKEND) {
        // Local demo: just toggle premium for 30 days
        const current = await getCurrentUser();
        if (!current) throw new Error('No authenticated user');
        const users = getLocalUsers();
        const idx = users.findIndex(u => u.id === current.id);
        if (idx === -1) throw new Error('Usuario no encontrado (Local).');
        users[idx].isPremium = true;
        users[idx].premiumUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
        saveLocalUsers(users);
        // Also note: support opening Settings to refresh the UI; return current url
        return { url: window.location.href };
    }

    const current = await getCurrentUser();
    if (!current) throw new Error('No authenticated user');
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (current?.id) headers['x-user-id'] = current.id;
    const res = await fetch(`${API_URL}/stripe-create-checkout-session`, { method: 'POST', headers, body: JSON.stringify({}) });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error creating checkout session');
    }
    return await res.json();
};

export const createBillingPortalSession = async () => {
    if (!USE_BACKEND) {
        const current = await getCurrentUser();
        if (!current) throw new Error('No authenticated user');
        // Local demo: just return same page
        return { url: window.location.href };
    }

    const current = await getCurrentUser();
    if (!current) throw new Error('No authenticated user');
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    if (current?.id) headers['x-user-id'] = current.id;
    const res = await fetch(`${API_URL}/stripe-create-portal-session`, { method: 'POST', headers, body: JSON.stringify({}) });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error creating portal session');
    }
    return await res.json();
};

export const uploadAvatar = async (userId: string, base64Image: string): Promise<string> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/upload-avatar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, base64Image })
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Error subiendo avatar');
            }
            
            const data = await res.json();
            return data.url;
        } catch (e) {
            console.error('Error uploading avatar:', e);
            if (ALLOW_LOCAL_FALLBACK) {
                console.warn('Upload failed, using base64 directly');
                return base64Image;
            }
            throw e;
        }
    }
    
    // Sin backend, devolver el base64 directamente
    return base64Image;
};

export const uploadSessionFile = async (file: File, userId: string): Promise<string> => {
    if (USE_BACKEND) {
        try {
            // Convert file to base64
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await fetch(`${API_URL}/upload-session-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId, 
                    base64File: base64,
                    fileName: file.name,
                    fileType: file.type
                })
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Error subiendo archivo');
            }
            
            const data = await res.json();
            return data.url;
        } catch (e) {
            console.error('Error uploading session file:', e);
            throw e;
        }
    }
    
    // Sin backend, convertir a base64 y devolver
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};



