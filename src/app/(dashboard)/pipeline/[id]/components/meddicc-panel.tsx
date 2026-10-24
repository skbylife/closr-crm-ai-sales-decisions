'use client';

import { useState, useCallback, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import {
  ChevronDown,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Target,
  Users,
  Shield,
  Swords,
  Brain,
  Loader2,
  Pencil,
  Lightbulb,
} from 'lucide-react';
import type {
  Opportunity,
  MeddiccAssessment,
  DecisionStep,
  Contact,
} from '@/lib/babel-engine/types';
import {
  uid,
  daysBetween,
  computeMeddiccScore,
  getDimensionScore,
  MEDDICC_COLORS,
  MEDDICC_LABELS,
  MEDDICC_GUIDES,
  MEDDICC_STRENGTHEN,
} from '@/lib/meddicc';
import { RingChart, MiniBar } from './shared';
import { AssessmentResultDisplay } from '@/components/meddicc/assessment-result-display';
import type { AssessmentResult } from '@/components/meddicc/assessment-result-display';
import { visibleBusinessText } from '@/lib/visible-business-text';

// ─── Constants ───────────────────────────────────────────────────────

const MEDDICC_ASSESS_STEPS_ZH = [
  "收集 MEDDICC 维度数据...",
  "分析各维度差距...",
  "生成评估建议...",
  "完成",
];

const MEDDICC_ASSESS_STEPS_EN = [
  'Collecting MEDDICC dimension data...',
  'Analyzing dimension gaps...',
  'Generating assessment recommendations...',
  'Complete',
];

const MEDDICC_LABELS_EN: Record<string, string> = {
  metrics: 'M Metrics',
  economicBuyer: 'E Economic Buyer',
  decisionCriteria: 'D Decision Criteria',
  decisionProcess: 'D Decision Process',
  identifiedPain: 'I Identified Pain',
  champion: 'C Champion',
  competition: 'C Competition',
};

const SECTION_LABELS_EN: Record<string, string> = {
  metrics: 'M - Business Metrics',
  economicBuyer: 'E - Economic Buyer (EB)',
  decisionCriteria: 'D - Decision Criteria (DC)',
  decisionProcess: 'D - Decision Process (DP)',
  identifiedPain: 'I - Identified Pain',
  champion: 'C - Champion',
  competition: 'C - Competition',
};

const MEDDICC_GUIDES_EN: typeof MEDDICC_GUIDES = {
  metrics: {
    label: 'Metrics',
    description: 'Can the customer pain be quantified with numbers?',
    questions: [
      'What annual financial loss does the current pain create?',
      'How much cost can be saved or revenue added after our solution?',
      'What is the ROI payback period, and has the customer accepted it?',
    ],
    example: 'Current manual errors create measurable operating loss. Our solution reduces error rate materially and pays back within the target window.',
  },
  economicBuyer: {
    label: 'Economic Buyer',
    description: 'Who can approve budget and sign off the purchase?',
    questions: [
      'Who owns budget approval for this deal?',
      'Can we reach that person directly or through a trusted path?',
      'What does the economic buyer care about most?',
    ],
    example: 'The CFO is the final approver and cares about ROI timing. A champion has opened a short executive readout.',
  },
  decisionCriteria: {
    label: 'Decision Criteria',
    description: 'What standards will the customer use to evaluate vendors?',
    questions: [
      'What formal technical, commercial, and compliance criteria exist?',
      'Which criteria favor us and which create risk?',
      'Can we influence the criteria before they harden?',
    ],
    example: 'The evaluation includes availability, integration fit, ROI, and support coverage. We are strong on the first three and need proof on support.',
  },
  decisionProcess: {
    label: 'Decision Process',
    description: 'What is the path from evaluation to signature?',
    questions: [
      'How many approval stages are there?',
      'Who participates at each stage?',
      'What could delay or stall the process?',
    ],
    example: 'Technical review, commercial negotiation, and executive approval are sequenced over the next quarter.',
  },
  identifiedPain: {
    label: 'Identified Pain',
    description: 'What is the real business pain, not just the surface symptom?',
    questions: [
      'How does the customer describe the top pain?',
      'What is the root cause behind it?',
      'Has the impact been quantified and tied to a stakeholder?',
    ],
    example: 'Slow operational updates are the symptom; fragmented manual workflow is the root cause and the cost is visible in execution loss.',
  },
  champion: {
    label: 'Champion',
    description: 'Who is actively selling our case inside the customer?',
    questions: [
      'Who is the strongest internal supporter?',
      'Has this person created access or internal meetings for us?',
      'What personal or business incentive makes them support the change?',
    ],
    example: 'A business VP is sponsoring the project and has scheduled an executive review because this initiative maps to their KPI.',
  },
  competition: {
    label: 'Competition',
    description: 'Who are we really competing against: vendors, relationships, or no decision?',
    questions: [
      'Which alternatives is the customer evaluating?',
      'Where are competitors stronger and where can we differentiate?',
      'How attractive is the do-nothing option?',
    ],
    example: 'The main competitor has strong brand awareness, while our differentiation is faster operational intelligence and clearer ROI proof.',
  },
};

const MEDDICC_STRENGTHEN_EN: typeof MEDDICC_STRENGTHEN = {
  metrics: [
    'Run an ROI workshop with finance to quantify the current pain.',
    'Prepare benchmark data that frames the cost of inaction.',
  ],
  economicBuyer: [
    'Use the champion to secure a short executive readout with the economic buyer.',
    'Prepare a one-page executive summary focused on ROI and business risk.',
  ],
  decisionCriteria: [
    'Ask the champion for the internal scorecard or RFP evaluation criteria.',
    'Propose evaluation criteria that highlight our strongest proof points.',
  ],
  decisionProcess: [
    'Map every approval step with owner, date, and required evidence.',
    'Check for hidden approvals such as security, legal, or procurement review.',
  ],
  identifiedPain: [
    'Ask what happens if the customer does nothing and quantify that impact.',
    'Interview frontline users to validate pain that leadership may not see.',
  ],
  champion: [
    'Clarify the champion’s personal KPI and risk in backing this project.',
    'Test champion strength by asking for a senior internal meeting.',
  ],
  competition: [
    'Build a competitor matrix around differentiated proof, not feature volume.',
    'Learn the customer’s history and dissatisfaction with alternative vendors.',
  ],
};

const DIMENSION_KEYS = [
  'metrics', 'economicBuyer', 'decisionCriteria',
  'decisionProcess', 'identifiedPain', 'champion', 'competition',
] as const;

type MeddiccAssessmentResult = AssessmentResult;

// ─── Helper: check if a dimension has content ───────────────────────

function isDimensionFilled(m: MeddiccAssessment, key: string, contacts: Contact[]): boolean {
  switch (key) {
    case 'metrics':
      return !!(m.metrics?.notes?.trim()) || m.metrics?.status !== 'unconfirmed';
    case 'economicBuyer':
      return m.economicBuyer?.status !== 'unknown' || contacts.some((c) => c.role === 'decision_maker');
    case 'decisionCriteria':
      return (m.decisionCriteria ?? []).length > 0;
    case 'decisionProcess':
      return (m.decisionProcess ?? []).length > 0;
    case 'identifiedPain':
      return (m.identifiedPain ?? []).length > 0;
    case 'champion':
      return contacts.some((c) => c.role === 'champion') || (m.champion?.strength > 0);
    case 'competition':
      return (m.competition ?? []).length > 0;
    default:
      return false;
  }
}

// ─── Sub-components ─────────────────────────────────────────────────

function MeddiccProgressSteps({ currentStep, locale }: { currentStep: number; locale: 'zh' | 'en' }) {
  const steps = locale === 'en' ? MEDDICC_ASSESS_STEPS_EN : MEDDICC_ASSESS_STEPS_ZH;
  return (
    <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 p-4">
      <div className="space-y-2">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div key={i} className="flex items-center gap-2.5">
              {isDone ? (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-positive text-white text-[12px]">✓</div>
              ) : isActive ? (
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[12px] text-muted">{i + 1}</div>
              )}
              <span className={`text-xs ${isActive ? "text-accent font-medium" : isDone ? "text-positive" : "text-muted"}`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Top progress dots: 7 dimensions completion status */
function DimensionProgressBar({ m, contacts, locale }: { m: MeddiccAssessment; contacts: Contact[]; locale: 'zh' | 'en' }) {
  const filled = DIMENSION_KEYS.filter((k) => isDimensionFilled(m, k, contacts)).length;
  const total = DIMENSION_KEYS.length;
  const pct = Math.round((filled / total) * 100);
  const labels = locale === 'en' ? MEDDICC_LABELS_EN : MEDDICC_LABELS;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        {DIMENSION_KEYS.map((key) => {
          const isFilled = isDimensionFilled(m, key, contacts);
          return (
            <div
              key={key}
              className="h-2.5 w-2.5 rounded-full transition-colors duration-250"
              style={{
                backgroundColor: isFilled ? MEDDICC_COLORS[key] : 'var(--border)',
              }}
              title={`${labels[key]}${isFilled ? ' ✓' : ''}`}
            />
          );
        })}
      </div>
      <span className="text-xs font-medium text-secondary">
        {locale === 'en' ? 'Complete' : '完成'} {filled}/{total} ({pct}%)
      </span>
    </div>
  );
}

/** Guided questions block — shown when dimension is not filled */
function GuidedQuestions({ dimKey, locale, onStartFill }: { dimKey: string; locale: 'zh' | 'en'; onStartFill?: () => void }) {
  const guide = (locale === 'en' ? MEDDICC_GUIDES_EN : MEDDICC_GUIDES)[dimKey];
  if (!guide) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-secondary flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-accent-amber" />
        {guide.description}
      </p>
      <div className="space-y-1.5">
        {guide.questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-secondary">
            <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent text-[12px] font-semibold mt-0.5">
              {i + 1}
            </span>
            <span>{q}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg px-3 py-2.5" style={{ background: 'var(--border)', opacity: 0.7 }}>
        <p className="text-xs text-muted italic leading-relaxed">
          💡 {locale === 'en' ? 'Example' : '示例'}：{guide.example}
        </p>
      </div>
      {onStartFill && (
        <button
          onClick={onStartFill}
          className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
        >
          <Pencil className="h-3 w-3" />
          {locale === 'en' ? 'Start Filling' : '开始填写'}
        </button>
      )}
    </div>
  );
}


/** AI Strengthen suggestions — shown when dimension score is low */
function StrengtheningTips({ dimKey, m, contacts, locale }: { dimKey: string; m: MeddiccAssessment; contacts: Contact[]; locale: 'zh' | 'en' }) {
  const tips = (locale === 'en' ? MEDDICC_STRENGTHEN_EN : MEDDICC_STRENGTHEN)[dimKey];
  if (!tips) return null;
  const { score, max } = getDimensionScore(m, dimKey, contacts);
  const pct = max > 0 ? score / max : 0;
  // Show when score is below 50%
  if (pct >= 0.5) return null;
  return (
    <div className="mt-2 rounded-lg bg-warning/5 border border-warning/20 p-3">
      <p className="text-xs font-semibold text-warning mb-1">💡 {locale === 'en' ? 'AI Strengthening Tips' : 'AI补强建议'}</p>
      {tips.map((tip, i) => (
        <p key={i} className="text-xs text-secondary mt-1">• {tip}</p>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function MeddiccTab({ opp }: { opp: Opportunity }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const updateOpportunity = useStore((s) => s.updateOpportunity);
  const updateContact = useStore((s) => s.updateContact);
  const accounts = useStore((s) => s.accounts);
  const account = accounts.find((a) => a.id === opp.accountId);
  const contacts = account?.contacts || [];
  const [assessing, setAssessing] = useState(false);
  const [assessStep, setAssessStep] = useState(0);
  const [assessResult, setAssessResult] = useState<MeddiccAssessmentResult | null>(null);
  const addTask = useStore((s) => s.addTask);
  const [addedMeddiccTasks, setAddedMeddiccTasks] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  // Track which unfilled dimensions the user clicked Start Filling to show the form.
  const [forceEdit, setForceEdit] = useState<Set<string>>(new Set());

  const m = opp.meddicc;
  const score = computeMeddiccScore(m, contacts);
  const meddiccLabels = en ? MEDDICC_LABELS_EN : MEDDICC_LABELS;
  const hasCjk = (value?: string | null) => /[\u4e00-\u9fff]/.test(value ?? '');
  const safeText = (value: string | undefined | null, fallback: string) => {
    const cleaned = visibleBusinessText(value, locale);
    return en && hasCjk(cleaned) ? fallback : cleaned || fallback;
  };
  const statusCopy = {
    confirmed: en ? 'Confirmed' : '已确认',
    partial: en ? 'Partial' : '部分',
    unconfirmed: en ? 'Unconfirmed' : '未确认',
    unfilled: en ? 'Empty' : '未填',
  };

  const save = useCallback((meddicc: MeddiccAssessment) => {
    const newScore = computeMeddiccScore(meddicc, contacts);
    updateOpportunity(opp.id, { meddicc: { ...meddicc, overallScore: newScore } });
  }, [opp.id, updateOpportunity, contacts]);

  const updateField = <K extends keyof MeddiccAssessment>(key: K, value: MeddiccAssessment[K]) => {
    save({ ...m, [key]: value });
  };

  // AI Assess
  const handleAssess = async () => {
    setAssessing(true);
    setAssessStep(0);
    const t1 = setTimeout(() => setAssessStep(1), 1200);
    const t2 = setTimeout(() => setAssessStep(2), 3000);
    try {
      const ebContact = contacts.find((c) => c.role === 'decision_maker');
      const champContacts = contacts.filter((c) => c.role === 'champion');
      const res = await fetch('/api/meddicc-assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: { id: account?.id, name: account?.name, industry: account?.industry, dealStage: opp.stage, dealValue: opp.value },
          meddicc: {
            metrics: { notes: m.metrics.notes, status: m.metrics?.status },
            economicBuyer: { contactName: ebContact?.name, status: m.economicBuyer?.status },
            decisionCriteria: { items: m.decisionCriteria.map((d) => ({ criterion: d.criterion, fit: d.ourFit })) },
            decisionProcess: { steps: m.decisionProcess.map((d) => ({ name: d.step, completed: d.status === 'completed' })) },
            pain: { items: m.identifiedPain.map((p) => ({ pain: p.pain, quantified: p.quantified ? 'quantified' : 'not_quantified' })) },
            champion: { contactName: champContacts[0]?.name, strength: m.champion?.strength },
            competition: m.competition.map((c) => ({ name: c.name, theirAdvantage: c.strengths, ourCounter: c.ourAdvantage })),
          },
          tasks: (() => {
            const allTasks = useStore.getState().tasks;
            const oppTasks = allTasks.filter((t) => t.opportunityId === opp.id);
            const now = new Date();
            return oppTasks.map((t) => ({
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              isOverdue: !!(t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'),
            }));
          })(),
          outputLocale: locale,
        }),
      });
      const result = await res.json();
      setAssessStep(3);
      if (result.overallScore !== undefined) {
        save({ ...m, overallScore: result.overallScore });
      }
      setAssessResult(result);
    } catch (err) {
      console.error('MEDDICC assess error:', err);
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setAssessing(false);
    }
  };

  // Dimension status indicators
  const dimStatus = (key: string): { icon: string; label: string; color: string } => {
    const { score: s, max } = getDimensionScore(m, key, contacts);
    const pct = max > 0 ? s / max : 0;
    if (pct >= 0.7) return { icon: '✅', label: statusCopy.confirmed, color: 'text-positive' };
    if (pct >= 0.3) return { icon: '⚠️', label: statusCopy.partial, color: 'text-accent-amber' };
    if (s > 0) return { icon: '❌', label: statusCopy.unconfirmed, color: 'text-accent-red' };
    return { icon: '❓', label: statusCopy.unfilled, color: 'text-muted' };
  };

  const dpCompleted = (m.decisionProcess ?? []).filter((d) => d.status === 'completed').length;
  const dpTotal = (m.decisionProcess ?? []).length;
  const painQuantified = (m.identifiedPain ?? []).filter((p) => p.quantified).length;
  const painTotal = (m.identifiedPain ?? []).length;
  const champDepts = new Set(
    contacts.filter((c) => c.role === 'champion').map((c) => c.department).filter(Boolean)
  );

  const sections = [
    { key: 'metrics', label: en ? SECTION_LABELS_EN.metrics : 'M — 商业指标', icon: Target },
    { key: 'economicBuyer', label: en ? SECTION_LABELS_EN.economicBuyer : 'E — 经济决策者 (EB)', icon: Users },
    { key: 'decisionCriteria', label: en ? SECTION_LABELS_EN.decisionCriteria : 'D — 决策标准 (DC)', icon: CheckCircle2 },
    { key: 'decisionProcess', label: en ? SECTION_LABELS_EN.decisionProcess : 'D — 决策流程 (DP)', icon: CircleDot },
    { key: 'identifiedPain', label: en ? SECTION_LABELS_EN.identifiedPain : 'I — 识别痛点 (Pain)', icon: AlertTriangle },
    { key: 'champion', label: en ? SECTION_LABELS_EN.champion : 'C — 内部推动者', icon: Shield },
    { key: 'competition', label: en ? SECTION_LABELS_EN.competition : 'C — 竞争态势 (Competition)', icon: Swords },
  ];

  const weakestDim = useMemo(() => {
    let weakest = '';
    let lowestPct = 1;
    for (const s of sections) {
      const { score: ds, max: dm } = getDimensionScore(m, s.key, contacts);
      const pct = dm > 0 ? ds / dm : 0;
      if (pct < lowestPct) { lowestPct = pct; weakest = s.key; }
    }
    return lowestPct < 0.5 ? weakest : '';
  }, [m]);

  // Should we show the guide (unfilled) or the edit form?
  const shouldShowGuide = (key: string) => {
    return !isDimensionFilled(m, key, contacts) && !forceEdit.has(key);
  };

  return (
    <div className="space-y-3">
      {/* Score Panel + Progress Dots */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        {/* Dimension progress dots */}
        <div className="mb-4">
          <DimensionProgressBar m={m} contacts={contacts} locale={locale} />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <RingChart score={score} size={100} strokeWidth={10} />
            <span className="text-xs font-medium">{score >= 70 ? (en ? 'Strong Assessment' : '评估良好') : score >= 40 ? (en ? 'Needs Improvement' : '需要改善') : (en ? 'Severe Gaps' : '严重不足')}</span>
          </div>
          <div className="flex-1 w-full space-y-1.5">
            {Object.entries(meddiccLabels).map(([key, label]) => {
              const { score: s, max } = getDimensionScore(m, key, contacts);
              return <MiniBar key={key} score={s} max={max} color={MEDDICC_COLORS[key]} label={label} />;
            })}
          </div>
          <button
            onClick={handleAssess}
            disabled={assessing}
            className="flex flex-col items-center gap-1 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 flex-shrink-0"
          >
            {assessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Brain className="h-5 w-5" />}
            <span className="text-xs">{en ? 'AI Assess' : 'AI 评估'}</span>
          </button>
        </div>

        {assessing && <MeddiccProgressSteps currentStep={assessStep} locale={locale} />}

        {assessResult && (
          <div className="mt-4">
            <AssessmentResultDisplay
              assessment={assessResult}
              accountId={opp.accountId}
              entityId={opp.id}
              entityName={account?.name || opp.name}
              fallbackScore={score}
              renderPriorityAction={(p, i) =>
                !addedMeddiccTasks.has(i) ? (
                  <button
                    onClick={() => {
                      addTask({
                        title: p,
                        description: en ? `MEDDICC gap remediation: ${p}\n\n${assessResult.narrative || ''}` : `MEDDICC 差距补救：${p}\n\n${assessResult.narrative || ''}`,
                        status: 'todo',
                        priority: 'high',
                        source: 'meddicc',
                        aiGenerated: true,
                        accountId: opp.accountId,
                        opportunityId: opp.id,
                      });
                      setAddedMeddiccTasks((prev) => new Set(prev).add(i));
                    }}
                    className="ml-2 flex items-center gap-1 rounded border border-accent/30 px-1.5 py-0.5 text-xs text-accent hover:bg-accent/5 transition-colors flex-shrink-0"
                  >
                    <Plus className="h-2.5 w-2.5" />{en ? 'Remediation Task' : '补救任务'}
                  </button>
                ) : (
                  <span className="ml-2 flex items-center gap-1 text-xs text-positive flex-shrink-0"><CheckCircle2 className="h-2.5 w-2.5" />{en ? 'Created' : '已创建'}</span>
                )
              }
              footer={
                <button onClick={() => setAssessResult(null)} className="text-xs text-muted hover:text-accent">{en ? 'Close' : '关闭'}</button>
              }
            />
          </div>
        )}
      </div>

      {/* EB Missing Warning */}
      {m.economicBuyer?.status === 'unknown' && !contacts.some((c) => c.role === 'decision_maker') && (
        <div className="rounded-lg border border-accent-red/30 bg-accent-red/5 px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-accent-red" />
          <span className="text-xs font-medium text-accent-red">{en ? 'Warning: the Economic Buyer (EB) is not identified yet. This materially weakens close probability.' : '警告：经济决策者（EB）尚未识别，这会严重影响成交概率'}</span>
        </div>
      )}

      {/* Dimension Sections */}
      {sections.map(({ key, label, icon: Icon }) => {
        const status = dimStatus(key);
        const { score: dimS, max: dimMax } = getDimensionScore(m, key, contacts);
        const isPriority = weakestDim === key;
        const filled = isDimensionFilled(m, key, contacts);
        const showGuide = shouldShowGuide(key);
        const summary: string = (() => {
          switch (key) {
            case 'metrics': return m.metrics.notes ? safeText(m.metrics.notes.slice(0, 30) + (m.metrics.notes.length > 30 ? '...' : ''), en ? 'Metric notes' : '指标备注') : (en ? 'Empty' : '未填写');
            case 'economicBuyer': return contacts.find((c) => c.role === 'decision_maker')?.name || (en ? 'Not identified' : '未识别');
            case 'decisionCriteria': return (m.decisionCriteria ?? []).length + (en ? ' criteria' : ' 条标准');
            case 'decisionProcess': return (m.decisionProcess ?? []).filter((d) => d.status === 'completed').length + '/' + (m.decisionProcess ?? []).length + (en ? ' complete' : ' 完成');
            case 'identifiedPain': return (m.identifiedPain ?? []).filter((p) => p.quantified).length + '/' + (m.identifiedPain ?? []).length + (en ? ' quantified' : ' 已量化');
            case 'champion': return contacts.filter((c) => c.role === 'champion').length + (en ? ' people, strength ' : ' 人, 强度 ') + (m.champion?.strength || 0) + '/5';
            case 'competition': return (m.competition?.length || 0) + (en ? ' competitors' : ' 个竞品');
            default: return '';
          }
        })();
        return (
          <div key={key} className={`rounded-xl border bg-card shadow-sm transition-colors ${isPriority ? 'border-warning/40' : 'border-border'}`} style={{ borderLeftWidth: 4, borderLeftColor: isPriority ? '#f59e0b' : MEDDICC_COLORS[key] }}>
            <button
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setExpanded(expanded === key ? null : key)}
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="text-sm" title={status.label}>{status.icon}</span>
                <Icon className="h-4 w-4 flex-shrink-0" style={{ color: MEDDICC_COLORS[key] }} />
                <span className="text-sm font-medium truncate">{label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium flex-shrink-0 ${
                  status.color === 'text-positive' ? 'bg-positive/10 text-positive' :
                  status.color === 'text-accent-amber' ? 'bg-accent-amber/10 text-accent-amber' :
                  status.color === 'text-muted' ? 'bg-card text-muted' :
                  'bg-accent-red/10 text-accent-red'
                }`}>{status.icon} {status.label}</span>
                <span className="text-xs font-medium text-secondary flex-shrink-0">{dimS}/{dimMax}</span>
                <span className="hidden sm:inline truncate max-w-[180px] text-xs text-muted">{summary}</span>
                {isPriority && <span className="hidden sm:inline rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning flex-shrink-0">{en ? 'Recommended priority' : '建议优先补充'}</span>}
              </div>
              <ChevronDown className={`h-4 w-4 text-muted transition-transform duration-150 ${expanded === key ? 'rotate-180' : ''}`} />
            </button>

            <div className={`overflow-hidden transition-all duration-250 ${expanded === key ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="border-t border-border px-4 pb-4 pt-3">

                {/* Show guided questions if not filled and user hasn't clicked "开始填写" */}
                {showGuide && (
                  <GuidedQuestions
                    dimKey={key}
                    locale={locale}
                    onStartFill={() => setForceEdit((prev) => new Set(prev).add(key))}
                  />
                )}

                {/* AI Strengthen Tips */}
                <StrengtheningTips dimKey={key} m={m} contacts={contacts} locale={locale} />

                {/* Show edit form if filled OR user clicked "开始填写" */}
                {!showGuide && (
                  <>
                    {/* -- Metrics -- */}
                    {key === 'metrics' && (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Status' : '状态'}</label>
                          <div className="flex gap-2">
                            {([['confirmed', en ? '✅ Confirmed' : '✅ 已确认'], ['partial', en ? '⚠️ Partially confirmed' : '⚠️ 部分确认'], ['unconfirmed', en ? '❌ Unconfirmed' : '❌ 未确认']] as const).map(([val, lbl]) => (
                              <button
                                key={val}
                                onClick={() => updateField('metrics', { ...m.metrics, status: val })}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  m.metrics?.status === val ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:bg-background'
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Business metrics the customer expects to achieve' : '客户期望达成的商业指标'}</label>
                          <textarea
                            value={m.metrics.notes}
                            onChange={(e) => updateField('metrics', { ...m.metrics, notes: e.target.value })}
                            className="form-input"
                            rows={3}
                            placeholder={en ? 'Example: save $2M in labor cost over 3 years...' : '如：3年节省200万人力成本...'}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Supporting Evidence' : '证据支持'}</label>
                          <textarea
                            value={m.metrics.evidence}
                            onChange={(e) => updateField('metrics', { ...m.metrics, evidence: e.target.value })}
                            className="form-input"
                            rows={2}
                            placeholder={en ? 'What evidence supports these metrics?' : '有什么证据支持这些指标？'}
                          />
                        </div>
                      </div>
                    )}

                    {/* -- Economic Buyer -- */}
                    {key === 'economicBuyer' && (
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Linked Contact' : '关联联系人'}</label>
                          <select
                            value={contacts.find((c) => c.role === 'decision_maker')?.id || ''}
                            onChange={(e) => {
                              const accountId = opp.accountId;
                              const oldEB = contacts.find((c) => c.role === 'decision_maker');
                              if (oldEB) updateContact(accountId, oldEB.id, { role: 'contact' });
                              if (e.target.value) updateContact(accountId, e.target.value, { role: 'decision_maker' });
                              if (e.target.value && m.economicBuyer?.status === 'unknown') {
                                updateField('economicBuyer', { ...m.economicBuyer, status: 'identified' });
                              }
                            }}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          >
                            <option value="">{en ? 'Select contact' : '选择联系人'}</option>
                            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.title}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Engagement Status' : '接触状态'}</label>
                          <div className="flex gap-2">
                            {([['engaged', en ? '✅ Relationship established' : '✅ 已建立关系'], ['identified', en ? '⚠️ Identified, not engaged' : '⚠️ 已识别未接触'], ['unknown', en ? '❌ Unknown' : '❌ 未识别']] as const).map(([val, lbl]) => (
                              <button
                                key={val}
                                onClick={() => updateField('economicBuyer', { ...m.economicBuyer, status: val })}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  m.economicBuyer?.status === val ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:bg-background'
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Access Level' : '访问级别'}</label>
                          <input
                            value={m.economicBuyer?.accessLevel}
                            onChange={(e) => updateField('economicBuyer', { ...m.economicBuyer, accessLevel: e.target.value })}
                            className="form-input"
                            placeholder={en ? 'Can we contact directly? Who can make the introduction?' : '可以直接联系？需要谁引荐？'}
                          />
                        </div>
                      </div>
                    )}

                    {/* -- Decision Criteria -- */}
                    {key === 'decisionCriteria' && (
                      <div className="space-y-2">
                        {(m.decisionCriteria ?? []).length === 0 && (
                          <p className="text-xs text-muted italic">{en ? 'List the criteria the customer uses to evaluate vendors.' : '列出客户评估供应商的标准'}</p>
                        )}
                        {m.decisionCriteria.map((dc) => (
                          <div key={dc.id} className="flex items-start gap-2 rounded-lg border border-border p-2">
                            <div className="flex-1 space-y-1">
                              <input
                                value={dc.criterion}
                                onChange={(e) => updateField('decisionCriteria', m.decisionCriteria.map((d) => d.id === dc.id ? { ...d, criterion: e.target.value } : d))}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm input-glow"
                                placeholder={en ? 'Decision criterion...' : '决策标准...'}
                              />
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="flex flex-wrap gap-1">
                                  {([['strong', en ? '💪 Strong' : '💪 强'], ['partial', en ? '⚡ Partial' : '⚡ 部分'], ['weak', en ? '⚠️ Weak' : '⚠️ 弱'], ['unknown', en ? '❓ Unknown' : '❓ 未知']] as const).map(([val, lbl]) => (
                                    <button
                                      key={val}
                                      onClick={() => updateField('decisionCriteria', m.decisionCriteria.map((d) => d.id === dc.id ? { ...d, ourFit: val } : d))}
                                      className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                                        dc.ourFit === val ? 'bg-accent/10 text-accent ring-1 ring-accent/30' : 'bg-background text-muted hover:bg-border/50'
                                      }`}
                                    >
                                      {lbl}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  value={dc.notes}
                                  onChange={(e) => updateField('decisionCriteria', m.decisionCriteria.map((d) => d.id === dc.id ? { ...d, notes: e.target.value } : d))}
                                  className="flex-1 min-w-[120px] rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                                  placeholder={en ? 'Notes...' : '备注...'}
                                />
                              </div>
                            </div>
                            <button onClick={() => updateField('decisionCriteria', (m.decisionCriteria ?? []).filter((d) => d.id !== dc.id))} className="mt-1 text-muted hover:text-accent-red">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateField('decisionCriteria', [...m.decisionCriteria, { id: uid(), criterion: '', ourFit: 'unknown', notes: '' }])}
                          className="flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Plus className="h-3 w-3" /> {en ? 'Add Criterion' : '添加标准'}
                        </button>
                      </div>
                    )}

                    {/* -- Decision Process -- */}
                    {key === 'decisionProcess' && (
                      <div className="space-y-2">
                        {dpTotal > 0 && (
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-muted mb-1">
                              <span>{en ? 'Progress' : '进度'}</span>
                              <span>{dpCompleted}/{dpTotal} {en ? 'steps complete' : '步骤已完成'}</span>
                            </div>
                            <div className="h-2 rounded-full bg-border">
                              <div className="h-full rounded-full bg-[var(--positive)] transition-all" style={{ width: `${(dpCompleted / dpTotal) * 100}%` }} />
                            </div>
                          </div>
                        )}
                        {m.decisionProcess.map((ds) => (
                          <div key={ds.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                            <div className={`h-5 w-5 flex-shrink-0 rounded-full flex items-center justify-center text-xs ${
                              ds.status === 'completed' ? 'bg-positive text-white' :
                              ds.status === 'in_progress' ? 'bg-blue-500 text-white' :
                              ds.status === 'blocked' ? 'bg-accent-red text-white' :
                              'bg-border text-muted'
                            }`}>
                              {ds.status === 'completed' ? '✓' : ds.status === 'in_progress' ? '▸' : ds.status === 'blocked' ? '✕' : '○'}
                            </div>
                            <input
                              value={ds.step}
                              onChange={(e) => updateField('decisionProcess', m.decisionProcess.map((d) => d.id === ds.id ? { ...d, step: e.target.value } : d))}
                              className="flex-1 min-w-[120px] rounded border border-border bg-background px-2 py-1 text-sm input-glow"
                              placeholder={en ? 'Step description...' : '步骤描述...'}
                            />
                            <select
                              value={ds.status}
                              onChange={(e) => updateField('decisionProcess', m.decisionProcess.map((d) => d.id === ds.id ? { ...d, status: e.target.value as DecisionStep['status'] } : d))}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            >
                              <option value="pending">⏳ {en ? 'Pending' : '待开始'}</option>
                              <option value="in_progress">🔄 {en ? 'In progress' : '进行中'}</option>
                              <option value="completed">✅ {en ? 'Completed' : '已完成'}</option>
                              <option value="blocked">🚫 {en ? 'Blocked' : '阻塞'}</option>
                            </select>
                            <input
                              value={ds.owner}
                              onChange={(e) => updateField('decisionProcess', m.decisionProcess.map((d) => d.id === ds.id ? { ...d, owner: e.target.value } : d))}
                              className="w-24 rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                              placeholder={en ? 'Owner' : '负责人'}
                            />
                            <input
                              type="date"
                              value={ds.dueDate}
                              onChange={(e) => updateField('decisionProcess', m.decisionProcess.map((d) => d.id === ds.id ? { ...d, dueDate: e.target.value } : d))}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            />
                            <button onClick={() => updateField('decisionProcess', (m.decisionProcess ?? []).filter((d) => d.id !== ds.id))} className="text-muted hover:text-accent-red">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateField('decisionProcess', [...m.decisionProcess, { id: uid(), step: '', status: 'pending', owner: '', dueDate: '' }])}
                          className="flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Plus className="h-3 w-3" /> {en ? 'Add Step' : '添加步骤'}
                        </button>
                      </div>
                    )}

                    {/* -- Identified Pain -- */}
                    {key === 'identifiedPain' && (
                      <div className="space-y-2">
                        {painTotal > 0 && (
                          <div className="mb-3 flex items-center gap-2 text-xs">
                            <span className="text-muted">{en ? 'Quantified rate:' : '量化率：'}</span>
                            <span className={`font-medium ${painQuantified === painTotal ? 'text-positive' : 'text-accent-amber'}`}>
                              {painQuantified}/{painTotal} {en ? 'quantified' : '已量化'}
                            </span>
                          </div>
                        )}
                        {m.identifiedPain.map((pp) => (
                          <div
                            key={pp.id}
                            className={`flex items-start gap-2 rounded-lg border p-2 ${!pp.quantified ? 'border-accent-amber/40 bg-accent-amber/5' : 'border-border'}`}
                          >
                            <div className="flex-1 space-y-1">
                              <input
                                value={pp.pain}
                                onChange={(e) => updateField('identifiedPain', m.identifiedPain.map((p) => p.id === pp.id ? { ...p, pain: e.target.value } : p))}
                                className="w-full rounded border border-border bg-background px-2 py-1 text-sm input-glow"
                                placeholder={en ? 'Pain description...' : '痛点描述...'}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => updateField('identifiedPain', m.identifiedPain.map((p) => p.id === pp.id ? { ...p, quantified: !p.quantified } : p))}
                                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                                    pp.quantified ? 'bg-positive/10 text-positive' : 'bg-accent-amber/10 text-accent-amber'
                                  }`}
                                >
                                  {pp.quantified ? (en ? '✅ Quantified' : '✅ 已量化') : (en ? '⚠️ Not quantified' : '⚠️ 未量化')}
                                </button>
                                <input
                                  value={pp.impactValue}
                                  onChange={(e) => updateField('identifiedPain', m.identifiedPain.map((p) => p.id === pp.id ? { ...p, impactValue: e.target.value } : p))}
                                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                                  placeholder={en ? 'Quantified impact, e.g. $500K annual loss...' : '量化影响（如：每年损失50万美元）...'}
                                />
                              </div>
                              {pp.notes !== undefined && (
                                <input
                                  value={pp.notes}
                                  onChange={(e) => updateField('identifiedPain', m.identifiedPain.map((p) => p.id === pp.id ? { ...p, notes: e.target.value } : p))}
                                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                                  placeholder={en ? 'Notes...' : '备注...'}
                                />
                              )}
                            </div>
                            <button onClick={() => updateField('identifiedPain', (m.identifiedPain ?? []).filter((p) => p.id !== pp.id))} className="mt-1 text-muted hover:text-accent-red">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateField('identifiedPain', [...m.identifiedPain, { id: uid(), pain: '', quantified: false, impactValue: '', notes: '' }])}
                          className="flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Plus className="h-3 w-3" /> {en ? 'Add Pain' : '添加痛点'}
                        </button>
                      </div>
                    )}

                    {/* -- Champion -- */}
                    {key === 'champion' && (
                      <div className="space-y-3">
                        {contacts.filter((c) => c.role === 'champion').length === 1 && (
                          <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-3 py-2 flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-accent-amber" />
                            <span className="text-xs text-accent-amber">{en ? 'Single-thread risk: only one champion. Build more internal support.' : '单线程风险：仅 1 个内部推动者，建议发展更多内部推动者'}</span>
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Champion Contacts (multi-select)' : '内部推动者联系人（多选）'}</label>
                          <div className="space-y-1">
                            {contacts.map((c) => {
                              const isChampion = c.role === 'champion';
                              return (
                                <label key={c.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm cursor-pointer ${
                                  isChampion ? 'border-positive/30 bg-positive/5' : 'border-border hover:bg-background'
                                }`}>
                                  <input
                                    type="checkbox"
                                    checked={isChampion}
                                    onChange={(e) => {
                                      updateContact(opp.accountId, c.id, { role: e.target.checked ? 'champion' : 'contact' });
                                    }}
                                    className="rounded"
                                  />
                                  <span className="font-medium">{c.name}</span>
                                  <span className="text-xs text-muted">{safeText(c.title, en ? 'Contact title' : '联系人职位')}</span>
                                  {c.department && <span className="rounded bg-background px-1.5 py-0.5 text-xs text-muted">{safeText(c.department, en ? 'Department' : '部门')}</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                        {champDepts.size > 0 && (
                          <div className="text-xs text-muted">
                            {en ? 'Multi-thread coverage' : '多线程覆盖'}：{champDepts.size} {en ? 'departments' : '个部门'} ({[...champDepts].map((d) => safeText(d, en ? 'Department' : '部门')).join(en ? ', ' : '、')})
                          </div>
                        )}
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Champion Strength' : '推动者强度'} ({m.champion?.strength}/5)</label>
                          <div className="flex items-center gap-2 overflow-hidden">
                            <input
                              type="range" min={0} max={5} step={1}
                              value={m.champion?.strength}
                              onChange={(e) => updateField('champion', { ...m.champion, strength: Number(e.target.value) })}
                              className="flex-1"
                            />
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <div key={s} className={`h-2 w-4 rounded-full ${s <= m.champion?.strength ? 'bg-positive' : 'bg-border'}`} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Last Engagement Date' : '最近互动日期'}</label>
                          <input
                            type="date"
                            value={m.champion?.lastEngagement}
                            onChange={(e) => updateField('champion', { ...m.champion, lastEngagement: e.target.value })}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                          />
                          {m.champion?.lastEngagement && (() => {
                            const days = daysBetween(m.champion?.lastEngagement, new Date().toISOString().split('T')[0]);
                            if (days > 30) return <p className="mt-1 text-xs text-accent-red">🔴 {days} {en ? 'days without engagement - relationship is decaying' : '天未互动 — 关系严重衰减'}</p>;
                            if (days > 14) return <p className="mt-1 text-xs text-accent-amber">🟡 {days} {en ? 'days without engagement - needs attention' : '天未互动 — 注意维护关系'}</p>;
                            return <p className="mt-1 text-xs text-positive">🟢 {days} {en ? 'days since last engagement - relationship active' : '天前互动 — 关系活跃'}</p>;
                          })()}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-muted">{en ? 'Notes' : '备注'}</label>
                          <textarea
                            value={m.champion.notes}
                            onChange={(e) => updateField('champion', { ...m.champion, notes: e.target.value })}
                            className="form-input"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}

                    {/* -- Competition -- */}
                    {key === 'competition' && (
                      <div className="space-y-2">
                        {m.competition.map((comp) => (
                          <div key={comp.id} className={`rounded-lg border p-3 space-y-2 ${
                            comp.threatLevel === 'high' ? 'border-accent-red/30 bg-accent-red/5' :
                            comp.threatLevel === 'medium' ? 'border-accent-amber/20 bg-accent-amber/5' :
                            'border-border'
                          }`}>
                            <div className="flex items-center gap-2">
                              <input
                                value={comp.name}
                                onChange={(e) => updateField('competition', m.competition.map((c) => c.id === comp.id ? { ...c, name: e.target.value } : c))}
                                className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm font-medium input-glow"
                                placeholder={en ? 'Competitor name...' : '竞品名称...'}
                              />
                              <div className="flex gap-1">
                                {([['high', en ? '🔴 High' : '🔴 高'], ['medium', en ? '🟡 Medium' : '🟡 中'], ['low', en ? '🟢 Low' : '🟢 低']] as const).map(([val, lbl]) => (
                                  <button
                                    key={val}
                                    onClick={() => updateField('competition', m.competition.map((c) => c.id === comp.id ? { ...c, threatLevel: val } : c))}
                                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                                      comp.threatLevel === val ? 'ring-1 ring-accent/30 bg-accent/10' : 'bg-background text-muted hover:bg-border/50'
                                    }`}
                                  >
                                    {lbl}
                                  </button>
                                ))}
                              </div>
                              <button onClick={() => updateField('competition', (m.competition ?? []).filter((c) => c.id !== comp.id))} className="text-muted hover:text-accent-red">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-muted">{en ? 'Their Strengths' : '他们的优势'}</label>
                                <input
                                  value={comp.strengths}
                                  onChange={(e) => updateField('competition', m.competition.map((c) => c.id === comp.id ? { ...c, strengths: e.target.value } : c))}
                                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                                  placeholder={en ? 'Competitor strengths...' : '对方优势...'}
                                />
                              </div>
                              <div>
                                <label className="text-xs text-muted">{en ? 'Our Counterpoints' : '我们的反击点'}</label>
                                <input
                                  value={comp.ourAdvantage}
                                  onChange={(e) => updateField('competition', m.competition.map((c) => c.id === comp.id ? { ...c, ourAdvantage: e.target.value } : c))}
                                  className="w-full rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                                  placeholder={en ? 'Our advantage / counter-strategy...' : '我们的优势/反击策略...'}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => updateField('competition', [...m.competition, { id: uid(), name: '', strengths: '', ourAdvantage: '', threatLevel: 'medium' }])}
                          className="flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Plus className="h-3 w-3" /> {en ? 'Add Competitor' : '添加竞品'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
