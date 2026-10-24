'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Shield, Target, AlertTriangle, Eye, ChevronDown, ChevronRight, Crown, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import type { Account, Contact, StrategicPlay, PlayAssumption } from '@/lib/babel-engine/types';

// ─── Role Labels ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  decision_maker: '最终决策者',
  economic_buyer: '预算控制者',
  champion: '内部推动者',
  technical_evaluator: '技术评估',
  influencer: '影响者',
  blocker: '阻碍者',
  end_user: '最终用户',
  procurement: '采购',
  legal: '法务',
  project_manager: '项目经理',
  executive_sponsor: '高管支持者',
  gate_keeper: '守门人',
  coach: '教练',
  committee_member: '评审委员会',
  it_admin: 'IT 管理员'
};
const ASSUMPTION_STATUS_CONFIG: Record<string, {
  icon: string;
  color: string;
  label: string;
}> = {
  verified: {
    icon: '✓',
    color: 'text-positive',
    label: '已验证'
  },
  invalidated: {
    icon: '✗',
    color: 'text-danger',
    label: '已否定'
  },
  pending: {
    icon: '?',
    color: 'text-warning',
    label: '待验证'
  }
};

// ─── Analysis Tab (legacy — no longer rendered, kept for reference) ──

export function AnalysisTab({
  account,
  contacts
}: {
  account: Account;
  contacts: Contact[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  return <div className="space-y-6">
      <DecisionAndStakeholderMap contacts={contacts} />
      <CoverageAndActions contacts={contacts} accountId={account.id} />
      <AssumptionsLog accountId={account.id} />
    </div>;
}

// ─── Shared analysis hooks ──────────────────────────────────────────

function useStakeholderAnalysis(contacts: Contact[]) {
  const decisionMakers = useMemo(() => contacts.filter(c => c.role === 'decision_maker' || c.role === 'economic_buyer' || c.role === 'executive_sponsor'), [contacts]);
  const budgetControllers = useMemo(() => contacts.filter(c => c.role === 'economic_buyer' || c.role === 'procurement'), [contacts]);
  const approvalChain = useMemo(() => contacts.filter(c => c.role === 'gate_keeper' || c.role === 'legal' || c.role === 'committee_member'), [contacts]);
  const advocates = useMemo(() => contacts.filter(c => c.role === 'champion' || c.role === 'coach' || c.role === 'executive_sponsor'), [contacts]);
  const resistors = useMemo(() => contacts.filter(c => c.role === 'blocker'), [contacts]);
  const neutrals = useMemo(() => {
    const advocateIds = new Set(advocates.map(a => a.id));
    const resistorIds = new Set(resistors.map(r => r.id));
    const decisionIds = new Set(decisionMakers.map(d => d.id));
    return contacts.filter(c => !advocateIds.has(c.id) && !resistorIds.has(c.id) && !decisionIds.has(c.id));
  }, [contacts, advocates, resistors, decisionMakers]);
  const [coverageReferenceTime] = useState(() => Date.now());
  const coverageAssessment = useMemo(() => {
    const covered: Contact[] = [];
    const weak: Contact[] = [];
    const notCovered: Contact[] = [];
    for (const c of contacts) {
      if (c.lastContactedAt) {
        const daysSince = Math.floor((coverageReferenceTime - new Date(c.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 30) covered.push(c);else if (daysSince <= 90) weak.push(c);else notCovered.push(c);
      } else {
        notCovered.push(c);
      }
    }
    const singleThreadRisk = covered.length <= 1 && contacts.length > 1;
    return {
      covered,
      weak,
      notCovered,
      singleThreadRisk
    };
  }, [contacts, coverageReferenceTime]);
  return {
    decisionMakers,
    budgetControllers,
    approvalChain,
    advocates,
    resistors,
    neutrals,
    coverageAssessment
  };
}

// ─── Exported: Decision Structure + Stakeholder Map (for Contacts tab) ─

export function DecisionAndStakeholderMap({
  contacts
}: {
  contacts: Contact[];
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['decision', 'map']));
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);else next.add(key);
      return next;
    });
  };
  const {
    decisionMakers,
    budgetControllers,
    approvalChain,
    advocates,
    resistors,
    neutrals
  } = useStakeholderAnalysis(contacts);
  if (contacts.length === 0) return null;
  return <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Users className="h-4 w-4 text-accent" />{tx("利益相关方分析")}</h3>

      <SectionCard title={tx("决策结构")} icon={Crown} sectionKey="decision" expanded={expandedSections.has('decision')} onToggle={toggleSection}>
        <div className="space-y-3">
          <ContactGroup label={tx("决策者")} contacts={decisionMakers} emptyText={tx("未识别决策者")} />
          <ContactGroup label={tx("预算控制")} contacts={budgetControllers} emptyText={tx("未识别预算控制者")} />
          {approvalChain.length > 0 && <ContactGroup label={tx("审批流程")} contacts={approvalChain} />}
        </div>
      </SectionCard>

      <SectionCard title={tx("利益相关方地图")} icon={Target} sectionKey="map" expanded={expandedSections.has('map')} onToggle={toggleSection}>
        <div className="space-y-3">
          <ContactGroup label={tx("支持者")} contacts={advocates} emptyText={tx("暂无内部支持者")} dotColor="bg-positive" />
          <ContactGroup label={tx("中立方")} contacts={neutrals} emptyText="—" dotColor="bg-secondary" />
          <ContactGroup label={tx("阻碍者")} contacts={resistors} emptyText={tx("暂无已识别的阻碍者")} dotColor="bg-danger" />
        </div>
      </SectionCard>
    </div>;
}

