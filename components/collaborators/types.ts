// Programa de colaboradores — tipos compartidos por el área del colaborador y
// el panel de superadmin. La forma la define panelColaborador() en
// backend/utils/colaboradores.js.

export type PayoutModel = 'one_time' | 'recurring';
export type PayoutAmountType = 'fixed' | 'percent';

export interface CollaboratorPayout {
  payout_model: PayoutModel;
  payout_amount_type: PayoutAmountType;
  payout_amount: number;
  payout_percent: number;
  payout_min_months: number;
  payout_max_months: number | null;
}

export interface CollaboratorStats {
  leads: number;
  paying: number;
  converted: number;
  canceled: number;
  total_earned: number;
  total_paid_out: number;
  balance: number;
  earned_this_month: number;
}

export interface CollaboratorCode {
  id: string;
  code: string;
  percent_off: number;
  duration_months: number | null;
  max_redemptions: number | null;
  active: boolean;
  created_at: string;
  uses: number;
}

export interface CollaboratorReferral {
  id: string;
  name: string | null;
  email: string | null;
  code: string | null;
  subscription_type: string | null;
  plan_id: string | null;
  status: string | null;
  months_paid: number;
  total_paid?: number;
  created_at: string;
  first_paid_at: string | null;
  earned: number;
}

export interface CollaboratorEarning {
  id: string;
  type: 'one_time' | 'recurring' | 'payout' | 'adjustment';
  amount: number;
  description: string | null;
  created_at: string;
}

export interface CollaboratorPanel {
  collaborator: CollaboratorPayout & {
    id: string;
    user_id: string;
    name: string | null;
    email: string | null;
    active: boolean;
    created_at: string;
    deactivated_at: string | null;
    notes?: string | null;
  };
  codes: CollaboratorCode[];
  stats: CollaboratorStats;
  referrals: CollaboratorReferral[];
  earnings: CollaboratorEarning[];
}

export interface CollaboratorListItem extends CollaboratorPayout {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  notes: string | null;
  codes: { code: string; active: boolean }[];
  stats: CollaboratorStats;
}

export const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);

export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** "20 % durante 3 meses" / "20 % para siempre". */
export const describeDiscount = (c: Pick<CollaboratorCode, 'percent_off' | 'duration_months'>) =>
  `${c.percent_off} % ${c.duration_months ? `durante ${c.duration_months} ${c.duration_months === 1 ? 'mes' : 'meses'}` : 'para siempre'}`;

/** Cómo gana dinero el colaborador, en una frase. */
export const describePayout = (p: CollaboratorPayout) => {
  if (p.payout_model === 'one_time') {
    const m = p.payout_min_months;
    return `${eur(p.payout_amount)} por cada lead que lleve ${m} ${m === 1 ? 'mes pagado' : 'meses pagados'} en mainds`;
  }
  const cuanto = p.payout_amount_type === 'percent'
    ? `${p.payout_percent} % de lo que paga`
    : eur(p.payout_amount);
  const tope = p.payout_max_months ? ` durante sus primeros ${p.payout_max_months} meses` : ' mientras siga pagando';
  return `${cuanto} cada mes por cada lead que pague${tope}`;
};

export const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active:             { label: 'Pagando',     className: 'bg-emerald-100 text-emerald-700' },
  trialing:           { label: 'En prueba',   className: 'bg-sky-100 text-sky-700' },
  past_due:           { label: 'Pago fallido', className: 'bg-amber-100 text-amber-700' },
  unpaid:             { label: 'Impagado',    className: 'bg-amber-100 text-amber-700' },
  canceled:           { label: 'Baja',        className: 'bg-slate-200 text-slate-600' },
  incomplete:         { label: 'Incompleto',  className: 'bg-slate-100 text-slate-500' },
  incomplete_expired: { label: 'Caducado',    className: 'bg-slate-100 text-slate-500' },
};

export const EARNING_LABEL: Record<CollaboratorEarning['type'], string> = {
  one_time: 'Pago por lead',
  recurring: 'Comisión mensual',
  payout: 'Pago recibido',
  adjustment: 'Ajuste',
};
