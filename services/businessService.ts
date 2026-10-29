// Cliente de la API de mainds business (/api/org/*).
//
// Todo lo de clínicas va por aquí. El espacio de trabajo va en la ruta
// (/api/org/:orgId/...), así que apiFetch y las peticiones de Pro no cambian.

import { apiFetch } from './authService';
import { API_URL } from './config';

export type OrgRole = 'titular' | 'gerente' | 'director_clinico' | 'psicologo' | 'en_practicas' | 'recepcion' | 'contable';
export type EmploymentType = 'employee' | 'freelance' | 'room_rental' | 'intern';
export type BillingModel = 'payroll' | 'org_invoices' | 'psych_invoices' | 'fixed_rent';
export type OrgPlan = 'essential' | 'plus';

export interface OrgMembershipSummary {
  orgId: string;
  name: string;
  slug: string;
  logo_url: string | null;
  role: OrgRole;
  status: string;
  memberId: string;
  permissions: string[];
  access: 'full' | 'read_only';
  trial: boolean;
  trial_days_left: number;
  /** Cerrada por el titular: solo lectura. */
  closed?: boolean;
}

export interface PendingInvitation {
  memberId: string;
  orgId: string;
  orgName: string;
  role: OrgRole;
  expiresAt: string | null;
}

export interface BusinessMe {
  enabled: boolean;
  canCreateOrg?: boolean;
  /** 'beta' (superadmin o lista beta) | 'self_serve' (lo activa el psicólogo desde su perfil) */
  createVia?: 'beta' | 'self_serve' | null;
  dpaVersion?: string;
  memberships: OrgMembershipSummary[];
  pendingInvitations?: PendingInvitation[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  cif: string | null;
  logo_url: string | null;
  plan_id: OrgPlan;
  billing_interval: 'month' | 'year';
  status: 'trialing' | 'active' | 'past_due' | 'canceled';
  trial_ends_at: string | null;
  access: 'full' | 'read_only';
  trial: boolean;
  trial_days_left: number;
  plus: boolean;
  /** Tarifas por servicio (€). Rellenan el precio de las citas. */
  service_prices?: Record<string, number>;
  /** Fecha de cierre si el titular la cerró (solo lectura hasta reactivarla). */
  closed_at?: string | null;
}

export interface OrgMember {
  id: string;
  user_id: string | null;
  display_name: string | null;
  role: OrgRole;
  status: 'invited' | 'active' | 'suspended' | 'left' | 'declined';
  is_clinical: boolean;
  supervisor_member_id: string | null;
  accepts_leads: boolean;
  email?: string;
  employment_type?: EmploymentType;
  billing_model?: BillingModel;
  irpf_rate?: number | null;
  seat_billable?: boolean;
  permissions_override?: { revoke?: string[]; grant?: string[] };
  permissions?: string[];
  invitation_expires_at?: string | null;
  joined_at?: string | null;
}

export interface OrgBilling {
  plan_id: OrgPlan;
  billing_interval: 'month' | 'year';
  status: string;
  trial: boolean;
  trial_ends_at: string | null;
  trial_days_left: number;
  seats: number;
  seats_billed: number | null;
  seat_sync_pending: boolean;
  has_subscription: boolean;
  stripe_configured: boolean;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  code?: string;
}

export const ROLE_LABELS: Record<OrgRole, string> = {
  titular: 'Titular',
  gerente: 'Gerente / Administración',
  director_clinico: 'Director/a clínico/a',
  psicologo: 'Psicólogo/a',
  en_practicas: 'Psicólogo/a en prácticas',
  recepcion: 'Recepción',
  contable: 'Contable / Gestoría'
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  employee: 'Contratado/a (nómina)',
  freelance: 'Autónomo/a',
  room_rental: 'Alquila despacho',
  intern: 'En prácticas'
};

export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  payroll: 'Factura la clínica (nómina, sin liquidación)',
  org_invoices: 'Factura la clínica y liquida un % al profesional',
  psych_invoices: 'Factura el profesional y paga una comisión a la clínica',
  fixed_rent: 'Factura el profesional y paga un alquiler fijo'
};

export const PLAN_INFO: Record<OrgPlan, { name: string; base: number; seat: number }> = {
  essential: { name: 'Business Essential', base: 39, seat: 19 },
  plus: { name: 'Business Plus', base: 79, seat: 25 }
};

const BASE = `${API_URL}/org`;

export async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(`${BASE}${path}`, {
      method,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: json?.error || 'No se pudo completar la operación', code: json?.code };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch {
    return { ok: false, status: 0, data: null, error: 'No hay conexión con el servidor', code: 'NETWORK' };
  }
}

