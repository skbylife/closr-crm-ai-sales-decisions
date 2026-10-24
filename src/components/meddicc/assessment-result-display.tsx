'use client';

import { Brain } from 'lucide-react';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';

// ─── Shared constants ────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  metrics: '商业指标',
  economicBuyer: '经济决策者',
  decisionCriteria: '决策标准',
  decisionProcess: '决策流程',
  pain: '识别痛点',
  identifiedPain: '识别痛点',
  champion: '内部推动者',
  competition: '竞争态势',
};

// ─── Types ───────────────────────────────────────────────────────────

export type DimensionScore = {
  score: number;
  maxScore: number;
  suggestion: string;
};

export type AssessmentResult = {
  overallScore?: number;
  dimensionScores?: Record<string, DimensionScore>;
  topPriorities?: string[];
  narrative?: string;
};

type Props = {
  /** The assessment result from the AI endpoint */
  assessment: AssessmentResult;
  /** Account ID for evidence panel lookup */
  accountId: string;
  /** Unique entity ID (account.id or opp.id) — used to build recommendationId keys */
  entityId: string;
  /** Display name for evidence panel titles */
  entityName: string;
  /** Fallback score when assessment.overallScore is not set */
  fallbackScore: number;
  /** Optional render prop for each priority item — e.g. pipeline uses this for "add task" buttons */
  renderPriorityAction?: (priority: string, index: number) => React.ReactNode;
  /** Optional footer — e.g. pipeline renders a close button */
  footer?: React.ReactNode;
};

// ─── Component ───────────────────────────────────────────────────────

export function AssessmentResultDisplay({
  assessment,
  accountId,
  entityId,
  entityName,
  fallbackScore,
  renderPriorityAction,
  footer,
}: Props) {
  const confidence = Math.max(0, Math.min(100, assessment.overallScore ?? fallbackScore));

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-4 w-4 text-accent" />
        <h4 className="text-sm font-semibold text-foreground">AI 评估结果</h4>
        {assessment.overallScore != null && (
          <span className="ml-auto text-lg font-bold text-accent">
            {assessment.overallScore}/100
          </span>
        )}
      </div>

      {/* Narrative */}
      {assessment.narrative && (
        <RecommendationDisplayWithEvidence
          sectionTitle="评估概述"
          recommendationTitle={`${entityName} MEDDICC 评估概述`}
          recommendationSummary={assessment.narrative}
          accountId={accountId}
          recommendationId={`meddicc-assessment:narrative:${entityId}`}
          confidence={confidence}
          panelTitle="证据面板 · MEDDICC 评估"
          variant="accent"
          summaryClassName="text-sm leading-relaxed text-foreground whitespace-pre-line"
        />
      )}

      {/* Top Priorities / Key Recommendations */}
      {assessment.topPriorities && assessment.topPriorities.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted mb-1">优先改进:</p>
          <ul className="space-y-1">
            {assessment.topPriorities.map((p, i) => (
              <li
                key={i}
                className="text-xs text-foreground/80 flex items-center justify-between gap-2"
              >
                <span className="flex items-start gap-1.5">
                  <span className="text-accent mt-0.5">{i + 1}.</span>
                  {p}
                </span>
                {renderPriorityAction?.(p, i)}
              </li>
            ))}
          </ul>
          <RecommendationDisplayWithEvidence
            sectionTitle="优先改进项"
            recommendationTitle={`${entityName} MEDDICC 优先改进项`}
            recommendationSummary={assessment.topPriorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}
            accountId={accountId}
            recommendationId={`meddicc-assessment:priorities:${entityId}`}
            confidence={confidence}
            panelTitle="证据面板 · 优先改进"
            showRecommendationBlock={false}
            variant="positive"
          />
        </div>
      )}

      {/* Dimension Scores & Suggestions */}
      {assessment.dimensionScores && Object.keys(assessment.dimensionScores).length > 0 && (
        <div className="space-y-3 mt-2">
          <p className="text-xs font-medium text-muted">维度建议:</p>
          {Object.entries(assessment.dimensionScores).map(([dimensionKey, val]) => {
            const dimensionLabel = DIMENSION_LABELS[dimensionKey] ?? dimensionKey;
            const dimConfidence = val.maxScore > 0
              ? Math.round((val.score / val.maxScore) * 100)
              : 0;
            return (
              <div
                key={dimensionKey}
                className="rounded-lg border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted uppercase">
                    {dimensionLabel}
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {val.score}/{val.maxScore}
                  </span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {val.suggestion}
                </p>
                <RecommendationDisplayWithEvidence
                  sectionTitle={dimensionLabel}
                  recommendationTitle={`${entityName} MEDDICC ${dimensionLabel} suggestion`}
                  recommendationSummary={val.suggestion}
                  accountId={accountId}
                  recommendationId={`meddicc-assessment:dimension:${dimensionKey}:${entityId}`}
                  confidence={Math.max(0, Math.min(100, dimConfidence))}
                  panelTitle={`证据面板 · ${dimensionLabel}`}
                  showRecommendationBlock={false}
                  variant="positive"
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Optional footer (e.g. close button) */}
      {footer}
    </div>
  );
}
