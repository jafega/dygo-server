import { JournalEntry, Goal, UserSettings, Invitation, User, PatientSummary, CareRelationship } from '../types';
import * as AuthService from './authService';
import { API_URL, USE_BACKEND, ALLOW_LOCAL_FALLBACK } from './config';

const ENTRIES_KEY = 'ai_diary_entries_v2';
const GOALS_KEY = 'ai_diary_goals_v2';
const SETTINGS_KEY = 'ai_diary_settings_v3';
const INVITATIONS_KEY = 'ai_diary_invitations_v1';
const RELATIONSHIPS_KEY = 'ai_diary_care_relationships_v1';

// Cache para relationships - expira después de 30 segundos
interface RelationshipsCache {
  data: CareRelationship[];
  timestamp: number;
  filter: string; // stringify del filtro usado
}

const relationshipsCache = new Map<string, RelationshipsCache>();
const CACHE_TTL = 30000; // 30 segundos

type RelationshipFilter = {
  psychologistId?: string; // Legacy
  patientId?: string; // Legacy
  psych_user_id?: string;
  patient_user_id?: string;
};

const getLocalRelationships = (): CareRelationship[] => {
  try {
      const stored = localStorage.getItem(RELATIONSHIPS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
      console.warn('Failed to parse local care relationships', err);
      return [];
  }
};

const saveLocalRelationships = (relationships: CareRelationship[]) => {
  localStorage.setItem(RELATIONSHIPS_KEY, JSON.stringify(relationships));
};

const matchesRelationshipFilter = (rel: CareRelationship, filter: RelationshipFilter) => {
  if (!rel) return false;
  
  // Soportar tanto campos nuevos como legacy
  const relPsychId = rel.psych_user_id || rel.psychologistId;
  const relPatId = rel.patient_user_id || rel.patientId;
  const filterPsychId = filter.psych_user_id || filter.psychologistId;
  const filterPatId = filter.patient_user_id || filter.patientId;
  
  if (filterPsychId && relPsychId !== filterPsychId) return false;
  if (filterPatId && relPatId !== filterPatId) return false;
  return true;
};

const fetchRelationships = async (filter: RelationshipFilter, skipCache = false): Promise<CareRelationship[]> => {
  const hasPsych = filter.psych_user_id || filter.psychologistId;
  const hasPat = filter.patient_user_id || filter.patientId;
  
  if (!hasPsych && !hasPat) {
      throw new Error('psych_user_id o patient_user_id requerido');
  }

  // Crear clave de caché basada en el filtro
  const cacheKey = JSON.stringify(filter);
  
  // Verificar caché si no se solicita saltar
  if (!skipCache) {
    const cached = relationshipsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log('[fetchRelationships] Usando datos en caché', { filter, age: Date.now() - cached.timestamp });
      return cached.data;
    }
  }

  if (USE_BACKEND) {
      const params = new URLSearchParams();
      // Preferir nuevos campos sobre legacy
      if (filter.psych_user_id) {
        params.append('psych_user_id', filter.psych_user_id);
      } else if (filter.psychologistId) {
        params.append('psychologistId', filter.psychologistId);
      }
      if (filter.patient_user_id) {
        params.append('patient_user_id', filter.patient_user_id);
      } else if (filter.patientId) {
        params.append('patientId', filter.patientId);
      }
      // Anti-caché: timestamp único en cada petición
      params.append('_t', Date.now().toString());
      
      try {
          const res = await fetch(`${API_URL}/relationships?${params.toString()}`, {
              headers: {
                  'Cache-Control': 'no-cache, no-store, must-revalidate',
                  'Pragma': 'no-cache',
                  'Expires': '0'
              }
          });
          if (!res.ok) {
              let details = '';
              try {
                  const err = await res.json();
                  details = err?.error ? `: ${err.error}` : '';
              } catch (_) {
                  // ignore json errors
              }
              throw new Error(`Error fetching relationships (${res.status})${details}`);
          }
          const data = await res.json();
          
          // Guardar en caché
          relationshipsCache.set(cacheKey, {
            data,
            timestamp: Date.now(),
            filter: cacheKey
          });
          
          return data;
      } catch (err) {
          if (!ALLOW_LOCAL_FALLBACK) {
              console.error('No se puede conectar con el servidor para obtener relaciones. Mostrando lista vacía.', err);
              return [];
          }
          console.warn('Fetch relationships failed, using local fallback', err);
      }
  }

  if (USE_BACKEND && !ALLOW_LOCAL_FALLBACK) {
      console.error('Persistencia local deshabilitada y backend no disponible. Mostrando lista vacía.');
      return [];
  }

  const localData = getLocalRelationships().filter(rel => matchesRelationshipFilter(rel, filter));
  
  // Guardar en caché también los datos locales
  relationshipsCache.set(cacheKey, {
    data: localData,
    timestamp: Date.now(),
    filter: cacheKey
  });
  
  return localData;
};

