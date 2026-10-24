import type {
  AccountMemoryConflict,
  AccountMemorySummary,
  AccountMemorySummarySnapshot,
  DealPulseMetric,
  Judgment,
  JudgmentRevisionItem,
  JudgmentStatus,
  JudgmentValue,
  MomentumShift,
  RecommendationEvidenceItem,
} from '@/lib/babel-engine/types';

function toStatusFromConflict(hasConflict: boolean): JudgmentStatus {
  return hasConflict ? 'provisional' : 'active';
}

function buildRevisionReason(params: {
  previousLabel?: string;
  currentLabel: string;
  reasons: Array<string | null | undefined>;
}) {
  const { previousLabel, currentLabel, reasons } = params;
  const base = previousLabel && previousLabel !== currentLabel
    ? `判断由“${previousLabel}”修正为“${currentLabel}”`
    : `判断维持“${currentLabel}”，但依据已更新`;
  const detail = reasons.filter(Boolean).join('；');
  return detail ? `${base}；${detail}` : base;
}


function describeRiskSignals(params: {
  conflicts: AccountMemoryConflict[];
  recentRisk: AccountMemorySummary['timelineHighlights'];
  blockers: AccountMemorySummary['people'];
  tensions: string[];
}): string[] {
  const { conflicts, recentRisk, blockers, tensions } = params;
  return [
    ...conflicts.slice(0, 2).map((item) => `矛盾信号：${item.summary}`),
    ...recentRisk.slice(0, 2).map((item) => `风险信号：${item.title} — ${item.summary || '需确认影响范围'}`),
    ...tensions.slice(0, 2).map((item) => `内部张力：${item}`),
    ...blockers.slice(0, 3).map((person) => `疑似阻碍方：${personLabel(person)} — ${person.summary || '阻碍点待确认'}`),
  ].filter(Boolean);
}


function personLabel(person: AccountMemorySummary['people'][number]): string {
  const qualifier = person.title || person.influenceLabel || person.role;
  return qualifier ? `${person.name}（${qualifier}）` : person.name;
}

function concreteRiskText(params: {
  conflicts?: AccountMemoryConflict[];
  recentRisk?: AccountMemorySummary['timelineHighlights'];
  blockers?: AccountMemorySummary['people'];
  tensions?: string[];
  fallback?: string;
}): string {
  const conflict = params.conflicts?.find((item) => item.summary?.trim());
  if (conflict) return `矛盾信号：${conflict.summary}`;
  const riskEvent = params.recentRisk?.find((item) => item.summary?.trim() || item.title?.trim());
  if (riskEvent) return `风险信号：${riskEvent.title} — ${riskEvent.summary || '需要确认该信号是否影响推进节奏'}`;
  const blocker = params.blockers?.find((item) => item.name?.trim());
  if (blocker) return `疑似阻碍方：${personLabel(blocker)} — ${blocker.summary || '需要确认具体阻碍点'}`;
  const tension = params.tensions?.find((item) => item?.trim());
  if (tension) return `待核实张力：${tension}`;
  return params.fallback ?? '当前暂无明确高强度交易风险。';
}

function concreteAlignmentText(params: { tensions?: string[]; blockers?: AccountMemorySummary['people']; fallback?: string }): string {
  const tension = params.tensions?.find((item) => item?.trim());
  if (tension) return `待处理张力：${tension}`;
  const blocker = params.blockers?.find((item) => item.name?.trim());
  if (blocker) return `疑似阻碍方：${personLabel(blocker)} — ${blocker.summary || '阻碍点待确认'}`;
  return params.fallback ?? '当前未见明显内部对齐问题。';
}

