-- RPC: match_knowledge
-- 向量相似度检索知识库，供知识引擎使用
-- 依赖 pgvector 扩展（已启用）

DROP FUNCTION IF EXISTS match_knowledge(vector, int, uuid, uuid);
DROP FUNCTION IF EXISTS match_knowledge(vector, int, text, uuid);

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding   vector(1536),
  match_count       int     DEFAULT 5,
  filter_account_id text    DEFAULT NULL,
  filter_org_id     uuid    DEFAULT NULL
)
RETURNS TABLE (
  id                    text,
  category              text,
  title                 text,
  content               text,
  applicable_scenarios  text[],
  account_id            text,
  similarity            float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.category,
    kb.title,
    kb.content,
    kb.applicable_scenarios,
    kb.account_id,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    kb.embedding IS NOT NULL
    AND (filter_org_id IS NULL OR kb.org_id = filter_org_id)
    AND (
      filter_account_id IS NULL
      OR kb.account_id = filter_account_id
      OR kb.account_id IS NULL
    )
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
