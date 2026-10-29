// API de los paneles de mainds business (agenda, pacientes, historia,
// facturación…). Va en un módulo aparte de businessService.ts para que solo lo
// descarguen los paneles de la clínica (carga diferida) y no el bundle de Pro.

import { call, orgApi, type OrgMember } from './businessService';
import { apiFetch } from './authService';
import { API_URL } from './config';

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
  /** Precio propio del paciente; null = tarifa de la clínica. */
  default_price?: number | null;
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
  series_id?: string | null;
}

export interface RepeatRule { every_weeks: number; count: number }
export interface SeriesResult { id: string; created: number; skipped: { starts_at: string; code: string; reason: string }[] }

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
export const createAppointment = (orgId: string, body: Partial<OrgAppointment> & { repeat?: RepeatRule }) =>
  orgApi<{ appointment: OrgAppointment; warnings: string[]; series?: SeriesResult }>('POST', orgId, '/appointments', body);
export const bulkAppointmentStatus = (orgId: string, ids: string[], status: 'completed' | 'no_show' | 'cancelled') =>
  orgApi<{ updated: number; skipped: { id: string; reason: string }[] }>('POST', orgId, '/appointments/bulk-status', { ids, status });
export const cancelFollowing = (orgId: string, id: string) => orgApi<{ cancelled: number }>('POST', orgId, `/appointments/${id}/cancel-following`);
export const listPatientAppointments = (orgId: string, patientId: string) =>
  orgApi<{ appointments: OrgAppointment[] }>('GET', orgId, `/patients/${patientId}/appointments`);
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

// ── Fase 3: emisores, comisiones, facturas, liquidaciones ──────────────────
export interface BillingEntity {
  id: string; legal_name: string; tax_id: string; address: string | null; postal_code: string | null; city: string | null;
  province: string | null; iban: string | null; email: string | null; series_prefix: string;
  start_numbers: Record<string, number>; vat_exempt: boolean; exemption_text: string | null; active: boolean;
}
export interface BillingProfile { legal_name?: string | null; tax_id?: string | null; address?: string | null; series_prefix?: string; iban?: string | null; monthly_rent?: number | null }
export interface CommissionRule {
  id: string; member_id: string | null; service_type: string | null; lead_source: 'clinic' | 'own' | null;
  psych_percent: number | null; fixed_fee: number | null; valid_from: string; valid_to: string | null; active: boolean;
}
export interface InvoiceLine { description: string; quantity: number; unit_price: number; vat_rate: number; base: number; vat: number; amount: number }
export type InvoiceKind = 'patient' | 'psych_to_org' | 'org_to_psych';
export interface ClinicInvoice {
  id: string; kind: InvoiceKind; status: 'draft' | 'issued' | 'rectified' | 'paid'; series: string; number: number | null;
  full_number: string | null; aeat_type: string; issue_date: string | null;
  issuer_type: 'entity' | 'member'; issuer_member_id: string | null; issuer_name: string; issuer_tax_id: string; issuer_address: string | null;
  recipient_name: string; recipient_tax_id: string | null; recipient_address: string | null; recipient_member_id: string | null;
  member_id: string | null; lines: InvoiceLine[]; vat_breakdown: { vat_rate: number; base: number; vat: number }[];
  subtotal: number; vat_total: number; irpf_rate: number; irpf_total: number; total: number; exemption_text: string | null;
  rectifies_invoice_id: string | null; rectification_reason: string | null; settlement_id: string | null;
  notes: string | null; paid_at: string | null; payment_method: string | null; verifactu_hash: string | null; created_at: string;
}
export interface VerifactuInfo { hash: string; previous_hash: string; generated_at: string; qr_url: string; status: string; invoice_type: string }
export interface BillableAppointment { id: string; patient_id: string; patient_name: string | null; member_id: string; starts_at: string; service_type: string; price: number | null }
export interface SettlementData {
  model: string; period: string; invoice_kind: InvoiceKind | null;
  lines: { appointment_id: string; date: string; service_type: string; minutes: number; price: number; psych_amount: number; clinic_amount: number }[];
  summary: { sessions: number; hours: number; revenue: number; psych_amount: number; clinic_amount: number };
  invoice: { lines: InvoiceLine[]; irpf_rate: number; subtotal: number; vat: number; irpf: number; total: number } | null;
  deductions: { concept: string; amount: number }[]; net_payable: number | null; warnings: { code: string; appointment_id?: string }[];
}
export interface Settlement {
  id: string; member_id: string; member_name: string | null; period: string; billing_model: string;
  status: 'draft' | 'validated' | 'invoiced' | 'paid'; data: SettlementData; validated_at: string | null;
  invoice_id: string | null; paid_at: string | null;
}
export interface ProductivityRow { member_id: string; member_name: string; billing_model: string; sessions: number; hours: number; revenue: number; psych_amount: number; clinic_amount: number; no_shows: number; cancelled: number }

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  patient: 'A paciente', psych_to_org: 'Profesional → clínica', org_to_psych: 'Clínica → profesional'
};
export const INVOICE_STATUS_LABELS: Record<ClinicInvoice['status'], string> = {
  draft: 'Borrador', issued: 'Emitida', rectified: 'Rectificada', paid: 'Pagada'
};
export const SETTLEMENT_STATUS_LABELS: Record<Settlement['status'], string> = {
  draft: 'Pendiente de validar', validated: 'Validada', invoiced: 'Facturada', paid: 'Pagada'
};

