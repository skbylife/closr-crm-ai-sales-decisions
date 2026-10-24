import type { JudgmentEvidenceRef } from '@/lib/babel-engine/types';

export function buildEvidenceHref(ref: JudgmentEvidenceRef, accountId: string): string | undefined {
  const encodedAccountId = encodeURIComponent(accountId);
  const encodedSourceId = encodeURIComponent(ref.sourceId);
  switch (ref.sourceKind) {
    case 'intel_item':
    case 'email_decode':
    case 'integration_email':
    case 'meeting_prep':
    case 'activity_log':
      return `/accounts/${encodedAccountId}?tab=activity&targetKind=${encodeURIComponent(ref.sourceKind)}&targetId=${encodedSourceId}`;
    case 'strategic_play':
      return `/accounts/${encodedAccountId}?tab=plays&playId=${encodedSourceId}`;
    case 'source_record': {
      const targetId = ref.sourceRowId ?? ref.sourceId;
      return `/accounts/${encodedAccountId}?tab=knowledge&targetKind=source_record&targetId=${encodeURIComponent(targetId)}`;
    }
    default:
      return undefined;
  }
}