/** Estado de Business para el usuario. Nunca lanza: ante cualquier fallo, Business "apagado". */
export async function getBusinessMe(): Promise<BusinessMe> {
  const r = await call<BusinessMe>('GET', '/me');
  if (!r.ok || !r.data) return { enabled: false, memberships: [] };
  return {
    enabled: !!r.data.enabled,
    canCreateOrg: !!r.data.canCreateOrg,
    createVia: r.data.createVia ?? null,
    dpaVersion: r.data.dpaVersion,
    memberships: Array.isArray(r.data.memberships) ? r.data.memberships : [],
    pendingInvitations: Array.isArray(r.data.pendingInvitations) ? r.data.pendingInvitations : []
  };
}

export const createOrganization = (body: {
  name: string; slug?: string; plan: OrgPlan; billing_interval?: 'month' | 'year';
  legal_name?: string; cif?: string; is_clinical?: boolean; dpa_accepted: boolean; dpa_version: string;
}) => call<{ organization: Organization; membership: OrgMember }>('POST', '', body);

export const getOrganization = (orgId: string) =>
  call<{ organization: Organization; membership: OrgMember & { permissions: string[] } }>('GET', `/${orgId}`);

export const updateOrganization = (orgId: string, body: Partial<Pick<Organization, 'name' | 'legal_name' | 'cif' | 'logo_url' | 'slug' | 'service_prices'>>) =>
  call<{ organization: Organization }>('PATCH', `/${orgId}`, body);

export const listMembers = (orgId: string) => call<{ members: OrgMember[] }>('GET', `/${orgId}/members`);

export const inviteMember = (orgId: string, body: {
  email: string; role: OrgRole; employment_type?: EmploymentType; billing_model?: BillingModel;
  display_name?: string; supervisor_member_id?: string | null; irpf_rate?: number | null;
}) => call<{ member: OrgMember; invite_url: string; email_sent: boolean }>('POST', `/${orgId}/members/invite`, body);

export const updateMember = (orgId: string, memberId: string, body: Partial<OrgMember>) =>
  call<{ member: OrgMember }>('PATCH', `/${orgId}/members/${memberId}`, body);

export const suspendMember = (orgId: string, memberId: string) => call<{ member: OrgMember }>('POST', `/${orgId}/members/${memberId}/suspend`);
export const reactivateMember = (orgId: string, memberId: string) => call<{ member: OrgMember }>('POST', `/${orgId}/members/${memberId}/reactivate`);
export const removeMember = (orgId: string, memberId: string) => call<{ member: OrgMember }>('DELETE', `/${orgId}/members/${memberId}`);
export const leaveOrganization = (orgId: string) => call<{ ok: boolean }>('POST', `/${orgId}/leave`);
/** Cierra la clínica (titular): cancela su cobro y la deja en solo lectura. mainds pro no cambia. */
export const closeOrganization = (orgId: string, confirmName: string) =>
  call<{ organization: Organization }>('POST', `/${orgId}/close`, { confirm_name: confirmName });

export const acceptInvitation = (token: string) =>
  call<{ organization: Organization; membership: OrgMember }>('POST', '/invitations/accept', { token });
export const declineInvitation = (token: string) => call<{ ok: boolean }>('POST', '/invitations/decline', { token });

export const getOrgBilling = (orgId: string) => call<OrgBilling>('GET', `/${orgId}/billing`);
export const startOrgCheckout = (orgId: string, plan: OrgPlan, interval: 'month' | 'year') =>
  call<{ url: string }>('POST', `/${orgId}/billing/checkout`, { plan, interval });

/** Llamada genérica para los paneles de las fases siguientes. */
export const orgApi = <T,>(method: string, orgId: string, path: string, body?: unknown) =>
  call<T>(method, `/${orgId}${path}`, body);

// ── Espacio de trabajo activo (por usuario, en localStorage) ───────────────
const WS_KEY = (userId: string) => `mainds_workspace_${userId}`;

export function getStoredWorkspace(userId: string): string | null {
  try { return localStorage.getItem(WS_KEY(userId)); } catch { return null; }
}

export function storeWorkspace(userId: string, workspace: string | null) {
  try {
    if (!workspace || workspace === 'personal') localStorage.removeItem(WS_KEY(userId));
    else localStorage.setItem(WS_KEY(userId), workspace);
  } catch { /* almacenamiento no disponible */ }
}

// ── Invitación pendiente de aceptar (?org_invite=<token>) ──────────────────
const INVITE_KEY = 'mainds_pending_org_invite';

/** Lee ?org_invite de la URL, lo guarda (sobrevive al login) y limpia la URL. */
export function captureInviteToken(): string | null {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('org_invite');
    if (token) {
      sessionStorage.setItem(INVITE_KEY, token);
      url.searchParams.delete('org_invite');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }
    return token || sessionStorage.getItem(INVITE_KEY);
  } catch { return null; }
}

export function getPendingInviteToken(): string | null {
  try { return sessionStorage.getItem(INVITE_KEY); } catch { return null; }
}

export function clearPendingInviteToken() {
  try { sessionStorage.removeItem(INVITE_KEY); } catch { /* */ }
}