export const listBillingEntities = (orgId: string) => orgApi<{ entities: BillingEntity[] }>('GET', orgId, '/billing-entities');
export const createBillingEntity = (orgId: string, body: Partial<BillingEntity>) => orgApi<{ entity: BillingEntity }>('POST', orgId, '/billing-entities', body);
export const updateBillingEntity = (orgId: string, id: string, body: Partial<BillingEntity>) => orgApi<{ entity: BillingEntity }>('PATCH', orgId, `/billing-entities/${id}`, body);
export const getMyBillingProfile = (orgId: string) => orgApi<{ billing_profile: BillingProfile }>('GET', orgId, '/members/me/billing-profile');
export const saveMyBillingProfile = (orgId: string, body: BillingProfile) => orgApi<{ billing_profile: BillingProfile }>('PUT', orgId, '/members/me/billing-profile', body);
export const setMemberRent = (orgId: string, memberId: string, monthlyRent: number | null) => orgApi<{ monthly_rent: number | null }>('PUT', orgId, `/members/${memberId}/rent`, { monthly_rent: monthlyRent });

export const listCommissionRules = (orgId: string) => orgApi<{ rules: CommissionRule[] }>('GET', orgId, '/commission-rules');
export const createCommissionRule = (orgId: string, body: Partial<CommissionRule>) => orgApi<{ rule: CommissionRule }>('POST', orgId, '/commission-rules', body);
export const endCommissionRule = (orgId: string, id: string, validTo: string) => orgApi<{ rule: CommissionRule }>('PATCH', orgId, `/commission-rules/${id}`, { valid_to: validTo });

export const listBillable = (orgId: string, patientId?: string) =>
  orgApi<{ appointments: BillableAppointment[] }>('GET', orgId, `/billing/billable${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`);