const ensureLocalRelationship = (psychUserId: string, patientUserId: string): CareRelationship => {
  const relationships = getLocalRelationships();
  const existing = relationships.find(rel => {
    const relPsychId = rel.psych_user_id || rel.psychologistId;
    const relPatId = rel.patient_user_id || rel.patientId;
    return relPsychId === psychUserId && relPatId === patientUserId;
  });
  if (existing) return existing;
  
  const relationship: CareRelationship = { 
    id: crypto.randomUUID(), 
    psych_user_id: psychUserId, 
    patient_user_id: patientUserId, 
    createdAt: Date.now() 
  };
  relationships.push(relationship);
  saveLocalRelationships(relationships);
  return relationship;
};

const removeLocalRelationship = (psychUserId: string, patientUserId: string) => {
  const relationships = getLocalRelationships();
  const filtered = relationships.filter(rel => {
    const relPsychId = rel.psych_user_id || rel.psychologistId;
    const relPatId = rel.patient_user_id || rel.patientId;
    return !(relPsychId === psychUserId && relPatId === patientUserId);
  });
  saveLocalRelationships(filtered);
};

const ensureRelationship = async (psychUserId: string, patientUserId: string): Promise<CareRelationship> => {
  if (!psychUserId || !patientUserId) {
      throw new Error('psych_user_id y patient_user_id son obligatorios');
  }
  if (USE_BACKEND) {
      try {
          console.log('[ensureRelationship]', { psychUserId, patientUserId });
          const res = await fetch(`${API_URL}/relationships`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                psych_user_id: psychUserId, 
                patient_user_id: patientUserId 
              })
          });
          if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Error creating relationship (${res.status})`);
          }
          
          // Invalidar caché después de crear relación
          relationshipsCache.clear();
          
          return await res.json();
      } catch (err) {
          if (!ALLOW_LOCAL_FALLBACK) {
              throw err instanceof Error ? err : new Error('Error creando relación');
          }
          console.warn('Create relationship failed, saving locally', err);
      }
  }

  if (USE_BACKEND && !ALLOW_LOCAL_FALLBACK) {
      throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
  }

  // Invalidar caché local también
  relationshipsCache.clear();
  
  return ensureLocalRelationship(psychUserId, patientUserId);
};

const removeRelationship = async (psychUserId: string, patientUserId: string): Promise<void> => {
  if (!psychUserId || !patientUserId) {
      throw new Error('psych_user_id y patient_user_id son obligatorios para eliminar relación');
  }
  if (USE_BACKEND) {
      console.log('[removeRelationship]', { psychUserId, patientUserId });
      const params = new URLSearchParams({ 
        psych_user_id: psychUserId, 
        patient_user_id: patientUserId 
      });
      try {
          const res = await fetch(`${API_URL}/relationships?${params.toString()}`, { method: 'DELETE' });
          if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Error removing relationship (${res.status})`);
          }
          
          // Invalidar caché después de eliminar relación
          relationshipsCache.clear();
          
          return;
      } catch (err) {
          if (!ALLOW_LOCAL_FALLBACK) {
              throw err instanceof Error ? err : new Error('Error eliminando relación');
          }
          console.warn('Delete relationship failed, removing locally', err);
      }
  }

  if (USE_BACKEND && !ALLOW_LOCAL_FALLBACK) {
      throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
  }

  // Invalidar caché local también
  relationshipsCache.clear();
  
  removeLocalRelationship(psychUserId, patientUserId);
};