// ─── Exported: Coverage + Actions with buttons (for Overview tab) ───

export function CoverageAndActions({
  contacts,
  accountId,
  onSwitchTab
}: {
  contacts: Contact[];
  accountId: string;
  onSwitchTab?: (tab: string, prefill?: {
    goalType?: string;
    goalDescription?: string;
  }) => void;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['coverage', 'actions']));
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);else next.add(key);
      return next;
    });
  };
  const {
    decisionMakers,
    budgetControllers,
    advocates,
    resistors,
    coverageAssessment
  } = useStakeholderAnalysis(contacts);
  const {
    addTask
  } = useStore();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const showMsg = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 2000);
  };
  const contactLabel = useCallback((contact: Contact) => contact.title ? `${contact.name}（${contact.title}）` : contact.name, []);
  const listContacts = useCallback((items: Contact[], limit = 3) => {
    const names = items.slice(0, limit).map(contactLabel).join('、');
    const remaining = items.length > limit ? ` 等 ${items.length} 位` : '';
    return names ? `${names}${remaining}` : '待确认联系人';
  }, [contactLabel]);
  const bestBudgetVerifier = decisionMakers[0] ?? advocates[0] ?? contacts[0];
  const recommendations = useMemo(() => {
    type Rec = {
      text: string;
      type: string;
    };
    const actions: Rec[] = [];
    if (decisionMakers.length === 0) {
      actions.push({
        text: '尚未识别决策者，优先确认最终决策人和审批流程',
        type: 'no_decision_maker'
      });
    }
    if (advocates.length === 0) {
      actions.push({
        text: '缺少内部支持者，需要发展内部推动者或内线教练',
        type: 'no_champion'
      });
    }
    if (resistors.length > 0) {
      actions.push({
        text: `阻碍信号来自 ${listContacts(resistors)}；先逐个确认反对点、影响范围和能否被条件化解决`,
        type: 'has_blockers'
      });
    }
    if (coverageAssessment.singleThreadRisk) {
      actions.push({
        text: '单点依赖风险：仅一位联系人有近期互动，需扩展关系覆盖',
        type: 'single_thread'
      });
    }
    if (coverageAssessment.notCovered.length > 0) {
      actions.push({
        text: `无近期互动：${listContacts(coverageAssessment.notCovered)}；需要确认这些人是否仍参与评估或采购`,
        type: 'not_covered'
      });
    }
    if (budgetControllers.length === 0) {
      actions.push({
        text: bestBudgetVerifier ? `预算控制者待确认：先向 ${contactLabel(bestBudgetVerifier)} 核实 CFO/采购/Finance 谁拥有审批权` : '预算控制者待确认：先补充一位客户联系人，再核实 CFO/采购/Finance 谁拥有审批权',
        type: 'no_budget'
      });
    }
    if (actions.length === 0) {
      actions.push({
        text: '利益相关方覆盖良好，继续保持定期互动',
        type: 'ok'
      });
    }
    return actions;
  }, [decisionMakers, advocates, resistors, coverageAssessment, budgetControllers, bestBudgetVerifier, contactLabel, listContacts]);
  const handleAction = (rec: {
    type: string;
  }) => {
    switch (rec.type) {
      case 'no_decision_maker':
        addTask({
          accountId,
          title: '确认决策人',
          description: '尚未识别决策者，优先确认最终决策人和审批流程',
          status: 'todo',
          priority: 'high',
          labels: ['利益相关方'],
          source: 'manual' as const,
          aiGenerated: false
        });
        showMsg('✅ 已创建任务：确认决策人');
        break;
      case 'no_champion':
        onSwitchTab?.('plays', {
          goalType: 'reach_key_person',
          goalDescription: '发展内部推动者，建立支持者关系'
        });
        break;
      case 'has_blockers':
        onSwitchTab?.('plays', {
          goalType: 'remove_blocker',
          goalDescription: '消除关键阻碍者的反对意见'
        });
        break;
      case 'single_thread':
        addTask({
          accountId,
          title: '扩展关系覆盖',
          description: '单点依赖风险：仅一位联系人有近期互动，需要扩展关系网络',
          status: 'todo',
          priority: 'high',
          labels: ['利益相关方'],
          source: 'manual' as const,
          aiGenerated: false
        });
        showMsg('✅ 已创建任务：扩展关系覆盖');
        break;
      case 'not_covered':
        {
          const count = coverageAssessment.notCovered.length;
          for (const c of coverageAssessment.notCovered) {
            addTask({
              accountId,
              title: `跟进联系人: ${c.name}`,
              description: `该联系人无近期互动记录，需要激活或确认其是否仍相关`,
              status: 'todo',
              priority: 'medium',
              labels: ['跟进'],
              source: 'manual' as const,
              aiGenerated: false
            });
          }
          showMsg(`✅ 已批量创建 ${count} 个跟进任务`);
          break;
        }
      case 'no_budget':
        addTask({
          accountId,
          title: '确认预算审批人',
          description: bestBudgetVerifier ? `预算控制者待确认：先向 ${bestBudgetVerifier.name}${bestBudgetVerifier.title ? `（${bestBudgetVerifier.title}）` : ''} 核实 CFO/采购/Finance 谁拥有审批权。` : '预算控制者待确认：先补充一位客户联系人，再核实 CFO/采购/Finance 谁拥有审批权。',
          status: 'todo',
          priority: 'high',
          labels: ['利益相关方'],
          source: 'manual' as const,
          aiGenerated: false
        });
        showMsg('✅ 已创建任务：确认预算审批人');
        break;
    }
  };
  const ACTION_BUTTON_LABELS: Record<string, string> = {
    no_decision_maker: '创建任务：确认决策人',
    no_champion: '创建谋局：发展内部推动者',
    has_blockers: '创建谋局：消除阻碍',
    single_thread: '创建任务：扩展关系覆盖',
    not_covered: '批量创建跟进任务',
    no_budget: '创建任务：确认预算审批人'
  };
  if (contacts.length === 0) return null;
  return <div className="space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Shield className="h-4 w-4 text-accent" />{tx("覆盖与行动建议")}</h3>

      {actionMsg && <div className="rounded-lg bg-positive/10 border border-positive/20 px-4 py-2 text-sm font-medium text-positive animate-in fade-in">
          {actionMsg}
        </div>}

      <SectionCard title={tx("覆盖评估")} icon={Shield} sectionKey="coverage" expanded={expandedSections.has('coverage')} onToggle={toggleSection}>
        <div className="space-y-3">
          {coverageAssessment.singleThreadRisk && <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <span className="text-xs font-medium text-warning">{tx("单点依赖风险")}</span>
            </div>}
          <CoverageGroup label={tx("良好覆盖")} sublabel={tx("30 天内有互动")} contacts={coverageAssessment.covered} barColor="bg-positive" total={contacts.length} />
          <CoverageGroup label={tx("覆盖较弱")} sublabel={tx("30-90 天内")} contacts={coverageAssessment.weak} barColor="bg-warning" total={contacts.length} />
          <CoverageGroup label={tx("未覆盖")} sublabel={tx("90+ 天或无记录")} contacts={coverageAssessment.notCovered} barColor="bg-danger" total={contacts.length} />
        </div>
      </SectionCard>

      <SectionCard title={tx("建议行动")} icon={AlertTriangle} sectionKey="actions" expanded={expandedSections.has('actions')} onToggle={toggleSection}>
        <ul className="space-y-2">
          {recommendations.map((rec, i) => <li key={i} className="flex items-start gap-2 text-xs text-foreground">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span className="flex-1">{rec.text}</span>
              {ACTION_BUTTON_LABELS[rec.type] && <button onClick={() => handleAction(rec)} className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-accent-hover shadow-sm transition-colors">
                  {ACTION_BUTTON_LABELS[rec.type]}
                </button>}
            </li>)}
        </ul>
      </SectionCard>
    </div>;
}