export const listClinicInvoices = (orgId: string, params: { status?: string; kind?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return orgApi<{ invoices: ClinicInvoice[] }>('GET', orgId, `/invoices${qs ? `?${qs}` : ''}`);
};
export const createClinicInvoice = (orgId: string, body: { patient_id: string; appointment_ids: string[]; issuer?: 'entity' | 'member'; billing_entity_id?: string; recipient_tax_id?: string; notes?: string }) =>
  orgApi<{ invoice: ClinicInvoice }>('POST', orgId, '/invoices', body);
export const getClinicInvoice = (orgId: string, id: string) =>
  orgApi<{ invoice: ClinicInvoice; verifactu: VerifactuInfo | null; qr_data_url: string | null }>('GET', orgId, `/invoices/${id}`);
export const deleteClinicInvoice = (orgId: string, id: string) => orgApi<{ ok: boolean }>('DELETE', orgId, `/invoices/${id}`);
export const issueClinicInvoice = (orgId: string, id: string) => orgApi<{ invoice: ClinicInvoice }>('POST', orgId, `/invoices/${id}/issue`);
export const rectifyClinicInvoice = (orgId: string, id: string, reason: string) => orgApi<{ invoice: ClinicInvoice }>('POST', orgId, `/invoices/${id}/rectify`, { reason });
export interface BulkInvoiceResult {
  created: { id: string; patient_id: string; patient_name: string; appointments: number; total: number }[];
  skipped: { patient_id: string; patient_name: string; appointments: number; code: string; reason: string }[];
}
export const bulkInvoice = (orgId: string, body: { from?: string; to?: string } = {}) => orgApi<BulkInvoiceResult>('POST', orgId, '/invoices/bulk', body);
export const issueInvoiceBatch = (orgId: string, ids: string[]) =>
  orgApi<{ issued: { id: string; full_number: string }[]; failed: { id: string; reason: string }[] }>('POST', orgId, '/invoices/issue-batch', { ids });
export const markClinicInvoicePaid = (orgId: string, id: string, method: string) => orgApi<{ invoice: ClinicInvoice }>('POST', orgId, `/invoices/${id}/mark-paid`, { method });
export const exportInvoicesCsv = (orgId: string, from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return downloadOrgFile(orgId, `/invoices/export.csv${qs.toString() ? `?${qs}` : ''}`, `facturas-${from || 'inicio'}-${to || 'hoy'}.csv`);
};

export const generateSettlements = (orgId: string, period: string) => orgApi<{ settlements: Settlement[] }>('POST', orgId, '/settlements/generate', { period });
export const listSettlements = (orgId: string, period?: string) => orgApi<{ settlements: Settlement[] }>('GET', orgId, `/settlements${period ? `?period=${period}` : ''}`);
export const validateSettlement = (orgId: string, id: string) => orgApi<{ settlement: Settlement }>('POST', orgId, `/settlements/${id}/validate`);
export const invoiceSettlement = (orgId: string, id: string) => orgApi<{ settlement: Settlement; invoice: ClinicInvoice }>('POST', orgId, `/settlements/${id}/invoice`);
export const markSettlementPaid = (orgId: string, id: string) => orgApi<{ settlement: Settlement }>('POST', orgId, `/settlements/${id}/mark-paid`);
export const getProductivity = (orgId: string, period: string) => orgApi<{ period: string; members: ProductivityRow[] }>('GET', orgId, `/reports/productivity?period=${period}`);

/** Descarga un fichero de la API de la clínica (con la sesión) y lo guarda. */
export async function downloadOrgFile(orgId: string, path: string, filename: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await apiFetch(`${API_URL}/org/${orgId}${path}`);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      return { ok: false, error: j?.error || 'No se pudo descargar' };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true };
  } catch {
    return { ok: false, error: 'No hay conexión con el servidor' };
  }
}

