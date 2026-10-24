// BABEL Engine — Vector Store
// 人物向量档案系统：保存人物档案、语义搜索策略案例、记录接触历史

import { createClient } from '@/lib/supabase/server';
import { getAiEmbeddingsUrl, getAiProviderConfig } from '@/lib/ai-provider-config';
import { isNativeKnowledge, searchNativeCases } from '@/lib/native-knowledge/repository';
import { validateEmbedding } from '@/lib/native-knowledge/embedding';

// ─── Config ────────────────────────────────────────────────────────────

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-v3';

// ─── Types ─────────────────────────────────────────────────────────────

export type DiscType = 'D' | 'I' | 'S' | 'C';

export type OutreachResult = 'positive' | 'negative' | 'neutral' | 'pending';

export type StrategyCaseResult = 'success' | 'failure' | 'neutral';

export interface ContactProfileData {
  linkedin_id?: string;
  linkedin_url?: string;
  name: string;
  headline?: string;
  current_company?: string;
  location?: string;
  disc_primary?: DiscType;
  disc_secondary?: DiscType;
  disc_confidence?: number;
  disc_evidence?: string[];
  disc_approach?: string;
  disc_risk_warnings?: string[];
  optimal_channel?: string;
  opening_line_template?: string;
  outreach_count?: number;
  last_outreach_at?: string;
  last_outreach_result?: string;
  successful_strategies?: string[];
  raw_linkedin_data?: Record<string, unknown>;
  notes?: string;
}

export interface ContactProfile extends ContactProfileData {
  id: string;
  user_id: string;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface StrategyCase {
  id: string;
  situation: string;
  target_type?: string;
  disc_type?: string;
  approach: string;
  opening_line?: string;
  result?: StrategyCaseResult;
  why_it_worked?: string;
  source?: string;
  tags?: string[];
  embedding?: number[];
  created_at: string;
}

export interface OutreachLogData {
  strategy_name?: string;
  message_text?: string;
  channel?: string;
  result?: OutreachResult;
  response_received?: boolean;
  response_time_hours?: number;
  meeting_booked?: boolean;
  notes?: string;
}

export interface OutreachLog extends OutreachLogData {
  id: string;
  profile_id: string;
  user_id: string;
  created_at: string;
}

export interface ContactWithHistory {
  profile: ContactProfile;
  logs: OutreachLog[];
}

// ─── Embedding ─────────────────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const config = getAiProviderConfig();
  const embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
  if (!config.apiKey || config.provider === 'disabled') throw new Error('Embedding provider is not configured');
  if (isNativeKnowledge() && !config.embeddingModel) throw new Error('AI_EMBEDDING_MODEL is required for native vectors');

