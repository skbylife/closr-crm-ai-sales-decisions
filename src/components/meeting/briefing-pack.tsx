'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import {
  Users,
  Shield,
  AlertTriangle,
  Swords,
  MessageSquare,
  FileText,
  ChevronDown,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  Target,
  Ban,
  Plus,
} from 'lucide-react';
import type {
  Opportunity,
  Contact,
  MeetingType,
  MeetingPrepInput,
} from '@/lib/babel-engine/types';
import { MEETING_TYPE_LABELS } from '@/lib/babel-engine/types';

// ─── Local types (not added to types.ts) ────────────────────────────

interface AttendeeProfile {
  name: string;
  decisionStyle: string;
  riskAppetite: string;
  communicationPreference: string;
  landmines: string;
  keyInsight: string;
}

interface NegotiationStrategy {
  overallApproach: string;
  concessionPlan: string[];
  leveragePoints: string[];
  redLines: string[];
}

interface RiskAlert {
  type: 'sentiment_decline' | 'meddicc_gap' | 'commitment_overdue' | 'competitive_threat' | 'other';
  severity: 'high' | 'medium' | 'low';
  description: string;
  mitigation: string;
}

interface BriefingPackResult {
  meetingSummary: { title: string; date: string; type: string; ourTeam: string };
  winProbability: number;
  winProbabilityReasoning: string;
  contactAnalysis: { name: string; title?: string; role?: string; attitudePrediction: string; communicationTips: string[]; warnings: string[] }[];
  agendaPrep: { topic: string; keyInfo: string; recommendedApproach: string; expectedReaction: string; counterStrategy: string }[];
  talkingPoints: { topic: string; angle: string }[];
  suggestedScripts: { opening: string; keyTransitions: string[]; closing: string };
  questionsToAsk: { question: string; priority: 'high' | 'medium' | 'low' }[];
  topicsToAvoid: string[];
  actionItems: { phase: 'before' | 'during' | 'after'; action: string }[];
  suggestedMaterials: string[];
  recentDynamics: string;
  attendeeProfiles?: AttendeeProfile[];
  negotiationStrategy?: NegotiationStrategy;
  riskAlerts?: RiskAlert[];
}

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ icon, title, badge, children, defaultOpen = true }: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground">
        {icon}
        {title}
        {badge}
        <ChevronDown className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

// ─── Severity Badge ─────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const cls = severity === 'high' ? 'bg-danger/10 text-danger' : severity === 'medium' ? 'bg-warning/10 text-warning' : 'bg-muted/10 text-muted';
  const label = severity === 'high' ? '高' : severity === 'medium' ? '中' : '低';
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

const RISK_TYPE_LABELS: Record<string, string> = {
  sentiment_decline: '情绪下降',
  meddicc_gap: 'MEDDICC缺口',
  commitment_overdue: '承诺逾期',
  competitive_threat: '竞争威胁',
  other: '其他',
};

// ─── Main Component ─────────────────────────────────────────────────

