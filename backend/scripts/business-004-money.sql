-- business-004-money.sql
--
-- mainds business — Fase 3 (dinero): emisores fiscales, reglas de comisión,
-- facturas de la clínica y de sus profesionales, liquidaciones mensuales y
-- registros Verifactu.
--
-- Reglas:
--   - Tablas propias (D1). RLS activado SIN políticas (solo service role).
--   - Una factura emitida es inmutable en lo fiscal (trigger): solo pueden
--     cambiar su estado (rectificada/pagada), el cobro y la referencia Verifactu.
--   - Numeración única por emisor (NIF) y serie: issuer_key = 'nif:<NIF>'.
--   - verifactu_records es de solo inserción y su cadena no admite bifurcaciones
--     (un solo registro por NIF puede apuntar a cada huella anterior).
--   - Idempotente. Ejecutar a mano después de business-003.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Datos fiscales del profesional para sus facturas a la clínica (y alquiler).
ALTER TABLE public.org_members ADD COLUMN IF NOT EXISTS billing_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── Emisores (CIF de la clínica) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_billing_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  tax_id text NOT NULL,
  address text,
  postal_code text,
  city text,
  province text,
  iban text,
  email text,
  series_prefix text NOT NULL DEFAULT 'C',          -- serie = prefijo + año (C31)
  start_numbers jsonb NOT NULL DEFAULT '{}'::jsonb, -- { "C31": 120 } al migrar de otro programa
  vat_exempt boolean NOT NULL DEFAULT true,         -- asistencia sanitaria (art. 20.Uno.3º LIVA)
  exemption_text text,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_org_billing_entities_org ON public.org_billing_entities (org_id);
ALTER TABLE public.org_billing_entities ENABLE ROW LEVEL SECURITY;

-- ── Reglas de comisión ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.org_members(id) ON DELETE CASCADE,
  service_type text,
  lead_source text,                                 -- clinic | own
  psych_percent numeric(5,2),                       -- parte del profesional (%)
  fixed_fee numeric(10,2),                          -- o importe fijo por cita
  valid_from date NOT NULL DEFAULT current_date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_by text,
  CONSTRAINT org_commission_rules_value_chk CHECK ((psych_percent IS NULL) <> (fixed_fee IS NULL)),
  CONSTRAINT org_commission_rules_percent_chk CHECK (psych_percent IS NULL OR (psych_percent >= 0 AND psych_percent <= 100)),
  CONSTRAINT org_commission_rules_source_chk CHECK (lead_source IS NULL OR lead_source IN ('clinic', 'own'))
);
CREATE INDEX IF NOT EXISTS idx_org_commission_rules_org ON public.org_commission_rules (org_id);
ALTER TABLE public.org_commission_rules ENABLE ROW LEVEL SECURITY;