// ── Fase 4: captación ──────────────────────────────────────────────────────
export type LeadStatus = 'nuevo' | 'contactado' | 'primera_cita' | 'paciente' | 'descartado';
export interface Lead {
  id: string; name: string; email: string | null; phone: string | null; reason: string | null; modality: string | null;
  preferences: string | null; source: string; utm: Record<string, string>; preferred_member_id: string | null; preferred_member_name: string | null;
  status: LeadStatus; assigned_member_id: string | null; assigned_member_name: string | null; patient_id: string | null;
  consent_at: string | null; events: { at: string; type: string; by: string | null; from?: string; to?: string | null; note?: string }[];
  created_at: string; updated_at: string;
}
export interface PublicPageSettings {
  enabled?: boolean; headline?: string | null; description?: string | null; specialties?: string[]; contact_phone?: string | null;
  contact_email?: string | null; address?: string | null; city?: string | null; modalities?: string[]; assignment?: 'manual' | 'round_robin';
}
export interface PublicProfile { visible?: boolean; display_name?: string | null; bio?: string | null; specialties?: string[]; photo_url?: string | null }
export interface LeadMetrics {
  total: number; converted: number; rate: number; by_status: Record<LeadStatus, number>;
  by_source: { source: string; leads: number; converted: number; rate: number }[];
  by_member: { member_id: string; member_name: string | null; leads: number; converted: number; rate: number }[];
}
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  nuevo: 'Nuevo', contactado: 'Contactado', primera_cita: 'Primera cita', paciente: 'Paciente', descartado: 'Descartado'
};
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  web: 'Página web', widget: 'Widget', telefono: 'Teléfono', whatsapp: 'WhatsApp', otro: 'Otro'
};

export const getPublicPage = (orgId: string) => orgApi<{ public_page: PublicPageSettings; plus: boolean; slug: string }>('GET', orgId, '/public-page');
export const savePublicPage = (orgId: string, body: PublicPageSettings) => orgApi<{ public_page: PublicPageSettings }>('PUT', orgId, '/public-page', body);
export const saveMyPublicProfile = (orgId: string, body: PublicProfile & { accepts_leads: boolean }) =>
  orgApi<{ public_profile: PublicProfile; accepts_leads: boolean }>('PUT', orgId, '/members/me/public-profile', body);
export const listLeads = (orgId: string, status?: string) => orgApi<{ leads: Lead[] }>('GET', orgId, `/leads${status ? `?status=${status}` : ''}`);
export const createLead = (orgId: string, body: { name: string; email?: string; phone?: string; reason?: string; source: string; consent?: boolean }) =>
  orgApi<{ lead: Lead }>('POST', orgId, '/leads', body);
export const updateLead = (orgId: string, id: string, body: { status?: LeadStatus; note?: string }) => orgApi<{ lead: Lead }>('PATCH', orgId, `/leads/${id}`, body);
export const assignLead = (orgId: string, id: string, memberId: string | 'round_robin' | null) => orgApi<{ lead: Lead }>('POST', orgId, `/leads/${id}/assign`, { member_id: memberId });
export const convertLead = (orgId: string, id: string) => orgApi<{ lead: Lead; patient_id: string }>('POST', orgId, `/leads/${id}/convert`);
export const getLeadMetrics = (orgId: string) => orgApi<LeadMetrics>('GET', orgId, '/leads/metrics');

// ── Fase 5: conocimiento y panel del dueño ─────────────────────────────────
export type LibraryKind = 'protocolo' | 'material' | 'plantilla' | 'enlace';
export interface LibraryItem { id: string; kind: LibraryKind; title: string; body: string | null; url: string | null; tags: string[]; active: boolean; updated_at?: string }
export interface CourseModule { id: string; course_id: string; title: string; body: string | null; url: string | null; minutes: number; position: number; completed: boolean }
export interface Course { id: string; title: string; description: string | null; required_for: string[]; active: boolean; modules: CourseModule[]; total_minutes: number; my_completed: number; required: boolean }
export interface TrainingHoursRow { member_id: string; name: string; role: string; training_hours: number; modules_completed: number; supervision_hours: number }
export interface SupervisionLog { id: string; supervisor_member_id: string; supervisor_name: string | null; supervisee_member_id: string; supervisee_name: string | null; session_date: string; minutes: number; topics: string[]; notes: string | null; unreadable: boolean }
export interface ClinicDashboard {
  period: string; production: number; invoiced: number; sessions: number; no_shows: number; no_show_rate: number; cancelled: number;
  room_occupancy: number; rooms: { room_id: string; name: string; occupancy: number; hours: number }[];
  patients_active: number; patients_seen: number; leads: number; leads_converted: number; lead_conversion: number;
  settlements_pending: number; settlements_pending_amount: number;
  by_member: { member_id: string; name: string; sessions: number; production: number }[];
  by_location: { location_id: string | null; name: string; sessions: number; production: number }[];
}
export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = { protocolo: 'Protocolo', material: 'Material', plantilla: 'Plantilla', enlace: 'Enlace' };