export function BriefingPack({ opp, accountId, contacts }: { opp: Opportunity; accountId: string; contacts: Contact[] }) {
  const { locale } = useLocale();
  const addMeetingPrep = useStore((s) => s.addMeetingPrep);
  const addTask = useStore((s) => s.addTask);
  const getMeetingPreps = useStore((s) => s.getMeetingPreps);
  const emailDecodes = useStore((s) => s.emailDecodes);
  const tasks = useStore((s) => s.tasks);
  const intelItems = useStore((s) => s.intelItems);
  const accounts = useStore((s) => s.accounts);

  const account = accounts.find((a) => a.id === accountId);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<BriefingPackResult | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [tasksCreated, setTasksCreated] = useState(false);

  // Form state
  const [meetingType, setMeetingType] = useState<MeetingType>('discovery');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [objective, setObjective] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [agenda, setAgenda] = useState('');
  const [ourTeam, setOurTeam] = useState('');
  const [specialConcerns, setSpecialConcerns] = useState('');

  // Derived data
  const recentDecodes = useMemo(
    () => emailDecodes
      .filter((d) => d.accountId === accountId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3),
    [emailDecodes, accountId],
  );

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.accountId === accountId && t.status !== 'done'),
    [tasks, accountId],
  );

  const preps = getMeetingPreps(accountId);

  // Compute MEDDICC weaknesses
  const meddiccWeaknesses = useMemo(() => {
    const m = opp.meddicc;
    if (!m) return [];
    const weak: string[] = [];
    if (m.metrics?.status === 'unconfirmed') weak.push('Metrics（量化指标）尚未确认');
    if (m.economicBuyer?.status === 'unknown') weak.push('Economic Buyer（决策者）未识别');
    if (!m.decisionCriteria?.length) weak.push('Decision Criteria（决策标准）为空');
    if (!m.decisionProcess?.length) weak.push('Decision Process（决策流程）未明确');
    if (!m.identifiedPain?.length) weak.push('Identified Pain（关键痛点）未记录');
    if (m.champion?.strength != null && m.champion.strength <= 2) weak.push('Champion（内部支持者）力量不足');
    if (!m.competition?.length) weak.push('Competition（竞争情况）未分析');
    return weak;
  }, [opp.meddicc]);

  const handleGenerate = async () => {
    if (!account) return;
    setGenerating(true);
    try {
      const selectedContactObjs = contacts.filter((c) => selectedContacts.includes(c.id));
      const input: MeetingPrepInput = {
        meetingTitle: meetingTitle || `${MEETING_TYPE_LABELS[meetingType]} - ${opp.name}`,
        meetingDate: meetingDate || new Date().toISOString().slice(0, 10),
        meetingType,
        agenda,
        topics: [],
        attendeeContactIds: selectedContacts,
        externalAttendees: [],
        ourTeam,
        meetingObjective: objective,
        specialConcerns,
      };

      const res = await fetch('/api/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          input,
          meetingTitle: input.meetingTitle,
          meetingDate: input.meetingDate,
          meetingType,
          agenda,
          ourTeam,
          meetingObjective: objective,
          specialConcerns,
          account: {
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
            dealHealth: account.dealHealth,
          },
          contacts: selectedContactObjs.map((c) => ({
            name: c.name,
            title: c.title,
            role: c.role,
            decisionStyle: c.decisionStyle,
            riskAppetite: c.riskAppetite,
            communicationNotes: c.communicationNotes,
            landmines: c.landmines,
          })),
          attendees: selectedContactObjs.map((c) => ({
            name: c.name,
            title: c.title,
            role: c.role,
            hasProfile: !!c.contactProfile,
            profileSummary: c.contactProfile
              ? `决策风格:${c.contactProfile.decisionStyle?.type ?? '未知'}, 风险偏好:${c.contactProfile.riskAppetite ?? '未知'}`
              : undefined,
          })),
          contactProfiles: selectedContactObjs
            .filter((c) => c.contactProfile)
            .map((c) => ({
              name: c.name,
              summary: `决策风格:${c.contactProfile!.decisionStyle?.type ?? '未知'}, 沟通:${c.contactProfile!.communication?.formality ?? '未知'}, 触发:${(c.contactProfile!.positiveTriggers ?? []).join('/')}`,
            })),
          recentIntel: intelItems
            .filter((i) => i.accountId === accountId)
            .slice(0, 5)
            .map((i) => i.summary || i.title),
          recentDecodes: recentDecodes.map((d) => ({
            emailSnippet: d.emailText.slice(0, 100),
            sentiment: d.decode?.threadAnalysis?.sentimentTrend ?? 'unknown',
            keySignal: d.decode?.threadAnalysis?.keySignal ?? '',
          })),
          meddiccScore: opp.meddicc?.overallScore,
          pendingCommitments: pendingTasks.slice(0, 10).map((t) => ({
            title: t.title,
            dueDate: t.dueDate,
            status: t.status,
          })),
          meddiccWeaknesses,
          attitudeTrends: selectedContactObjs
            .filter((c) => c.attitudeTrend)
            .map((c) => ({ name: c.name, trend: c.attitudeTrend! })),
          outputLocale: locale,
        }),
      });

      const data = await res.json();
      if (data.meetingSummary) {
        setResult(data as BriefingPackResult);
        addMeetingPrep(accountId, input, data);
        setShowForm(false);
      }
    } catch (err) {
      console.error('Briefing pack error:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Load a previous prep
  const handleLoadPrep = (prep: typeof preps[0]) => {
    setResult(prep.result as unknown as BriefingPackResult);
    setShowForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          Briefing Pack
        </h3>
        <button
          onClick={() => { setShowForm(!showForm); setResult(null); setTasksCreated(false); }}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
        >
          <Sparkles className="h-3 w-3" />
          {showForm ? '取消' : '生成 Briefing Pack'}
        </button>
      </div>

      {/* Form */}
      {showForm && !result && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="rounded-lg border border-accent/20 bg-accent/[0.03] p-4 space-y-3">
            <p className="text-xs font-bold text-accent">Step 1 — 必填</p>
            <div>
              <label className="mb-1 block text-xs text-muted">会议类型</label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType)} className="form-select text-sm">
                {(Object.entries(MEETING_TYPE_LABELS) as [MeetingType, string][]).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">参会人员</label>
              <div className="flex flex-wrap gap-2">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs cursor-pointer hover:bg-sidebar">
                    <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => setSelectedContacts((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])} />
                    {c.name}{c.title ? ` (${c.title})` : ''}
                  </label>
                ))}
                {contacts.length === 0 && <p className="text-xs text-muted">暂无联系人</p>}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">会议目标</label>
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} className="form-input" rows={2} placeholder="这次会议要达成什么目的？" />
            </div>
          </div>

          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-accent hover:underline">
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {showAdvanced ? '收起更多选项' : '展开更多选项'}
          </button>

          <div className={`overflow-hidden transition-all duration-250 ${showAdvanced ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="rounded-lg border border-border bg-sidebar p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">会议标题</label>
                  <input type="text" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} className="form-input text-sm" placeholder="自动生成" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">会议日期</label>
                  <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="form-input text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">议程</label>
                <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} className="form-input text-sm" rows={2} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">我方参会人员</label>
                <input type="text" value={ourTeam} onChange={(e) => setOurTeam(e.target.value)} className="form-input text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">特别关注事项</label>
                <textarea value={specialConcerns} onChange={(e) => setSpecialConcerns(e.target.value)} className="form-input text-sm" rows={2} />
              </div>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || !objective.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 w-full justify-center"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? '生成 Briefing Pack...' : '生成 Briefing Pack'}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Win probability banner */}
          {result.winProbability != null && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent" />
                  成功概率
                </span>
                <span className="text-lg font-bold text-accent">{result.winProbability}%</span>
              </div>
              {result.winProbabilityReasoning && <p className="text-xs text-muted">{result.winProbabilityReasoning}</p>}
            </div>
          )}

          {/* Risk Alerts */}
          {result.riskAlerts && result.riskAlerts.length > 0 && (
            <Section icon={<AlertTriangle className="h-4 w-4 text-danger" />} title="风险提醒" badge={<span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger ml-1">{result.riskAlerts.length}</span>}>
              <div className="space-y-2">
                {result.riskAlerts.map((alert, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${alert.severity === 'high' ? 'border-danger/30 bg-danger/5' : alert.severity === 'medium' ? 'border-warning/30 bg-warning/5' : 'border-border bg-background'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={alert.severity} />
                      <span className="text-[10px] text-muted">{RISK_TYPE_LABELS[alert.type] || alert.type}</span>
                    </div>
                    <p className="text-xs text-foreground">{alert.description}</p>
                    <p className="text-xs text-secondary mt-1">
                      <span className="font-medium text-accent">缓解：</span>{alert.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Attendee Profiles */}
          {result.attendeeProfiles && result.attendeeProfiles.length > 0 && (
            <Section icon={<Users className="h-4 w-4 text-blue-500" />} title={`参会人画像 (${result.attendeeProfiles.length})`}>
              <div className="space-y-2">
                {result.attendeeProfiles.map((p, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-muted">决策风格：</span><span className="text-foreground">{p.decisionStyle}</span></div>
                      <div><span className="text-muted">风险偏好：</span><span className="text-foreground">{p.riskAppetite}</span></div>
                      <div><span className="text-muted">沟通偏好：</span><span className="text-foreground">{p.communicationPreference}</span></div>
                      {p.landmines && <div><span className="text-danger">地雷：</span><span className="text-foreground">{p.landmines}</span></div>}
                    </div>
                    <p className="mt-1.5 text-xs text-accent font-medium">{p.keyInsight}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Contact Analysis */}
          {result.contactAnalysis && result.contactAnalysis.length > 0 && (
            <Section icon={<Users className="h-4 w-4 text-accent" />} title="参会人沟通策略">
              <div className="space-y-2">
                {result.contactAnalysis.map((ca, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground">{ca.name}</span>
                      {ca.title && <span className="text-xs text-muted">{ca.title}</span>}
                    </div>
                    <p className="text-xs text-foreground mb-1">{ca.attitudePrediction}</p>
                    {ca.communicationTips?.length > 0 && (
                      <ul className="text-xs text-secondary space-y-0.5">
                        {ca.communicationTips.map((tip, j) => (
                          <li key={j} className="flex items-start gap-1"><span className="text-positive mt-0.5">•</span> {tip}</li>
                        ))}
                      </ul>
                    )}
                    {ca.warnings?.length > 0 && <div className="mt-1 text-xs text-danger">⚠️ {ca.warnings.join(' | ')}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Negotiation Strategy */}
          {result.negotiationStrategy && (
            <Section icon={<Swords className="h-4 w-4 text-purple-500" />} title="谈判策略">
              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                  <span className="font-semibold text-foreground">整体策略：</span>
                  <span className="text-foreground">{result.negotiationStrategy.overallApproach}</span>
                </div>
                {result.negotiationStrategy.concessionPlan?.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground mb-1">让步节奏</p>
                    {result.negotiationStrategy.concessionPlan.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-secondary mb-0.5">
                        <span className="text-accent font-medium">{i + 1}.</span> {step}
                      </div>
                    ))}
                  </div>
                )}
                {result.negotiationStrategy.leveragePoints?.length > 0 && (
                  <div>
                    <p className="font-semibold text-foreground mb-1">我方筹码</p>
                    {result.negotiationStrategy.leveragePoints.map((lp, i) => (
                      <div key={i} className="text-secondary mb-0.5">• {lp}</div>
                    ))}
                  </div>
                )}
                {result.negotiationStrategy.redLines?.length > 0 && (
                  <div className="rounded-lg border border-danger/20 bg-danger/5 p-2">
                    <p className="font-semibold text-danger mb-1">底线</p>
                    {result.negotiationStrategy.redLines.map((rl, i) => (
                      <div key={i} className="text-foreground mb-0.5">🚫 {rl}</div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Pending Commitments (from local data) */}
          {pendingTasks.length > 0 && (
            <Section icon={<Clock className="h-4 w-4 text-warning" />} title={`待完成承诺 (${pendingTasks.length})`} defaultOpen={false}>
              <div className="space-y-1.5">
                {pendingTasks.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${t.priority === 'urgent' || t.priority === 'high' ? 'bg-danger' : t.priority === 'medium' ? 'bg-warning' : 'bg-muted'}`} />
                    <span className="text-foreground truncate">{t.title}</span>
                    {t.dueDate && <span className="text-muted flex-shrink-0">{new Date(t.dueDate).toLocaleDateString('zh-CN')}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recent decodes */}
          {recentDecodes.length > 0 && (
            <Section icon={<MessageSquare className="h-4 w-4 text-positive" />} title={`最近沟通 (${recentDecodes.length})`} defaultOpen={false}>
              <div className="space-y-2">
                {recentDecodes.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between text-xs text-muted mb-1">
                      <span>{d.clientName || d.accountName || '邮件'}</span>
                      <span>{new Date(d.date).toLocaleDateString('zh-CN')}</span>
                    </div>
                    {d.decode?.threadAnalysis && (
                      <div className="flex items-center gap-2 text-xs mb-1">
                        <span className={`font-medium ${d.decode.threadAnalysis.sentimentTrend === 'warming' ? 'text-positive' : d.decode.threadAnalysis.sentimentTrend === 'cooling' ? 'text-danger' : 'text-foreground'}`}>
                          {d.decode.threadAnalysis.sentimentTrend}
                        </span>
                        <span className="text-muted">·</span>
                        <span className="text-foreground">{d.decode.threadAnalysis.keySignal}</span>
                      </div>
                    )}
                    <p className="text-xs text-secondary line-clamp-2">{d.emailText.slice(0, 120)}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Talking points */}
          {result.talkingPoints?.length > 0 && (
            <Section icon={<MessageSquare className="h-4 w-4 text-positive" />} title="谈话要点" defaultOpen={false}>
              <div className="space-y-1.5">
                {result.talkingPoints.map((tp, i) => (
                  <div key={i} className="text-xs"><span className="font-medium text-foreground">{tp.topic}：</span><span className="text-secondary">{tp.angle}</span></div>
                ))}
              </div>
            </Section>
          )}

          {/* Questions */}
          {result.questionsToAsk?.length > 0 && (
            <Section icon={<Shield className="h-4 w-4 text-blue-500" />} title="关键提问" defaultOpen={false}>
              <div className="space-y-1.5">
                {result.questionsToAsk.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 h-1.5 w-1.5 rounded-full flex-shrink-0 ${q.priority === 'high' ? 'bg-danger' : q.priority === 'medium' ? 'bg-warning' : 'bg-muted'}`} />
                    <span className="text-foreground">{q.question}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Topics to avoid */}
          {result.topicsToAvoid?.length > 0 && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 p-3">
              <h4 className="text-xs font-semibold text-danger mb-1 flex items-center gap-1"><Ban className="h-3 w-3" /> 避免话题</h4>
              <ul className="text-xs text-foreground space-y-0.5">
                {result.topicsToAvoid.map((t, i) => <li key={i}>• {t}</li>)}
              </ul>
            </div>
          )}

          {/* Scripts */}
          {result.suggestedScripts && (
            <Section icon={<MessageSquare className="h-4 w-4 text-accent" />} title="推荐话术" defaultOpen={false}>
              <div className="space-y-2 text-xs">
                {result.suggestedScripts.opening && (
                  <div><span className="font-medium text-foreground">开场白：</span><p className="text-secondary mt-0.5">{result.suggestedScripts.opening}</p></div>
                )}
                {result.suggestedScripts.keyTransitions?.length > 0 && (
                  <div><span className="font-medium text-foreground">话题切入：</span>{result.suggestedScripts.keyTransitions.map((t, i) => <p key={i} className="text-secondary mt-0.5">• {t}</p>)}</div>
                )}
                {result.suggestedScripts.closing && (
                  <div><span className="font-medium text-foreground">收尾：</span><p className="text-secondary mt-0.5">{result.suggestedScripts.closing}</p></div>
                )}
              </div>
            </Section>
          )}

          {/* Action items */}
          {result.actionItems?.length > 0 && (
            <Section icon={<CheckCircle2 className="h-4 w-4 text-positive" />} title="行动清单">
              <div className="space-y-1">
                {(['before', 'during', 'after'] as const).map((phase) => {
                  const items = result.actionItems.filter((a) => a.phase === phase);
                  if (items.length === 0) return null;
                  return (
                    <div key={phase} className="mb-2">
                      <p className="text-[10px] font-bold text-muted uppercase mb-1">{phase === 'before' ? '会前' : phase === 'during' ? '会中' : '会后'}</p>
                      {items.map((a, i) => <div key={i} className="text-xs text-foreground mb-0.5">• {a.action}</div>)}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Create tasks from action items */}
          <div className="flex gap-2 pt-2 border-t border-border">
            {tasksCreated ? (
              <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />已创建任务</span>
            ) : (
              <button
                onClick={() => {
                  for (const item of result.actionItems || []) {
                    addTask({
                      title: item.action,
                      description: `[${item.phase === 'before' ? '会前' : item.phase === 'during' ? '会中' : '会后'}] Briefing Pack 行动项`,
                      status: 'todo',
                      priority: 'medium',
                      source: 'manual',
                      aiGenerated: true,
                      accountId,
                      opportunityId: opp.id,
                    });
                  }
                  setTasksCreated(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/5 transition-colors"
              >
                <Plus className="h-3 w-3" /> 将行动项转为任务
              </button>
            )}
          </div>
        </div>
      )}

      {/* Previous preps (when nothing else shown) */}
      {!showForm && !result && preps.length > 0 && (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="px-4 py-2">
            <p className="text-xs font-semibold text-muted">历史 Briefing Pack</p>
          </div>
          {preps.slice(0, 5).map((p) => (
            <button key={p.id} onClick={() => handleLoadPrep(p)} className="w-full px-4 py-3 text-left hover:bg-sidebar transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{p.input.meetingTitle || MEETING_TYPE_LABELS[p.input.meetingType]}</span>
                <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <p className="text-xs text-secondary mt-0.5 line-clamp-1">{p.input.meetingObjective}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