const relationshipExists = async (psychUserId: string, patientUserId: string): Promise<boolean> => {
  const rels = await fetchRelationships({ psych_user_id: psychUserId, patient_user_id: patientUserId });
  return rels.length > 0;
};

// --- Entries ---
export interface GetEntriesOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  limit?: number;     // Máximo número de entradas a retornar
}

export const getEntriesForUser = async (
  userId: string, 
  viewerId?: string, 
  options?: GetEntriesOptions
): Promise<JournalEntry[]> => {
  if (USE_BACKEND) {
      try {
          const params = new URLSearchParams({ userId });
          if (viewerId) params.append('viewerId', viewerId);
          if (options?.startDate) params.append('startDate', options.startDate);
          if (options?.endDate) params.append('endDate', options.endDate);
          if (options?.limit) params.append('limit', String(options.limit));
          
          const url = `${API_URL}/entries?${params.toString()}`;
          const res = await fetch(url);
          if (res.ok) return (await res.json()).sort((a: any, b: any) => b.timestamp - a.timestamp);
          throw new Error(`Server error: ${res.status}`);
      } catch (e) {
                    if (ALLOW_LOCAL_FALLBACK) { console.warn("Backend fail, using local fallback", e); }
                    else throw new Error('No se puede conectar con el servidor. Asegúrate de ejecutar `node server.js`.');
      }
  }
  if (USE_BACKEND) {
      throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
  }
    // Local Fallback (solo si USE_BACKEND es false)
  const stored = localStorage.getItem(ENTRIES_KEY);
  let all: JournalEntry[] = stored ? JSON.parse(stored) : [];
  
  // Aplicar filtros locales
  all = all.filter(e => e.userId === userId);
  
  if (options?.startDate || options?.endDate) {
    all = all.filter(e => {
      if (!e.timestamp && !e.date) return true;
      const entryDate = e.date || new Date(e.timestamp).toISOString().split('T')[0];
      if (options.startDate && entryDate < options.startDate) return false;
      if (options.endDate && entryDate > options.endDate) return false;
      return true;
    });
  }
  
  all = all.sort((a, b) => b.timestamp - a.timestamp);
  
  if (options?.limit && options.limit > 0) {
    all = all.slice(0, options.limit);
  }
  
  return all;
};

export const saveEntry = async (entry: JournalEntry): Promise<void> => {
  if (USE_BACKEND) {
      try {
          // If an ID exists try to update first, otherwise create
          if (entry.id) {
              const res = await fetch(`${API_URL}/entries?id=${entry.id}`, {
                  method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry)
              });
              if (res.ok) return;
          }
          const createRes = await fetch(`${API_URL}/entries`, {
              method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry)
          });
          if (!createRes.ok) throw new Error(`Error creating entry (${createRes.status})`);
          return;
      } catch(e) { if (ALLOW_LOCAL_FALLBACK) { console.warn("Backend fail, saved locally", e); } else { throw e; } }
  }

  if (USE_BACKEND) {
      throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
  }

  const entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
  const idx = entries.findIndex((e: any) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
};

export const updateEntry = async (updatedEntry: JournalEntry): Promise<void> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/entries?id=${updatedEntry.id}`, {
                method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updatedEntry)
            });
            if (!res.ok) throw new Error(`Error updating entry (${res.status})`);
            return;
        } catch (e) {
            if (ALLOW_LOCAL_FALLBACK) { console.warn('Update entry failed, saving locally.', e); }
            else { throw e; }
        }
    }
    await saveEntry(updatedEntry);
};

export const deleteEntry = async (id: string): Promise<void> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/entries?id=${id}`, { method: 'DELETE' });
            if (!res.ok) {
                let details = '';
                try {
                    const data = await res.json();
                    details = data?.error ? `: ${data.error}` : '';
                } catch (_) {
                    // ignore
                }
                throw new Error(`Error deleting entry (${res.status})${details}`);
            }
            return;
        } catch (e) {
            if (ALLOW_LOCAL_FALLBACK) { console.warn('Delete entry failed, removing locally.', e); }
            else { throw e; }
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries.filter((e:any) => e.id !== id)));
};

