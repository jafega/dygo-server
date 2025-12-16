import { JournalEntry, Goal, UserSettings, Invitation, User, PatientSummary } from '../types';
import * as AuthService from './authService';
import { API_URL, USE_BACKEND } from './config';

const ENTRIES_KEY = 'ai_diary_entries_v2';
const GOALS_KEY = 'ai_diary_goals_v2';
const SETTINGS_KEY = 'ai_diary_settings_v3';
const INVITATIONS_KEY = 'ai_diary_invitations_v1';

// --- Entries ---
export const getEntriesForUser = async (userId: string): Promise<JournalEntry[]> => {
  if (USE_BACKEND) {
      try {
          const res = await fetch(`${API_URL}/entries?userId=${userId}`);
          if (res.ok) return (await res.json()).sort((a: any, b: any) => b.timestamp - a.timestamp);
      } catch (e) { console.warn("Backend fail", e); }
  }
  // Local Fallback
  const stored = localStorage.getItem(ENTRIES_KEY);
  const all: JournalEntry[] = stored ? JSON.parse(stored) : [];
  return all.filter(e => e.userId === userId).sort((a, b) => b.timestamp - a.timestamp);
};

export const saveEntry = async (entry: JournalEntry): Promise<void> => {
  if (USE_BACKEND) {
      try {
          // Check if exists (PUT) or new (POST)
          // Simplified: Always POST for new, PUT for update. 
          // We assume the ID check happens in caller or we try one then other. 
          // Actually, let's just assume POST is create. But to be safe, we check local logic:
          // Ideally the API handles upsert, but here we explicitly separate.
          // For simplicity in this demo, we'll try to UPDATE, if 404 then CREATE? No.
          // Let's just use POST for everything in a 'sync' style or check ID.
          // Better: We implement updateEntry separately.
          await fetch(`${API_URL}/entries`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify(entry)
          });
          return;
      } catch(e) { console.warn("Backend fail", e); }
  }

  const entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
  const idx = entries.findIndex((e: any) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
};

export const updateEntry = async (updatedEntry: JournalEntry): Promise<void> => {
    if (USE_BACKEND) {
        await fetch(`${API_URL}/entries/${updatedEntry.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updatedEntry)
        });
        return;
    }
    await saveEntry(updatedEntry);
};

export const deleteEntry = async (id: string): Promise<void> => {
    if (USE_BACKEND) {
        await fetch(`${API_URL}/entries/${id}`, { method: 'DELETE' });
        return;
    }
    const entries = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries.filter((e:any) => e.id !== id)));
};

export const getLastDaysEntries = async (userId: string, days: number): Promise<JournalEntry[]> => {
  const entries = await getEntriesForUser(userId);
  return entries.slice(0, days);
};

// --- Goals ---
export const getGoalsForUser = async (userId: string): Promise<Goal[]> => {
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/goals?userId=${userId}`);
            if (res.ok) return await res.json();
        } catch(e) {}
    }
    const all = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
    return all.filter((g:any) => g.userId === userId);
};

export const saveUserGoals = async (userId: string, userGoals: Goal[]) => {
    if (USE_BACKEND) {
        try {
            await fetch(`${API_URL}/goals/sync`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId, goals: userGoals })
            });
            return;
        } catch(e) {}
    }
    const all = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
    const other = all.filter((g:any) => g.userId !== userId);
    localStorage.setItem(GOALS_KEY, JSON.stringify([...other, ...userGoals]));
};

// --- Settings ---
export const getSettings = async (userId: string): Promise<UserSettings> => {
    const defaults: UserSettings = { notificationsEnabled: false, notificationTime: '20:00', language: 'es-ES', voice: 'Kore' };
    if (USE_BACKEND) {
        try {
            const res = await fetch(`${API_URL}/settings/${userId}`);
            if (res.ok) {
                const data = await res.json();
                return { ...defaults, ...data };
            }
        } catch(e) {}
    }
    const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaults, ...(all[userId] || {}) };
};

export const saveSettings = async (userId: string, settings: UserSettings): Promise<void> => {
    if (USE_BACKEND) {
        await fetch(`${API_URL}/settings/${userId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(settings)
        });
        return;
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
        } catch(e) {}
    }
    return JSON.parse(localStorage.getItem(INVITATIONS_KEY) || '[]');
};

export const sendInvitation = async (fromPsychId: string, fromName: string, toEmail: string) => {
    const invs = await getInvitations();
    if (invs.find(i => i.fromPsychologistId === fromPsychId && i.toUserEmail === toEmail && i.status === 'PENDING')) {
        throw new Error("Invitación ya pendiente.");
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
        await fetch(`${API_URL}/invitations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newInv)
        });
        return;
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
    if (!inv) return;

    if (USE_BACKEND) {
        inv.status = 'ACCEPTED';
        await fetch(`${API_URL}/invitations/${inv.id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(inv)
        });
    } else {
        inv.status = 'ACCEPTED';
        localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
    }

    const patient = await AuthService.getUserById(userId);
    const psych = await AuthService.getUserById(inv.fromPsychologistId);

    if (patient && psych) {
        if (!patient.accessList.includes(psych.id)) {
            patient.accessList.push(psych.id);
            await AuthService.updateUser(patient);
        }
        if (!psych.accessList.includes(patient.id)) {
            psych.accessList.push(patient.id);
            await AuthService.updateUser(psych);
        }
    }
};

export const rejectInvitation = async (invitationId: string) => {
    if (USE_BACKEND) {
        await fetch(`${API_URL}/invitations/${invitationId}`, { method: 'DELETE' });
        return;
    }
    const invs = (await getInvitations()).filter(i => i.id !== invitationId);
    localStorage.setItem(INVITATIONS_KEY, JSON.stringify(invs));
};

export const linkPatientToPsychologist = async (patientId: string, psychId: string) => {
     const patient = await AuthService.getUserById(patientId);
     const psych = await AuthService.getUserById(psychId);

     if (patient && psych) {
         if (!patient.accessList.includes(psych.id)) {
             patient.accessList.push(psych.id);
             await AuthService.updateUser(patient);
         }
         if (!psych.accessList.includes(patient.id)) {
             psych.accessList.push(patient.id);
             await AuthService.updateUser(psych);
         }
     }
};

export const revokeAccess = async (patientId: string, psychId: string) => {
    const patient = await AuthService.getUserById(patientId);
    const psych = await AuthService.getUserById(psychId);

    if (patient) {
        patient.accessList = patient.accessList.filter(id => id !== psychId);
        await AuthService.updateUser(patient);
    }
    if (psych) {
        psych.accessList = psych.accessList.filter(id => id !== patientId);
        await AuthService.updateUser(psych);
    }
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

    // Parallel processing for speed
    const patientPromises = psych.accessList.map(async (pid) => {
        const p = await AuthService.getUserById(pid);
        if (p) return await processUser(p);
        return null;
    });

    const results = await Promise.all(patientPromises);
    results.forEach(r => { if(r) patientsData.push(r); });

    patientsData.unshift(await processUser(psych, true));

    return patientsData;
};

export const getPsychologistsForPatient = async (patientId: string): Promise<User[]> => {
    const patient = await AuthService.getUserById(patientId);
    if (!patient) return [];
    
    const psychs = [];
    for (const id of patient.accessList) {
        const u = await AuthService.getUserById(id);
        if (u) psychs.push(u);
    }
    return psychs;
};

export const getAllPsychologists = async (): Promise<User[]> => {
    const users = await AuthService.getUsers();
    return users.filter(u => u.role && u.role.trim().toUpperCase() === 'PSYCHOLOGIST');
};