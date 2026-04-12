// ─────────────────── CRM / Sales Types ───────────────────

export type LeadStage = 'new' | 'prueba' | 'contacted' | 'demo' | 'won' | 'lost' | 'cancelled';

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  stage: LeadStage;
  app_user_id: string | null;
  app_registered_at: string | null;
  app_plan: string | null;
  app_is_subscribed: boolean;
  assigned_to: string | null;
  tags: string[];
  notes_count: number;
  last_contacted_at: string | null;
}

export type LeadActivityType =
  | 'note'
  | 'email_sent'
  | 'email_received'
  | 'email_bulk'
  | 'document'
  | 'stage_change'
  | 'app_event';

export interface LeadActivity {
  id: string;
  created_at: string;
  lead_id: string;
  type: LeadActivityType;
  title: string | null;
  body: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
}

export interface LeadEmailTemplate {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  subject: string;
  body_html: string;
  variables: string[];
  created_by: string | null;
}

export interface LeadImportRow {
  email: string;
  name?: string;
  phone?: string;
  company?: string;
  source?: string;
  _status?: 'ok' | 'duplicate' | 'invalid';
  _reason?: string;
}

export interface LeadEmailEvent {
  type: 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained';
  created_at: string;
}

export const LEAD_STAGES: { id: LeadStage; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { id: 'new',       label: 'Nuevo',      color: 'text-blue-700',   bgColor: 'bg-blue-50',    borderColor: 'border-blue-200' },
  { id: 'prueba',    label: 'Prueba',     color: 'text-cyan-700',   bgColor: 'bg-cyan-50',    borderColor: 'border-cyan-200' },
  { id: 'contacted', label: 'Contactado', color: 'text-amber-700',  bgColor: 'bg-amber-50',   borderColor: 'border-amber-200' },
  { id: 'demo',      label: 'Demo',       color: 'text-violet-700', bgColor: 'bg-violet-50',  borderColor: 'border-violet-200' },
  { id: 'won',       label: 'Ganado',     color: 'text-emerald-700',bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { id: 'lost',      label: 'Perdido',    color: 'text-red-700',    bgColor: 'bg-red-50',     borderColor: 'border-red-200' },
  { id: 'cancelled', label: 'Cancelado',  color: 'text-slate-700',  bgColor: 'bg-slate-50',   borderColor: 'border-slate-200' },
];

export const PIPELINE_STAGES = LEAD_STAGES.filter(s => !['won', 'lost', 'cancelled'].includes(s.id));
export const CLOSED_STAGES = LEAD_STAGES.filter(s => ['won', 'lost', 'cancelled'].includes(s.id));