export const getLastDaysEntries = async (userId: string, days: number): Promise<JournalEntry[]> => {
  const entries = await getEntriesForUser(userId);
  return entries.slice(0, days);
};

// Migrate localStorage data to backend for a user (called at init when backend is available)
export const migrateLocalToBackend = async (userId: string) => {
    if (!USE_BACKEND || !ALLOW_LOCAL_FALLBACK) return;
    try {
        // Entries
        const localEntries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]') as JournalEntry[];
        const userEntries = localEntries.filter(e => String(e.userId) === String(userId));
        for (const e of userEntries) {
            try { await saveEntry(e); } catch (err) { console.warn('Failed to migrate entry', e.id, err); }
        }

        // Goals
        const localGoals = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]') as Goal[];
        const userGoals = localGoals.filter(g => String(g.userId) === String(userId));
        if (userGoals.length > 0) {
            try { await saveUserGoals(userId, userGoals); } catch (err) { console.warn('Failed to migrate goals', err); }
        }

        // Settings
        const allSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (allSettings[userId]) {
            try { await saveSettings(userId, allSettings[userId]); } catch (err) { console.warn('Failed to migrate settings', err); }
        }

        // Invitations
        const localInvs = JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]') as Invitation[];
        const user = await AuthService.getUserById(userId);
        const userEmail = user?.email || '';
        const invsToMigrate = localInvs.filter(i => i.toUserEmail === userEmail);
        for (const inv of invsToMigrate) {
            try { await sendInvitation(inv.fromPsychologistId, inv.fromPsychologistName, inv.toUserEmail); } catch (err) { console.warn('Failed to migrate invitation', inv.id, err); }
        }

        const relationshipsToMigrate = getLocalRelationships().filter(rel => {
            const relPsychId = rel.psych_user_id || rel.psychologistId;
            const relPatId = rel.patient_user_id || rel.patientId;
            return relPatId === userId || relPsychId === userId;
        });
        for (const rel of relationshipsToMigrate) {
            try {
                const psychId = rel.psych_user_id || rel.psychologistId;
                const patId = rel.patient_user_id || rel.patientId;
                await fetch(`${API_URL}/relationships`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ psych_user_id: psychId, patient_user_id: patId })
                });
            } catch (err) {
                const psychId = rel.psych_user_id || rel.psychologistId;
                const patId = rel.patient_user_id || rel.patientId;
                console.warn('Failed to migrate relationship', `${psychId}-${patId}`, err);
            }
        }

        console.log('✅ Local data migration attempted');
    } catch (e) {
        console.error('Error during migration', e);
    }
};

// --- Goals ---
export const getGoalsForUser = async (userId: string): Promise<Goal[]> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/goals?userId=${userId}`);
            if (res.ok) return await res.json();
            throw new Error(`Server error: ${res.status}`);
        } catch(e) {
            if (ALLOW_LOCAL_FALLBACK) { console.warn('Get goals failed, using local fallback', e); }
            else { throw new Error('No se puede conectar con el servidor para obtener goals.'); }
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const all = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
    return all.filter((g:any) => g.userId === userId);
};

export const saveUserGoals = async (userId: string, userGoals: Goal[]) => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/goals-sync`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId, goals: userGoals })
            });
            if (!res.ok) throw new Error(`Error syncing goals (${res.status})`);
            return;
        } catch(e) { if (ALLOW_LOCAL_FALLBACK) { console.warn('Save goals failed, storing locally', e); } else { throw e; } }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const all = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
    const other = all.filter((g:any) => g.userId !== userId);
    localStorage.setItem(GOALS_KEY, JSON.stringify([...other, ...userGoals]));
};

