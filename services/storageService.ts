import { JournalEntry, Goal, UserSettings, Invitation, User, PatientSummary, CareRelationship } from '../types';
import * as AuthService from './authService';
import { API_URL, USE_BACKEND, ALLOW_LOCAL_FALLBACK } from './config';

const ENTRIES_KEY = 'ai_diary_entries_v2';
const GOALS_KEY = 'ai_diary_goals_v2';
const SETTINGS_KEY = 'ai_diary_settings_v3';
const INVITATIONS_KEY = 'ai_diary_invitations_v1';
const RELATIONSHIPS_KEY = 'ai_diary_care_relationships_v1';

type RelationshipFilter = {
  psychologistId?: string;
  patientId?: string;
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
  if (filter.psychologistId && rel.psychologistId !== filter.psychologistId) return false;
  if (filter.patientId && rel.patientId !== filter.patientId) return false;
  return true;
};

const fetchRelationships = async (filter: RelationshipFilter): Promise<CareRelationship[]> => {
  if (!filter.psychologistId && !filter.patientId) {
      throw new Error('psychologistId o patientId requerido');
  }

  if (USE_BACKEND) {
      const params = new URLSearchParams();
      if (filter.psychologistId) params.append('psychologistId', filter.psychologistId);
      if (filter.patientId) params.append('patientId', filter.patientId);
      try {
          const res = await fetch(`${API_URL}/relationships?${params.toString()}`);
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
          return await res.json();
      } catch (err) {
          if (!ALLOW_LOCAL_FALLBACK) {
              throw err instanceof Error ? err : new Error('Error obteniendo relaciones');
          }
          console.warn('Fetch relationships failed, using local fallback', err);
      }
  }

  if (USE_BACKEND && !ALLOW_LOCAL_FALLBACK) {
      throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
  }

  return getLocalRelationships().filter(rel => matchesRelationshipFilter(rel, filter));
};

const ensureLocalRelationship = (psychologistId: string, patientId: string): CareRelationship => {
  const relationships = getLocalRelationships();
  const existing = relationships.find(rel => rel.psychologistId === psychologistId && rel.patientId === patientId);
  if (existing) return existing;
  const relationship: CareRelationship = { id: crypto.randomUUID(), psychologistId, patientId, createdAt: Date.now() };
  relationships.push(relationship);
  saveLocalRelationships(relationships);
  return relationship;
};

const removeLocalRelationship = (psychologistId: string, patientId: string) => {
  const relationships = getLocalRelationships();
  const filtered = relationships.filter(rel => !(rel.psychologistId === psychologistId && rel.patientId === patientId));
  saveLocalRelationships(filtered);
};

const ensureRelationship = async (psychologistId: string, patientId: string): Promise<CareRelationship> => {
  if (USE_BACKEND) {
      try {
          const res = await fetch(`${API_URL}/relationships`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ psychologistId, patientId })
          });
          if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Error creating relationship (${res.status})`);
          }
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

  return ensureLocalRelationship(psychologistId, patientId);
};

const removeRelationship = async (psychologistId: string, patientId: string): Promise<void> => {
  if (USE_BACKEND) {
      const params = new URLSearchParams({ psychologistId, patientId });
      try {
          const res = await fetch(`${API_URL}/relationships?${params.toString()}`, { method: 'DELETE' });
          if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || `Error removing relationship (${res.status})`);
          }
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

  removeLocalRelationship(psychologistId, patientId);
};

const relationshipExists = async (psychologistId: string, patientId: string): Promise<boolean> => {
  const rels = await fetchRelationships({ psychologistId, patientId });
  return rels.length > 0;
};

// --- Entries ---
export const getEntriesForUser = async (userId: string): Promise<JournalEntry[]> => {
  if (USE_BACKEND) {
      try {
          const res = await fetch(`${API_URL}/entries?userId=${userId}`);
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
  const all: JournalEntry[] = stored ? JSON.parse(stored) : [];
  return all.filter(e => e.userId === userId).sort((a, b) => b.timestamp - a.timestamp);
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

        const relationshipsToMigrate = getLocalRelationships().filter(rel => rel.patientId === userId || rel.psychologistId === userId);
        for (const rel of relationshipsToMigrate) {
            try {
                await fetch(`${API_URL}/relationships`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ psychologistId: rel.psychologistId, patientId: rel.patientId })
                });
            } catch (err) {
                console.warn('Failed to migrate relationship', `${rel.psychologistId}-${rel.patientId}`, err);
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
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/invitations`);
            if (res.ok) return await res.json();
            throw new Error(`Server error: ${res.status}`);
        } catch(e) {
            if (ALLOW_LOCAL_FALLBACK) { console.warn('Fetch invitations failed, using local fallback', e); } else { throw new Error('No se puede conectar con el servidor para obtener invitaciones.'); }
        }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    return JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]');
};

