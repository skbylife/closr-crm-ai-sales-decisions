// BABEL Engine — Phase 2: Multi-Turn Context Memory
// Fetches historical decode summaries for a contact and formats them
// as prompt context, enabling trend detection across interactions.

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { SentimentTrend, RiskLevel, BuyerState } from './types';

export interface DecodeHistorySummary {
  date: string;
  keySignal: string;
  sentimentTrend: SentimentTrend;
  buyerState: BuyerState;
  riskLevel: RiskLevel;
  topEmotion: string;
}

/**
 * Fetch recent decode history for a contact.
 * Returns summaries extracted from the decode JSONB field's thread_analysis.
 */
export async function fetchDecodeHistory(
  contactId: string,
  userId: string,
  limit = 5,
  orgId?: string,
): Promise<DecodeHistorySummary[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  let query = supabase
    .from('email_decodes')
    .select('created_at, decode')
    .eq('matched_contact_id', contactId)
    .eq('user_id', userId);

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error('[context-memory] Failed to fetch decode history:', error);
    return [];
  }

  return data
    .map((row: { created_at: string; decode: Record<string, unknown> | null }) => {
      const decode = row.decode as {
        threadAnalysis?: {
          keySignal?: string;
          sentimentTrend?: string;
          riskLevel?: string;
          buyerState?: string;
        };
        messages?: { decode?: { emotion?: string } }[];
      } | null;

      const ta = decode?.threadAnalysis;
      if (!ta) return null;

      // Pick the first "them" emotion as topEmotion
      const topEmotion =
        decode?.messages?.find((m) => m.decode?.emotion)?.decode?.emotion ?? '未知';

      return {
        date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '未知',
        keySignal: ta.keySignal ?? '',
        sentimentTrend: (ta.sentimentTrend ?? 'stable') as SentimentTrend,
        buyerState: (ta.buyerState ?? 'evaluating') as BuyerState,
        riskLevel: (ta.riskLevel ?? 'low') as RiskLevel,
        topEmotion,
      } satisfies DecodeHistorySummary;
    })
    .filter((item): item is DecodeHistorySummary => item !== null);
}

const TREND_LABELS: Record<SentimentTrend, string> = {
  warming: '升温',
  cooling: '降温',
  stable: '稳定',
  volatile: '波动',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '危急',
};

const BUYER_STATE_LABELS: Record<BuyerState, string> = {
  engaged: '积极参与',
  evaluating: '评估中',
  stalling: '拖延',
  ghosting: '失联',
  evaluator_to_ghost: '从评估转失联',
  ready_to_buy: '准备购买',
};

/**
 * Format decode history into a prompt-injectable context block.
 * Returns empty string if no history exists.
 */
export function formatContextMemory(history: DecodeHistorySummary[]): string {
  if (history.length === 0) return '';

  const lines = history
    // Reverse so oldest is first (chronological order)
    .slice()
    .reverse()
    .map(
      (h) =>
        `- [${h.date}] 信号: ${h.keySignal} | 情绪趋势: ${TREND_LABELS[h.sentimentTrend]} | 买家状态: ${BUYER_STATE_LABELS[h.buyerState]} | 风险: ${RISK_LABELS[h.riskLevel]} | 主要情绪: ${h.topEmotion}`,
    )
    .join('\n');

  return `## 历史互动记忆（同一联系人最近 ${history.length} 次 Decode）

以下是该联系人过去的沟通信号摘要，请结合历史趋势进行分析——识别态度变化（升温/降温）、从犹豫到积极等时序信号：

${lines}

请在本次分析中注意与历史的对比，如果发现趋势变化请在 key_signal 中指出。`;
}
