-- RPC: match_strategy_cases
-- 向量相似度检索策略案例，供谋局引擎使用
-- 依赖 pgvector 扩展（已启用）

-- 注意：ivfflat 索引需要足够数据量（>= 1000 行）才能发挥作用
-- 数据量少时跳过，依赖顺序扫描（strategy_cases 数据量有限时性能可接受）
-- 待数据量 >= 1000 行后手动执行：
-- CREATE INDEX idx_strategy_cases_embedding ON strategy_cases USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 创建/替换 match_strategy_cases RPC
CREATE OR REPLACE FUNCTION match_strategy_cases(
  query_embedding  vector(1536),
  match_count      int     DEFAULT 5,
  filter_disc_type text    DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  situation       text,
  target_type     text,
  disc_type       text,
  approach        text,
  opening_line    text,
  result          text,
  why_it_worked   text,
  source          text,
  tags            text[],
  created_at      timestamptz,
  similarity      float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.situation,
    sc.target_type,
    sc.disc_type,
    sc.approach,
    sc.opening_line,
    sc.result,
    sc.why_it_worked,
    sc.source,
    sc.tags,
    sc.created_at,
    1 - (sc.embedding <=> query_embedding) AS similarity
  FROM strategy_cases sc
  WHERE
    sc.embedding IS NOT NULL
    AND (filter_disc_type IS NULL OR sc.disc_type = filter_disc_type)
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
