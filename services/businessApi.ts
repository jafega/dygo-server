// API de los paneles de mainds business (agenda, pacientes, historia,
// facturación…). Va en un módulo aparte de businessService.ts para que solo lo
// descarguen los paneles de la clínica (carga diferida) y no el bundle de Pro.

import { call, orgApi, type OrgMember } from './businessService';

export * from './businessService';

// ── Fase 2: sedes, salas, pacientes, agenda, historia clínica ──────────────
export interface OrgRoom { id: string; name: string; active: boolean; location_id: string; hourly_rate?: number | null }
export interface OrgLocation { id: string; name: string; address: string | null; active: boolean; rooms: OrgRoom[] }

export type PatientStatus = 'active' | 'discharged' | 'archived';
export interface OrgPatient {
  id: string;
  first_name: string;
  last_name: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  tax_id: string | null;
  address: string | null;
  admin_notes: string | null;
  status: PatientStatus;
  acquisition_source: 'own' | 'clinic_lead' | 'referral' | 'other';
  assigned_member_ids: string[];
  assigned_members: { id: string; name: string | null }[];
  created_at: string;
}

export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export interface OrgAppointment {
  id: string;
  member_id: string;
  room_id: string | null;
  location_id: string | null;
  starts_at: string;
  ends_at: string;
  busy?: boolean;
  patient_id?: string | null;
  patient_name?: string | null;
  status?: AppointmentStatus;
  service_type?: string;
  modality?: 'in_person' | 'online';
  price?: number | null;
  invoice_id?: string | null;
  admin_notes?: string | null;
}

export interface ClinicalNote {
  id: string;
  author_member_id: string;
  author_name: string | null;
  appointment_id: string | null;
  visibility: 'clinical_record' | 'private_annotation';
  content: string | null;
  unreadable: boolean;
  amends_note_id: string | null;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConsentTemplate { id: string; name: string; content: string; version: number; active: boolean }
export interface PatientConsent {
  id: string; template_name: string; template_version: number; method: 'papel_firmado' | 'aceptacion_presencial';
  signed_at: string; content_sha256: string; content_snapshot: string;
}
export interface AuditEntry {
  id: string; at: string; action: string; actor_user_id: string; actor_name: string | null;
  resource_type: string | null; resource_id: string | null; patient_id: string | null; justification: string | null;
}
export interface BusyBlock { starts_at: string; ends_at: string; source: 'org' | 'personal'; org_id: string | null; org_name: string | null }

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  session: 'Sesión', first_visit: 'Primera visita', couple: 'Pareja', family: 'Familia',
  group: 'Grupo', evaluation: 'Evaluación', other: 'Otro'
};
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Programada', completed: 'Realizada', cancelled: 'Cancelada', no_show: 'No se presentó'
};
export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Activo', discharged: 'Alta', archived: 'Archivado'
};

export const listLocations = (orgId: string) => orgApi<{ locations: OrgLocation[] }>('GET', orgId, '/locations');
export const createLocation = (orgId: string, body: { name: string; address?: string }) => orgApi<{ location: OrgLocation }>('POST', orgId, '/locations', body);
export const updateLocation = (orgId: string, id: string, body: Partial<OrgLocation>) => orgApi<{ location: OrgLocation }>('PATCH', orgId, `/locations/${id}`, body);
export const deleteLocation = (orgId: string, id: string) => orgApi<{ ok: boolean }>('DELETE', orgId, `/locations/${id}`);
export const createRoom = (orgId: string, body: { location_id: string; name: string; hourly_rate?: number | null }) => orgApi<{ room: OrgRoom }>('POST', orgId, '/rooms', body);
export const updateRoom = (orgId: string, id: string, body: Partial<OrgRoom>) => orgApi<{ room: OrgRoom }>('PATCH', orgId, `/rooms/${id}`, body);
export const deleteRoom = (orgId: string, id: string) => orgApi<{ ok: boolean }>('DELETE', orgId, `/rooms/${id}`);

