-- Retained application RPC contracts, executed with the caller's PostgreSQL RLS role.
-- No arbitrary SQL execution RPC is provided.
CREATE OR REPLACE FUNCTION public.match_strategy_cases(
 query_embedding vector(1536), match_count integer DEFAULT 5, filter_disc_type text DEFAULT NULL
) RETURNS TABLE(id uuid,situation text,target_type text,disc_type text,approach text,
 opening_line text,result text,why_it_worked text,source text,tags text[],created_at timestamptz,similarity float)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT sc.id,sc.situation,sc.target_type,sc.disc_type,sc.approach,sc.opening_line,
 sc.result,sc.why_it_worked,sc.source,sc.tags,sc.created_at,1-(sc.embedding <=> query_embedding)
 FROM public.strategy_cases sc WHERE sc.embedding IS NOT NULL
 AND (filter_disc_type IS NULL OR sc.disc_type=filter_disc_type)
 ORDER BY sc.embedding <=> query_embedding LIMIT LEAST(GREATEST(COALESCE(match_count,5),1),50)
$$;
CREATE OR REPLACE FUNCTION public.match_knowledge(
 query_embedding vector(1536),match_count integer DEFAULT 5,filter_account_id text DEFAULT NULL,filter_org_id uuid DEFAULT NULL
) RETURNS TABLE(id text,category text,title text,content text,applicable_scenarios text[],account_id text,similarity float)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT kb.id,kb.category,kb.title,kb.content,kb.applicable_scenarios,kb.account_id,
 1-(kb.embedding <=> query_embedding) FROM public.knowledge_base kb
 WHERE kb.embedding IS NOT NULL AND filter_org_id IS NOT NULL
 AND ((kb.org_id=filter_org_id AND (filter_account_id IS NULL OR kb.account_id=filter_account_id OR kb.account_id IS NULL))
   OR (kb.org_id IS NULL AND kb.account_id IS NULL AND kb.is_general_knowledge))
 ORDER BY kb.embedding <=> query_embedding LIMIT LEAST(GREATEST(COALESCE(match_count,5),1),50)
$$;
CREATE OR REPLACE FUNCTION public.append_successful_strategy(p_profile_id uuid,p_strategy text)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 UPDATE public.contact_profiles_v2 SET successful_strategies=
   CASE WHEN COALESCE(successful_strategies,'[]'::jsonb) @> jsonb_build_array(p_strategy)
   THEN successful_strategies ELSE COALESCE(successful_strategies,'[]'::jsonb)||jsonb_build_array(p_strategy) END,
   updated_at=now() WHERE id=p_profile_id AND length(p_strategy) BETWEEN 1 AND 2000
$$;
CREATE OR REPLACE FUNCTION public.increment_outreach_count(p_profile_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 UPDATE public.contact_profiles_v2 SET outreach_count=COALESCE(outreach_count,0)+1,updated_at=now() WHERE id=p_profile_id
$$;
REVOKE ALL ON FUNCTION public.match_strategy_cases(vector,integer,text),public.match_knowledge(vector,integer,text,uuid),
 public.append_successful_strategy(uuid,text),public.increment_outreach_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_strategy_cases(vector,integer,text),public.match_knowledge(vector,integer,text,uuid),
 public.append_successful_strategy(uuid,text),public.increment_outreach_count(uuid) TO closr_app;
