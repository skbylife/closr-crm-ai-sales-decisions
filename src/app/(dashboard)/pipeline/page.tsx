'use client';
import { formatCurrency, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/format-currency';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useSelection } from '@/hooks/use-selection';
import { useAuth } from '@/lib/auth-context';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { useEffectiveJobLevel } from '@/hooks/use-effective-job-level';
import { getOpportunityOwnerUserId } from '@/lib/opportunity-ownership';
import {
  Plus,
  TrendingUp,
  DollarSign,
  BarChart3,
  Clock,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  X,
  User,
  Download,
  LayoutGrid,
  Calendar as CalendarIcon,
  Trophy,
} from 'lucide-react';
import { SpotlightTour } from '@/components/onboarding/SpotlightTour';
import type {
  Opportunity,
  OpportunityStage,
  MeddiccAssessment,
  MutualActionPlan,
  Contact,
  StrategicPlay,
  PlayMomentum,
} from '@/lib/babel-engine/types';
import { usePipelineStages } from '@/hooks/use-pipeline-stages';
import { useLocale } from '@/lib/i18n';
import { downloadCsv } from '@/lib/export-csv';
import { canViewScope, getDefaultScope, getEffectiveScope, MOMENTUM_CONFIG, type DataScope } from '@/lib/permissions';
import { NextActionBadge } from '@/components/pipeline/NextActionBadge';
import { computeDealHealth, type DealHealthResult } from '@/lib/deal-health';
import { DealHealthBadge } from '@/components/pipeline/DealHealthBadge';
import { emitDealStageChanged } from '@/lib/pipeline-events';
import ForecastPage from '../forecast/page';
import { checkStageGate } from '@/lib/stage-gates';
import { toast } from '@/lib/toast-store';
import { appConfirm } from '@/lib/confirm-store';
import { calculateWinProbability, getWinProbabilityColor, type WinProbabilityResult } from '@/lib/win-probability';
import { daysBetween } from '@/lib/time-utils';
import { getMeddiccScore } from '@/lib/meddicc';
import { RoleFocusBanner } from '@/components/shared/role-focus-banner';
import { buildManagerInspectionQueue } from '@/lib/crm-foundation/manager-inspection';
import { ManagerInspectionView } from '@/components/crm/manager-inspection-view';

type PipelineView = 'kanban' | 'calendar' | 'forecast' | 'inspection' | 'won';

function parsePipelineView(value: string | null): PipelineView {
  return value === 'calendar' || value === 'forecast' || value === 'inspection' || value === 'won'
    ? value
    : 'kanban';
}

// ─── Pipeline Calendar View ──────────────────────────────────────────

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

function PipelineCalendar({ opportunities, getStageLabel, currency }: { opportunities: Opportunity[]; getStageLabel: (key: string) => string; currency: CurrencyCode }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const getDealsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return opportunities.filter(o => o.expectedCloseDate?.split('T')[0] === dateStr);
  };

  // 本月有预计关单日的 deal 数量
  const monthDeals = opportunities.filter(o => {
    if (!o.expectedCloseDate) return false;
    const d = new Date(o.expectedCloseDate);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  const monthValue = monthDeals.reduce((s, o) => s + o.value, 0);

  return (
    <div className="space-y-4">
      {/* 月份导航 + 统计 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="rounded-lg border border-border p-2 hover:bg-background">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-foreground min-w-[120px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="rounded-lg border border-border p-2 hover:bg-background">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background">今天</button>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-secondary">本月 <strong className="text-foreground">{monthDeals.length}</strong> 个 Deal 预计关单</span>
          <span className="text-secondary">总额 <strong className="text-accent">{formatCurrency(monthValue, currency)}</strong></span>
        </div>
      </div>

      {/* 日历网格 */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-[12px] font-semibold text-secondary">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[48px] sm:min-h-[90px] border-b border-r border-border bg-sidebar/30" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dayDeals = getDealsForDay(day);
            return (
              <div key={i} className={`min-h-[48px] sm:min-h-[90px] border-b border-r border-border p-0.5 sm:p-1.5 ${isToday ? 'bg-accent/5' : 'hover:bg-background'}`}>
                <p className={`text-xs font-medium mb-1 ${isToday ? 'text-accent font-bold' : 'text-foreground'}`}>{day}</p>
                {/* Mobile dots */}
                <div className="flex flex-wrap gap-0.5 sm:hidden">
                  {dayDeals.slice(0, 4).map(o => (
                    <span key={o.id} className="h-1.5 w-1.5 rounded-full bg-accent flex-shrink-0" />
                  ))}
                </div>
                {/* Desktop deal cards */}
                <div className="hidden sm:block space-y-0.5">
                  {dayDeals.slice(0, 2).map(o => (
                    <Link key={o.id} href={`/pipeline/${o.id}`} className="block truncate rounded px-1 py-0.5 text-[11px] bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                      💰 {o.name}
                      <span className="ml-1 text-[10px] text-secondary">${(o.value / 1000).toFixed(0)}k</span>
                    </Link>
                  ))}
                  {dayDeals.length > 2 && (
                    <p className="text-[10px] text-muted px-1">+{dayDeals.length - 2} 更多</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 本月即将关单列表 */}
      {monthDeals.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground mb-3">📋 本月预计关单</p>
          <div className="space-y-2">
            {monthDeals.sort((a, b) => (a.expectedCloseDate || '').localeCompare(b.expectedCloseDate || '')).map(o => (
              <Link key={o.id} href={`/pipeline/${o.id}`} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-background transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted font-mono whitespace-nowrap">{o.expectedCloseDate?.split('T')[0]?.slice(5)}</span>
                  <span className="text-sm text-foreground truncate">{o.name}</span>
                  <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-secondary whitespace-nowrap">{getStageLabel(o.stage)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold text-foreground">${o.value.toLocaleString()}</span>
                  <span className="text-xs text-accent">{o.probability}%</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Win Probability Mini Ring ───────────────────────────────────────

function WinProbBadge({ result }: { result: WinProbabilityResult }) {
  const size = 36;
  const sw = 4;
  const radius = (size - sw) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - result.score / 100);
  const color = getWinProbabilityColor(result.score);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-400"
        />
        <text
          x={size / 2} y={size / 2}
          textAnchor="middle" dominantBaseline="central"
          className="fill-foreground font-bold"
          style={{ fontSize: '10px', transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {result.score}%
        </text>
      </svg>
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 rounded-lg border border-border bg-card p-3 shadow-lg text-xs">
          <p className="font-semibold text-foreground mb-2">AI 胜率分析</p>
          {result.factors.map((f, i) => (
            <div key={i} className="mb-1.5 last:mb-0">
              <div className="flex items-center justify-between">
                <span className="text-secondary">{f.name}</span>
                <span className="font-medium" style={{ color: getWinProbabilityColor(f.impact * 5) }}>+{f.impact}</span>
              </div>
              <p className="text-[12px] text-muted leading-tight mt-0.5">{f.detail}</p>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
            <span className="font-semibold text-foreground">总分</span>
            <span className="font-bold text-lg" style={{ color }}>{result.score}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────


function emptyMeddicc(): MeddiccAssessment {
  return {
    metrics: { notes: '', status: 'unconfirmed', evidence: '' },
    economicBuyer: { status: 'unknown', accessLevel: '' },
    decisionCriteria: [],
    decisionProcess: [],
    identifiedPain: [],
    champion: { strength: 0, lastEngagement: '', notes: '' },
    competition: [],
    overallScore: 0,
  };
}

function emptyMap(): MutualActionPlan {
  return { targetSignDate: '', confidence: 50, milestones: [] };
}

// ─── Stage validation ────────────────────────────────────────────────

function computeMeddiccScore(m: Opportunity['meddicc'], contacts: Contact[]): number {
  return getMeddiccScore(m, contacts);
}

function checkStageRequirements(opp: Opportunity, targetStage: OpportunityStage, contacts: Contact[]): string[] {
  const warnings: string[] = [];
  const m = opp.meddicc;
  const score = computeMeddiccScore(m, contacts);

  switch (targetStage) {
    case 'discovery':
      if (contacts.length === 0) warnings.push('至少需要 1 个联系人');
      break;
    case 'solution_presented':
      if (m.metrics.status === 'unconfirmed') warnings.push('量化指标至少需要部分确认');
      if (m.identifiedPain.length === 0) warnings.push('至少需要 1 条痛点');
      if (!contacts.some((c) => c.role === 'champion')) warnings.push('至少需要 1 个内部推动者');
      break;
    case 'proposal_sent':
      if (m.decisionCriteria.length === 0) warnings.push('至少需要 1 条决策标准');
      if (!opp.value) warnings.push('需要填写金额');
      break;
    case 'negotiation':
      if (m.economicBuyer.status === 'unknown') warnings.push('Economic Buyer 至少需要已识别');
      if (m.decisionProcess.length === 0) warnings.push('至少需要 1 步决策流程');
      break;
    case 'contract_review':
      if (score < 40) warnings.push(`MEDDICC 评分 ${score}，需要 >= 40`);
      if (opp.mutualActionPlan.milestones.length < 3) warnings.push(`MAP 仅 ${opp.mutualActionPlan.milestones.length} 个里程碑，需要 >= 3`);
      break;
    case 'closed_won':
      if (score < 60) warnings.push(`MEDDICC 评分 ${score}，需要 >= 60`);
      if (opp.mutualActionPlan.milestones.some((ms) => ms.status === 'blocked')) warnings.push('MAP 存在阻塞里程碑');
      break;
    case 'closed_lost':
      if (!opp.lostReason) warnings.push('丢失原因必填');
      break;
  }
  return warnings;
}

function PipelineVisualSummary({
  activeOpps,
  stages,
  getStageLabel,
  currency,
  dealHealthMap,
  weightedValue,
  totalValue,
  monthlyCloseValue,
  locale,
}: {
  activeOpps: Opportunity[];
  stages: OpportunityStage[];
  getStageLabel: (key: string) => string;
  currency: CurrencyCode;
  dealHealthMap: Map<string, DealHealthResult>;
  weightedValue: number;
  totalValue: number;
  monthlyCloseValue: number;
  locale: 'zh' | 'en';
}) {
  const en = locale === 'en';
  const stageRows = stages
    .map((stage) => {
      const opps = activeOpps.filter((opp) => opp.stage === stage);
      const value = opps.reduce((sum, opp) => sum + opp.value, 0);
      return { stage, label: getStageLabel(stage), count: opps.length, value };
    })
    .filter((row) => row.count > 0 || row.value > 0);
  const maxStageValue = Math.max(1, ...stageRows.map((row) => row.value));
  const riskDeals = activeOpps.filter((opp) => {
    const health = dealHealthMap.get(opp.id);
    return health?.level === 'critical' || health?.level === 'at_risk';
  });
  const riskPct = activeOpps.length > 0 ? Math.round((riskDeals.length / activeOpps.length) * 100) : 0;
  const weightedPct = totalValue > 0 ? Math.round((weightedValue / totalValue) * 100) : 0;
  const monthPct = totalValue > 0 ? Math.round((monthlyCloseValue / totalValue) * 100) : 0;

  return (
    <section className="grid gap-3 lg:grid-cols-[1.25fr_0.9fr_0.85fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">{en ? 'Stage Value Distribution' : '阶段金额分布'}</p>
          <span className="text-xs text-muted">{activeOpps.length} {en ? 'active opportunities' : '个活跃机会'}</span>
        </div>
        <div className="space-y-3">
          {stageRows.slice(0, 6).map((row) => (
            <div key={row.stage}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-secondary">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatCurrency(row.value, currency)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-accent" style={{ width: Math.max(5, (row.value / maxStageValue) * 100) + '%' }} />
              </div>
            </div>
          ))}
          {stageRows.length === 0 && <p className="text-sm text-muted">{en ? 'No active opportunities.' : '暂无活跃商机。'}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">{en ? 'Pipeline Credibility' : '管线可信度'}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-background px-3 py-3">
            <p className="text-[11px] text-muted">{en ? 'Weighted / Total' : '加权 / 总额'}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{weightedPct}%</p>
            <div className="mt-3 h-2 rounded-full bg-sidebar">
              <div className="h-full rounded-full bg-positive" style={{ width: Math.max(4, weightedPct) + '%' }} />
            </div>
          </div>
          <div className="rounded-lg bg-background px-3 py-3">
            <p className="text-[11px] text-muted">{en ? 'This-month close share' : '本月关单占比'}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{monthPct}%</p>
            <div className="mt-3 h-2 rounded-full bg-sidebar">
              <div className="h-full rounded-full bg-warning" style={{ width: Math.max(4, monthPct) + '%' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{en ? 'Risk Hotspots' : '风险热区'}</p>
            <p className="mt-1 text-xs text-muted">{en ? 'Opportunities needing review' : '需要复核的商机'}</p>
          </div>
          <span className={riskDeals.length > 0 ? 'rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger' : 'rounded-full bg-positive/10 px-2 py-1 text-xs font-semibold text-positive'}>
            {riskDeals.length}
          </span>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-background">
          <div className={riskDeals.length > 0 ? 'h-full rounded-full bg-danger' : 'h-full rounded-full bg-positive'} style={{ width: Math.max(4, riskPct) + '%' }} />
        </div>
        <p className="mt-3 text-xs text-secondary">{riskPct}% {en ? 'of active opportunities need review' : '活跃机会需要复核'}</p>
      </div>
    </section>
  );
}

// ─── Add Opportunity Modal ───────────────────────────────────────────

function AddOpportunityModal({ onClose }: { onClose: () => void }) {
  const { orgMembers, user } = useAuth();
  const getMemberName = (m: { displayName?: string; email?: string; userId: string }) => {
    if (m.displayName) return m.displayName;
    if (m.email) return m.email.split("@")[0].replace(/[._-]/g, " ").split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return m.userId.slice(0, 8);
  };
  const { t } = useLocale();
  const { accounts } = useRoleFilteredData();
  const addOpportunity = useStore((s) => s.addOpportunity);
  const defaultCurrency = useStore((s) => s.currencyCode);
  const [form, setForm] = useState({
    accountId: accounts[0]?.id || '',
    name: '',
    value: 0,
    currency: defaultCurrency,
    assignedTo: user?.id || '',
    source: '',
    expectedCloseDate: '',
  });
  // 表单验证错误
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 金额输入仅允许数字
  const handleAmountChange = (val: string) => {
    const cleaned = val.replace(/[^\d.]/g, '');
    setForm({ ...form, value: cleaned ? Number(cleaned) : 0 });
    setErrors((prev) => ({ ...prev, value: '' }));
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (!form.accountId) newErrors.accountId = '请选择客户';
    if (!form.name.trim()) newErrors.name = '请输入机会名称';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    if (!form.accountId || !form.name) return;
    const selectedMember = orgMembers.find((m) => m.userId === form.assignedTo);
    addOpportunity({
      ...form,
      owner: selectedMember ? getMemberName(selectedMember) : '',
      stage: 'lead_identified',
      probability: 10,
      meddicc: emptyMeddicc(),
      mutualActionPlan: emptyMap(),
      competitorIds: [],
      notes: '',
    });
    onClose();
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="card-elevated mx-3 w-full max-w-lg rounded-2xl border border-border bg-card p-4 sm:mx-0 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("pipeline.modal.title")}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="form-label">{t("pipeline.modal.account")} <span className="text-danger">*</span></label>
            <select
              value={form.accountId}
              onChange={(e) => { setForm({ ...form, accountId: e.target.value }); setErrors((prev) => ({ ...prev, accountId: '' })); }}
              className={`form-select ${errors.accountId ? 'border-danger' : ''}`}
            >
              <option value="">{t("pipeline.modal.selectAccount")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.accountId && <p className="text-xs text-danger mt-1">{errors.accountId}</p>}
          </div>
          <div>
            <label className="form-label">{t("pipeline.modal.name")} <span className="text-danger">*</span></label>
            <input
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors((prev) => ({ ...prev, name: '' })); }}
              className={`form-input ${errors.name ? 'border-danger' : ''}`}
              placeholder={t("pipeline.modal.namePlaceholder")}
            />
            {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("pipeline.modal.amount")}</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.value || ''}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="form-input"
                placeholder="0"
              />
            </div>
            <div>
              <label className="form-label">{t("pipeline.modal.currency")}</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as CurrencyCode })}
                className="form-select"
              >
                {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">{t("pipeline.modal.owner")}</label>
              <select
                value={form.assignedTo}
                onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                className="form-select"
              >
                <option value="">选择负责人</option>
                {orgMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {getMemberName(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t("pipeline.modal.source")}</label>
              <input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="form-input"
              />
            </div>
          </div>
          <div>
            <label className="form-label">{t("pipeline.modal.expectedClose")}</label>
            <input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              className="form-input"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-background">
            {t("pipeline.modal.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.accountId || !form.name}
            className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-hover disabled:opacity-40"
          >
            {t("pipeline.modal.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stage Warning Modal ─────────────────────────────────────────────

function StageWarningModal({ warnings, onConfirm, onCancel }: { warnings: string[]; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useLocale();
  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="card-elevated mx-3 w-full max-w-md rounded-2xl border border-border bg-card p-4 sm:mx-0 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="font-semibold">{t("pipeline.modal.stageCheck")}</h3>
        </div>
        <p className="mb-3 text-sm text-muted">{t("pipeline.modal.unmetConditions")}</p>
        <ul className="mb-5 space-y-2">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-danger">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-danger" />
              {w}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-background">
            {t("pipeline.modal.cancelAdvance")}
          </button>
          <button onClick={onConfirm} className="rounded-lg bg-amber-600 px-5 py-3 text-sm font-medium text-white hover:bg-amber-700">
            {t("pipeline.modal.forceAdvance")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Page ───────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { opportunities: roleFilteredOpportunities, tasks, accounts: roleFilteredAccounts, intelItems, emailDecodes, composedEmails } = useRoleFilteredData();
  const { t, locale } = useLocale();
  const en = locale === 'en';
  const { orgMembers, user } = useAuth();
  const jobLevel = useEffectiveJobLevel();

  // ── 自定义管线阶段 hook ──
  const { stages: pipelineStages } = usePipelineStages();

  // 从 hook 推导 STAGE_ORDER / STAGE_LABELS（自定义优先，空则回退默认）
  const STAGE_ORDER = useMemo(
    () => pipelineStages.map((s) => s.key as OpportunityStage),
    [pipelineStages],
  );
  const STAGE_LABELS = useMemo(
    () =>
      Object.fromEntries(pipelineStages.map((s) => [s.key, s.label])) as Record<
        OpportunityStage,
        string
      >,
    [pipelineStages],
  );
  const displayStageLabel = (stage: OpportunityStage) => (en ? t(`stage.${stage}`) : STAGE_LABELS[stage] || stage);
  const accounts = roleFilteredAccounts;

  // Scope 切换（权限过滤）— applied on top of role-filtered baseline
  const defaultScope = getDefaultScope(jobLevel);
  const [scope, setScope] = useState<DataScope>(defaultScope);
  const effectiveScope = canViewScope(jobLevel, scope) ? scope : getEffectiveScope(jobLevel);

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  const currentMember = orgMembers.find(m => m.userId === user?.id);
  const teamMemberIds = currentMember?.teamId
    ? orgMembers.filter(m => m.teamId === currentMember.teamId).map(m => m.userId)
    : user?.id ? [user.id] : [];

  // 根据 scope UI 过滤 opportunities（on top of role-filtered data）
  const opportunities = roleFilteredOpportunities.filter((o) => {
    const ownerUserId = getOpportunityOwnerUserId(o);
    if (effectiveScope === 'mine') return ownerUserId === user?.id;
    if (effectiveScope === 'team') return !ownerUserId || teamMemberIds.includes(ownerUserId);
    return true; // 'all'
  });

  /** 每个 opportunity 的下一个待办 task（按 dueDate 升序，排除 done） */
  const nextTaskMap = useMemo(() => {
    const map = new Map<string, import('@/lib/babel-engine/types').Task>();
    const pending = tasks
      .filter((t) => t.opportunityId && t.status !== 'done')
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    for (const task of pending) {
      if (task.opportunityId && !map.has(task.opportunityId)) {
        map.set(task.opportunityId, task);
      }
    }
    return map;
  }, [tasks]);

  /** 每个 opportunity 的自动健康度 */
  const dealHealthMap = useMemo(() => {
    const map = new Map<string, DealHealthResult>();
    for (const opp of opportunities) {
      if (opp.stage === 'closed_won' || opp.stage === 'closed_lost') continue;
      const account = accounts.find((a) => a.id === opp.accountId);
      if (!account) continue;
      map.set(opp.id, computeDealHealth({ opportunity: opp, account, tasks, locale }));
    }
    return map;
  }, [opportunities, accounts, tasks, locale]);

  /** 根据 user_id 查找成员显示名 */
  function getOwnerName(userId?: string): string {
    if (!userId) return "";
    const member = orgMembers.find((m) => m.userId === userId);
    if (member?.displayName) return member.displayName;
    if (member?.email) {
      const localPart = member.email.split("@")[0];
      return localPart.replace(/[._-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
    return "";
  }
  const prefetchOpportunity = (id: string) => router.prefetch(`/pipeline/${id}`);
  const navigateToOpportunity = (id: string) => router.push(`/pipeline/${id}`);
  const updateOpportunity = useStore((s) => s.updateOpportunity);
  // ── 批量选择 ──
  const selection = useSelection(opportunities);

  function handleExportSelected() {
    const selected = opportunities.filter(o => selection.selectedIds.has(o.id));
    const headers = ["名称", "客户", "阶段", "金额", "概率", "预计关闭日期", "负责人"];
    const rows = selected.map((o) => [
      o.name,
      getAccountName(o.accountId),
      displayStageLabel(o.stage),
      String(o.value),
      `${o.probability}%`,
      o.expectedCloseDate || "",
      getOwnerName(getOpportunityOwnerUserId(o)) || o.owner || "",
    ]);
    downloadCsv("closr-pipeline-selected", headers, rows);
  }

  const [showAddModal, setShowAddModal] = useState(false);
  const [stageWarning, setStageWarning] = useState<{ oppId: string; targetStage: OpportunityStage; warnings: string[] } | null>(null);
  const [pipelineView, setPipelineView] = useState<PipelineView>(() => parsePipelineView(searchParams.get('view')));

  useEffect(() => {
    setPipelineView(parsePipelineView(searchParams.get('view')));
  }, [searchParams]);

  function switchPipelineView(view: PipelineView) {
    setPipelineView(view);
    router.replace(view === 'kanban' ? '/pipeline' : '/pipeline?view=' + view, { scroll: false });
  }

  // Active stages for kanban (exclude closed)
  const kanbanStages: OpportunityStage[] = STAGE_ORDER.filter((s) => s !== 'closed_won' && s !== 'closed_lost');
  const activeOpps = opportunities.filter((o) => o.stage !== 'closed_won' && o.stage !== 'closed_lost');
  const wonOpps = opportunities.filter((o) => o.stage === 'closed_won');
  const lostOpps = opportunities.filter((o) => o.stage === 'closed_lost');

  // Stats
  const totalDeals = activeOpps.length;
  const totalValue = activeOpps.reduce((sum, o) => sum + o.value, 0);
  const weightedValue = activeOpps.reduce((sum, o) => sum + o.value * (o.probability / 100), 0);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const monthlyCloseValue = activeOpps
    .filter((o) => {
      if (!o.expectedCloseDate) return false;
      const d = new Date(o.expectedCloseDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, o) => sum + o.value, 0);

  const managerInspectionQueue = useMemo(() => buildManagerInspectionQueue({
    accounts,
    opportunities,
    tasks,
    intelItems,
    decodes: emailDecodes,
    composedEmails,
  }), [accounts, opportunities, tasks, intelItems, emailDecodes, composedEmails]);

  const getAccountName = (accountId: string) => accounts.find((a) => a.id === accountId)?.name || t('pipeline.unknownAccount');

  /** 导出 Pipeline 数据为 CSV */
  function handleExportPipeline() {
    const headers = ["名称", "客户", "阶段", "金额", "概率", "预计关闭日期", "负责人"];
    const rows = opportunities.map((o) => [
      o.name,
      getAccountName(o.accountId),
      displayStageLabel(o.stage),
      String(o.value),
      `${o.probability}%`,
      o.expectedCloseDate || "",
      getOwnerName(getOpportunityOwnerUserId(o)) || o.owner || "",
    ]);
    downloadCsv("closr-pipeline", headers, rows);
  }

  /** 使用通用 exportToCSV 导出 Pipeline */
  function exportPipelineCSV() {
    const headers = ["名称", "客户", "阶段", "金额", "加权金额", "概率", "预计关闭日期", "停留天数", "健康度", "负责人"];
    const rows = opportunities.map((o) => {
      const health = dealHealthMap.get(o.id);
      const healthLabel = health ? (health.level === 'healthy' ? '🟢 健康' : health.level === 'at_risk' ? '🟡 有风险' : '🔴 危险') : '';
      const daysInStage = o.createdAt ? Math.ceil((Date.now() - new Date(o.createdAt).getTime()) / 86400000) : null;
      return [
        o.name,
        getAccountName(o.accountId),
        displayStageLabel(o.stage),
        o.value,
        Math.round(o.value * (o.probability / 100)),
        `${o.probability}%`,
        o.expectedCloseDate || '',
        daysInStage,
        healthLabel,
        getOwnerName(getOpportunityOwnerUserId(o)) || o.owner || '',
      ];
    });
    downloadCsv('closr-pipeline', headers, rows);
  }

  /** 计算停留天数 */
  function getDaysInStage(createdAt?: string): number {
    if (!createdAt) return 0;
    return Math.ceil((Date.now() - new Date(createdAt).getTime()) / 86400000);
  }

  /** 健康度 emoji */
  function getHealthEmoji(oppId: string): string {
    const health = dealHealthMap.get(oppId);
    if (!health) return '';
    if (health.level === 'healthy') return '🟢';
    if (health.level === 'at_risk') return '🟡';
    return '🔴';
  }
  function momentumLabel(momentum: PlayMomentum): string {
    if (!en) return MOMENTUM_CONFIG[momentum].label;
    return ({
      progressing: 'Progressing',
      active: 'Active',
      slowing: 'Slowing',
      stalled: 'Stalled',
      blocked: 'Blocked',
    } satisfies Record<PlayMomentum, string>)[momentum];
  }

  // ─── Play momentum per opportunity ──────────────────────────────────
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  useEffect(() => {
    fetch("/api/strategic-play")
      .then((r) => r.json())
      .then((d) => setPlays(d.plays ?? []))
      .catch(() => setPlays([]));
  }, []);

  const oppMomentumMap = useMemo(() => {
    const map = new Map<string, PlayMomentum>();
    for (const p of plays) {
      if (!p.opportunityId) continue;
      if (p.status !== "active" && p.status !== "in_progress") continue;
      // Keep the most recent active play per opportunity
      if (!map.has(p.opportunityId)) {
        map.set(p.opportunityId, p.momentum);
      }
    }
    return map;
  }, [plays]);

  /** 每个 opportunity 的 AI 胜率 */
  const winProbMap = useMemo(() => {
    const map = new Map<string, WinProbabilityResult>();
    for (const opp of opportunities) {
      if (opp.stage === 'closed_won' || opp.stage === 'closed_lost') continue;
      const account = accounts.find((a) => a.id === opp.accountId);
      if (!account) continue;
      map.set(opp.id, calculateWinProbability({ opportunity: opp, account, plays, locale }));
    }
    return map;
  }, [opportunities, accounts, plays, locale]);

  const handleStageChange = async (opp: Opportunity, direction: 'forward' | 'backward') => {
    const currentIdx = STAGE_ORDER.indexOf(opp.stage);
    const targetIdx = direction === 'forward' ? currentIdx + 1 : currentIdx - 1;
    if (targetIdx < 0 || targetIdx >= STAGE_ORDER.length) return;
    const targetStage = STAGE_ORDER[targetIdx];

    if (direction === 'forward') {
      const account = accounts.find((a) => a.id === opp.accountId);
      const contacts = account?.contacts ?? [];

      // MEDDICC 低分准入警告 — 目标阶段 >= proposal_sent 且评分 < 30
      const advancedStages: OpportunityStage[] = ['proposal_sent', 'negotiation', 'contract_review', 'closed_won'];
      if (advancedStages.includes(targetStage) && (opp.meddicc?.overallScore ?? 0) < 30) {
        const meddiccScore = opp.meddicc?.overallScore ?? 0;
        const stageName = displayStageLabel(targetStage);
        if (!await appConfirm({ message: `⚠️ MEDDICC评分仅${meddiccScore}分，建议先完善评估。确定要推进到「${stageName}」吗？`, variant: 'warning' })) {
          return;
        }
      }

      // Stage Gate 检查（blocker 硬拦截 + warning 可确认）
      const gateResult = checkStageGate(targetStage, opp, contacts);

      if (!gateResult.canProceed) {
        // 有 blocker，显示错误提示
        toast('⛔ 无法推进到此阶段：\n\n' + gateResult.blockers.map(b => '• ' + b).join('\n'), 'error');
        return;
      }

      if (gateResult.warnings.length > 0) {
        // 有警告，让用户确认（合并 gate warnings 与 stage requirement warnings）
        const requirementWarnings = checkStageRequirements(opp, targetStage, contacts);
        const allWarnings = [...new Set([...gateResult.warnings, ...requirementWarnings])];
        setStageWarning({ oppId: opp.id, targetStage, warnings: allWarnings });
        return;
      }

      // 无 gate 警告时仍检查 stage requirements
      const warnings = checkStageRequirements(opp, targetStage, contacts);
      if (warnings.length > 0) {
        setStageWarning({ oppId: opp.id, targetStage, warnings });
        return;
      }
    }

    updateOpportunity(opp.id, {
      stage: targetStage,
      ...(targetStage === 'closed_won' ? { wonDate: new Date().toISOString() } : {}),
    });
    void emitDealStageChanged(opp.id, opp.stage, targetStage);
  };

  const confirmStageChange = () => {
    if (!stageWarning) return;
    const opp = opportunities.find((o) => o.id === stageWarning.oppId);
    updateOpportunity(stageWarning.oppId, {
      stage: stageWarning.targetStage,
      ...(stageWarning.targetStage === 'closed_won' ? { wonDate: new Date().toISOString() } : {}),
    });
    void emitDealStageChanged(stageWarning.oppId, opp?.stage ?? '', stageWarning.targetStage);
    setStageWarning(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SpotlightTour tourKey="pipeline" steps={[
        { target: "body", title: en ? "Pipeline - Opportunity Overview" : "管线 — 商机全览", content: en ? "See where every opportunity stands. Track health, amount, and play coverage, and watch opportunities that need attention." : "看清所有商机在什么阶段。追踪每个 Deal 的健康度、金额和谋局覆盖状态。关注标记「需要关注」的商机，它们可能正在流失。", position: "bottom" },
      ]} />
      {/* Header — 移动端标题简化 */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t("pipeline.title")}</h1>
        <p className="mt-0.5 text-sm text-secondary">{t("pipeline.subtitle")}</p>
        <p className="mt-1 hidden text-xs text-muted sm:block">{t("pipeline.description")}</p>
      </div>

      <RoleFocusBanner surface="pipeline" jobLevel={jobLevel} />

      {/* Scope 切换 */}
      <div className="flex gap-1 rounded-lg bg-sidebar p-1">
        {(['mine', 'team', 'all'] as const).map(s => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              effectiveScope === s ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'
            }`}
          >
            {s === 'mine' ? (en ? 'My opportunities' : '我的机会') : s === 'team' ? (en ? 'Team opportunities' : '团队机会') : (en ? 'All opportunities' : '全部机会')}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      <div className="card-elevated rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:flex sm:justify-between sm:gap-4">
            {/* 总机会数 */}
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-xs font-medium text-secondary">{t("pipeline.totalOpportunities")}</p>
                <p className="text-base font-bold text-foreground">{totalDeals}</p>
              </div>
            </div>
            {/* Pipeline 总额 */}
            <div className="flex items-center gap-2.5">
              <DollarSign className="h-4 w-4 text-positive" />
              <div>
                <p className="text-xs font-medium text-secondary">{t("pipeline.pipelineTotal")}</p>
                <p className="text-base font-bold text-foreground">{formatCurrency(totalValue)}</p>
              </div>
            </div>
            {/* 加权金额 */}
            <div className="flex items-center gap-2.5">
              <TrendingUp className="h-4 w-4 text-accent" />
              <div>
                <p className="text-xs font-medium text-secondary">{t("pipeline.weightedAmount")}</p>
                <p className="text-base font-bold text-foreground">{formatCurrency(Math.round(weightedValue))}</p>
              </div>
            </div>
            {/* 本月预计成交 */}
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-warning" />
              <div>
                <p className="text-xs font-medium text-secondary">{t("pipeline.monthlyExpectedClose")}</p>
                <p className="text-base font-bold text-foreground">{formatCurrency(monthlyCloseValue)}</p>
              </div>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:ml-4 sm:w-auto">
            {/* 看板 / 日历 切换 */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => switchPipelineView('kanban')}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${pipelineView === 'kanban' ? 'bg-accent text-white' : 'bg-card text-secondary hover:text-foreground'}`}
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">{en ? 'Board' : '看板'}</span>
              </button>
              <button
                onClick={() => switchPipelineView('calendar')}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${pipelineView === 'calendar' ? 'bg-accent text-white' : 'bg-card text-secondary hover:text-foreground'}`}
              >
                <CalendarIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{en ? 'Calendar' : '日历'}</span>
              </button>
              <button
                onClick={() => switchPipelineView('forecast')}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${pipelineView === 'forecast' ? 'bg-accent text-white' : 'bg-card text-secondary hover:text-foreground'}`}
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">{en ? 'Forecast' : '预测'}</span>
              </button>
              <button
                onClick={() => switchPipelineView('inspection')}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${pipelineView === 'inspection' ? 'bg-accent text-white' : 'bg-card text-secondary hover:text-foreground'}`}
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="hidden sm:inline">{en ? 'Inspection' : '巡检'}</span>
              </button>
              <button
                onClick={() => switchPipelineView('won')}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${pipelineView === 'won' ? 'bg-accent text-white' : 'bg-card text-secondary hover:text-foreground'}`}
              >
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">{en ? 'Won' : '已成交'}</span>
              </button>
            </div>
            {opportunities.length > 0 && (
              <button
                onClick={handleExportPipeline}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-background"
                title={en ? 'Export CSV' : '导出 CSV'}
              >
                <Download className="h-4 w-4" />
                {en ? 'Export' : '导出'}
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-hover hover:shadow-md sm:flex-none"
            >
              <Plus className="h-4 w-4" />
              {t("pipeline.newOpportunity")}
            </button>
          </div>
        </div>
      </div>

      <PipelineVisualSummary
        activeOpps={activeOpps}
        stages={kanbanStages}
        getStageLabel={(stage) => displayStageLabel(stage as OpportunityStage)}
        currency={useStore.getState().currencyCode}
        dealHealthMap={dealHealthMap}
        weightedValue={weightedValue}
        totalValue={totalValue}
        monthlyCloseValue={monthlyCloseValue}
        locale={locale}
      />

      {/* ═══ 日历视图 ═══ */}
      {pipelineView === 'calendar' && <PipelineCalendar opportunities={opportunities} getStageLabel={(stage) => displayStageLabel(stage as OpportunityStage)} currency={useStore.getState().currencyCode} />}

      {/* ═══ 预测视图 ═══ */}
      {pipelineView === 'forecast' && <ForecastPage />}

      {/* ═══ 巡检视图 ═══ */}
      {pipelineView === 'inspection' && (
        <ManagerInspectionView
          items={managerInspectionQueue}
          getStageLabel={(stage) => displayStageLabel(stage)}
          en={en}
        />
      )}

      {/* ═══ 已成交视图 ═══ */}
      {pipelineView === 'won' && (
        <div className="space-y-3">
          {wonOpps.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Trophy className="mx-auto h-8 w-8 text-muted mb-3" />
              <p className="text-sm text-muted">暂无已成交商机</p>
            </div>
          ) : (
            wonOpps.map((opp) => {
              const accountName = getAccountName(opp.accountId);
              const oppTasks = tasks.filter((t) => t.opportunityId === opp.id && t.labels?.includes('赢单交付'));
              const doneTasks = oppTasks.filter((t) => t.status === 'done').length;
              const totalTasks = oppTasks.length;
              const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
              const wonDate = opp.wonDate || opp.updatedAt;
              const renewalDate = new Date(wonDate);
              renewalDate.setFullYear(renewalDate.getFullYear() + 1);
              const renewalStr = renewalDate.toISOString().split('T')[0];
              const daysToRenewal = Math.floor((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

              return (
                <Link
                  key={opp.id}
                  href={`/pipeline/${opp.id}`}
                  className="block rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <h3 className="text-sm font-semibold text-foreground truncate">{opp.name}</h3>
                      </div>
                      <p className="mt-0.5 text-xs text-secondary">{accountName}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-right">
                        <p className="text-muted">金额</p>
                        <p className="font-mono font-bold text-foreground">{formatCurrency(opp.value)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted">赢单日期</p>
                        <p className="text-foreground">{wonDate.split('T')[0]}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted">续约日期</p>
                        <p className={`font-medium ${daysToRenewal <= 60 ? 'text-amber-600' : 'text-foreground'}`}>
                          {renewalStr}
                          {daysToRenewal <= 60 && daysToRenewal > 0 && <span className="ml-1">({daysToRenewal}天)</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                  {/* Delivery checklist progress */}
                  {totalTasks > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-secondary">交付进度</span>
                        <span className="text-foreground font-medium">{doneTasks}/{totalTasks} ({progressPct}%)</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-border">
                        <div
                          className={`h-1.5 rounded-full transition-all ${progressPct === 100 ? 'bg-emerald-500' : 'bg-accent'}`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              );
            })
          )}
          {/* Won summary */}
          {wonOpps.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between text-xs">
              <div className="flex gap-6">
                <div>
                  <p className="text-muted">已成交总额</p>
                  <p className="text-lg font-bold text-foreground">{formatCurrency(wonOpps.reduce((s, o) => s + o.value, 0))}</p>
                </div>
                <div>
                  <p className="text-muted">成交数量</p>
                  <p className="text-lg font-bold text-accent">{wonOpps.length} 笔</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ 看板视图 ═══ */}
      {pipelineView === 'kanban' && <>
      {/* 批量操作栏 */}
      {selection.count > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 mb-3">
          <span className="text-sm font-medium text-accent">{en ? 'Selected' : '已选'} {selection.count} {en ? 'items' : '项'}</span>
          <button onClick={handleExportSelected} className="text-xs text-accent hover:underline">{en ? 'Export CSV' : '导出CSV'}</button>
          <button onClick={selection.clearAll} className="ml-auto text-xs text-muted hover:text-foreground">{en ? 'Clear selection' : '取消选择'}</button>
        </div>
      )}

      {/* 桌面端看板视图 */}
      <div className="hidden sm:flex -mx-3 overflow-x-auto px-3 pb-4 sm:mx-0 sm:px-0" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
        {kanbanStages.map((stage, colIdx) => {
          const stageOpps = activeOpps.filter((o) => o.stage === stage);
          const stageValue = stageOpps.reduce((sum, o) => sum + o.value, 0);
          const stageWeighted = stageOpps.reduce((sum, o) => sum + o.value * (o.probability / 100), 0);
          const isLast = colIdx === kanbanStages.length - 1;
          return (
            <div key={stage} className={`min-w-[260px] flex-1 px-2 first:pl-0 last:pr-0 flex flex-col${!isLast ? ' border-r border-border' : ''}`}>
              {/* Column Header */}
              <div className="mb-3 rounded-lg bg-background px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{displayStageLabel(stage)}</span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-border px-1.5 text-xs font-medium text-secondary">
                    {stageOpps.length}
                  </span>
                </div>
                <p className="mt-1 text-[14px] font-medium text-secondary">{formatCurrency(stageValue)}</p>
                <p className="text-[13px] text-muted">{en ? 'Weighted' : '加权'} ${Math.round(stageWeighted).toLocaleString()}</p>
              </div>

              {/* Cards — scrollable */}
              <div className="space-y-3 flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                {stageOpps.map((opp) => {
                  const daysRemaining = opp.expectedCloseDate
                    ? daysBetween(new Date().toISOString(), opp.expectedCloseDate)
                    : null;
                  const stageIdx = STAGE_ORDER.indexOf(opp.stage);
                  const accountContacts = accounts.find((a) => a.id === opp.accountId)?.contacts ?? [];
                  const score = computeMeddiccScore(opp.meddicc, accountContacts);
                  return (
                    <div
                      key={opp.id}
                      className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow duration-150 hover:shadow-md"
                      onMouseEnter={() => prefetchOpportunity(opp.id)}
                      onFocus={() => prefetchOpportunity(opp.id)}
                      onClick={() => navigateToOpportunity(opp.id)}
                    >
                      <div className="space-y-2">
                        {/* Checkbox */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selection.isSelected(opp.id)}
                            onChange={() => selection.toggle(opp.id)}
                            className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                          />
                        </div>
                        {/* Line 1: Customer name */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[14px] font-medium text-secondary">
                            {getAccountName(opp.accountId)}
                            {dealHealthMap.get(opp.id) && <DealHealthBadge health={dealHealthMap.get(opp.id)!} size="sm" />}
                          </div>
                          {getOwnerName(getOpportunityOwnerUserId(opp)) && (
                            <span className="flex items-center gap-1 text-[13px] text-muted">
                              <User className="h-3 w-3" />
                              {getOwnerName(getOpportunityOwnerUserId(opp))}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold leading-snug text-foreground">{opp.name}</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(opp.value, opp.currency as CurrencyCode)}</p>
                        {/* MEDDICC + AI 胜率 */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-secondary">MEDDICC</span>
                              <span className="font-semibold text-foreground">{score}%</span>
                            </div>
                            <div className="mt-1 h-1 rounded-full bg-background">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${score}%`,
                                  backgroundColor: score >= 70 ? 'var(--positive)' : score >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)',
                                }}
                              />
                            </div>
                          </div>
                          {winProbMap.has(opp.id) && (
                            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                              <WinProbBadge result={winProbMap.get(opp.id)!} />
                              <span className="text-[11px] text-muted">{en ? 'Win rate' : '胜率'}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-xs text-secondary">
                          <span>{opp.expectedCloseDate ? `${t('pipeline.targetDate')} ${opp.expectedCloseDate}` : t('pipeline.noTargetDate')}</span>
                          {daysRemaining !== null && (
                            <span className={`font-medium ${daysRemaining < 0 ? 'text-danger' : daysRemaining <= 14 ? 'text-warning' : 'text-secondary'}`}>
                              {daysRemaining < 0 ? t('pipeline.overdueDays').replace('{0}', String(Math.abs(daysRemaining))) : t('pipeline.remainingDays').replace('{0}', String(daysRemaining))}
                            </span>
                          )}
                        </div>
                        {/* Days in stage + Health + Momentum indicator */}
                        <div className="flex items-center justify-between text-xs text-muted">
                          <div className="flex items-center gap-2">
                            <span>{en ? `${getDaysInStage(opp.createdAt)}d in stage` : `停留 ${getDaysInStage(opp.createdAt)} 天`}</span>
                            {oppMomentumMap.has(opp.id) ? (
                              <span className={`inline-flex items-center gap-1 text-[13px] ${MOMENTUM_CONFIG[oppMomentumMap.get(opp.id)!].color}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${MOMENTUM_CONFIG[oppMomentumMap.get(opp.id)!].dotColor}`} />
                                {momentumLabel(oppMomentumMap.get(opp.id)!)}
                              </span>
                            ) : (
                              <span className="text-[12px] text-[var(--chrome-ink-dim)]">{en ? 'No play' : '无谋局'}</span>
                            )}
                          </div>
                          {getHealthEmoji(opp.id) && (
                            <span title={dealHealthMap.get(opp.id)?.reasons.join(', ')}>
                              {getHealthEmoji(opp.id)} {dealHealthMap.get(opp.id)?.level === 'healthy' ? (en ? 'Healthy' : '健康') : dealHealthMap.get(opp.id)?.level === 'at_risk' ? (en ? 'At risk' : '有风险') : (en ? 'Critical' : '危险')}
                            </span>
                          )}
                        </div>
                        {/* Stage buttons */}
                        <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                          {stageIdx > 0 && (
                            <button
                              onClick={() => handleStageChange(opp, 'backward')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-secondary hover:bg-background hover:text-foreground"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {stageIdx < STAGE_ORDER.length - 2 && (
                            <button
                              onClick={() => handleStageChange(opp, 'forward')}
                              className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-border text-xs font-medium text-secondary hover:border-accent hover:text-accent"
                            >
                              {t("pipeline.advance")} <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {stageOpps.length === 0 && (
                  <div className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-border p-6 text-center">
                    <p className="text-[15px] text-secondary">{t("pipeline.dragToStage")}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 移动端卡片列表视图 — 按阶段分组显示 */}
      <div className="space-y-4 sm:hidden">
        {kanbanStages.map((stage) => {
          const stageOpps = activeOpps.filter((o) => o.stage === stage);
          if (stageOpps.length === 0) return null;
          const stageValue = stageOpps.reduce((sum, o) => sum + o.value, 0);
          const stageWeightedMobile = stageOpps.reduce((sum, o) => sum + o.value * (o.probability / 100), 0);
          return (
            <div key={stage}>
              {/* 阶段标题 */}
              <div className="mb-2 flex items-center justify-between rounded-lg bg-background px-3 py-2">
                <span className="text-sm font-semibold text-foreground">{displayStageLabel(stage)}</span>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-xs text-secondary">{formatCurrency(stageValue)}</span>
                    <p className="text-[12px] text-muted">{en ? 'Weighted' : '加权'} ${Math.round(stageWeightedMobile).toLocaleString()}</p>
                  </div>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-border px-1.5 text-xs font-medium text-secondary">
                    {stageOpps.length}
                  </span>
                </div>
              </div>
              {/* 卡片列表 */}
              <div className="space-y-2">
                {stageOpps.map((opp) => {
                  const daysRemaining = opp.expectedCloseDate
                    ? daysBetween(new Date().toISOString(), opp.expectedCloseDate)
                    : null;
                  const stageIdx = STAGE_ORDER.indexOf(opp.stage);
                  const accountContacts = accounts.find((a) => a.id === opp.accountId)?.contacts ?? [];
                  const score = computeMeddiccScore(opp.meddicc, accountContacts);
                  return (
                    <div
                      key={opp.id}
                      className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-stripe"
                      onMouseEnter={() => prefetchOpportunity(opp.id)}
                      onFocus={() => prefetchOpportunity(opp.id)}
                      onClick={() => navigateToOpportunity(opp.id)}
                    >
                      {/* Checkbox */}
                      <div className="mb-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selection.isSelected(opp.id)}
                          onChange={() => selection.toggle(opp.id)}
                          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                        />
                      </div>
                      {/* 客户名 + 负责人 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-secondary truncate">
                          {getAccountName(opp.accountId)}
                          {dealHealthMap.get(opp.id) && <DealHealthBadge health={dealHealthMap.get(opp.id)!} size="sm" />}
                        </div>
                        {getOwnerName(getOpportunityOwnerUserId(opp)) && (
                          <span className="flex items-center gap-1 text-[13px] text-muted flex-shrink-0 ml-2">
                            <User className="h-3 w-3" />
                            {getOwnerName(getOpportunityOwnerUserId(opp))}
                          </span>
                        )}
                      </div>
                      {/* 机会名 + 金额 */}
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground truncate">{opp.name}</p>
                        <p className="text-base font-bold text-foreground flex-shrink-0 ml-2">{formatCurrency(opp.value, opp.currency as CurrencyCode)}</p>
                      </div>
                      {/* Next Action */}
                      <div className="mt-2">
                        <NextActionBadge task={nextTaskMap.get(opp.id) ?? null} />
                      </div>
                      {/* Days in stage + Health + Momentum */}
                      <div className="mt-1 flex items-center gap-3 text-[13px] text-muted">
                        <span>{en ? `${getDaysInStage(opp.createdAt)}d in stage` : `停留 ${getDaysInStage(opp.createdAt)} 天`}</span>
                        {opp.expectedCloseDate && <span>{en ? 'Close' : '预关'} {opp.expectedCloseDate}</span>}
                        {getHealthEmoji(opp.id) && <span>{getHealthEmoji(opp.id)}</span>}
                        {oppMomentumMap.has(opp.id) ? (
                          <span className={`inline-flex items-center gap-1 ${MOMENTUM_CONFIG[oppMomentumMap.get(opp.id)!].color}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${MOMENTUM_CONFIG[oppMomentumMap.get(opp.id)!].dotColor}`} />
                            {momentumLabel(oppMomentumMap.get(opp.id)!)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[var(--chrome-ink-dim)]">{en ? 'No play' : '无谋局'}</span>
                        )}
                      </div>
                      {/* MEDDICC + 胜率 + 倒计时 + 操作按钮 */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium ${score >= 70 ? 'text-positive' : score >= 40 ? 'text-warning' : 'text-danger'}`}>
                            M{score}
                          </span>
                          {winProbMap.has(opp.id) && (
                            <span className="text-xs font-medium" style={{ color: getWinProbabilityColor(winProbMap.get(opp.id)!.score) }}>
                              {en ? 'Win ' : '胜'}{winProbMap.get(opp.id)!.score}%
                            </span>
                          )}
                          {daysRemaining !== null && (
                            <span className={`text-xs ${daysRemaining < 0 ? 'text-danger' : daysRemaining <= 14 ? 'text-warning' : 'text-secondary'}`}>
                              {daysRemaining < 0 ? t('pipeline.overdueDays').replace('{0}', String(Math.abs(daysRemaining))) : t('pipeline.remainingDays').replace('{0}', String(daysRemaining))}
                            </span>
                          )}
                        </div>
                        {/* 阶段切换按钮 */}
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {stageIdx > 0 && (
                            <button
                              onClick={() => handleStageChange(opp, 'backward')}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-secondary"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {stageIdx < STAGE_ORDER.length - 2 && (
                            <button
                              onClick={() => handleStageChange(opp, 'forward')}
                              className="flex h-7 items-center justify-center gap-0.5 rounded-lg border border-border px-2 text-xs font-medium text-secondary"
                            >
                              {t("pipeline.advance")} <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {activeOpps.length === 0 && (
          <div className="flex min-h-[120px] items-center justify-center rounded-xl border-2 border-dashed border-border p-6 text-center">
            <p className="text-sm text-secondary">{t("pipeline.dragToStage")}</p>
          </div>
        )}
      </div>

      {/* Closed deals summary */}
      {(wonOpps.length > 0 || lostOpps.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card-elevated rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-positive" />
              <h3 className="text-sm font-semibold text-positive">{t('pipeline.closedWon')} ({wonOpps.length})</h3>
            </div>
            <p className="mt-2 text-xl font-bold text-positive">
              ${wonOpps.reduce((s, o) => s + o.value, 0).toLocaleString()}
            </p>
            <div className="mt-3 space-y-2">
              {wonOpps.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:bg-stripe" onMouseEnter={() => prefetchOpportunity(o.id)} onClick={() => navigateToOpportunity(o.id)}>
                  <span className="text-foreground">{o.name}</span>
                  <span className="font-medium text-foreground">{formatCurrency(o.value, o.currency as CurrencyCode)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card-elevated rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-danger" />
              <h3 className="text-sm font-semibold text-danger">{t('pipeline.closedLost')} ({lostOpps.length})</h3>
            </div>
            <p className="mt-2 text-xl font-bold text-danger">
              ${lostOpps.reduce((s, o) => s + o.value, 0).toLocaleString()}
            </p>
            <div className="mt-3 space-y-2">
              {lostOpps.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:bg-stripe" onMouseEnter={() => prefetchOpportunity(o.id)} onClick={() => navigateToOpportunity(o.id)}>
                  <span className="text-foreground">{o.name}</span>
                  <span className="text-secondary">{o.lostReason || t('pipeline.lostReasonLabel')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      </>}

      {/* Empty State */}
      {opportunities.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-20">
          <div className="mb-4 text-4xl sm:text-5xl">🎯</div>
          <p className="text-base font-semibold text-foreground">{t("pipeline.noOpportunities")}</p>
          <p className="mt-2 max-w-[320px] text-sm leading-relaxed text-secondary text-center">
            {t("pipeline.noOpportunitiesHint")}
          </p>
          <Link href="/accounts" className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-hover">
            {t("pipeline.goToAccounts")}
          </Link>
        </div>
      )}

      {/* Pipeline 汇总条 */}
      {activeOpps.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex gap-6">
            <div>
              <p className="text-[12px] text-muted">{en ? 'Pipeline Total' : 'Pipeline 总额'}</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(totalValue)}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">{en ? 'Weighted Total' : '加权总额'}</p>
              <p className="text-lg font-bold text-accent">{formatCurrency(Math.round(weightedValue))}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">{en ? 'Active Deals' : '活跃 Deal'}</p>
              <p className="text-lg font-bold text-foreground">{activeOpps.length} {en ? 'deals' : '个'}</p>
            </div>
          </div>
          <button onClick={exportPipelineCSV} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background">
            <Download className="h-3.5 w-3.5" />
            {en ? 'Export CSV' : '导出 CSV'}
          </button>
        </div>
      )}

      {showAddModal && <AddOpportunityModal onClose={() => setShowAddModal(false)} />}
      {stageWarning && (
        <StageWarningModal
          warnings={stageWarning.warnings}
          onConfirm={confirmStageChange}
          onCancel={() => setStageWarning(null)}
        />
      )}
    </div>
  );
}
