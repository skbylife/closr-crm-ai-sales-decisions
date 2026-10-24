'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import {
  ChevronDown,
  Loader2,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Lightbulb,
  ListChecks,
  Plus,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import type { Opportunity } from '@/lib/babel-engine/types';

// ─── Local types ────────────────────────────────────────────────────

interface GapItem {
  dimension: string;
  expected: string;
  actual: string;
  gap: 'positive' | 'neutral' | 'negative';
  insight: string;
}

interface ExtractedAction {
  action: string;
  owner: '我方' | '客方' | '待定';
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

interface KeyDiscovery {
  finding: string;
  impact: 'positive' | 'negative' | 'neutral';
  nextStep: string;
}

interface SentimentShift {
  before: string;
  after: string;
  direction: 'improved' | 'stable' | 'declined';
  reason: string;
}

interface FollowUp {
  action: string;
  timeline: string;
}

interface MeetingReviewResult {
  meetingSummary: string;
  gapAnalysis: GapItem[];
  extractedActionItems: ExtractedAction[];
  keyDiscoveries: KeyDiscovery[];
  sentimentShift: SentimentShift;
  updatedWinProbability: number;
  updatedWinReasoning: string;
  followUpPlan: FollowUp[];
  lessonsLearned: string[];
}

// ─── Section ────────────────────────────────────────────────────────

function Section({ icon, title, children, defaultOpen = true }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-foreground">
        {icon}
        {title}
        <ChevronDown className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

// ─── Helper Functions ──────────────────────────────────────────────

function generateReportText(result: MeetingReviewResult, accountName: string): string {
  let report = `会后复盘报告\n`;
  report += `客户：${accountName}\n`;
  report += `日期：${new Date().toLocaleDateString('zh-CN')}\n`;
  report += `\n${'='.repeat(50)}\n\n`;

  report += `会议摘要\n${'-'.repeat(30)}\n${result.meetingSummary}\n\n`;

  report += `赢单概率：${result.updatedWinProbability}%\n`;
  report += `${result.updatedWinReasoning}\n\n`;

  if (result.sentimentShift) {
    report += `客户情绪变化\n${'-'.repeat(30)}\n`;
    report += `会前：${result.sentimentShift.before}\n`;
    report += `会后：${result.sentimentShift.after}\n`;
    report += `${result.sentimentShift.reason}\n\n`;
  }

  if (result.gapAnalysis?.length > 0) {
    report += `预期 vs 实际差异\n${'-'.repeat(30)}\n`;
    result.gapAnalysis.forEach((g, i) => {
      report += `${i + 1}. ${g.dimension}\n`;
      report += `   预期：${g.expected}\n`;
      report += `   实际：${g.actual}\n`;
      report += `   洞察：${g.insight}\n\n`;
    });
  }

  if (result.keyDiscoveries?.length > 0) {
    report += `关键发现\n${'-'.repeat(30)}\n`;
    result.keyDiscoveries.forEach((d, i) => {
      report += `${i + 1}. ${d.finding}\n`;
      report += `   下一步：${d.nextStep}\n\n`;
    });
  }

  if (result.extractedActionItems?.length > 0) {
    report += `行动项\n${'-'.repeat(30)}\n`;
    result.extractedActionItems.forEach((a, i) => {
      report += `${i + 1}. [${a.owner}] ${a.action}`;
      if (a.dueDate) report += ` (截止: ${a.dueDate})`;
      report += `\n`;
    });
    report += `\n`;
  }

  if (result.followUpPlan?.length > 0) {
    report += `跟进计划\n${'-'.repeat(30)}\n`;
    result.followUpPlan.forEach((f, i) => {
      report += `${i + 1}. ${f.action} [${f.timeline}]\n`;
    });
    report += `\n`;
  }

  if (result.lessonsLearned?.length > 0) {
    report += `经验教训\n${'-'.repeat(30)}\n`;
    result.lessonsLearned.forEach((l, i) => {
      report += `${i + 1}. ${l}\n`;
    });
  }

  return report;
}

// ─── Main Component ─────────────────────────────────────────────────

export function MeetingReview({ opp, accountId }: { opp: Opportunity; accountId: string }) {
  const { locale } = useLocale();
  const accounts = useStore((s) => s.accounts);
  const addTask = useStore((s) => s.addTask);
  const getMeetingPreps = useStore((s) => s.getMeetingPreps);

  const account = accounts.find((a) => a.id === accountId);
  const preps = getMeetingPreps(accountId);
  const latestPrep = preps.length > 0 ? preps[0] : null;

  const [meetingNotes, setMeetingNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MeetingReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasksCreated, setTasksCreated] = useState(false);
  const [useBriefing, setUseBriefing] = useState(!!latestPrep);

  const handleAnalyze = async () => {
    if (!account || !meetingNotes.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const briefingSnapshot = useBriefing && latestPrep ? {
        winProbability: latestPrep.result.winProbability,
        talkingPoints: latestPrep.result.talkingPoints,
        questionsToAsk: latestPrep.result.questionsToAsk,
        actionItems: latestPrep.result.actionItems,
        negotiationStrategy: (latestPrep.result as unknown as { negotiationStrategy?: { overallApproach?: string; leveragePoints?: string[] } }).negotiationStrategy,
      } : undefined;

      const res = await fetch('/api/meeting-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingNotes,
          account: {
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
          },
          briefingSnapshot,
          attendeeNames: latestPrep?.input.attendeeContactIds
            ? account.contacts?.filter((c) => latestPrep.input.attendeeContactIds.includes(c.id)).map((c) => c.name)
            : undefined,
          outputLocale: locale,
        }),
      });

      if (!res.ok) throw new Error('生成失败');
      const data = await res.json() as MeetingReviewResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const directionIcon = (dir: string) => {
    if (dir === 'improved') return <TrendingUp className="h-4 w-4 text-positive" />;
    if (dir === 'declined') return <TrendingDown className="h-4 w-4 text-danger" />;
    return <Minus className="h-4 w-4 text-muted" />;
  };

  const gapColor = (gap: string) => {
    if (gap === 'positive') return 'border-positive/30 bg-positive/5';
    if (gap === 'negative') return 'border-danger/30 bg-danger/5';
    return 'border-border bg-background';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-accent" />
        会后复盘
      </h3>

      {!result && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          {latestPrep && (
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={useBriefing} onChange={() => setUseBriefing(!useBriefing)} />
              对照最近 Briefing Pack 做差异分析
              <span className="text-muted">({new Date(latestPrep.createdAt).toLocaleDateString('zh-CN')})</span>
            </label>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">会议记录 / 要点</label>
            <textarea
              value={meetingNotes}
              onChange={(e) => setMeetingNotes(e.target.value)}
              className="form-input text-sm"
              rows={6}
              placeholder="请输入会议的关键要点、讨论内容、客户反馈、达成的共识、遗留问题等..."
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleAnalyze}
            disabled={generating || !meetingNotes.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 w-full justify-center"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
            {generating ? 'AI 复盘分析中...' : 'AI 复盘分析'}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Export button */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                const reportText = generateReportText(result, account?.name || '客户');
                const blob = new Blob([reportText], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `meeting-review-${new Date().toISOString().split("T")[0]}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              <ClipboardCheck className="h-3 w-3" />
              导出复盘报告
            </button>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
            <p className="text-sm text-foreground">{result.meetingSummary}</p>
          </div>

          {/* Updated win probability */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">更新赢单概率</span>
            </div>
            <span className="text-lg font-bold text-accent">{result.updatedWinProbability}%</span>
            {result.sentimentShift && directionIcon(result.sentimentShift.direction)}
            <p className="text-xs text-muted flex-1">{result.updatedWinReasoning}</p>
          </div>

          {/* Sentiment shift */}
          {result.sentimentShift && (
            <div className={`rounded-lg border p-3 ${result.sentimentShift.direction === 'improved' ? 'border-positive/30 bg-positive/5' : result.sentimentShift.direction === 'declined' ? 'border-danger/30 bg-danger/5' : 'border-border bg-background'}`}>
              <div className="flex items-center gap-2 mb-1">
                {directionIcon(result.sentimentShift.direction)}
                <span className="text-xs font-semibold text-foreground">客户情绪变化</span>
              </div>
              <div className="flex gap-4 text-xs">
                <div><span className="text-muted">会前：</span><span className="text-foreground">{result.sentimentShift.before}</span></div>
                <div><span className="text-muted">会后：</span><span className="text-foreground">{result.sentimentShift.after}</span></div>
              </div>
              <p className="text-xs text-secondary mt-1">{result.sentimentShift.reason}</p>
            </div>
          )}

          {/* Gap analysis */}
          {result.gapAnalysis?.length > 0 && (
            <Section icon={<Target className="h-4 w-4 text-purple-500" />} title="预期 vs 实际差异">
              <div className="space-y-2">
                {result.gapAnalysis.map((g, i) => (
                  <div key={i} className={`rounded-lg border p-3 ${gapColor(g.gap)}`}>
                    <p className="text-xs font-semibold text-foreground mb-1">{g.dimension}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-1">
                      <div><span className="text-muted">预期：</span><span className="text-foreground">{g.expected}</span></div>
                      <div><span className="text-muted">实际：</span><span className="text-foreground">{g.actual}</span></div>
                    </div>
                    <p className="text-xs text-accent">{g.insight}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Key discoveries */}
          {result.keyDiscoveries?.length > 0 && (
            <Section icon={<Lightbulb className="h-4 w-4 text-warning" />} title="关键发现">
              <div className="space-y-2">
                {result.keyDiscoveries.map((d, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${d.impact === 'positive' ? 'bg-positive' : d.impact === 'negative' ? 'bg-danger' : 'bg-muted'}`} />
                      <span className="text-xs font-medium text-foreground">{d.finding}</span>
                    </div>
                    <p className="text-xs text-secondary">下一步：{d.nextStep}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Extracted action items */}
          {result.extractedActionItems?.length > 0 && (
            <Section icon={<ListChecks className="h-4 w-4 text-positive" />} title={`提取行动项 (${result.extractedActionItems.length})`}>
              <div className="space-y-1.5">
                {result.extractedActionItems.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${a.priority === 'high' ? 'bg-danger' : a.priority === 'medium' ? 'bg-warning' : 'bg-muted'}`} />
                    <span className="text-foreground flex-1">{a.action}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${a.owner === '我方' ? 'bg-accent/10 text-accent' : a.owner === '客方' ? 'bg-positive/10 text-positive' : 'bg-muted/10 text-muted'}`}>{a.owner}</span>
                    {a.dueDate && <span className="text-muted">{a.dueDate}</span>}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-border flex items-center justify-between gap-2">
                {tasksCreated ? (
                  <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />已创建任务</span>
                ) : (
                  <button
                    onClick={() => {
                      const ourItems = result.extractedActionItems.filter((a) => a.owner === '我方' || a.owner === '待定');
                      for (const item of ourItems) {
                        addTask({
                          title: item.action,
                          description: `会后复盘提取 [${item.owner}]`,
                          status: 'todo',
                          priority: item.priority === 'high' ? 'high' : item.priority === 'medium' ? 'medium' : 'low',
                          source: 'manual',
                          aiGenerated: true,
                          accountId,
                          opportunityId: opp.id,
                          dueDate: item.dueDate,
                        });
                      }
                      setTasksCreated(true);
                    }}
                    className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/5 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> 将我方行动项转为任务
                  </button>
                )}
                {tasksCreated && (
                  <Link
                    href={`/accounts/${accountId}?tab=tasks`}
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    查看任务
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </Section>
          )}

          {/* Follow-up plan */}
          {result.followUpPlan?.length > 0 && (
            <Section icon={<ListChecks className="h-4 w-4 text-accent" />} title="跟进计划" defaultOpen={false}>
              <div className="space-y-1.5">
                {result.followUpPlan.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-accent font-medium mt-0.5">{i + 1}.</span>
                    <div>
                      <span className="text-foreground">{f.action}</span>
                      <span className="text-muted ml-2">[{f.timeline}]</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Lessons learned */}
          {result.lessonsLearned?.length > 0 && (
            <div className="rounded-lg border border-border bg-sidebar p-3">
              <h4 className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1"><Lightbulb className="h-3 w-3 text-warning" /> 经验教训</h4>
              <ul className="text-xs text-secondary space-y-0.5">
                {result.lessonsLearned.map((l, i) => <li key={i}>• {l}</li>)}
              </ul>
            </div>
          )}

          {/* Reset */}
          <button
            onClick={() => { setResult(null); setMeetingNotes(''); setTasksCreated(false); }}
            className="text-xs text-muted hover:text-accent"
          >
            重新复盘
          </button>
        </div>
      )}
    </div>
  );
}
