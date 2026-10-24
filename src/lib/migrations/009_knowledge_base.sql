-- Knowledge Base table for Knowledge Engine v2 (RAG)
-- Phase 1: keyword search via ILIKE
-- Phase 2: vector similarity via pgvector

-- Try to enable vector extension (may require superuser; safe to skip)
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  applicable_scenarios text[] DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for keyword search
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_title ON knowledge_base USING gin(to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS idx_knowledge_base_content ON knowledge_base USING gin(to_tsvector('simple', content));

-- Index for vector similarity (Phase 2)
-- CREATE INDEX IF NOT EXISTS idx_knowledge_base_embedding ON knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
