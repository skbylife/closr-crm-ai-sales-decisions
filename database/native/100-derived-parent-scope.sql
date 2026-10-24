-- Tables without org_id still need parent-scope validation: infer tenant from
-- the quote, and user ownership from the contact profile respectively.
CREATE OR REPLACE FUNCTION public.native_validate_quote_item_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE quote_org uuid; product_org uuid;
BEGIN
 SELECT org_id INTO quote_org FROM public.quotes WHERE id=NEW.quote_id;
 IF quote_org IS NULL THEN RAISE EXCEPTION 'Quote parent does not exist' USING ERRCODE='23503'; END IF;
 IF NEW.product_id IS NOT NULL THEN
  SELECT org_id INTO product_org FROM public.products WHERE id=NEW.product_id;
  IF product_org IS DISTINCT FROM quote_org THEN
   RAISE EXCEPTION 'Product belongs to a different organization' USING ERRCODE='23503';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.native_validate_quote_item_scope() FROM PUBLIC;
DROP TRIGGER IF EXISTS native_quote_item_scope ON public.quote_items;
CREATE TRIGGER native_quote_item_scope BEFORE INSERT OR UPDATE ON public.quote_items
 FOR EACH ROW EXECUTE FUNCTION public.native_validate_quote_item_scope();

CREATE OR REPLACE FUNCTION public.native_validate_outreach_profile_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE profile_user uuid;
BEGIN
 IF NEW.profile_id IS NULL THEN RETURN NEW; END IF;
 SELECT user_id INTO profile_user FROM public.contact_profiles_v2 WHERE id=NEW.profile_id;
 IF profile_user IS NULL OR profile_user IS DISTINCT FROM NEW.user_id THEN
  RAISE EXCEPTION 'Contact profile belongs to a different user' USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.native_validate_outreach_profile_scope() FROM PUBLIC;
DROP TRIGGER IF EXISTS native_outreach_profile_scope ON public.outreach_logs;
CREATE TRIGGER native_outreach_profile_scope BEFORE INSERT OR UPDATE ON public.outreach_logs
 FOR EACH ROW EXECUTE FUNCTION public.native_validate_outreach_profile_scope();
