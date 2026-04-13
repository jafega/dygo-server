-- Add lead scoring columns
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_score smallint,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at timestamp with time zone;

-- Index for sorting by score
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON public.leads(lead_score DESC NULLS LAST);
