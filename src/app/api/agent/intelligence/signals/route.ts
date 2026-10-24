/**
 * GET /api/agent/intelligence/signals
 *
 * 返回最近7天的高优先信号列表，用于 Dashboard 展示。
 * 支持 query params:
 *   - priority: high | medium | low（默认返回 high + medium）
 *   - limit: 最多返回条数（默认20）
 *   - contactId: 筛选特定联系人
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';

interface SignalRow {
  id: string;
  account_id: string | null;
  account_name: string | null;
  content: string;
  signal_type: string | null;
  priority: string;
  source_url: string | null;
  triggered_by: string;
  actioned_at: string | null;
  created_at: string;
}

interface SuggestedAction {
  kind: 'open_account' | 'generate_play' | 'review_signal' | 'schedule_meeting' | 'create_task';
  label: string;
  targetEntityType?: 'account' | 'contact' | 'opportunity';
}

interface ContradictionEntry {
  text: string;
  /** Higher severity = should be resolved first */
  severity: 'high' | 'medium' | 'low';
  /** Why this contradiction matters */
  reason: string;
}

interface SignalImpact {
  scope: 'account';
  impactLevel: 'high' | 'medium' | 'low';
  impactDirection: 'opportunity' | 'risk' | 'neutral';
  suggestedAction: SuggestedAction;
  actionRationale: string;
}