// --- Settings ---
export const getSettings = async (userId: string): Promise<UserSettings> => {
    const defaults: UserSettings = { notificationsEnabled: false, feedbackNotificationsEnabled: true, notificationTime: '20:00', language: 'es-ES', voice: 'Kore' };
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/settings?userId=${userId}`);
            if (res.ok) {
                const data = await res.json();
                return { ...defaults, ...data };
            }
            throw new Error(`Server error: ${res.status}`);
        } catch(e) {
            if (ALLOW_LOCAL_FALLBACK) { console.warn('Fetch settings failed, using local fallback', e); } else { throw new Error('No se puede conectar con el servidor para obtener settings.'); }
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaults, ...(all[userId] || {}) };
};

export const saveSettings = async (userId: string, settings: UserSettings): Promise<void> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/settings?userId=${userId}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings)
            });
            if (!res.ok) throw new Error(`Error saving settings (${res.status})`);
            return;
        } catch(e) { if (ALLOW_LOCAL_FALLBACK) { console.warn('Save settings failed, storing locally', e); } else { throw e; } }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    all[userId] = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
};

// --- Invitations ---
const getInvitations = async (): Promise<Invitation[]> => {
    console.log('🔍 [getInvitations] Iniciando carga de invitaciones...', { USE_BACKEND, API_URL });
    if (USE_BACKEND) {
        try {
            // Agregar timestamp para evitar caché del navegador
            const url = `${API_URL}/invitations?_t=${Date.now()}`;
            console.log('📡 [getInvitations] Fetching:', url);
            const res = await fetch(url, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            console.log('📨 [getInvitations] Response status:', res.status, res.ok);
            if (res.ok) {
                const data = await res.json();
                console.log('✅ [getInvitations] Invitaciones recibidas:', data.length, data);
                return data;
            }
            throw new Error(`Server error: ${res.status}`);
        } catch(e) {
            console.error('❌ [getInvitations] Fetch invitations failed', e);
            if (ALLOW_LOCAL_FALLBACK) { 
                console.warn('⚠️ [getInvitations] Using local fallback');
                return JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]');
            } else { 
                // Devolver array vacío en lugar de lanzar error para evitar bloquear la UI
                console.error('❌ [getInvitations] No se puede conectar con el servidor para obtener invitaciones. Mostrando lista vacía.');
                return [];
            }
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    return JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]');
};

// Nueva función para enviar invitaciones con roles explícitos
export const sendInvitation = async (
    fromUserId: string,
    fromUserEmail: string,
    fromUserName: string,
    toEmail: string,
    role: 'PSYCHOLOGIST' | 'PATIENT' // rol que tendrá el destinatario en la relación
) => {
    const invs = await getInvitations();
    
    // Determinar quién es psicólogo y quién paciente según el rol deseado
    const isPsychologistInvite = role === 'PSYCHOLOGIST'; // Estás invitando a un psicólogo
    const psychUserId = isPsychologistInvite ? '' : fromUserId; // Se llenará con el ID del invitado si es psych
    const psychUserEmail = isPsychologistInvite ? toEmail : fromUserEmail;
    const psychUserName = isPsychologistInvite ? '' : fromUserName; // Se llenará después
    const patientUserEmail = isPsychologistInvite ? fromUserEmail : toEmail;
    const patientUserName = isPsychologistInvite ? fromUserName : '';

    // Verificar si ya existe invitación pendiente con el mismo par psychologist-patient
    const normalizedPsychEmail = psychUserEmail.toLowerCase().trim();
    const normalizedPatientEmail = patientUserEmail.toLowerCase().trim();
    
    const existingInv = invs.find(i => {
        const invPsychEmail = (i.psych_user_email || i.psychologistEmail || '').toLowerCase().trim();
        const invPatientEmail = (i.patient_user_email || i.patientEmail || i.toUserEmail || '').toLowerCase().trim();
        
        return invPsychEmail === normalizedPsychEmail && 
               invPatientEmail === normalizedPatientEmail && 
               i.status === 'PENDING';
    });
    
    if (existingInv) {
        throw new Error("Ya existe una invitación pendiente entre este psicólogo y paciente.");
    }

    // Prevent sending an invitation if relationship already exists
    const existingUser = await AuthService.getUserByEmail(toEmail.trim());
    if (existingUser) {
        try {
            const psychId = isPsychologistInvite ? existingUser.id : fromUserId;
            const patId = isPsychologistInvite ? fromUserId : existingUser.id;
            const alreadyLinked = await relationshipExists(psychId, patId);
            if (alreadyLinked) {
                throw new Error('Relación ya existe.');
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'Relación ya existe.') {
                throw err;
            }
            console.warn('No se pudo verificar si la relación ya existía, continuando con la invitación.', err);
        }
    }

    const newInv: Invitation = {
        id: crypto.randomUUID(),
        psych_user_id: psychUserId || (existingUser && isPsychologistInvite ? existingUser.id : ''),
        psych_user_email: psychUserEmail,
        psych_user_name: psychUserName,
        patient_user_email: patientUserEmail,
        patient_user_name: patientUserName,
        patient_user_id: existingUser && !isPsychologistInvite ? existingUser.id : undefined,
        status: 'PENDING',
        timestamp: Date.now(),
        createdAt: new Date().toISOString(),
        initiatorEmail: fromUserEmail, // Email de quien inició la invitación
        // Campos legacy para compatibilidad
        psychologistId: psychUserId || (existingUser && isPsychologistInvite ? existingUser.id : ''),
        psychologistEmail: psychUserEmail,
        psychologistName: psychUserName,
        patientEmail: patientUserEmail,
        patientName: patientUserName,
        patientId: existingUser && !isPsychologistInvite ? existingUser.id : undefined
    };

    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/invitations`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newInv) });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || `Error creating invitation (${res.status})`);
            }
            return;
        } catch (e) {
            if (ALLOW_LOCAL_FALLBACK) { invs.push(newInv); localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs)); console.warn('Create invitation failed, saved locally', e); return; }
            throw e;
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    invs.push(newInv);
    localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
};