-- ── Facturas ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  kind text NOT NULL,                     -- patient | psych_to_org | org_to_psych
  issuer_type text NOT NULL,              -- entity | member
  billing_entity_id uuid REFERENCES public.org_billing_entities(id),
  issuer_member_id uuid REFERENCES public.org_members(id),
  issuer_key text NOT NULL,               -- 'nif:<NIF>' (numeración por NIF y serie)
  issuer_name text NOT NULL,
  issuer_tax_id text NOT NULL,
  issuer_address text,
  recipient_type text NOT NULL,           -- patient | org | member
  recipient_patient_id uuid REFERENCES public.org_patients(id),
  recipient_member_id uuid REFERENCES public.org_members(id),
  recipient_name text NOT NULL,
  recipient_tax_id text,
  recipient_address text,
  member_id uuid REFERENCES public.org_members(id),   -- profesional que prestó el servicio
  series text NOT NULL,
  number integer,                         -- NULL mientras es borrador
  full_number text,
  aeat_type text NOT NULL DEFAULT 'F1',   -- F1 | F2 | R4 | R5
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  vat_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_total numeric(12,2) NOT NULL DEFAULT 0,
  irpf_rate numeric(5,2) NOT NULL DEFAULT 0,
  irpf_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  exemption_text text,
  status text NOT NULL DEFAULT 'draft',   -- draft | issued | rectified | paid
  issue_date date,
  issued_at timestamptz,
  rectifies_invoice_id uuid REFERENCES public.org_invoices(id),
  rectification_reason text,
  settlement_id uuid,
  appointment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  paid_at timestamptz,
  payment_method text,
  verifactu_record_id uuid,
  verifactu_hash text,
  created_by text,
  CONSTRAINT org_invoices_kind_chk CHECK (kind IN ('patient', 'psych_to_org', 'org_to_psych')),
  CONSTRAINT org_invoices_status_chk CHECK (status IN ('draft', 'issued', 'rectified', 'paid')),
  CONSTRAINT org_invoices_aeat_type_chk CHECK (aeat_type IN ('F1', 'F2', 'R4', 'R5')),
  CONSTRAINT org_invoices_number_chk CHECK ((status = 'draft') = (number IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS org_invoices_issuer_series_number_key ON public.org_invoices (issuer_key, series, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_invoices_org_date ON public.org_invoices (org_id, issue_date);
CREATE INDEX IF NOT EXISTS idx_org_invoices_issuer_series ON public.org_invoices (issuer_key, series, number DESC);
ALTER TABLE public.org_invoices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.org_invoices_protect_issued()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Una factura emitida no se puede borrar' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.number IS DISTINCT FROM OLD.number OR NEW.full_number IS DISTINCT FROM OLD.full_number OR
       NEW.series IS DISTINCT FROM OLD.series OR NEW.issuer_key IS DISTINCT FROM OLD.issuer_key OR
       NEW.issuer_tax_id IS DISTINCT FROM OLD.issuer_tax_id OR NEW.issuer_name IS DISTINCT FROM OLD.issuer_name OR
       NEW.recipient_name IS DISTINCT FROM OLD.recipient_name OR NEW.recipient_tax_id IS DISTINCT FROM OLD.recipient_tax_id OR
       NEW.lines IS DISTINCT FROM OLD.lines OR NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
       NEW.vat_total IS DISTINCT FROM OLD.vat_total OR NEW.irpf_total IS DISTINCT FROM OLD.irpf_total OR
       NEW.total IS DISTINCT FROM OLD.total OR NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
       NEW.aeat_type IS DISTINCT FROM OLD.aeat_type OR NEW.kind IS DISTINCT FROM OLD.kind OR
       NEW.status = 'draft'
     ) THEN
    RAISE EXCEPTION 'Una factura emitida es inmutable: emite una rectificativa' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_org_invoices_protect ON public.org_invoices;
CREATE TRIGGER trg_org_invoices_protect
  BEFORE UPDATE OR DELETE ON public.org_invoices
  FOR EACH ROW EXECUTE FUNCTION public.org_invoices_protect_issued();

-- ── Liquidaciones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.org_members(id),
  period text NOT NULL,                   -- 'YYYY-MM'
  billing_model text NOT NULL,
  status text NOT NULL DEFAULT 'draft',   -- draft | validated | invoiced | paid
  data jsonb NOT NULL DEFAULT '{}'::jsonb, -- foto del cálculo (líneas, totales, avisos)
  validated_at timestamptz,
  validated_by text,
  invoice_id uuid REFERENCES public.org_invoices(id),
  paid_at timestamptz,
  CONSTRAINT org_settlements_status_chk CHECK (status IN ('draft', 'validated', 'invoiced', 'paid')),
  CONSTRAINT org_settlements_period_chk CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE UNIQUE INDEX IF NOT EXISTS org_settlements_member_period_key ON public.org_settlements (org_id, member_id, period);
ALTER TABLE public.org_settlements ENABLE ROW LEVEL SECURITY;

-- ── Verifactu ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.verifactu_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid,
  invoice_id uuid NOT NULL,
  record_type text NOT NULL DEFAULT 'alta',   -- alta | anulacion
  issuer_tax_id text NOT NULL,
  series_number text NOT NULL,
  issue_date text NOT NULL,                   -- dd-mm-aaaa, tal cual entra en la huella
  invoice_type text NOT NULL,                 -- F1 | F2 | R4 | R5
  vat_total text NOT NULL,                    -- texto exacto usado en la huella
  total text NOT NULL,
  previous_hash text NOT NULL DEFAULT '',
  chain_index integer NOT NULL,
  generated_at text NOT NULL,                 -- aaaa-mm-ddThh:mm:ss+hh:mm
  hash text NOT NULL,
  qr_url text NOT NULL,
  mode text NOT NULL DEFAULT 'noverifactu',
  status text NOT NULL DEFAULT 'pending_submission'
);
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_chain_key ON public.verifactu_records (issuer_tax_id, previous_hash);
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_records_invoice_key ON public.verifactu_records (invoice_id, record_type);
CREATE INDEX IF NOT EXISTS idx_verifactu_records_issuer_chain ON public.verifactu_records (issuer_tax_id, chain_index DESC);
ALTER TABLE public.verifactu_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.verifactu_records_block_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'verifactu_records es de solo inserción (% bloqueado)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS trg_verifactu_records_block ON public.verifactu_records;
CREATE TRIGGER trg_verifactu_records_block
  BEFORE UPDATE OR DELETE ON public.verifactu_records
  FOR EACH ROW EXECUTE FUNCTION public.verifactu_records_block_changes();