export function buildRevisionHistory(params: {
  kind: Judgment['kind'];
  title: string;
  summaryHistory?: AccountMemorySummarySnapshot[];
  fallback?: JudgmentRevisionItem[];
}) {
  const { kind, title, summaryHistory, fallback = [] } = params;
  if (!summaryHistory || summaryHistory.length === 0) return fallback;

  const items = summaryHistory.map<JudgmentRevisionItem>((snapshot) => {
    let summary = snapshot.summary.narrativeSummary;
    if (kind === 'momentum') {
      summary = snapshot.summary.momentum.label;
    } else if (kind === 'champion_strength') {
      const supporters = snapshot.summary.people.filter((p) => p.stance === 'supportive');
      summary = supporters.length > 0 ? `已识别 ${supporters.length} 位支持者：${supporters.map((p) => p.name).join('、')}` : '未识别明确支持者';
    } else if (kind === 'internal_alignment') {
      const blockers = snapshot.summary.people.filter((p) => p.stance === 'blocking');
      summary = concreteAlignmentText({
        tensions: snapshot.summary.tensions,
        blockers,
        fallback: '未见明显内部对齐问题',
      });
    } else if (kind === 'deal_risk') {
      const blockers = snapshot.summary.people.filter((p) => p.stance === 'blocking');
      const recentRisk = snapshot.summary.timelineHighlights.filter((item) => item.signal === 'risk');
      summary = concreteRiskText({ recentRisk, blockers, tensions: snapshot.summary.tensions });
    } else if (kind === 'general') {
      summary = snapshot.summary.timelineHighlights[0]?.summary ?? snapshot.summary.narrativeSummary;
    }

    return {
      id: `${title}:${snapshot.id}`,
      title,
      summary,
      changedAt: snapshot.summary.timelineHighlights[0]?.occurredAt ?? snapshot.summary.lastComputedAt,
    };
  });

  // Reverse so index 0 = oldest, making the chain read chronologically (oldest → newest).
  return items.reverse();
}

// ─── Deal Pulse Builder ──────────────────────────────────────────────