// Obtener invitaciones pendientes donde este email es el PACIENTE
export const getPendingInvitationsForEmail = async (email: string): Promise<Invitation[]> => {
    const invs = await getInvitations();
    const normalizedEmail = email.toLowerCase().trim();
    return invs.filter(i => 
        (i.patientEmail?.toLowerCase().trim() === normalizedEmail || i.toUserEmail?.toLowerCase().trim() === normalizedEmail) && 
        i.status === 'PENDING'
    );
};

// Obtener invitaciones enviadas donde este usuario es el PSICÓLOGO (invitó a pacientes)
export const getSentInvitationsForPsychologist = async (psychId: string, psychEmail?: string): Promise<Invitation[]> => {
    console.log('📋 [getSentInvitationsForPsychologist] Buscando invitaciones enviadas por:', psychId);
    const invs = await getInvitations();
    console.log('📊 [getSentInvitationsForPsychologist] Total invitaciones:', invs.length);
    const normalizedEmail = psychEmail?.toLowerCase().trim();
    const filtered = invs.filter(i => {
        const iPsychId = i.psych_user_id || i.psychologistId || i.fromPsychologistId;
        const iPsychEmail = i.psych_user_email || i.psychologistEmail;
        return (iPsychId === psychId || 
         (normalizedEmail && iPsychEmail?.toLowerCase().trim() === normalizedEmail)) && 
        i.status === 'PENDING';
    });
    console.log('✅ [getSentInvitationsForPsychologist] Invitaciones PENDING de este psicólogo:', filtered.length, filtered);
    return filtered;
};

// Obtener invitaciones donde solicitan a este email como PSICÓLOGO (para aprobar)
export const getPendingPsychologistInvitationsForEmail = async (email: string): Promise<Invitation[]> => {
    console.log('📋 [getPendingPsychologistInvitationsForEmail] Buscando solicitudes para:', email);
    const invs = await getInvitations();
    const normalizedEmail = email.toLowerCase().trim();
    const filtered = invs.filter(i => {
        const iPsychEmail = i.psych_user_email || i.psychologistEmail;
        const iInitiatorEmail = i.initiatorEmail;
        return iPsychEmail?.toLowerCase().trim() === normalizedEmail && 
        i.status === 'PENDING' &&
        iInitiatorEmail?.toLowerCase().trim() !== normalizedEmail; // Excluir las que el psicólogo inició
    });
    console.log('✅ [getPendingPsychologistInvitationsForEmail] Solicitudes PENDING iniciadas por pacientes:', filtered.length, filtered);
    return filtered;
};

