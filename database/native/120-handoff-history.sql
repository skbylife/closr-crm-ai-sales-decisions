-- The existing ownership workflow records handoff notes and a scoped context pack.
-- Retain these alongside the original transfer event in the same transaction.
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.ownership_transfers ADD COLUMN IF NOT EXISTS context_snapshot jsonb;
