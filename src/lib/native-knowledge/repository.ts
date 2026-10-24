import { query, queryOne } from '@/lib/postgres';
import { vectorParameter, type EmbeddingVector } from './embedding';

export const isNativeKnowledge = () => process.env.CLOSR_DATABASE_BACKEND === 'postgres';

export interface NativeKnowledgeRow {
  id: string;
  category: string;
  title: string;
  content: string;
  applicable_scenarios: string[];
  source?: string;
  source_type?: string;
  source_id?: string;
}

function validLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Knowledge limit must be between 1 and 50');
  return limit;
}
function requireOrg(orgId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
    throw new Error('An authenticated organization scope is required');
  }
}
function keywords(text: string): string[] {
  return text.split(/[，,\s]+/).filter(word => word.length > 1).slice(0, 8)
    .map(word => `%${word.replace(/[\\%_]/g, '\\$&')}%`);
}

/** Internal repository: caller must derive orgId from the authenticated UserContext.
 * A general record is readable only when explicitly marked and not attached to an org/account.
 * Model-mismatched rows never participate in vector ranking; keyword fallback is explicit.
 */
export async function searchNativeKnowledge(params: {
  orgId: string; accountId?: string; text: string; limit?: number; embedding?: EmbeddingVector | null;
}): Promise<NativeKnowledgeRow[]> {
  requireOrg(params.orgId);
  const limit = validLimit(params.limit ?? 5);
  const scope = `( (org_id = $1::uuid AND (account_id IS NULL OR account_id = $2::text))
    OR (is_general_knowledge = true AND org_id IS NULL AND account_id IS NULL) )`;
  if (params.embedding) {
    const vector = vectorParameter(params.embedding);
    const rows = await query<NativeKnowledgeRow>(`SELECT id,category,title,content,applicable_scenarios,source,source_type,source_id
      FROM public.knowledge_base WHERE ${scope}
      AND embedding IS NOT NULL AND embedding_model = $3 AND embedding_dimensions = 1536
      ORDER BY embedding <=> $4::vector, id LIMIT $5`,
    [params.orgId, params.accountId ?? null, params.embedding.model, vector, limit]);
    if (rows.length) return rows;
  }
  const terms = keywords(params.text);
  if (!terms.length) return [];
  return query<NativeKnowledgeRow>(`SELECT id,category,title,content,applicable_scenarios,source,source_type,source_id
    FROM public.knowledge_base WHERE ${scope}
    AND (title ILIKE ANY($3::text[]) OR content ILIKE ANY($3::text[]))
    ORDER BY (account_id IS NOT NULL) DESC, id LIMIT $4`,
  [params.orgId, params.accountId ?? null, terms, limit]);
}

export async function searchNativeCases<T>(params: {
  text: string; discType?: string; limit?: number; embedding?: EmbeddingVector | null;
}): Promise<T[]> {
  const limit = validLimit(params.limit ?? 5);
  if (params.embedding) {
    const vector = vectorParameter(params.embedding);
    const rows = await query<T>(`SELECT id,situation,target_type,disc_type,approach,opening_line,result,why_it_worked,source,tags,created_at
      FROM public.strategy_cases WHERE is_general_knowledge = true AND org_id IS NULL
      AND ($1::text IS NULL OR disc_type = $1 OR disc_type IS NULL)
      AND embedding IS NOT NULL AND embedding_model = $2 AND embedding_dimensions = 1536
      ORDER BY embedding <=> $3::vector, id LIMIT $4`,
    [params.discType ?? null, params.embedding.model, vector, limit]);
    if (rows.length) return rows;
  }
  const terms = keywords(params.text);
  if (!terms.length) return [];
  return query<T>(`SELECT id,situation,target_type,disc_type,approach,opening_line,result,why_it_worked,source,tags,created_at
    FROM public.strategy_cases WHERE is_general_knowledge = true AND org_id IS NULL
    AND ($1::text IS NULL OR disc_type = $1 OR disc_type IS NULL)
    AND (situation ILIKE ANY($2::text[]) OR approach ILIKE ANY($2::text[]))
    ORDER BY id LIMIT $3`, [params.discType ?? null, terms, limit]);
}

export async function saveNativeKnowledge(params: {
  orgId: string; accountId: string; title: string; content: string; category: string;
  applicableScenarios?: string[]; source?: string; sourceType?: string; sourceId?: string;
  embedding?: EmbeddingVector | null;
}): Promise<{ id: string }> {
  requireOrg(params.orgId);
  const vector = params.embedding ? vectorParameter(params.embedding) : null;
  const conflict = params.sourceType && params.sourceId
    ? `ON CONFLICT (org_id,source_type,source_id) DO UPDATE SET
      account_id=EXCLUDED.account_id,title=EXCLUDED.title,content=EXCLUDED.content,
      category=EXCLUDED.category,applicable_scenarios=EXCLUDED.applicable_scenarios,
      embedding=EXCLUDED.embedding,embedding_model=EXCLUDED.embedding_model,
      embedding_dimensions=EXCLUDED.embedding_dimensions,updated_at=now()` : '';
  const row = await queryOne<{ id: string }>(`INSERT INTO public.knowledge_base
    (org_id,account_id,title,content,category,applicable_scenarios,source,source_type,source_id,
     embedding,embedding_model,embedding_dimensions,is_general_knowledge)
    VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,false)
    ${conflict} RETURNING id`, [params.orgId, params.accountId, params.title.slice(0,500),
    params.content.slice(0,8000), params.category, params.applicableScenarios ?? [], params.source ?? 'manual',
    params.sourceType ?? null, params.sourceId ?? null, vector,
    params.embedding?.model ?? null, params.embedding ? 1536 : null]);
  if (!row) throw new Error('Knowledge insert did not return a row');
  return row;
}