// ─── Section B: Assumptions Log ──────────────────────────────────────

function AssumptionsLog({
  accountId
}: {
  accountId: string;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [plays, setPlays] = useState<StrategicPlay[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/strategic-play?accountId=${accountId}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          plays: StrategicPlay[];
        };
        if (!cancelled) setPlays(data.plays ?? []);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  // Aggregate assumptions across all plays
  const aggregated = useMemo(() => {
    const groups: {
      playId: string;
      playName: string;
      assumptions: PlayAssumption[];
    }[] = [];
    for (const play of plays) {
      if (play.assumptions && play.assumptions.length > 0) {
        groups.push({
          playId: play.id,
          playName: play.goalDescription,
          assumptions: play.assumptions
        });
      }
    }
    return groups;
  }, [plays]);
  const totalAssumptions = aggregated.reduce((sum, g) => sum + g.assumptions.length, 0);
  const verifiedCount = aggregated.reduce((sum, g) => sum + g.assumptions.filter(a => a.status === 'verified').length, 0);
  const invalidatedCount = aggregated.reduce((sum, g) => sum + g.assumptions.filter(a => a.status === 'invalidated').length, 0);
  const pendingCount = totalAssumptions - verifiedCount - invalidatedCount;
  return <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4 text-accent" />{tx("关键假设总览")}</h3>
        {totalAssumptions > 0 && <div className="flex items-center gap-3 text-[13px]">
            <span className="text-positive">{verifiedCount}{tx("已验证")}</span>
            <span className="text-warning">{pendingCount}{tx("待验证")}</span>
            <span className="text-danger">{invalidatedCount}{tx("已否定")}</span>
          </div>}
      </div>

      {loading && <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>}

      {!loading && aggregated.length === 0 && <div className="rounded-xl border border-border bg-card p-6 text-center">
          <Eye className="mx-auto h-6 w-6 text-muted mb-2" />
          <p className="text-xs text-muted">{tx("暂无假设记录。创建谋局计划时可添加关键假设。")}</p>
        </div>}

      {!loading && aggregated.length > 0 && <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {aggregated.map(group => <div key={group.playId} className="px-4 py-3">
              <p className="text-[13px] font-medium text-secondary mb-2">{tx("来自:")}{group.playName}
              </p>
              <div className="space-y-1.5">
                {group.assumptions.map(a => {
            const cfg = ASSUMPTION_STATUS_CONFIG[a.status] ?? ASSUMPTION_STATUS_CONFIG.pending;
            return <div key={a.id} className="flex items-start gap-2">
                      <span className={`mt-0.5 text-xs font-bold ${cfg.color}`}>{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-foreground">{a.text}</span>
                        <span className={`ml-2 text-[12px] ${cfg.color}`}>— {cfg.label}</span>
                        {a.evidence && <span className="text-[12px] text-muted ml-1">({a.evidence})</span>}
                        {a.status === 'invalidated' && a.impact && <p className="mt-0.5 text-[12px] text-danger/80">{tx("影响:")}{a.impact}</p>}
                      </div>
                    </div>;
          })}
              </div>
            </div>)}
        </div>}
    </div>;
}

// ─── Shared Components ───────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  sectionKey,
  expanded,
  onToggle,
  children
}: {
  title: string;
  icon: typeof Users;
  sectionKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  return <div className="rounded-xl border border-border bg-card">
      <button onClick={() => onToggle(sectionKey)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold text-secondary uppercase tracking-wider">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>;
}
function ContactGroup({
  label,
  contacts,
  emptyText,
  dotColor
}: {
  label: string;
  contacts: Contact[];
  emptyText?: string;
  dotColor?: string;
}) {
  return <div>
      <p className="text-[12px] font-semibold text-muted uppercase tracking-wide mb-1">{label}</p>
      {contacts.length === 0 ? <p className="text-xs text-muted italic">{emptyText ?? '—'}</p> : <div className="space-y-1">
          {contacts.map(c => <div key={c.id} className="flex items-center gap-2 text-xs">
              {dotColor && <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />}
              <span className="font-medium text-foreground">{c.name}</span>
              {c.title && <span className="text-muted">{c.title}</span>}
              {c.role && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[12px] font-medium text-accent">
                  {ROLE_LABELS[c.role] ?? c.role}
                </span>}
            </div>)}
        </div>}
    </div>;
}
function CoverageGroup({
  label,
  sublabel,
  contacts,
  barColor,
  total
}: {
  label: string;
  sublabel: string;
  contacts: Contact[];
  barColor: string;
  total: number;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const pct = total > 0 ? Math.round(contacts.length / total * 100) : 0;
  return <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="text-[12px] text-muted ml-1.5">({sublabel})</span>
        </div>
        <span className="text-xs text-secondary">{contacts.length}{tx("人 (")}{pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-border/50 mb-1.5">
        <div className={`h-1.5 rounded-full ${barColor} transition-all`} style={{
        width: `${pct}%`
      }} />
      </div>
      {contacts.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {contacts.slice(0, 6).map(c => <span key={c.id} className="text-[13px] text-muted">{c.name}</span>)}
          {contacts.length > 6 && <span className="text-[13px] text-muted">+{contacts.length - 6}{tx("更多")}</span>}
        </div>}
    </div>;
}