export function buildDealPulse(summary: AccountMemorySummary | null, momentumShift?: MomentumShift | null): DealPulseMetric[] {
  const baseConfidence = summary?.confidence ?? 0.45;

  // ── Momentum ──
  const momentumValue: JudgmentValue = (() => {
    switch (summary?.momentum.status) {
      case 'rising': return 'high';
      case 'steady': return 'medium';
      case 'slowing': return 'low';
      case 'stalled': return 'very_low';
      case 'at_risk': return 'very_low';
      default: return 'unknown';
    }
  })();

  const recentPositive = (summary?.timelineHighlights ?? []).filter((h) => h.signal === 'positive').length;
  const recentRisk = (summary?.timelineHighlights ?? []).filter((h) => h.signal === 'risk').length;
  const momentumObs: string[] = [];
  if (summary?.momentum.reasoning) momentumObs.push(summary.momentum.reasoning);
  if (recentPositive > 0) momentumObs.push(`近期 ${recentPositive} 个正向信号`);
  if (recentRisk > 0) momentumObs.push(`近期 ${recentRisk} 个风险信号`);

  // ── Champion ──
  const supportiveCount = summary?.people.filter((p) => p.stance === 'supportive').length ?? 0;
  const blockingCount = summary?.people.filter((p) => p.stance === 'blocking').length ?? 0;
  const unclearCount = summary?.people.filter((p) => p.stance === 'unclear').length ?? 0;
  const championObs: string[] = [];
  if (supportiveCount > 0) {
    const names = summary!.people.filter((p) => p.stance === 'supportive').map((p) => p.name).join('、');
    championObs.push(`支持者：${names}`);
  }
  if (blockingCount > 0) {
    const names = summary!.people.filter((p) => p.stance === 'blocking').map((p) => p.name).join('、');
    championObs.push(`阻碍方：${names}`);
  }
  if (unclearCount > 0) championObs.push(`${unclearCount} 位立场不明`);

  // ── Internal alignment ──
  const tensionCount = summary?.tensions.length ?? 0;
  const alignmentObs: string[] = [];
  if (tensionCount > 0) {
    summary!.tensions.slice(0, 2).forEach((t) => alignmentObs.push(t));
  }
  if (blockingCount > 0) alignmentObs.push(`疑似阻碍方：${summary!.people.filter((p) => p.stance === 'blocking').map(personLabel).join('、')}`);

  // ── Buying urgency ──
  const urgencyObs: string[] = [];
  const timelineHint = summary?.timelineHighlights?.[0];
  if (timelineHint) urgencyObs.push(timelineHint.summary);
  if (summary?.momentum.status === 'rising') urgencyObs.push('动量上升，买方可能有内部时间压力');
  if (summary?.momentum.status === 'stalled') urgencyObs.push('动量停滞，缺乏明确推进信号');

  // ── Risk ──
  const riskObs: string[] = [];
  const riskEvents = (summary?.timelineHighlights ?? []).filter((h) => h.signal === 'risk');
  if (blockingCount > 0) riskObs.push(`疑似阻碍方：${summary!.people.filter((p) => p.stance === 'blocking').map(personLabel).join('、')}`);
  if (tensionCount > 0) summary!.tensions.slice(0, 2).forEach((t) => riskObs.push(`内部张力：${t}`));
  if (riskEvents.length > 0) riskObs.push(...riskEvents.slice(0, 2).map((item) => `风险事件：${item.title} — ${item.summary}`));
  if (riskObs.length === 0) riskObs.push('暂未发现高强度风险信号');

  return [
    {
      kind: 'momentum',
      label: '动量',
      value: momentumValue,
      summary: summary?.momentum.label ?? '暂无判断',
      observations: momentumObs.length > 0 ? momentumObs : undefined,
      confidence: baseConfidence,
      previousSummary: momentumShift ? momentumShift.previousLabel : undefined,
      changeSummary: momentumShift ? momentumShift.summary : undefined,
      changeSignals: momentumShift?.evidenceRefs?.map((item) => item.title ?? item.sourceId),
    },
    {
      kind: 'champion_strength',
      label: '关键推动者强度',
      value: supportiveCount >= 2 ? 'high' : supportiveCount === 1 ? 'medium' : 'low',
      summary: supportiveCount > 0 ? `已识别 ${supportiveCount} 位支持者` : '尚未识别明确关键推动者',
      observations: championObs.length > 0 ? championObs : undefined,
      confidence: Math.max(0.35, Math.min(0.9, baseConfidence)),
    },
    {
      kind: 'internal_alignment',
      label: '内部一致性',
      value: blockingCount > 0 || tensionCount > 1 ? 'low' : tensionCount === 1 ? 'medium' : 'high',
      summary: concreteAlignmentText({ tensions: summary?.tensions ?? [], blockers: summary?.people.filter((p) => p.stance === 'blocking') ?? [], fallback: '当前未见明显对立信号' }),
      observations: alignmentObs.length > 0 ? alignmentObs : undefined,
      confidence: Math.max(0.3, baseConfidence - 0.05),
    },
    {
      kind: 'buying_urgency',
      label: '采购紧迫性',
      value: summary?.momentum.status === 'rising' ? 'high' : summary?.momentum.status === 'steady' ? 'medium' : 'low',
      summary: summary?.timelineHighlights?.[0]?.summary ?? '暂缺明确时间压力信号',
      observations: urgencyObs.length > 0 ? urgencyObs : undefined,
      confidence: Math.max(0.25, baseConfidence - 0.1),
    },
    {
      kind: 'deal_risk',
      label: '风险',
      value: blockingCount > 0 || tensionCount > 0 ? 'high' : 'medium',
      summary: concreteRiskText({ blockers: summary?.people.filter((p) => p.stance === 'blocking') ?? [], tensions: summary?.tensions ?? [], recentRisk: riskEvents, fallback: '暂未发现高强度阻碍方' }),
      observations: riskObs,
      confidence: Math.max(0.3, baseConfidence),
    },
  ];
}