  const res = await fetch(getAiEmbeddingsUrl(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: text,
      encoding_format: 'float',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) throw new Error('Embedding API returned empty data');
  validateEmbedding(embedding, embeddingModel);
  return embedding;
}

/**
 * 构建用于向量化的人物摘要文本
 */
function buildProfileText(profile: ContactProfileData): string {
  const parts: string[] = [
    profile.name,
    profile.headline ?? '',
    profile.current_company ?? '',
    profile.location ?? '',
    profile.disc_primary ? `DISC: ${profile.disc_primary}` : '',
    profile.disc_approach ?? '',
    ...(profile.disc_evidence ?? []),
    profile.notes ?? '',
  ];
  return parts.filter(Boolean).join('. ');
}

// ─── 1. saveContactProfile ─────────────────────────────────────────────

/**
 * 保存人物档案（含向量化）。
 * 若该 user_id + linkedin_id 组合已存在则 upsert，否则 insert。
 */
export async function saveContactProfile(
  userId: string,
  profileData: ContactProfileData,
): Promise<ContactProfile> {
  const supabase = await createClient();

  // 向量化
  const text = buildProfileText(profileData);
  const config = getAiProviderConfig();
  const native = isNativeKnowledge();
  const embedding = native && (!config.embeddingModel || !config.baseUrl || !config.apiKey || config.provider === 'disabled')
    ? null : await embedText(text);

  const payload = {
    user_id: userId,
    linkedin_id: profileData.linkedin_id ?? null,
    linkedin_url: profileData.linkedin_url ?? null,
    name: profileData.name,
    headline: profileData.headline ?? null,
    current_company: profileData.current_company ?? null,
    location: profileData.location ?? null,
    disc_primary: profileData.disc_primary ?? null,
    disc_secondary: profileData.disc_secondary ?? null,
    disc_confidence: profileData.disc_confidence ?? 0,
    disc_evidence: profileData.disc_evidence ?? [],
    disc_approach: profileData.disc_approach ?? null,
    disc_risk_warnings: profileData.disc_risk_warnings ?? [],
    optimal_channel: profileData.optimal_channel ?? 'linkedin_dm',
    opening_line_template: profileData.opening_line_template ?? null,
    outreach_count: profileData.outreach_count ?? 0,
    last_outreach_at: profileData.last_outreach_at ?? null,
    last_outreach_result: profileData.last_outreach_result ?? null,
    successful_strategies: profileData.successful_strategies ?? [],
    raw_linkedin_data: profileData.raw_linkedin_data ?? null,
    notes: profileData.notes ?? null,
    embedding: embedding ? `[${embedding.join(',')}]` : null,
    ...(native ? { embedding_model: embedding ? config.embeddingModel : null, embedding_dimensions: embedding ? 1536 : null } : {}),
  };

  const { data, error } = await supabase
    .from('contact_profiles_v2')
    .upsert(payload, {
      onConflict: 'user_id,linkedin_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`saveContactProfile failed: ${error.message}`);
  }

  return data as ContactProfile;
}

// ─── 2. searchSimilarCases ────────────────────────────────────────────

/**
 * 语义搜索相似策略案例（strategy_cases 表）。
 *
 * @param query    搜索文本
 * @param discType 可选，过滤 DISC 类型
 * @param limit    返回条数，默认 5
 */
export async function searchSimilarCases(
  query: string,
  discType?: DiscType,
  limit = 5,
): Promise<StrategyCase[]> {
  if (isNativeKnowledge()) {
    const config = getAiProviderConfig();
    const values = config.baseUrl && config.apiKey && config.embeddingModel && config.provider !== 'disabled' ? await embedText(query).catch(() => null) : null;
    return searchNativeCases<StrategyCase>({ text: query, discType, limit,
      embedding: values ? { values, model: config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL } : null });
  }
  const supabase = await createClient();

  const embedding = await embedText(query);

  // 使用 Supabase RPC 进行向量相似搜索
  // 需要在 DB 侧创建对应的 match_strategy_cases function；
  // 如果还没有，则使用 raw SQL 通过 rpc 调用。
  const { data, error } = await supabase.rpc('match_strategy_cases', {
    query_embedding: embedding,
    match_count: limit,
    filter_disc_type: discType ?? null,
  });

  if (error) {
    // 如果 RPC 不存在，fallback 到全表按相似度排序（仅限小数据集）
    console.warn('match_strategy_cases RPC not found, using fallback:', error.message);
    return searchSimilarCasesFallback(supabase, embedding, discType, limit);
  }

  return (data ?? []) as StrategyCase[];
}

/**
 * Fallback：从 strategy_cases 拉取数据后在内存中计算余弦相似度。
 * 仅适用于小数据集（< 1000 条）。
 */
async function searchSimilarCasesFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  queryEmbedding: number[],
  discType?: DiscType,
  limit = 5,
): Promise<StrategyCase[]> {
  let query = supabase
    .from('strategy_cases')
    .select('*');

  if (discType) {
    query = query.eq('disc_type', discType);
  }

  const { data, error } = await query.limit(200);
  if (error) throw new Error(`searchSimilarCasesFallback failed: ${error.message}`);

  const rows = (data ?? []) as StrategyCase[];

  // 内存中计算余弦相似度
  const withScore = rows
    .filter((r) => Array.isArray(r.embedding) && r.embedding.length > 0)
    .map((r) => ({
      ...r,
      _score: cosineSimilarity(queryEmbedding, r.embedding as number[]),
    }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return withScore.map((row) => {
    return Object.fromEntries(Object.entries(row).filter(([key]) => key !== '_score')) as unknown as StrategyCase;
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── 3. getContactHistory ──────────────────────────────────────────────

/**
 * 获取联系人档案及所有接触历史。
 */
export async function getContactHistory(
  userId: string,
  linkedinId: string,
): Promise<ContactWithHistory | null> {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from('contact_profiles_v2')
    .select('*')
    .eq('user_id', userId)
    .eq('linkedin_id', linkedinId)
    .single();

  if (profileError) {
    if (profileError.code === 'PGRST116') return null; // not found
    throw new Error(`getContactHistory (profile) failed: ${profileError.message}`);
  }

  const { data: logs, error: logsError } = await supabase
    .from('outreach_logs')
    .select('*')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

  if (logsError) {
    throw new Error(`getContactHistory (logs) failed: ${logsError.message}`);
  }

  return {
    profile: profile as ContactProfile,
    logs: (logs ?? []) as OutreachLog[],
  };
}

// ─── 4. recordOutreachResult ──────────────────────────────────────────

/**
 * 记录一次接触结果，并更新 profile 的 outreach_count / last_outreach_at 等字段。
 */
export async function recordOutreachResult(
  profileId: string,
  result: OutreachLogData & { userId: string },
): Promise<OutreachLog> {
  const supabase = await createClient();

  // 插入接触日志
  const { data: log, error: logError } = await supabase
    .from('outreach_logs')
    .insert({
      profile_id: profileId,
      user_id: result.userId,
      strategy_name: result.strategy_name ?? null,
      message_text: result.message_text ?? null,
      channel: result.channel ?? null,
      result: result.result ?? 'pending',
      response_received: result.response_received ?? false,
      response_time_hours: result.response_time_hours ?? null,
      meeting_booked: result.meeting_booked ?? false,
      notes: result.notes ?? null,
    })
    .select()
    .single();

  if (logError) {
    throw new Error(`recordOutreachResult (insert log) failed: ${logError.message}`);
  }

  // 更新 profile 统计
  const updateFields: Record<string, unknown> = {
    last_outreach_at: new Date().toISOString(),
    last_outreach_result: result.result ?? 'pending',
  };

  // 如果是成功的接触，追加到 successful_strategies
  if (result.result === 'positive' && result.strategy_name) {
    // 用数据库端 array_append 避免 race condition
    await supabase.rpc('append_successful_strategy', {
      p_profile_id: profileId,
      p_strategy: result.strategy_name,
    }).then(() => {
      // RPC 可能不存在，静默失败（下方 update 会处理 count）
    });
  }

  // increment outreach_count
  const { error: incrError } = await supabase.rpc('increment_outreach_count', {
    p_profile_id: profileId,
  });

  if (incrError) {
    // RPC 不存在时 fallback：手动 fetch + update
    const { data: current } = await supabase
      .from('contact_profiles_v2')
      .select('outreach_count')
      .eq('id', profileId)
      .single();

    updateFields.outreach_count = ((current?.outreach_count as number) ?? 0) + 1;
  }

  await supabase
    .from('contact_profiles_v2')
    .update(updateFields)
    .eq('id', profileId);

  return log as OutreachLog;
}