export const acceptInvitation = async (invitationId: string, userId: string) => {
    let invs = await getInvitations();
    const inv = invs.find(i => i.id === invitationId);
    if (!inv) {
        console.error('Invitation not found:', invitationId);
        throw new Error('Invitación no encontrada');
    }

    // Primero crear la relación de cuidado
    try {
        const psychId = inv.psych_user_id || inv.psychologistId;
        if (!psychId) {
            throw new Error('No se encontró el ID del psicólogo en la invitación');
        }
        await ensureRelationship(psychId, userId);
        console.log('✅ Relación de cuidado creada exitosamente');
    } catch (e) {
        console.error('Error creating care relationship:', e);
        throw new Error('No se pudo crear la relación de cuidado');
    }

    // Después eliminar la invitación ya que la relación está creada
    if (USE_BACKEND) {
        try {
            console.log('🗑️ Eliminando invitación aceptada:', inv.id);
            const res = await fetch(`${API_URL}/invitations?id=${inv.id}`, { 
                method: 'DELETE',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('Error eliminando invitación:', res.status, errorText);
                // No lanzar error, la relación ya está creada
            } else {
                console.log('✅ Invitación eliminada después de aceptar');
            }
        } catch (e) {
            console.error('Error in delete invitation after accept:', e);
            // No lanzar error, la relación ya está creada
        }
    } else {
        // Eliminar de localStorage
        const filteredInvs = invs.filter(i => i.id !== invitationId);
        localStorage.setItem(INVITATIONS_KEY, JSON.stringify(filteredInvs));
    }
};

export const rejectInvitation = async (invitationId: string) => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/invitations?id=${invitationId}`, { 
                method: 'DELETE',
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            if (!res.ok) throw new Error(`Error rejecting invitation (${res.status})`);
            console.log('✅ Invitación revocada exitosamente:', invitationId);
            return;
        } catch (e) { 
            console.error('❌ Error al revocar invitación:', e);
            if (ALLOW_LOCAL_FALLBACK) { 
                const invs = (await getInvitations()).filter(i => i.id !== invitationId); 
                localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs)); 
                console.warn('Reject invitation failed, updated locally', e); 
                return; 
            } else { 
                throw e; 
            } 
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const invs = (await getInvitations()).filter(i => i.id !== invitationId);
    localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
};

export const linkPatientToPsychologist = async (patientUserId: string, psychUserId: string) => {
     // Nota: patientUserId/psychUserId se refieren a la posición en esta relación específica,
     // no al rol general del usuario. Un psicólogo puede ser paciente de otro.
     await ensureRelationship(psychUserId, patientUserId);
};

export const revokeAccess = async (patientUserId: string, psychUserId: string) => {
    // Nota: patientUserId/psychUserId se refieren a la posición en esta relación específica,
    // no al rol general del usuario. Un psicólogo puede ser paciente de otro.
    await removeRelationship(psychUserId, patientUserId);
};

export const endRelationship = async (psychUserId: string, patientUserId: string) => {
    // Finalizar relación (marcar con endedAt) en lugar de eliminarla
    if (!USE_BACKEND) {
        throw new Error('La finalización de relaciones solo está disponible con backend');
    }
    
    try {
        const res = await fetch(`${API_URL}/relationships/end`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            body: JSON.stringify({ 
              psych_user_id: psychUserId, 
              patient_user_id: patientUserId 
            })
        });
        
        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || `Error finalizando relación (${res.status})`);
        }
        
        const relationship = await res.json();
        console.log('✅ Relación finalizada exitosamente:', relationship);
        return relationship;
    } catch (e) {
        console.error('❌ Error al finalizar relación:', e);
        throw e;
    }
};

export const getPatientsForPsychologist = async (psychId: string): Promise<PatientSummary[]> => {
    try {
        console.log('[getPatientsForPsychologist] Iniciando con psychId:', psychId);
        
        // Cargar usuarios y relaciones primero
        const [psych, relationships, allUsers] = await Promise.all([
            AuthService.getUserById(psychId),
            fetchRelationships({ psych_user_id: psychId }),
            AuthService.getUsers()
        ]);
        
        console.log('[getPatientsForPsychologist] Datos cargados:', {
            psych: psych?.email,
            relationshipsCount: relationships.length,
            relationships: relationships,
            allUsersCount: allUsers.length
        });
        
        if (!psych) {
            console.log('[getPatientsForPsychologist] No se encontró el psicólogo');
            return [];
        }

        const patientsData: PatientSummary[] = [];
        
        // Crear índice de usuarios para búsqueda rápida
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        
        // Obtener IDs únicos de pacientes
        const patientIds = relationships
            .map(rel => rel.patient_user_id || rel.patientId)
            .filter((id): id is string => Boolean(id));
        const uniquePatientIds = Array.from(new Set(patientIds));
        
        console.log('[getPatientsForPsychologist] Patient IDs encontrados:', uniquePatientIds);
        
        // Agregar el ID del psicólogo para cargar sus propias entradas
        const userIdsToLoad = [psychId, ...uniquePatientIds];
        
        // Cargar entradas de todos los usuarios relevantes en paralelo
        const entriesArrays = await Promise.all(
            userIdsToLoad.map(userId => getEntriesForUser(userId, psychId).catch(() => []))
        );
        
        // Crear índice de entradas por usuario (ya vienen ordenadas de getEntriesForUser)
        const entriesByUser = new Map<string, any[]>();
        entriesArrays.forEach((entries, index) => {
            const userId = userIdsToLoad[index];
            entriesByUser.set(userId, entries);
        });


        const processUser = (user: User, isSelf: boolean = false): PatientSummary => {
            const userEntries = entriesByUser.get(user.id) || [];
            const lastEntry = userEntries[0];
            
            const last7 = userEntries.slice(0, 7);
            const avgSentiment = last7.length > 0 
                ? (last7.reduce((acc, curr) => acc + curr.sentimentScore, 0) / last7.length)
                : 0;

            return {
                id: user.id,
                name: isSelf ? `${user.name} (Tú)` : user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                lastUpdate: lastEntry ? lastEntry.date : 'Sin datos',
                averageSentiment: parseFloat(avgSentiment.toFixed(1)),
                recentSummary: lastEntry ? lastEntry.summary : 'No hay registros recientes.',
                riskLevel: avgSentiment < 4 ? 'HIGH' : avgSentiment < 6 ? 'MEDIUM' : 'LOW',
                isSelf: isSelf
            } as PatientSummary;
        };
        
        // Procesar pacientes usando el mapa (sin llamadas adicionales al servidor)
        uniquePatientIds.forEach(pid => {
            const patient = userMap.get(pid);
            console.log('[getPatientsForPsychologist] Procesando paciente:', pid, 'encontrado:', !!patient);
            if (patient) {
                patientsData.push(processUser(patient));
            }
        });

        // Agregar el psicólogo al principio
        patientsData.unshift(processUser(psych, true));

        console.log('[getPatientsForPsychologist] Total pacientes devueltos:', patientsData.length);
        return patientsData;
    } catch (error) {
        console.error('[getPatientsForPsychologist] Error:', error);
        return [];
    }
};

export const getPsychologistsForPatient = async (patientId: string): Promise<User[]> => {
    const relationships = await fetchRelationships({ patient_user_id: patientId });
    if (relationships.length === 0) return [];

    const psychIds = Array.from(new Set(
        relationships
            .map(rel => rel.psych_user_id || rel.psychologistId)
            .filter((id): id is string => Boolean(id))
    ));
    const psychs = await Promise.all(psychIds.map(id => AuthService.getUserById(id)));
    return psychs.filter((u): u is User => Boolean(u));
};

export const getAllPsychologists = async (currentUserId?: string): Promise<User[]> => {
    const users = await AuthService.getUsers();
    
    // Filtrar por is_psychologist === true
    let psychologists = users.filter(u => u.is_psychologist === true || u.isPsychologist === true);
    
    // Si se proporciona currentUserId, excluir psicólogos con los que ya tiene relación
    if (currentUserId) {
        const relationships = await fetchRelationships({ patient_user_id: currentUserId });
        const connectedPsychIds = new Set(
            relationships
                .map(rel => rel.psych_user_id || rel.psychologistId)
                .filter((id): id is string => Boolean(id))
        );
        
        // También excluir al mismo usuario
        psychologists = psychologists.filter(p => 
            p.id !== currentUserId && !connectedPsychIds.has(p.id)
        );
    }
    
    return psychologists;
};

export const hasCareRelationship = async (psychologistId: string, patientId: string): Promise<boolean> => {
    return relationshipExists(psychologistId, patientId);
};