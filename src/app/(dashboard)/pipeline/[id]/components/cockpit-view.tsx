'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import {
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import type { Opportunity, OpportunityStage, Contact } from '@/lib/babel-engine/types';
import { STAGE_ORDER } from '@/lib/babel-engine/types';
import {
  formatCurrency,
  daysBetween,
  computeMeddiccScore,
  getDimensionScore,
  checkStageRequirements,
  MEDDICC_LABELS,
} from '@/lib/meddicc';
import { computeDealHealth } from '@/lib/deal-health';
import { RingChart, StageValidationModal, LostReasonModal } from './shared';
import { useLocale, type Locale, type TranslationKey } from '@/lib/i18n';

function DealDecisionSnapshot({
  opp,
  accountName,
  riskText,
  nextAction,
  openIssueCount,
  locale,
  stageLabel,
}: {
  opp: Opportunity;
  accountName: string;
  riskText: string;
  nextAction: string;
  openIssueCount: number;
  locale: Locale;
  stageLabel: (stage: OpportunityStage) => string;
}) {
  const en = locale === 'en';
  const closeText = opp.expectedCloseDate
    ? en
      ? `expected to complete the next confirmation before ${opp.expectedCloseDate}`
      : `预计在 ${opp.expectedCloseDate} 前完成下一轮确认`
    : en
      ? 'next confirmation timing is not aligned yet'
      : '下一轮确认时间待对齐';
  const currentSituation = en
    ? `${accountName} is currently in ${stageLabel(opp.stage)} stage, with an estimated value of ${formatCurrency(opp.value, opp.currency)}; ${closeText}.`
    : `${accountName} 当前处于「${stageLabel(opp.stage)}」阶段，项目金额约 ${formatCurrency(opp.value, opp.currency)}，${closeText}。`;
  const cards = [
    { label: en ? 'Current situation' : '当前情况', value: currentSituation, tone: 'border-accent/20 bg-accent/5' },
    { label: en ? 'Main risk' : '主要风险', value: riskText, tone: openIssueCount > 0 ? 'border-warning/25 bg-warning/5' : 'border-border bg-muted/10' },
    { label: en ? 'Recommended next step' : '建议下一步', value: nextAction, tone: 'border-positive/20 bg-positive/5' },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">{en ? 'Executive view' : '客户高层视角'}</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{en ? 'Current situation, main risk, and next step' : '当前情况、主要风险和建议下一步'}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/accounts/${opp.accountId}?tab=plays`} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/20">
            {en ? 'View account strategy' : '查看客户策略'}
          </Link>
          <Link href={`/pipeline/${opp.id}?tab=execution`} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover">
            {en ? 'View execution plan' : '查看推进计划'}
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className={'rounded-xl border px-3 py-3 ' + card.tone}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 line-clamp-3 text-sm font-medium leading-5 text-foreground">{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const EXECUTIVE_LABELS: Record<string, string> = {
  商业指标未确认: '业务价值和量化收益还需要进一步确认',
  经济决策者未知: '最终决策路径还不清晰',
  无已识别痛点: '客户核心问题还没有被明确量化',
  无内部推动者: '客户侧推进责任人还不清晰',
  无决策标准: '评估标准还没有对齐',
};

const EXECUTIVE_LABELS_EN: Record<string, string> = {
  商业指标未确认: 'business value and quantified outcomes need confirmation',
  经济决策者未知: 'final decision path is still unclear',
  无已识别痛点: 'core customer pain is not quantified yet',
  无内部推动者: 'customer-side owner is still unclear',
  无决策标准: 'evaluation criteria are not aligned yet',
};

function toExecutiveText(text: string, locale: Locale) {
  return locale === 'en' ? EXECUTIVE_LABELS_EN[text] ?? text : EXECUTIVE_LABELS[text] ?? text;
}

export function DealCockpit({ opp, accountName, contacts }: { opp: Opportunity; accountName: string; contacts: Contact[]; ownerName: string }) {
  const { locale, t } = useLocale();
  const en = locale === 'en';
  const updateOpportunity = useStore((s) => s.updateOpportunity);
  const { tasks, intelItems: visibleIntelItems, emailDecodes } = useRoleFilteredData();
  const intelItems = visibleIntelItems.filter((i) => i.accountId === opp.accountId);
  const decodes = emailDecodes.filter((d) => d.accountId === opp.accountId);

  const daysToClose = opp.expectedCloseDate ? daysBetween(new Date().toISOString(), opp.expectedCloseDate) : null;
  const score = computeMeddiccScore(opp.meddicc, contacts);
  const dealHealth = computeDealHealth({
    opportunity: opp,
    account: { lastActivity: opp.updatedAt, contacts },
    tasks,
    locale,
  });
  const mapProgress = opp.mutualActionPlan?.milestones?.length
    ? Math.round(((opp.mutualActionPlan?.milestones ?? []).filter((m) => m.status === 'completed').length / opp.mutualActionPlan?.milestones?.length) * 100)
    : 0;

  const stageIdx = STAGE_ORDER.indexOf(opp.stage);
  const [validationModal, setValidationModal] = useState<{ warnings: string[]; targetStage: OpportunityStage } | null>(null);
  const [lostModal, setLostModal] = useState(false);

  // Risk computation
  const meddiccMissing: string[] = [];
  if (opp.meddicc?.metrics?.status === 'unconfirmed') meddiccMissing.push('商业指标未确认');
  if (opp.meddicc?.economicBuyer?.status === 'unknown') meddiccMissing.push('经济决策者未知');
  if (opp.meddicc?.identifiedPain?.length === 0) meddiccMissing.push('无已识别痛点');
  if (!contacts.some((c) => c.role === 'champion')) meddiccMissing.push('无内部推动者');
  if (opp.meddicc?.decisionCriteria?.length === 0) meddiccMissing.push('无决策标准');

  const overdueMapTasks = (opp.mutualActionPlan?.milestones ?? []).filter(
    (m) => m.status !== 'completed' && m.dueDate && new Date(m.dueDate) < new Date()
  );
  const blockedMapTasks = (opp.mutualActionPlan?.milestones ?? []).filter((m) => m.status === 'blocked');

  const championContacts = contacts.filter((c) => c.role === 'champion');
  const ebContact = contacts.find((c) => c.role === 'decision_maker');

  // Champion decay
  const championDecayDays = opp.meddicc?.champion?.lastEngagement
    ? daysBetween(opp.meddicc?.champion?.lastEngagement, new Date().toISOString().split('T')[0])
    : null;

  const handleStageChange = (dir: 'forward' | 'backward') => {
    const targetIdx = dir === 'forward' ? stageIdx + 1 : stageIdx - 1;
    if (targetIdx < 0 || targetIdx >= STAGE_ORDER.length) return;
    const targetStage = STAGE_ORDER[targetIdx];

    if (targetStage === 'closed_lost') {
      setLostModal(true);
      return;
    }

    if (dir === 'forward') {
      const w = checkStageRequirements(opp, targetStage, contacts);
      if (w.length > 0) {
        setValidationModal({ warnings: w, targetStage });
        return;
      }
    }
    updateOpportunity(opp.id, {
      stage: targetStage,
      meddicc: { ...opp.meddicc, overallScore: score },
      ...(targetStage === 'closed_won' ? { wonDate: new Date().toISOString() } : {}),
    });
  };

  const contradictionTone = {
    execution_gap: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
    relationship_gap: 'bg-accent-red/10 text-accent-red border-accent-red/20',
    confidence_gap: 'bg-accent/10 text-accent border-accent/20',
  } as const;
  const stageLabel = (stage: OpportunityStage) => t(`stage.${stage}` as TranslationKey);
  const safeText = (value: string | undefined | null, fallback = 'Account analysis for this sales scenario.') => {
    if (!value) return '';
    return en && /[\u4e00-\u9fff]/.test(value) ? fallback : value;
  };
  const dateLocale = en ? 'en-US' : 'zh-CN';
  const activityTypeLabel = (type: 'intel' | 'decode' | 'map') => {
    if (en) return type === 'intel' ? 'Intel' : type === 'decode' ? 'Decode' : 'Execution';
    return type === 'intel' ? '情报' : type === 'decode' ? '解读' : '执行计划';
  };
  const momentumLabel = dealHealth.momentum === 'building'
    ? (en ? 'Building' : '增强中')
    : dealHealth.momentum === 'steady'
      ? (en ? 'Steady' : '平稳推进')
      : (en ? 'Stalled' : '停滞中');

  // Recent activities
  const activities = [
    ...intelItems.slice(0, 3).map((i) => ({ type: activityTypeLabel('intel'), kind: 'intel' as const, title: safeText(i.title, 'Customer signal'), date: i.date, href: '/intel' })),
    ...decodes.slice(0, 3).map((d) => ({ type: activityTypeLabel('decode'), kind: 'decode' as const, title: safeText(d.emailText?.slice(0, 30) + '...', 'No communication text available'), date: d.date, href: `/decode?decodeId=${d.id}` })),
    ...opp.mutualActionPlan.milestones
      .filter((m) => m.completedDate)
      .map((m) => ({ type: activityTypeLabel('map'), kind: 'map' as const, title: en ? `${safeText(m.title, 'Execution step')} completed` : `${m.title} 完成`, date: m.completedDate!, href: `/pipeline/${opp.id}` })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  const firstOverdueMapTask = overdueMapTasks[0];
  const firstBlockedMapTask = blockedMapTasks[0];
  const riskText = dealHealth.riskFlags[0]
    || dealHealth.contradictions[0]?.summary
    || (meddiccMissing[0] ? toExecutiveText(meddiccMissing[0], locale) : '')
    || (firstOverdueMapTask ? (en ? `Key execution item is overdue: ${safeText(firstOverdueMapTask.title, 'Execution step')}` : `关键推进事项已逾期：${firstOverdueMapTask.title}`) : '')
    || (firstBlockedMapTask ? (en ? `Key execution item is blocked: ${safeText(firstBlockedMapTask.title, 'Execution step')}` : `关键推进事项受阻：${firstBlockedMapTask.title}`) : '')
    || (en ? 'No obvious risk detected yet; validate the judgment with the next customer update.' : '暂未发现明显风险，但仍需用下一次客户反馈校准项目判断。');
  const nextAction = firstOverdueMapTask
    ? (en ? `Align the overdue key item first: ${safeText(firstOverdueMapTask.title, 'Execution step')}` : `先对齐已逾期的关键事项：${firstOverdueMapTask.title}`)
    : firstBlockedMapTask
      ? (en ? `Remove the current execution blocker first: ${safeText(firstBlockedMapTask.title, 'Execution step')}` : `先解除当前推进阻塞：${firstBlockedMapTask.title}`)
      : meddiccMissing.length > 0
        ? (en ? `Confirm the customer evidence needed for ${toExecutiveText(meddiccMissing[0], locale)}` : `先补齐「${toExecutiveText(meddiccMissing[0], locale)}」所需的客户确认`)
        : championDecayDays !== null && championDecayDays > 14
          ? (en ? 'Reconfirm the customer-side owner and next commitment' : '重新确认客户侧推进人和下一步承诺')
          : (en ? 'Complete the next customer touchpoint, then update the opportunity judgment and follow-up plan.' : '完成下一次客户沟通，并更新项目判断和后续安排。');
  const openIssueCount = meddiccMissing.length + overdueMapTasks.length + blockedMapTasks.length + dealHealth.contradictions.length;

  return (
    <div className="space-y-5">
      {/* Validation Modal */}
      {validationModal && (
        <StageValidationModal
          warnings={validationModal.warnings}
          targetStage={validationModal.targetStage}
          onConfirm={() => {
            updateOpportunity(opp.id, {
              stage: validationModal.targetStage,
              meddicc: { ...opp.meddicc, overallScore: score },
              ...(validationModal.targetStage === 'closed_won' ? { wonDate: new Date().toISOString() } : {}),
            });
            setValidationModal(null);
          }}
          onCancel={() => setValidationModal(null)}
        />
      )}

      {/* Lost Modal */}
      {lostModal && (
        <LostReasonModal
          onConfirm={(reason) => {
            updateOpportunity(opp.id, { stage: 'closed_lost', lostReason: reason });
            setLostModal(false);
          }}
          onCancel={() => setLostModal(false)}
        />
      )}

      {/* Hero Card -- condensed header */}
      <DealDecisionSnapshot
        opp={opp}
        accountName={accountName}
        riskText={riskText}
        nextAction={nextAction}
        openIssueCount={openIssueCount}
        locale={locale}
        stageLabel={stageLabel}
      />

      <div className="card-elevated rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <span className="text-2xl font-bold">{formatCurrency(opp.value, opp.currency)}</span>
            {opp.expectedCloseDate && (
              <span className="text-xs text-muted">{en ? 'Expected close' : '预计签约'} {opp.expectedCloseDate}</span>
            )}
            {daysToClose !== null && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                daysToClose < 0 ? 'badge-danger' : daysToClose <= 7 ? 'badge-warning' : 'badge-success'
              }`}>
                {daysToClose >= 0
                  ? (en ? `${daysToClose} days to close` : `${daysToClose} 天后签约`)
                  : (en ? `${Math.abs(daysToClose)} days overdue` : `已逾期 ${Math.abs(daysToClose)} 天`)}
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <RingChart score={score} size={72} strokeWidth={7} />
            <span className="text-xs text-muted">MEDDICC</span>
          </div>
        </div>
      </div>

      {/* Stage Pipeline -- circles connected by lines */}
      <style>{`
        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 var(--accent-alpha, rgba(59,130,246,0.4)); }
          70% { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        .stage-pulse { animation: pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite; }
      `}</style>
      <div className="card-elevated rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex flex-1 items-center overflow-x-auto pb-2 sm:pb-0">
            {STAGE_ORDER.filter((s) => s !== 'closed_lost').map((stage, i, arr) => {
              const isCurrent = stage === opp.stage;
              const isPast = STAGE_ORDER.indexOf(stage) < stageIdx;
              return (
                <div key={stage} className="flex flex-1 items-center last:flex-none">
                  {/* Circle + Label */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isPast
                        ? 'bg-[var(--positive)] text-white'
                        : isCurrent
                          ? 'border-2 border-accent bg-card text-accent stage-pulse animate-pulse'
                          : 'border-2 border-border bg-card text-muted'
                    }`}>
                      {isPast ? '✓' : (i + 1)}
                    </div>
                    <span className={`text-xs whitespace-nowrap ${isCurrent ? 'font-bold text-accent' : isPast ? 'text-positive font-medium' : 'text-muted'}`}>
                      {stageLabel(stage)}
                    </span>
                  </div>
                  {/* Connecting line */}
                  {i < arr.length - 1 && (
                    <div className={`mx-1 h-0.5 flex-1 ${isPast ? 'bg-[var(--positive)]' : 'bg-border'}`} />
                  )}
                </div>
              );
            })}
          </div>
          {/* Advance/Retreat buttons on the right */}
          <div className="ml-0 sm:ml-4 flex flex-row sm:flex-col gap-1.5 flex-shrink-0">
            {stageIdx < STAGE_ORDER.length - 2 && opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
              <button onClick={() => handleStageChange('forward')} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover shadow-sm">
                {en ? 'Advance' : '推进'} <ChevronRight className="h-3 w-3" />
              </button>
            )}
            {stageIdx > 0 && opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
              <button onClick={() => handleStageChange('backward')} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-background">
                <ChevronLeft className="h-3 w-3" /> {en ? 'Move back' : '回退'}
              </button>
            )}
          </div>
        </div>
        {opp.stage !== 'closed_won' && opp.stage !== 'closed_lost' && (
          <div className="mt-3 flex justify-end">
            <button onClick={() => setLostModal(true)} className="flex items-center gap-1 rounded-lg border border-accent-red/30 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/5">
              <XCircle className="h-3 w-3" /> {en ? 'Mark lost' : '标记丢失'}
            </button>
          </div>
        )}
      </div>

      {/* Dual Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {/* Left Panel (60%): Deal Info + Recent Activities */}
        <div className="lg:col-span-5 space-y-4">
          {/* Deal Info Card */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Deal information' : '交易信息'}</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 p-4">
              <div className="text-center">
                <p className="text-lg font-bold">{formatCurrency(opp.value, opp.currency)}</p>
                <p className="text-xs text-muted">{en ? 'Amount' : '金额'}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{stageLabel(opp.stage)}</p>
                <p className="text-xs text-muted">{en ? 'Stage' : '阶段'}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold truncate">{opp.expectedCloseDate || '-'}</p>
                <p className="text-xs text-muted">{en ? 'Expected close' : '预计签约'}</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold">{opp.probability}%</p>
                <p className="text-xs text-muted">{en ? 'Probability' : '概率'}</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-bold ${daysToClose !== null && daysToClose < 0 ? 'text-accent-red' : daysToClose !== null && daysToClose <= 7 ? 'text-accent-amber' : ''}`}>
                  {daysToClose !== null ? (daysToClose >= 0 ? (en ? `${daysToClose}d` : `${daysToClose}天`) : (en ? `${Math.abs(daysToClose)}d overdue` : `逾期${Math.abs(daysToClose)}天`)) : '-'}
                </p>
                <p className="text-xs text-muted">{en ? 'Countdown' : '倒计时'}</p>
              </div>
            </div>
          </div>

          {/* Deal health strip */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Deal health' : '交易健康度'}</h3>
              <p className="mt-0.5 text-xs text-muted">{en ? 'Shows momentum, risks, missing signals, and contradictions independent of stage' : '独立于阶段展示推进动能、风险、缺失信号与矛盾点'}</p>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-4">
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">{en ? 'Momentum' : '推进动能'}</p>
                <p className={`mt-1 text-sm font-semibold ${dealHealth.momentum === 'building' ? 'text-positive' : dealHealth.momentum === 'steady' ? 'text-accent-amber' : 'text-accent-red'}`}>
                  {momentumLabel}
                </p>
                <p className="mt-1 text-xs text-muted">{en ? 'Stagnation score' : '停滞分'} {dealHealth.stagnationScore}/100</p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">{en ? 'Risks' : '风险'}</p>
                <div className="mt-1 space-y-1">
                  {(dealHealth.riskFlags.length ? dealHealth.riskFlags : dealHealth.reasons.slice(0, 2)).slice(0, 2).map((flag) => (
                    <p key={flag} className="text-xs text-foreground">• {safeText(flag, 'Execution or qualification risk requires attention')}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">{en ? 'Missing signals' : '缺失信号'}</p>
                <div className="mt-1 space-y-1">
                  {(dealHealth.missingSignals.length ? dealHealth.missingSignals : [en ? 'No additional gap detected' : '当前未检测到额外缺口']).slice(0, 2).map((flag) => (
                    <p key={flag} className="text-xs text-foreground">• {safeText(flag, 'Missing signal requires confirmation')}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted">{en ? 'Contradictions' : '矛盾点'}</p>
                <div className="mt-1 space-y-1.5">
                  {dealHealth.contradictions.length > 0 ? dealHealth.contradictions.slice(0, 2).map((item) => (
                    <div key={item.id} className="rounded-md border border-border px-2.5 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium ${contradictionTone[item.conflictClass]}`}>{item.conflictClass === 'execution_gap' ? (en ? 'Execution gap' : '执行落差') : item.conflictClass === 'relationship_gap' ? (en ? 'Relationship gap' : '关系落差') : (en ? 'Confidence gap' : '信心落差')}</span>
                      <p className="mt-1 text-xs text-foreground">{safeText(item.summary, 'Contradiction requires follow-up')}</p>
                      <p className="mt-1 text-[11px] text-muted">{en ? 'Sources' : '来源'}: {item.sources.map((source) => safeText(source, 'Source')).join(' · ')}</p>
                    </div>
                  )) : <p className="text-xs text-muted">{en ? 'No clear contradiction' : '暂无明显冲突'}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activities (3 items) */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Recent activity' : '最近活动'}</h3>
            </div>
            <div className="p-4">
              {activities.length === 0 ? (
                <p className="text-xs text-muted">{en ? 'No activity yet' : '暂无活动'}</p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 3).map((a, i) => {
                    const itemClass = `flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs transition-all ${a.href ? 'cursor-pointer hover:shadow-md hover:bg-stripe' : 'cursor-default bg-background/40'}`;
                    const content = (
                      <>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          a.kind === 'intel' ? 'bg-amber-50 text-amber-700' : a.kind === 'map' ? 'bg-positive/10 text-positive' : 'bg-accent/10 text-accent'
                        }`}>{a.type}</span>
                        <span className="flex-1 truncate">{a.title}</span>
                        {!a.href && <span className="text-[11px] text-muted">{en ? 'Record only' : '仅记录'}</span>}
                        <span className="text-xs text-muted">{new Date(a.date).toLocaleDateString(dateLocale)}</span>
                      </>
                    );
                    return a.href ? (
                      <Link key={i} href={a.href} className={itemClass}>
                        {content}
                      </Link>
                    ) : (
                      <div key={i} className={itemClass}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Key Risk Alerts */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Risk alerts' : '风险预警'}</h3>
              <p className="mt-0.5 text-xs text-muted">{en ? 'AI risk assessment based on MEDDICC and execution plan' : '✨ AI 风险评估 — 基于 MEDDICC 和执行计划自动识别风险'}</p>
            </div>
            <div className="p-4">
              {meddiccMissing.length === 0 && overdueMapTasks.length === 0 && blockedMapTasks.length === 0 ? (
                <p className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" /> {en ? 'No risks detected' : '暂无风险'}</p>
              ) : (
                <div className="space-y-1">
                  {meddiccMissing.map((w, i) => (
                    <div key={`m${i}`} className="flex items-center gap-1 text-xs text-accent-amber">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" /> {toExecutiveText(w, locale)}
                    </div>
                  ))}
                  {overdueMapTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 text-xs text-accent-red">
                      <XCircle className="h-3 w-3 flex-shrink-0" /> {en ? 'Execution plan overdue' : '执行计划逾期'}：{safeText(t.title, 'Execution step')}
                    </div>
                  ))}
                  {blockedMapTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-1 text-xs text-accent-red">
                      <Ban className="h-3 w-3 flex-shrink-0" /> {en ? 'Execution plan blocked' : '执行计划阻塞'}：{safeText(t.title, 'Execution step')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: MEDDICC + execution + key people */}
        <div className="lg:col-span-2 space-y-4">
          {/* MEDDICC Mini Dashboard */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'MEDDICC assessment' : 'MEDDICC 评估'}</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-center">
                <RingChart score={score} size={80} strokeWidth={8} />
              </div>
              <div className="space-y-1.5">
                {Object.entries(MEDDICC_LABELS).map(([key, label]) => {
                  const { score: s, max } = getDimensionScore(opp.meddicc, key);
                  const pct = max > 0 ? s / max : 0;
                  return (
                    <div key={key} className="grid grid-cols-[0.5rem_5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0`} style={{
                        backgroundColor: pct >= 0.7 ? 'var(--positive)' : pct >= 0.3 ? 'var(--accent-amber)' : pct > 0 ? 'var(--accent-red)' : 'var(--border)'
                      }} />
                      <span className="whitespace-nowrap text-xs text-muted">{en ? key.toUpperCase() : label}</span>
                      <div className="h-1.5 min-w-0 rounded-full bg-border">
                        <div
                          className="h-full rounded-full transition-all duration-400"
                          style={{
                            width: `${Math.round(pct * 100)}%`,
                            backgroundColor: pct >= 0.7 ? 'var(--positive)' : pct >= 0.3 ? 'var(--accent-amber)' : pct > 0 ? 'var(--accent-red)' : 'var(--border)',
                          }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-right text-xs font-medium tabular-nums">{s}/{max}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Execution plan progress */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Execution progress' : '执行计划进度'}</h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="h-2 rounded-full bg-border">
                <div className="h-full rounded-full bg-[var(--positive)] transition-all" style={{ width: `${mapProgress}%` }} />
              </div>
              <p className="text-xs text-muted text-right">
                {(opp.mutualActionPlan?.milestones ?? []).filter((m) => m.status === 'completed').length}/{opp.mutualActionPlan?.milestones?.length} {en ? 'completed' : '完成'}
              </p>
              <div className="flex items-center gap-3 text-xs">
                {overdueMapTasks.length > 0 && (
                  <span className="flex items-center gap-1 text-accent-red">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-red" />
                    {en ? 'Overdue' : '逾期'} {overdueMapTasks.length}
                  </span>
                )}
                {blockedMapTasks.length > 0 && (
                  <span className="flex items-center gap-1 text-accent-red">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-red" />
                    {en ? 'Blocked' : '阻塞'} {blockedMapTasks.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Key People */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Key people' : '关键人物'}</h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Champion */}
              <div>
                <p className="text-xs font-medium text-muted mb-1.5">{en ? 'Champion' : '内部推动者'}</p>
                {championContacts.length > 0 ? championContacts.map((c) => (
                  <div key={c.id} className="mb-1.5 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-positive/10 text-xs font-bold text-positive">
                      {c.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                    </div>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <div key={s} className={`h-1.5 w-3 rounded-full ${s <= opp.meddicc?.champion?.strength ? 'bg-positive' : 'bg-border'}`} />
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-accent-red">{en ? 'Not set' : '未设置'}</p>
                )}
              </div>
              {/* Economic Buyer */}
              <div>
                <p className="text-xs font-medium text-muted mb-1.5">{en ? 'Economic buyer' : '经济决策者'}</p>
                {ebContact ? (
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                      {ebContact.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ebContact.name}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      opp.meddicc?.economicBuyer?.status === 'engaged' ? 'badge-success' :
                      opp.meddicc?.economicBuyer?.status === 'identified' ? 'badge-warning' :
                      'badge-danger'
                    }`}>
                      {opp.meddicc?.economicBuyer?.status === 'engaged' ? (en ? 'Engaged' : '已建立关系') : opp.meddicc?.economicBuyer?.status === 'identified' ? (en ? 'Identified' : '已识别') : (en ? 'Unknown' : '未知')}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-accent-red">{en ? 'Not identified' : '未识别'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Competition */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'Competitive position' : '竞争态势'}</h3>
            </div>
            <div className="p-4">
              {opp.meddicc?.competition?.length > 0 ? (opp.meddicc?.competition ?? []).map((c) => (
                <div key={c.id} className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm">{c.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    c.threatLevel === 'high' ? 'badge-danger' :
                    c.threatLevel === 'medium' ? 'badge-warning' :
                    'badge-success'
                  }`}>
                  {c.threatLevel === 'high' ? (en ? 'High' : '高') : c.threatLevel === 'medium' ? (en ? 'Medium' : '中') : (en ? 'Low' : '低')}
                  </span>
                </div>
              )) : (
                <p className="text-xs text-muted">{en ? 'No competitors identified' : '未识别竞品'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
