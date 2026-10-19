-- Extend the strategic_plays table created by the preceding Community preview migration.
ALTER TABLE public.strategic_plays ADD COLUMN IF NOT EXISTS success_criteria text;
ALTER TABLE public.strategic_plays ADD COLUMN IF NOT EXISTS momentum text DEFAULT 'active';
ALTER TABLE public.strategic_plays ADD COLUMN IF NOT EXISTS assumptions jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.strategic_plays ADD COLUMN IF NOT EXISTS learnings jsonb DEFAULT '[]'::jsonb;
