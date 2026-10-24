'use client';

import { JudgmentBrief } from '@/components/judgment/judgment-brief';
import { JudgmentFeedbackForm } from '@/components/judgment/judgment-feedback-form';
import type { Judgment } from '@/lib/babel-engine/types';
import { buildAccountJudgmentBrief } from '@/lib/judgment/brief';
import type { AccountMomentumSnapshot, AccountMomentumSnapshotStatus } from '@/lib/judgment/momentum';

const MOMENTUM_STATUS_LABEL: Record<AccountMomentumSnapshotStatus, string> = {
  heating: '升温',
  cooling: '降温',
  stalled: '停滞',
  risk_rising: '风险上升',
  mixed: '混合信号',
  unknown: '证据不足',
};

const MOMENTUM_STATUS_TONE: Record<AccountMomentumSnapshotStatus, string> = {
  heating: 'border-positive/20 bg-positive/10 text-positive',
  cooling: 'border-warning/20 bg-warning/10 text-warning',
  stalled: 'border-warning/20 bg-warning/10 text-warning',
  risk_rising: 'border-danger/20 bg-danger/10 text-danger',
  mixed: 'border-accent/20 bg-accent/10 text-accent',
  unknown: 'border-border bg-card text-muted',
};

function AccountMomentumBrief({ snapshot, accountId }: { snapshot: AccountMomentumSnapshot | null; accountId: string }) {
  if (!snapshot) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-secondary">局势动量</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">现在推进是在升温、卡住还是转弱？</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`rounded-md border px-2.5 py-1 font-medium ${MOMENTUM_STATUS_TONE[snapshot.status]}`}>
            {MOMENTUM_STATUS_LABEL[snapshot.status]}
          </span>

        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
          <p className="text-[11px] font-semibold text-secondary">当前局势</p>
          <p className="mt-1 text-sm leading-6 text-foreground">{snapshot.currentJudgment}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
          <p className="text-[11px] font-semibold text-secondary">最大张力</p>
          <p className="mt-1 text-sm leading-6 text-foreground">{snapshot.biggestTension}</p>
        </div>
        <div className="rounded-lg border border-border bg-warning/5 px-3 py-3">
          <p className="text-[11px] font-semibold text-warning">下一步动作</p>
          <p className="mt-1 text-sm leading-6 text-foreground">{snapshot.nextAction}</p>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-xs leading-5 text-secondary">为什么变化：{snapshot.whyChanged}</p>
      </div>

      <JudgmentFeedbackForm
        accountId={accountId}
        targetType="account_momentum"
        targetId="account-momentum"
        previousSummary={snapshot.currentJudgment}
        evidenceRefs={snapshot.evidenceRefs}
        buttonLabel="反馈/修正动量判断"
        compact
      />
    </div>
  );
}

export function JudgmentSummary({
  judgments,
  accountId,
  loading = false,
  accountMomentum = null,
  onOpenFullBoard,
}: {
  judgments: Judgment[];
  accountId: string;
  loading?: boolean;
  accountMomentum?: AccountMomentumSnapshot | null;
  onOpenFullBoard?: () => void;
}) {
  const brief = buildAccountJudgmentBrief(judgments, accountId);

  return (
    <div className="space-y-3">
      <JudgmentBrief
        brief={brief}
        loading={loading}
        emptyAction={{ href: `/decode?accountId=${encodeURIComponent(accountId)}`, label: '先用 Decode 录入一次客户沟通' }}
        detailsAction={onOpenFullBoard ? { label: '打开判断工作台', onClick: onOpenFullBoard } : undefined}
        feedbackTarget={brief ? {
          accountId,
          targetType: 'judgment',
          targetId: 'account-judgment-brief',
          previousSummary: brief.currentJudgment,
        } : undefined}
      />
      <AccountMomentumBrief snapshot={loading ? null : accountMomentum} accountId={accountId} />
    </div>
  );
}
