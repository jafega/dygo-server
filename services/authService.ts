import { User } from '../types';
import { API_URL, USE_BACKEND } from './config';

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
    } catch (e) {
      console.warn("Backend offline, falling back to local.");
    }
  }
  return getLocalUsers();
};

export const initializeDemoData = async () => {
    const users = await getUsers();
    const hasPsych = users.some(u => u.role === 'PSYCHOLOGIST');
    
    if (!hasPsych && !USE_BACKEND) {
        const demoPsychs: User[] = [
            { id: 'psych-demo-1', name: 'Dra. Elena Foster', email: 'elena@dygo.health', password: '123', role: 'PSYCHOLOGIST', accessList: [] },
            { id: 'psych-demo-2', name: 'Dr. Marc Spector', email: 'marc@dygo.health', password: '123', role: 'PSYCHOLOGIST', accessList: [] }
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
          if (e instanceof Error && (e.message.includes('Failed to fetch') || e.message.includes('NetworkError'))) {
             throw new Error("No se puede conectar con el servidor. ¿Has ejecutado 'node server.js'?");
          }
          throw e;
      }
  }

  // Local Fallback
  const users = getLocalUsers();
  if (users.find(u => u.email === normalizedEmail)) throw new Error("El email ya está registrado (Local).");
  
  const newUser: User = {
    id: crypto.randomUUID(),
    name, email: normalizedEmail, password, role: normalizedRole, accessList: []
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

// Sign in / Sign up with Google using an ID token from Google Identity Services
export const signInWithGoogle = async (idToken: string): Promise<User> => {
    if (USE_BACKEND) {
        const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error signing in with Google');
        }
        const user = await res.json();
        localStorage.setItem(CURRENT_USER_KEY, user.id);
        return user;
    }

    throw new Error('Google Sign-in is only supported when USE_BACKEND is true');
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
          const res = await fetch(`${API_URL}/users/${id}`);
          if (res.ok) return await res.json();
      } catch(e) { console.warn("Fetch error", e); }
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
            await fetch(`${API_URL}/users/${updatedUser.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });
            return;
        } catch (e) { console.error(e); }
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
        const res = await fetch(`${API_URL}/auth/reset-password-demo`, {
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



