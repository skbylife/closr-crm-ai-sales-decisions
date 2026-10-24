'use client';

import { useState } from 'react';
import { Trophy, XCircle, Loader2, Lightbulb, Target, AlertTriangle, CheckCircle2, XOctagon, ChevronDown, ChevronUp, Eye, Swords } from 'lucide-react';
import type { Opportunity } from '@/lib/babel-engine/types';
import { useLocale } from '@/lib/i18n';

interface KeyFactor {
  factor: string;
  impact: 'decisive' | 'contributing' | 'minor';
}

interface PlayEffectiveness {
  playId: string;
  goalDescription: string;
  contribution: string;
}

interface AssumptionReview {
  text: string;
  wasCorrect: boolean;
  impact: string;
}

interface WinLossResult {
  result: 'won' | 'lost';
  summary: string;
  winFactors: KeyFactor[];
  lossFactors: KeyFactor[];
  missedSignals: string[];
  competitorInsight: string;
  playEffectiveness: PlayEffectiveness[];
  assumptions: AssumptionReview[];
  turningPoint: string;
  lessonsLearned: string[];
  recommendations: string[];
}

export function WinLossCard({ opportunity }: { opportunity: Opportunity }) {
  const { locale } = useLocale();
  const [result, setResult] = useState<WinLossResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');

  const isWon = opportunity.stage === 'closed_won';

  const runAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/win-loss-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId: opportunity.id, outputLocale: locale }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '分析失败');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const impactBadge = (impact: string) => {
    if (impact === 'decisive') return <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">决定性</span>;
    if (impact === 'contributing') return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">贡献</span>;
    return <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">次要</span>;
  };

  return (
    <div className="card-elevated rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isWon ? (
            <Trophy className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">AI 复盘分析</h3>
            <p className="mt-0.5 text-[12px] text-muted">
              {isWon ? '成交复盘：总结赢单经验，沉淀组织知识' : '丢单复盘：分析失败原因，避免重蹈覆辙'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isWon ? (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">已成交</span>
          ) : (
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">已丢失</span>
          )}
          {!result && (
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
              {loading ? '分析中...' : '生成复盘报告'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-500">{error}</div>
      )}

      {result && (
        <div className="p-4 space-y-3">
          {/* Summary */}
          <div className={`rounded-lg border px-3 py-2.5 ${isWon ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'}`}>
            <p className="text-xs font-medium text-foreground leading-relaxed">{result.summary}</p>
          </div>

          {/* Turning point */}
          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className={`h-3.5 w-3.5 ${isWon ? 'text-emerald-500' : 'text-red-500'}`} />
              <span className="text-xs font-medium text-foreground">关键转折点</span>
            </div>
            <p className="text-[12px] text-secondary leading-relaxed">{result.turningPoint}</p>
          </div>

          {/* Win factors */}
          {result.winFactors.length > 0 && (
            <CollapsibleSection
              title="赢单因素"
              count={result.winFactors.length}
              expanded={expandedSection === 'winFactors'}
              onToggle={() => toggle('winFactors')}
            >
              <div className="space-y-2">
                {result.winFactors.map((f, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <div className="mt-0.5">{impactBadge(f.impact)}</div>
                    <p className="text-xs text-secondary leading-relaxed">{f.factor}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Loss factors */}
          {result.lossFactors.length > 0 && (
            <CollapsibleSection
              title="丢单因素"
              count={result.lossFactors.length}
              expanded={expandedSection === 'lossFactors'}
              onToggle={() => toggle('lossFactors')}
            >
              <div className="space-y-2">
                {result.lossFactors.map((f, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    <div className="mt-0.5">{impactBadge(f.impact)}</div>
                    <p className="text-xs text-secondary leading-relaxed">{f.factor}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Missed signals */}
          {result.missedSignals.length > 0 && (
            <CollapsibleSection
              title="被忽略的信号"
              count={result.missedSignals.length}
              expanded={expandedSection === 'signals'}
              onToggle={() => toggle('signals')}
            >
              <ul className="space-y-1.5">
                {result.missedSignals.map((signal, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-secondary">
                    <Eye className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{signal}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}

          {/* Competitor insight */}
          {result.competitorInsight && (
            <CollapsibleSection
              title="竞品洞察"
              count={1}
              expanded={expandedSection === 'competitor'}
              onToggle={() => toggle('competitor')}
            >
              <div className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <Swords className="h-3.5 w-3.5 text-accent mt-0.5 flex-shrink-0" />
                <p className="text-xs text-secondary leading-relaxed">{result.competitorInsight}</p>
              </div>
            </CollapsibleSection>
          )}

          {/* Play effectiveness */}
          {result.playEffectiveness.length > 0 && (
            <CollapsibleSection
              title="谋局贡献度"
              count={result.playEffectiveness.length}
              expanded={expandedSection === 'plays'}
              onToggle={() => toggle('plays')}
            >
              <div className="space-y-2">
                {result.playEffectiveness.map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-border bg-background px-3 py-2">
                    <p className="text-xs font-medium text-foreground">{p.goalDescription}</p>
                    <p className="mt-1 text-[12px] text-secondary leading-relaxed">{p.contribution}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Assumptions */}
          {result.assumptions.length > 0 && (
            <CollapsibleSection
              title="假设验证"
              count={result.assumptions.length}
              expanded={expandedSection === 'assumptions'}
              onToggle={() => toggle('assumptions')}
            >
              <div className="space-y-2">
                {result.assumptions.map((a, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                    {a.wasCorrect ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XOctagon className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-xs text-foreground">{a.text}</p>
                      <p className="mt-0.5 text-[12px] text-muted">{a.impact}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Lessons learned */}
          <CollapsibleSection
            title="经验教训"
            count={result.lessonsLearned.length}
            expanded={expandedSection === 'lessons'}
            onToggle={() => toggle('lessons')}
          >
            <ul className="space-y-1.5">
              {result.lessonsLearned.map((lesson, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{lesson}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          {/* Recommendations */}
          <CollapsibleSection
            title="未来建议"
            count={result.recommendations.length}
            expanded={expandedSection === 'recommendations'}
            onToggle={() => toggle('recommendations')}
          >
            <ul className="space-y-1.5">
              {result.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-secondary">
                  <Target className="h-3.5 w-3.5 text-accent mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          {/* Knowledge saved notice */}
          <div className="rounded-lg bg-accent/5 border border-accent/15 px-3 py-2 text-[11px] text-accent flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            经验教训已自动存入组织知识库
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Section ────────────────────────────────────────────

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-xs text-muted hover:text-foreground transition-colors py-1"
      >
        <span className="font-medium">{title} ({count})</span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}
