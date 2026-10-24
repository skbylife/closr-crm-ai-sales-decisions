'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RecommendationEvidenceBundle } from '@/lib/babel-engine/types';
import { RecommendationDisplayWithEvidence } from '@/components/recommendation/recommendation-display-with-evidence';
import { useLocale } from '@/lib/i18n';

export function StrategicPlayEvidencePanel({ accountId, playId }: { accountId: string; playId: string }) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [bundle, setBundle] = useState<RecommendationEvidenceBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/accounts/${accountId}/evidence-panel?playId=${playId}`);
        if (!cancelled && res.ok) {
          setBundle(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accountId, playId]);

  if (!loading && !bundle) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-sidebar/40"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{en ? 'Evidence Panel' : '证据面板'}</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            {en ? 'Evidence stays hidden by default; expand when you need to explain why this plan holds, or inspect conflicts and gaps.' : '证据默认隐藏；需要解释这条谋局为什么成立、是否存在冲突或证据不足时再展开。'}
          </p>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="border-t border-border px-4 py-3">
          <RecommendationDisplayWithEvidence
            sectionTitle={en ? 'Plan Recommendation' : '谋局建议'}
            recommendationSummary={bundle?.recommendationSummary ?? ''}
            bundle={bundle}
            loading={loading}
            panelTitle={en ? 'Evidence Panel · Plan' : '证据面板 · 谋局'}
            showRecommendationBlock={false}
          />
        </div>
      ) : null}
    </div>
  );
}