export const listPatients = (orgId: string, params: { q?: string; status?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  const s = qs.toString();
  return orgApi<{ patients: OrgPatient[] }>('GET', orgId, `/patients${s ? `?${s}` : ''}`);
};
export const getPatient = (orgId: string, id: string) =>
  orgApi<{ patient: OrgPatient; clinical_access: boolean; can_break_glass: boolean }>('GET', orgId, `/patients/${id}`);
export const createPatient = (orgId: string, body: Partial<OrgPatient>) => orgApi<{ patient: OrgPatient }>('POST', orgId, '/patients', body);
export const updatePatient = (orgId: string, id: string, body: Partial<OrgPatient>) => orgApi<{ patient: OrgPatient }>('PATCH', orgId, `/patients/${id}`, body);
export const setPatientAssignments = (orgId: string, id: string, memberIds: string[]) =>
  orgApi<{ patient: OrgPatient }>('PUT', orgId, `/patients/${id}/assignments`, { member_ids: memberIds });

export const listAppointments = (orgId: string, from: string, to: string, filters: { memberId?: string; roomId?: string; locationId?: string } = {}) => {
  const qs = new URLSearchParams({ from, to });
  if (filters.memberId) qs.set('memberId', filters.memberId);
  if (filters.roomId) qs.set('roomId', filters.roomId);
  if (filters.locationId) qs.set('locationId', filters.locationId);
  return orgApi<{ appointments: OrgAppointment[] }>('GET', orgId, `/appointments?${qs}`);
};
export const createAppointment = (orgId: string, body: Partial<OrgAppointment>) =>
  orgApi<{ appointment: OrgAppointment; warnings: string[] }>('POST', orgId, '/appointments', body);
export const updateAppointment = (orgId: string, id: string, body: Partial<OrgAppointment>) =>
  orgApi<{ appointment: OrgAppointment; warnings: string[] }>('PATCH', orgId, `/appointments/${id}`, body);

export const getMyBusy = (from: string, to: string) =>
  call<{ blocks: BusyBlock[] }>('GET', `/me/busy?${new URLSearchParams({ from, to })}`);

export const listNotes = (orgId: string, patientId: string) => orgApi<{ notes: ClinicalNote[] }>('GET', orgId, `/patients/${patientId}/notes`);
export const createNote = (orgId: string, patientId: string, body: { content: string; visibility: ClinicalNote['visibility']; amends_note_id?: string; appointment_id?: string }) =>
  orgApi<{ note: ClinicalNote }>('POST', orgId, `/patients/${patientId}/notes`, body);
export const updatePrivateNote = (orgId: string, patientId: string, noteId: string, content: string) =>
  orgApi<{ note: ClinicalNote }>('PATCH', orgId, `/patients/${patientId}/notes/${noteId}`, { content });
export const deletePrivateNote = (orgId: string, patientId: string, noteId: string) =>
  orgApi<{ ok: boolean }>('DELETE', orgId, `/patients/${patientId}/notes/${noteId}`);
export const breakGlass = (orgId: string, patientId: string, justification: string) =>
  orgApi<{ notes: ClinicalNote[] }>('POST', orgId, `/patients/${patientId}/break-glass`, { justification });

export const listConsentTemplates = (orgId: string) => orgApi<{ templates: ConsentTemplate[] }>('GET', orgId, '/consent-templates');
export const createConsentTemplate = (orgId: string, body: { name: string; content: string }) => orgApi<{ template: ConsentTemplate }>('POST', orgId, '/consent-templates', body);
export const updateConsentTemplate = (orgId: string, id: string, body: Partial<ConsentTemplate>) => orgApi<{ template: ConsentTemplate }>('PATCH', orgId, `/consent-templates/${id}`, body);
export const listPatientConsents = (orgId: string, patientId: string) => orgApi<{ consents: PatientConsent[] }>('GET', orgId, `/patients/${patientId}/consents`);
export const registerConsent = (orgId: string, patientId: string, templateId: string, method: PatientConsent['method']) =>
  orgApi<{ consent: PatientConsent }>('POST', orgId, `/patients/${patientId}/consents`, { template_id: templateId, method });

export const listAudit = (orgId: string, params: { patientId?: string } = {}) =>
  orgApi<{ entries: AuditEntry[] }>('GET', orgId, `/audit${params.patientId ? `?patientId=${encodeURIComponent(params.patientId)}` : ''}`);

export const offboardMember = (orgId: string, memberId: string, reassign: Record<string, string>) =>
  orgApi<{ ok: boolean; patients: number; reassigned: number; appointments_moved: number; appointments_cancelled: number }>(
    'POST', orgId, `/members/${memberId}/offboard`, { reassign });

/** Profesionales que atienden pacientes (para agenda y asignaciones). */
export const isClinicalMember = (m: OrgMember) =>
  m.status === 'active' && (m.role === 'psicologo' || m.role === 'director_clinico' || m.role === 'en_practicas' || (m.role === 'titular' && m.is_clinical));