export const listLibrary = (orgId: string) => orgApi<{ items: LibraryItem[] }>('GET', orgId, '/library');
export const createLibraryItem = (orgId: string, body: Partial<LibraryItem>) => orgApi<{ item: LibraryItem }>('POST', orgId, '/library', body);
export const updateLibraryItem = (orgId: string, id: string, body: Partial<LibraryItem>) => orgApi<{ item: LibraryItem }>('PATCH', orgId, `/library/${id}`, body);
export const deleteLibraryItem = (orgId: string, id: string) => orgApi<{ ok: boolean }>('DELETE', orgId, `/library/${id}`);
export const askLibrary = (orgId: string, question: string) => orgApi<{ answer: string; sources: { n: number; id: string; title: string }[] }>('POST', orgId, '/library/ask', { question });
export const listCourses = (orgId: string) => orgApi<{ courses: Course[] }>('GET', orgId, '/courses');
export const createCourse = (orgId: string, body: { title: string; description?: string; required_for?: string[] }) => orgApi<{ course: Course }>('POST', orgId, '/courses', body);
export const addCourseModule = (orgId: string, courseId: string, body: { title: string; minutes: number; body?: string; url?: string }) => orgApi<{ module: CourseModule }>('POST', orgId, `/courses/${courseId}/modules`, body);
export const completeModule = (orgId: string, courseId: string, moduleId: string) => orgApi<unknown>('POST', orgId, `/courses/${courseId}/modules/${moduleId}/complete`);
export const getTrainingHours = (orgId: string) => orgApi<{ members: TrainingHoursRow[] }>('GET', orgId, '/training/hours');
export const listSupervision = (orgId: string) => orgApi<{ logs: SupervisionLog[] }>('GET', orgId, '/supervision');
export const createSupervision = (orgId: string, body: { supervisee_member_id: string; session_date: string; minutes: number; topics?: string[]; notes?: string }) =>
  orgApi<{ log: SupervisionLog }>('POST', orgId, '/supervision', body);
export const getDashboard = (orgId: string, period: string) => orgApi<ClinicDashboard>('GET', orgId, `/dashboard?period=${period}`);

// ── Inicio (Fase 6) ──
export type SetupStep = 'billing_entity' | 'prices' | 'location' | 'team' | 'patient' | 'appointment' | 'public_page';
export interface HomeAppointment { id: string; starts_at: string; ends_at: string; status: AppointmentStatus; service_type: string; patient_id: string | null; patient_name: string | null; room_name: string | null; invoice_id: string | null }
export interface ClinicHomeData {
  date: string;
  today: { mine: HomeAppointment[] | null; clinic: { total: number; by_member: { member_id: string; name: string; count: number }[] } | null };
  pending: {
    to_close: { count: number; items: { id: string; starts_at: string; member_id: string; member_name: string; patient_name: string | null }[] } | null;
    unbilled: { count: number; amount: number; without_price: number } | null;
    drafts: number | null;
    leads_new: number | null;
    settlements_to_validate: number | null;
    invitations_pending: number | null;
  };
  setup: { id: SetupStep; done: boolean }[] | null;
}
export const getClinicHome = (orgId: string) => orgApi<ClinicHomeData>('GET', orgId, '/home');
