-- 知识库向量 embedding 字段（pgvector 已启用）
ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 向量余弦相似度索引
CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
