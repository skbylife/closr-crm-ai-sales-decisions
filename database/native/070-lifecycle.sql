-- Preserve update timestamps without depending on hosted database triggers.
CREATE OR REPLACE FUNCTION public.native_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT c.table_name FROM information_schema.columns c
   WHERE c.table_schema='public' AND c.column_name='updated_at'
   AND c.data_type='timestamp with time zone' LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS native_touch_updated_at ON public.%I',t.table_name);
  EXECUTE format('CREATE TRIGGER native_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.native_touch_updated_at()',t.table_name);
 END LOOP;
END $$;

-- Historical composite SET NULL FKs would also null the NOT NULL tenant id.
-- PostgreSQL 16 supports nulling only the relationship column, retaining isolation.
DO $$ DECLARE fk record; definition text; nullable_columns text; BEGIN
 FOR fk IN SELECT c.oid,c.conname,c.conrelid,c.conkey FROM pg_constraint c
   JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
   WHERE c.contype='f' AND c.confdeltype='n' AND n.nspname='public'
   AND array_length(c.conkey,1)>1 LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=fk.conrelid
    AND a.attnum=ANY(fk.conkey) AND a.attname='org_id') THEN CONTINUE; END IF;
  SELECT string_agg(quote_ident(a.attname),', ' ORDER BY keys.ordinality) INTO nullable_columns
  FROM unnest(fk.conkey) WITH ORDINALITY keys(attnum,ordinality)
  JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=keys.attnum
  WHERE a.attname<>'org_id';
  definition=pg_get_constraintdef(fk.oid);
  IF definition ~ 'ON DELETE SET NULL \(' THEN CONTINUE; END IF;
  definition=replace(definition,'ON DELETE SET NULL','ON DELETE SET NULL ('||nullable_columns||')');
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.conrelid::regclass,fk.conname);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',fk.conrelid::regclass,fk.conname,definition);
 END LOOP;
END $$;
