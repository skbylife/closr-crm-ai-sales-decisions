-- CRM Batch 4: allow CSV import governance to track lead imports.

DO $$
DECLARE
  constraint_name text;
BEGIN
  IF to_regclass('public.import_jobs') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.import_jobs'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%object_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.import_jobs DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;

    ALTER TABLE public.import_jobs
      ADD CONSTRAINT import_jobs_object_type_check
      CHECK (object_type IN ('accounts', 'contacts', 'leads'));
  END IF;

  IF to_regclass('public.field_mappings') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.field_mappings'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%object_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.field_mappings DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;

    ALTER TABLE public.field_mappings
      ADD CONSTRAINT field_mappings_object_type_check
      CHECK (object_type IN ('accounts', 'contacts', 'leads'));
  END IF;

  IF to_regclass('public.duplicate_candidates') IS NOT NULL THEN
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.duplicate_candidates'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%existing_entity_type%'
    LOOP
      EXECUTE format('ALTER TABLE public.duplicate_candidates DROP CONSTRAINT IF EXISTS %I', constraint_name);
    END LOOP;

    ALTER TABLE public.duplicate_candidates
      ADD CONSTRAINT duplicate_candidates_existing_entity_type_check
      CHECK (existing_entity_type IN ('account', 'contact', 'lead'));
  END IF;
END $$;