export const sendInvitation = async (fromPsychId: string, fromName: string, toEmail: string) => {
    const invs = await getInvitations();
    if (invs.find(i => i.fromPsychologistId === fromPsychId && i.toUserEmail === toEmail && i.status === 'PENDING')) {
        throw new Error("Invitación ya pendiente.");
    }

    // Prevent sending an invitation if the patient is already linked to this psychologist
    const existingUser = await AuthService.getUserByEmail(toEmail.trim());
    if (existingUser) {
        try {
            const alreadyLinked = await relationshipExists(fromPsychId, existingUser.id);
            if (alreadyLinked) {
                throw new Error('Paciente ya agregado.');
            }
        } catch (err) {
            if (err instanceof Error && err.message === 'Paciente ya agregado.') {
                throw err;
            }
            console.warn('No se pudo verificar si la relación ya existía, continuando con la invitación.', err);
        }
    }

    const newInv: Invitation = {
        id: crypto.randomUUID(),
        fromPsychologistId: fromPsychId,
        fromPsychologistName: fromName,
        toUserEmail: toEmail,
        status: 'PENDING',
        timestamp: Date.now()
    };

    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/invitations`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(newInv) });
            if (!res.ok) throw new Error(`Error creating invitation (${res.status})`);
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

export const getPendingInvitationsForEmail = async (email: string): Promise<Invitation[]> => {
    const invs = await getInvitations();
    return invs.filter(i => i.toUserEmail === email && i.status === 'PENDING');
};

export const getSentInvitationsForPsychologist = async (psychId: string): Promise<Invitation[]> => {
    const invs = await getInvitations();
    return invs.filter(i => i.fromPsychologistId === psychId && i.status === 'PENDING');
};

export const acceptInvitation = async (invitationId: string, userId: string) => {
    let invs = await getInvitations();
    const inv = invs.find(i => i.id === invitationId);
    if (!inv) {
        console.error('Invitation not found:', invitationId);
        throw new Error('Invitación no encontrada');
    }

    if (USE_BACKEND) {
        inv.status = 'ACCEPTED';
        try {
            console.log('Accepting invitation:', inv);
            const res = await fetch(`${API_URL}/invitations?id=${inv.id}`, { 
                method: 'PUT', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify(inv) 
            });
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('Error response:', res.status, errorText);
                throw new Error(`Error accepting invitation (${res.status}): ${errorText}`);
            }
            
            console.log('Invitation accepted successfully');
        } catch (e) {
            console.error('Error in acceptInvitation backend call:', e);
            if (ALLOW_LOCAL_FALLBACK) { 
                inv.status = 'ACCEPTED'; 
                localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs)); 
                console.warn('Accept invitation failed, saved locally', e); 
            } else { 
                throw new Error(`No se pudo aceptar la invitación: ${e instanceof Error ? e.message : 'Error desconocido'}`);
            }
        }
    } else {
        inv.status = 'ACCEPTED';
        localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
    }

    try {
        await ensureRelationship(inv.fromPsychologistId, userId);
    } catch (e) {
        console.error('Error creating care relationship:', e);
        throw new Error('La invitación fue aceptada pero hubo un error creando la relación de cuidado');
    }
};

export const rejectInvitation = async (invitationId: string) => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/invitations?id=${invitationId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`Error rejecting invitation (${res.status})`);
            return;
        } catch (e) { if (ALLOW_LOCAL_FALLBACK) { const invs = (await getInvitations()).filter(i => i.id !== invitationId); localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs)); console.warn('Reject invitation failed, updated locally', e); return; } else { throw e; } }
    }
    if (USE_BACKEND) {
        throw new Error('Persistencia local deshabilitada. El backend debe estar disponible.');
    }
    const invs = (await getInvitations()).filter(i => i.id !== invitationId);
    localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
};

export const linkPatientToPsychologist = async (patientId: string, psychId: string) => {
     await ensureRelationship(psychId, patientId);
};

export const revokeAccess = async (patientId: string, psychId: string) => {
    await removeRelationship(psychId, patientId);
};

export const getPatientsForPsychologist = async (psychId: string): Promise<PatientSummary[]> => {
    const psych = await AuthService.getUserById(psychId);
    if (!psych) return [];

    const patientsData: PatientSummary[] = [];

    const processUser = async (user: User, isSelf: boolean = false) => {
        const entries = await getEntriesForUser(user.id);
        const lastEntry = entries[0];
        
        const last7 = entries.slice(0, 7);
        const avgSentiment = last7.length > 0 
            ? (last7.reduce((acc, curr) => acc + curr.sentimentScore, 0) / last7.length)
            : 0;

        return {
            id: user.id,
            name: isSelf ? `${user.name} (Tú)` : user.name,
            email: user.email,
            lastUpdate: lastEntry ? lastEntry.date : 'Sin datos',
            averageSentiment: parseFloat(avgSentiment.toFixed(1)),
            recentSummary: lastEntry ? lastEntry.summary : 'No hay registros recientes.',
            riskLevel: avgSentiment < 4 ? 'HIGH' : avgSentiment < 6 ? 'MEDIUM' : 'LOW',
            isSelf: isSelf
        } as PatientSummary;
    };

    const relationships = await fetchRelationships({ psychologistId: psychId });
    const patientIds = relationships
        .map(rel => rel.patientId)
        .filter((id): id is string => Boolean(id));
    const uniquePatientIds = Array.from(new Set(patientIds));

    const patientPromises = uniquePatientIds.map(async (pid) => {
        const p = await AuthService.getUserById(pid);
        if (p) return await processUser(p);
        return null;
    });

    const results = await Promise.all(patientPromises);
    results.forEach(r => { if (r) patientsData.push(r); });

    patientsData.unshift(await processUser(psych, true));

    return patientsData;
};

export const getPsychologistsForPatient = async (patientId: string): Promise<User[]> => {
    const relationships = await fetchRelationships({ patientId });
    if (relationships.length === 0) return [];

    const psychIds = Array.from(new Set(
        relationships
            .map(rel => rel.psychologistId)
            .filter((id): id is string => Boolean(id))
    ));
    const psychs = await Promise.all(psychIds.map(id => AuthService.getUserById(id)));
    return psychs.filter((u): u is User => Boolean(u));
};

export const getAllPsychologists = async (): Promise<User[]> => {
    const users = await AuthService.getUsers();
    return users.filter(u => u.role && u.role.trim().toUpperCase() === 'PSYCHOLOGIST');
};

export const hasCareRelationship = async (psychologistId: string, patientId: string): Promise<boolean> => {
    return relationshipExists(psychologistId, patientId);
};