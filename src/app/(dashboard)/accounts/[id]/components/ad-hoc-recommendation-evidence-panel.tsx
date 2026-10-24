'use client';

import { useEffect, useState } from 'react';
import type { RecommendationEvidenceBundle } from '@/lib/babel-engine/types';
import { RecommendationEvidenceCard } from './recommendation-evidence-card';

export function AdHocRecommendationEvidencePanel({
  accountId,
  recommendationId,
  recommendationTitle,
  recommendationSummary,
  confidence,
  panelTitle,
  enabled = true,
}: {
  accountId: string;
  recommendationId: string;
  recommendationTitle: string;
  recommendationSummary: string;
  confidence: number;
  panelTitle?: string;
  enabled?: boolean;
}) {
  const [bundle, setBundle] = useState<RecommendationEvidenceBundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !recommendationSummary.trim()) {
      setBundle(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounts/${accountId}/evidence-panel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendationId,
            recommendationTitle,
            recommendationSummary,
            confidence,
          }),
        });
        if (!cancelled && res.ok) {
          setBundle(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [accountId, recommendationId, recommendationTitle, recommendationSummary, confidence, enabled]);

  if (!enabled) return null;

  return <RecommendationEvidenceCard bundle={bundle} loading={loading} title={panelTitle} accountId={accountId} />;
}
