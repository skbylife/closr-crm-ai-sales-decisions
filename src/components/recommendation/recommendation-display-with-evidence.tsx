'use client';

import type { RecommendationEvidenceBundle } from '@/lib/babel-engine/types';
import { AdHocRecommendationEvidencePanel } from '@/app/(dashboard)/accounts/[id]/components/ad-hoc-recommendation-evidence-panel';
import { RecommendationEvidenceCard } from '@/app/(dashboard)/accounts/[id]/components/recommendation-evidence-card';
import { ChineseFirstText } from '@/components/ui/chinese-first-text';

interface RecommendationDisplayWithEvidenceProps {
  sectionTitle: string;
  recommendationSummary: string;
  recommendationTitle?: string;
  accountId?: string;
  recommendationId?: string;
  confidence?: number;
  panelTitle?: string;
  enabled?: boolean;
  variant?: 'accent' | 'positive';
  bundle?: RecommendationEvidenceBundle | null;
  loading?: boolean;
  showRecommendationBlock?: boolean;
  containerClassName?: string;
  recommendationBlockClassName?: string;
  sectionTitleClassName?: string;
  summaryClassName?: string;
}

const VARIANT_STYLES: Record<NonNullable<RecommendationDisplayWithEvidenceProps['variant']>, string> = {
  accent: 'border-accent/20 bg-accent/5',
  positive: 'border-positive/20 bg-positive/5',
};

const VARIANT_TITLE_STYLES: Record<NonNullable<RecommendationDisplayWithEvidenceProps['variant']>, string> = {
  accent: 'text-accent',
  positive: 'text-positive',
};

export function RecommendationDisplayWithEvidence({
  sectionTitle,
  recommendationSummary,
  recommendationTitle,
  accountId,
  recommendationId,
  confidence,
  panelTitle,
  enabled = true,
  variant = 'accent',
  bundle,
  loading,
  showRecommendationBlock = true,
  containerClassName,
  recommendationBlockClassName,
  sectionTitleClassName,
  summaryClassName,
}: RecommendationDisplayWithEvidenceProps) {
  if (!recommendationSummary.trim() && !bundle) return null;

  const toneStyle = VARIANT_STYLES[variant];
  const titleToneStyle = VARIANT_TITLE_STYLES[variant];
  const canLoadAdHocEvidence = Boolean(
    accountId && recommendationId && recommendationTitle && typeof confidence === 'number'
  );

  return (
    <div className={containerClassName ?? 'space-y-3'}>
      {showRecommendationBlock && (
        <div className={recommendationBlockClassName ?? `rounded-xl border p-4 space-y-2 ${toneStyle}`}>
          <h4 className={sectionTitleClassName ?? `text-xs font-semibold uppercase tracking-[0.14em] ${titleToneStyle}`}>
            {sectionTitle}
          </h4>
          <ChineseFirstText text={recommendationSummary} className={summaryClassName ?? 'text-sm leading-relaxed text-foreground whitespace-pre-line block'} />
        </div>
      )}

      {bundle !== undefined ? (
        <RecommendationEvidenceCard
          bundle={bundle}
          loading={loading}
          title={panelTitle}
          accountId={accountId}
        />
      ) : canLoadAdHocEvidence ? (
        <AdHocRecommendationEvidencePanel
          accountId={accountId!}
          recommendationId={recommendationId!}
          recommendationTitle={recommendationTitle!}
          recommendationSummary={recommendationSummary}
          confidence={confidence!}
          panelTitle={panelTitle}
          enabled={enabled}
        />
      ) : null}
    </div>
  );
}