// ─── Judgment Builder ────────────────────────────────────────────────

export function buildJudgmentsFromMemory(params: {
  summary: AccountMemorySummary | null;
  previousSummary?: AccountMemorySummary | null;
  summaryHistory?: AccountMemorySummarySnapshot[];
  conflicts: AccountMemoryConflict[];
  evidenceItems?: RecommendationEvidenceItem[];
  momentumShift?: MomentumShift | null;
}): Judgment[] {
  const { summary, previousSummary, summaryHistory, conflicts, evidenceItems = [], momentumShift } = params;
  if (!summary) return [];

  const hasConflict = conflicts.length > 0;
  const sharedEvidence = evidenceItems.slice(0, 3).map((item) => ({
    sourceId: item.sourceId,
    sourceKind: item.sourceKind,
    title: item.title,
    sourceTable: item.sourceTable,
    sourceRowId: item.sourceRowId,
  }));

  const judgments: Judgment[] = [];

  // 1. 动量判断 — 使用 momentum + timelineHighlights
  const recentPositive = summary.timelineHighlights.filter((h) => h.signal === 'positive');
  const recentRisk = summary.timelineHighlights.filter((h) => h.signal === 'risk');
  const momentumRationale = [
    summary.momentum.reasoning,
    recentPositive[0] ? `正向信号：${recentPositive[0].title} — ${recentPositive[0].summary}` : null,
    recentRisk[0] ? `风险信号：${recentRisk[0].title} — ${recentRisk[0].summary}` : null,
  ].filter(Boolean).join('；');

  judgments.push({
    id: `${summary.accountId}:momentum`,
    accountId: summary.accountId,
    kind: 'momentum',
    title: '交易动量评估',
    summary: summary.momentum.label,
    rationale: momentumRationale || '当前信息未显示明确动量趋势。',
    value: (() => {
      switch (summary.momentum.status) {
        case 'rising': return 'high' as JudgmentValue;
        case 'steady': return 'medium' as JudgmentValue;
        case 'slowing': return 'low' as JudgmentValue;
        case 'stalled': return 'very_low' as JudgmentValue;
        case 'at_risk': return 'very_low' as JudgmentValue;
        default: return 'unknown' as JudgmentValue;
      }
    })(),
    confidence: summary.confidence,
    status: toStatusFromConflict(hasConflict),
    evidenceRefs: [
      ...sharedEvidence,
      ...recentPositive.slice(0, 2).map((h) => ({ sourceId: h.sourceId, sourceKind: h.sourceKind, title: h.title, sourceRowId: h.sourceId })),
    ],
    contradictionIds: conflicts.map((c) => c.id),
    updatedAt: summary.lastComputedAt,
    previousTitle: '交易动量评估',
    previousSummary: momentumShift ? momentumShift.previousLabel : undefined,
    whyChanged: momentumShift?.whyChanged,
    changeEvidenceRefs: momentumShift?.evidenceRefs,
    revisionHistory: buildRevisionHistory({
      kind: 'momentum',
      title: '交易动量评估',
      summaryHistory,
    }),
  });

  // 2. 关键推动者判断 — 如果有 supportive people
  const supporters = summary.people.filter((p) => p.stance === 'supportive');
  const previousSupporters = previousSummary?.people.filter((p) => p.stance === 'supportive') ?? [];
  if (supporters.length > 0) {
    const supporterNames = supporters.map((p) => p.name).join('、');
    const previousSupporterNames = previousSupporters.map((p) => p.name).join('、');
    const championWhyChanged = previousSummary
      ? buildRevisionReason({
          previousLabel: previousSupporters.length > 0 ? `已识别 ${previousSupporters.length} 位支持者` : '未识别明确支持者',
          currentLabel: `已识别 ${supporters.length} 位支持者`,
          reasons: [
            supporterNames !== previousSupporterNames ? `支持者名单由 ${previousSupporterNames || '无'} 变为 ${supporterNames}` : null,
            supporters[0]?.summary,
          ],
        })
      : undefined;
    judgments.push({
      id: `${summary.accountId}:champion`,
      accountId: summary.accountId,
      kind: 'champion_strength',
      title: '关键推动者评估',
      summary: `已识别 ${supporters.length} 位内部支持者：${supporterNames}`,
      rationale: supporters.map((p) => `${p.name}（${p.influenceLabel}）：${p.summary}`).join('；'),
      value: supporters.length >= 2 ? 'high' : 'medium',
      confidence: Math.max(0.4, summary.confidence),
      status: 'active',
      evidenceRefs: supporters.flatMap((p) => p.sourceIds.slice(0, 1).map((sid) => ({ sourceId: sid, sourceKind: 'source_record' as const, sourceRowId: sid }))),
      updatedAt: summary.lastComputedAt,
      previousTitle: previousSupporters.length > 0 ? '关键推动者评估' : undefined,
      previousSummary: previousSupporters.length > 0 ? previousSupporterNames : undefined,
      whyChanged: championWhyChanged,
      changeEvidenceRefs: supporters.flatMap((p) => p.sourceIds.slice(0, 1).map((sid) => ({ sourceId: sid, sourceKind: 'source_record' as const, title: p.name, sourceRowId: sid }))),
      revisionHistory: buildRevisionHistory({
        kind: 'champion_strength',
        title: '关键推动者评估',
        summaryHistory,
      }),
    });
  }

  // 3. 内部一致性 — 使用 tensions + blocking people
  const blockers = summary.people.filter((p) => p.stance === 'blocking');
  const previousBlockers = previousSummary?.people.filter((p) => p.stance === 'blocking') ?? [];
  const tensionRationale = [
    ...summary.tensions.slice(0, 3),
    ...blockers.map((p) => `${p.name} 持阻碍立场：${p.summary}`),
  ];
  if (summary.tensions.length > 0 || blockers.length > 0) {
    const previousAlignmentLabel = previousSummary
      ? concreteAlignmentText({ tensions: previousSummary.tensions, blockers: previousBlockers, fallback: '上次未见明显内部对齐问题' })
      : undefined;
    const currentAlignmentLabel = concreteAlignmentText({ tensions: summary.tensions, blockers });
    judgments.push({
      id: `${summary.accountId}:alignment`,
      accountId: summary.accountId,
      kind: 'internal_alignment',
      title: '内部一致性判断',
      summary: currentAlignmentLabel,
      rationale: tensionRationale.join('；') || '当前信息未显示明显矛盾。',
      value: summary.tensions.length > 1 || blockers.length > 0 ? 'low' : 'medium',
      confidence: Math.max(0.35, summary.confidence - 0.05),
      status: toStatusFromConflict(hasConflict),
      evidenceRefs: [
        ...sharedEvidence,
        ...blockers.flatMap((p) => p.sourceIds.slice(0, 1).map((sid) => ({ sourceId: sid, sourceKind: 'source_record' as const, sourceRowId: sid }))),
      ],
      contradictionIds: conflicts.map((c) => c.id),
      updatedAt: summary.lastComputedAt,
      previousTitle: previousAlignmentLabel ? '内部一致性判断' : undefined,
      previousSummary: previousAlignmentLabel,
      whyChanged: previousSummary ? buildRevisionReason({
        previousLabel: previousAlignmentLabel,
        currentLabel: currentAlignmentLabel,
        reasons: [
          summary.tensions[0] && summary.tensions[0] !== previousSummary.tensions[0] ? `当前最需要处理：${summary.tensions[0]}` : null,
          blockers.length !== previousBlockers.length ? `疑似阻碍方：${blockers.length > 0 ? blockers.map(personLabel).join('、') : '待确认'}` : null,
        ],
      }) : undefined,
      changeEvidenceRefs: blockers.flatMap((p) => p.sourceIds.slice(0, 1).map((sid) => ({ sourceId: sid, sourceKind: 'source_record' as const, title: p.name, sourceRowId: sid }))),
      revisionHistory: buildRevisionHistory({
        kind: 'internal_alignment',
        title: '内部一致性判断',
        summaryHistory,
      }),
    });
  } else {
    judgments.push({
      id: `${summary.accountId}:alignment`,
      accountId: summary.accountId,
      kind: 'internal_alignment',
      title: '内部一致性判断',
      summary: '未见明显内部对齐问题',
      rationale: '当前信息未显示明显矛盾。',
      value: 'high',
      confidence: Math.max(0.35, summary.confidence - 0.05),
      status: 'active',
      evidenceRefs: sharedEvidence,
      updatedAt: summary.lastComputedAt,
    });
  }

  // 4. 风险判断 — 使用 conflicts + risk timeline + blockers
  if (conflicts.length > 0 || recentRisk.length > 0 || blockers.length > 0) {
    const riskReasons = describeRiskSignals({ conflicts, recentRisk, blockers, tensions: summary.tensions });
    const currentRiskLabel = concreteRiskText({ conflicts, recentRisk, blockers, tensions: summary.tensions });
    const previousRiskLabel = previousSummary
      ? concreteRiskText({ blockers: previousBlockers, tensions: previousSummary.tensions, recentRisk: previousSummary.timelineHighlights.filter((item) => item.signal === 'risk'), fallback: '上次未见明确高强度交易风险' })
      : undefined;
    judgments.push({
      id: `${summary.accountId}:risk`,
      accountId: summary.accountId,
      kind: 'deal_risk',
      title: '交易风险评估',
      summary: currentRiskLabel,
      rationale: riskReasons.slice(0, 4).join('；'),
      value: conflicts.length > 1 || blockers.length > 0 ? 'high' : 'medium',
      confidence: Math.max(0.3, summary.confidence),
      status: 'active',
      evidenceRefs: [
        ...recentRisk.slice(0, 2).map((h) => ({ sourceId: h.sourceId, sourceKind: h.sourceKind, title: h.title, sourceRowId: h.sourceId })),
        ...blockers.flatMap((p) => p.sourceIds.slice(0, 1).map((sid) => ({ sourceId: sid, sourceKind: 'source_record' as const, sourceRowId: sid }))),
      ],
      contradictionIds: conflicts.map((c) => c.id),
      updatedAt: summary.lastComputedAt,
      previousTitle: previousRiskLabel ? '交易风险评估' : undefined,
      previousSummary: previousRiskLabel,
      whyChanged: previousSummary ? buildRevisionReason({
        previousLabel: previousRiskLabel,
        currentLabel: currentRiskLabel,
        reasons: [
          conflicts[0]?.summary ? `关键矛盾：${conflicts[0].summary}` : null,
          recentRisk[0]?.summary ? `最新风险：${recentRisk[0].summary}` : null,
          blockers.length > 0 ? `疑似阻碍方：${blockers.map(personLabel).join('、')}` : null,
        ],
      }) : undefined,
      changeEvidenceRefs: [
        ...recentRisk.slice(0, 2).map((h) => ({ sourceId: h.sourceId, sourceKind: h.sourceKind, title: h.title, sourceRowId: h.sourceId })),
      ],
      revisionHistory: buildRevisionHistory({
        kind: 'deal_risk',
        title: '交易风险评估',
        summaryHistory,
      }),
    });
  } else {
    judgments.push({
      id: `${summary.accountId}:risk`,
      accountId: summary.accountId,
      kind: 'deal_risk',
      title: '交易风险评估',
      summary: summary.tensions.length > 0 ? `存在 ${summary.tensions.length} 个待核实张力` : '当前暂无明确高强度交易风险',
      rationale: summary.tensions[0] ?? recentPositive[0]?.summary ?? summary.timelineHighlights[0]?.summary ?? '当前以正向或中性信号为主，但仍需持续补充最新证据。',
      value: summary.tensions.length > 0 ? 'medium' : 'low',
      confidence: Math.max(0.3, summary.confidence),
      status: 'active',
      evidenceRefs: [
        ...sharedEvidence,
        ...summary.timelineHighlights.slice(0, 1).map((h) => ({ sourceId: h.sourceId, sourceKind: h.sourceKind, title: h.title, sourceRowId: h.sourceId })),
      ],
      updatedAt: summary.lastComputedAt,
      previousTitle: previousSummary ? '交易风险评估' : undefined,
      previousSummary: previousSummary ? concreteRiskText({ tensions: previousSummary.tensions, recentRisk: previousSummary.timelineHighlights.filter((item) => item.signal === 'risk'), fallback: '上次暂无明确高强度交易风险' }) : undefined,
      whyChanged: previousSummary ? buildRevisionReason({
        previousLabel: concreteRiskText({ tensions: previousSummary.tensions, recentRisk: previousSummary.timelineHighlights.filter((item) => item.signal === 'risk'), fallback: '上次暂无明确高强度交易风险' }),
        currentLabel: concreteRiskText({ tensions: summary.tensions, recentRisk, fallback: '当前暂无明确高强度交易风险' }),
        reasons: [
          summary.tensions[0] && summary.tensions[0] !== previousSummary.tensions[0] ? `当前最需要核实：${summary.tensions[0]}` : null,
          summary.timelineHighlights[0]?.summary ?? null,
        ],
      }) : undefined,
      revisionHistory: buildRevisionHistory({
        kind: 'deal_risk',
        title: '交易风险评估',
        summaryHistory,
      }),
    });
  }

  // 5. 时间线关键事件判断 — 如果有 highlights 但前面没覆盖到
  const latestHighlight = summary.timelineHighlights[0];
  const previousLatestHighlight = previousSummary?.timelineHighlights[0];
  if (latestHighlight && judgments.length < 5) {
    judgments.push({
      id: `${summary.accountId}:latest-event`,
      accountId: summary.accountId,
      kind: 'general',
      title: `近期关键事件：${latestHighlight.title}`,
      summary: latestHighlight.summary,
      rationale: `来源于${new Date(latestHighlight.occurredAt).toLocaleDateString('zh-CN')}的${latestHighlight.sourceKind === 'email_decode' ? '邮件解读' : latestHighlight.sourceKind === 'intel_item' ? '情报' : '活动记录'}`,
      value: latestHighlight.signal === 'positive' ? 'high' : latestHighlight.signal === 'risk' ? 'low' : 'medium',
      confidence: Math.max(0.4, summary.confidence - 0.1),
      status: 'active',
      evidenceRefs: [{ sourceId: latestHighlight.sourceId, sourceKind: latestHighlight.sourceKind, title: latestHighlight.title, sourceRowId: latestHighlight.sourceId }],
      updatedAt: summary.lastComputedAt,
      previousTitle: previousLatestHighlight?.title,
      previousSummary: previousLatestHighlight?.summary,
      whyChanged: previousLatestHighlight ? buildRevisionReason({
        previousLabel: previousLatestHighlight.title,
        currentLabel: latestHighlight.title,
        reasons: [
          previousLatestHighlight.title !== latestHighlight.title ? `关键事件由“${previousLatestHighlight.title}”切换为“${latestHighlight.title}”` : null,
          latestHighlight.summary,
        ],
      }) : undefined,
      changeEvidenceRefs: [{ sourceId: latestHighlight.sourceId, sourceKind: latestHighlight.sourceKind, title: latestHighlight.title, sourceRowId: latestHighlight.sourceId }],
      revisionHistory: buildRevisionHistory({
        kind: 'general',
        title: `近期关键事件：${latestHighlight.title}`,
        summaryHistory,
      }),
    });
  }

  return judgments.slice(0, 5);
}