function getSignalImpact(signalType: string | null, priority: string): SignalImpact {
  const normalizedPriority = priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium';

  switch (signalType) {
    case 'competitor_news':
      return {
        scope: 'account',
        impactLevel: normalizedPriority,
        impactDirection: 'risk',
        suggestedAction: { kind: 'generate_play', label: '生成应对谋局', targetEntityType: 'account' },
        actionRationale: '竞品动态需要及时评估影响并制定应对策略',
      };
    case 'funding':
      return {
        scope: 'account',
        impactLevel: normalizedPriority,
        impactDirection: 'opportunity',
        suggestedAction: { kind: 'schedule_meeting', label: '安排跟进会议', targetEntityType: 'account' },
        actionRationale: '融资动态通常意味着新预算或战略调整，是推进的好时机',
      };
    case 'job_change':
      return {
        scope: 'account',
        impactLevel: normalizedPriority,
        impactDirection: 'opportunity',
        suggestedAction: { kind: 'open_account', label: '查看客户并更新联系人', targetEntityType: 'contact' },
        actionRationale: '职位变动可能影响决策链，需要确认关键联系人是否仍然有效',
      };
    case 'layoff':
      return {
        scope: 'account',
        impactLevel: normalizedPriority,
        impactDirection: 'risk',
        suggestedAction: { kind: 'create_task', label: '创建跟进任务评估影响', targetEntityType: 'account' },
        actionRationale: '裁员重组可能影响项目优先级和预算，需主动评估',
      };
    default:
      return {
        scope: 'account',
        impactLevel: normalizedPriority,
        impactDirection: normalizedPriority === 'high' ? 'risk' : 'neutral',
        suggestedAction: { kind: 'review_signal', label: '查看信号详情', targetEntityType: 'account' },
        actionRationale: '需要人工评估此信号对当前推进的影响',
      };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const { searchParams } = new URL(request.url);
    const priorityFilter = searchParams.get('priority'); // 'high' | 'medium' | 'low'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const contactId = searchParams.get('contactId');

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let query = admin
      .from('intel_items')
      .select(`
        id,
        account_id,
        account_name,
        content,
        signal_type,
        priority,
        source_url,
        triggered_by,
        actioned_at,
        created_at
      `)
      .eq('user_id', ctx.userId)
      .gte('created_at', since)
      .is('actioned_at', null) // 只返回未处理的
      .order('created_at', { ascending: false })
      .limit(limit);

    // 优先级筛选
    if (priorityFilter) {
      query = query.eq('priority', priorityFilter);
    } else {
      // 默认返回 high + medium
      query = query.in('priority', ['high', 'medium']);
    }

    // 当前 signals 基于 intel_items，仅支持 account 级信号
    if (contactId) {
      return NextResponse.json({
        signals: [],
        total: 0,
        scope: 'account',
        note: '当前 Intelligence signals 仅支持 account 级信号，不支持按 contactId 筛选。',
      });
    }

    const { data, error } = await query;

    if (error) {
      console.error('[/api/agent/intelligence/signals] DB error:', error.message);
      return NextResponse.json({ error: '获取信号失败' }, { status: 500 });
    }

    let signals = (data ?? []) as unknown as SignalRow[];

    // Defense-in-depth for Polanyi/Judgment Layer evidence: user-owned signal rows are still
    // checked against current account visibility before enriching with account claims.
    const visibleAccountIds = new Set<string>();
    for (const accountId of [...new Set(signals.map((s) => s.account_id).filter(Boolean))] as string[]) {
      try {
        await requireAccountAccess(ctx, accountId);
        visibleAccountIds.add(accountId);
      } catch {
        // Drop cross-org/out-of-scope signals instead of leaking related evidence context.
      }
    }
    signals = signals.filter((s) => !s.account_id || visibleAccountIds.has(s.account_id));

    // Best-effort: pull CIL claims (active + stale) for visible signal account IDs to enrich with evidence context
    const accountIds = [...visibleAccountIds];
    interface EnrichedClaim {
      statement: string;
      claimType: string;
      confidence: number;
      status: string;
      lastRevalidatedAt: string | null;
      freshness: 'fresh' | 'aging' | 'stale';
    }
    let claimsMap: Map<string, EnrichedClaim[]> = new Map();
    let contradictionsMap: Map<string, ContradictionEntry[]> = new Map();

    if (accountIds.length > 0) {
      try {
        const { data: claims } = await admin
          .from('account_claims')
          .select('account_id, statement, claim_type, confidence, status, last_revalidated_at')
          .in('account_id', accountIds)
          .in('status', ['active', 'stale'])
          .order('confidence', { ascending: false })
          .limit(80);
        if (claims) {
          const now = Date.now();
          const STALE_MS = 14 * 24 * 60 * 60 * 1000;
          const AGING_MS = 7 * 24 * 60 * 60 * 1000;

          for (const c of claims) {
            const acctId = c.account_id as string;
            if (!claimsMap.has(acctId)) claimsMap.set(acctId, []);

            const lastReval = c.last_revalidated_at ? new Date(c.last_revalidated_at as string).getTime() : 0;
            const age = lastReval > 0 ? now - lastReval : Infinity;
            const freshness: EnrichedClaim['freshness'] =
              c.status === 'stale' || age >= STALE_MS ? 'stale' :
              age >= AGING_MS ? 'aging' : 'fresh';

            claimsMap.get(acctId)!.push({
              statement: c.statement as string,
              claimType: c.claim_type as string,
              confidence: (c.confidence as number) ?? 0.5,
              status: c.status as string,
              lastRevalidatedAt: (c.last_revalidated_at as string) ?? null,
              freshness,
            });
          }

          // Detect per-account contradictions (same claim_type, opposing polarity)
          // Rank by severity: high-confidence claims involving decision-critical types rank higher
          const HIGH_IMPACT_CLAIM_TYPES = new Set(['budget', 'decision_maker', 'champion', 'timeline', 'authority', 'need']);
          for (const [acctId, acctClaims] of claimsMap) {
            const contradictions: ContradictionEntry[] = [];
            const byType = new Map<string, EnrichedClaim[]>();
            for (const cl of acctClaims) {
              const list = byType.get(cl.claimType) ?? [];
              list.push(cl);
              byType.set(cl.claimType, list);
            }
            for (const [claimType, groupClaims] of byType) {
              if (groupClaims.length < 2) continue;
              const negMarkers = ['不', '没', '未', '无', '缺乏', '暂停', '推迟', '拒绝', '反对', '风险', '阻塞'];
              for (let i = 0; i < groupClaims.length; i++) {
                for (let j = i + 1; j < groupClaims.length; j++) {
                  const aHasNeg = negMarkers.some((m) => groupClaims[i].statement.includes(m));
                  const bHasNeg = negMarkers.some((m) => groupClaims[j].statement.includes(m));
                  if (aHasNeg !== bHasNeg) {
                    // Rank severity by: claim type importance + average confidence
                    const avgConf = (groupClaims[i].confidence + groupClaims[j].confidence) / 2;
                    const isHighImpactType = HIGH_IMPACT_CLAIM_TYPES.has(claimType);
                    const severity: ContradictionEntry['severity'] =
                      (isHighImpactType && avgConf >= 0.6) ? 'high' :
                      (isHighImpactType || avgConf >= 0.5) ? 'medium' : 'low';
                    const reason = isHighImpactType
                      ? `${claimType} 类判断直接影响推进决策，需优先裁决`
                      : `${claimType} 类判断存在分歧，建议核实`;
                    contradictions.push({
                      text: `「${groupClaims[i].statement.slice(0, 40)}」vs「${groupClaims[j].statement.slice(0, 40)}」`,
                      severity,
                      reason,
                    });
                  }
                }
              }
            }
            if (contradictions.length > 0) {
              // Sort by severity: high first
              const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
              contradictions.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));
              contradictionsMap.set(acctId, contradictions);
            }
          }
        }
      } catch {
        // CIL tables may not exist yet — graceful degradation
        claimsMap = new Map();
        contradictionsMap = new Map<string, ContradictionEntry[]>();
      }
    }

    // Compute portfolio-level intelligence health summary
    const allClaims = [...claimsMap.values()].flat();
    const portfolioHealth = allClaims.length > 0
      ? {
          totalClaims: allClaims.length,
          fresh: allClaims.filter((c) => c.freshness === 'fresh').length,
          aging: allClaims.filter((c) => c.freshness === 'aging').length,
          stale: allClaims.filter((c) => c.freshness === 'stale').length,
          totalContradictions: [...contradictionsMap.values()].flat().length,
          highSeverityContradictions: [...contradictionsMap.values()].flat().filter((c) => c.severity === 'high').length,
        }
      : undefined;

    return NextResponse.json({
      signals: signals.map((s) => {
        const impact = getSignalImpact(s.signal_type, s.priority);
        const relatedClaims = s.account_id ? (claimsMap.get(s.account_id) ?? []).slice(0, 3) : [];
        const contradictions = s.account_id ? (contradictionsMap.get(s.account_id) ?? []) : [];
        const staleClaims = relatedClaims.filter((c) => c.freshness === 'stale').length;
        const agingClaims = relatedClaims.filter((c) => c.freshness === 'aging').length;

        // Freshness-to-urgency boost: if many stale/aging claims, escalate the signal's suggested action urgency
        let effectiveImpactLevel = impact.impactLevel;
        if (staleClaims >= 2 && effectiveImpactLevel === 'low') effectiveImpactLevel = 'medium';
        if (staleClaims >= 3 && effectiveImpactLevel === 'medium') effectiveImpactLevel = 'high';
        // High-severity contradictions also escalate
        const highContradictions = contradictions.filter((c) => c.severity === 'high');
        if (highContradictions.length > 0 && effectiveImpactLevel !== 'high') effectiveImpactLevel = 'high';

        return {
          id: s.id,
          scope: impact.scope,
          accountId: s.account_id,
          accountName: s.account_name,
          content: s.content,
          signalType: s.signal_type,
          priority: s.priority,
          sourceUrl: s.source_url,
          triggeredBy: s.triggered_by,
          createdAt: s.created_at,
          impactLevel: effectiveImpactLevel,
          impactDirection: impact.impactDirection,
          suggestedAction: impact.suggestedAction,
          actionRationale: impact.actionRationale,
          relatedClaims: relatedClaims.length > 0 ? relatedClaims : undefined,
          contradictions: contradictions.length > 0 ? contradictions : undefined,
          staleClaims: staleClaims > 0 ? staleClaims : undefined,
          agingClaims: agingClaims > 0 ? agingClaims : undefined,
          intelligenceHealth: relatedClaims.length > 0
            ? { total: relatedClaims.length, fresh: relatedClaims.filter((c) => c.freshness === 'fresh').length, stale: staleClaims, aging: agingClaims }
            : undefined,
        };
      }),
      total: signals.length,
      scope: 'account',
      portfolioHealth,
    });
  } catch (err) {
    return guardResponse(err) as NextResponse;
  }
}

/**
 * PATCH /api/agent/intelligence/signals
 * 标记信号已处理
 * Body: { signalId: string }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    const admin = requireAdmin();

    const body = (await request.json()) as { signalId: string };
    if (!body.signalId) {
      return NextResponse.json({ error: '缺少 signalId' }, { status: 400 });
    }

    const { error } = await admin
      .from('intel_items')
      .update({ actioned_at: new Date().toISOString() })
      .eq('id', body.signalId)
      .eq('user_id', ctx.userId); // 确保只能操作自己的数据

    if (error) {
      return NextResponse.json({ error: '标记失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return guardResponse(err) as NextResponse;
  }
}
