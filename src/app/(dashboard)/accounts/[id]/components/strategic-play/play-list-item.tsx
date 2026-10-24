'use client';

import { Target } from 'lucide-react';
import { normalizePlayStepExecutionStatus } from '@/lib/strategic-play-execution';
import { useLocale } from '@/lib/i18n';
import { GOAL_ICONS, PLAY_STATUS_CONFIG, PLAY_STATUS_LABEL_EN, tPlay } from './labels';
import { displayText } from './text';
import type {
  StrategicPlay,
} from '@/lib/babel-engine/types';

export function PlayListItem({
  play,
  isSelected,
  onClick,
  opportunityName,
}: {
  play: StrategicPlay;
  isSelected: boolean;
  onClick: () => void;
  opportunityName?: string;
}) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const GoalIcon = GOAL_ICONS[play.goalType] ?? Target;
  const statusConfig = PLAY_STATUS_CONFIG[play.status];
  const completedSteps = play.steps.filter(s => normalizePlayStepExecutionStatus(s.status) === 'done').length;
  const progress = play.steps.length > 0 ? Math.round((completedSteps / play.steps.length) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 transition-colors border-l-2 hover:bg-accent/5 ${
        isSelected
          ? 'border-l-accent bg-accent/5'
          : 'border-l-transparent hover:border-l-border'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isSelected ? 'bg-accent/15' : 'bg-background'
        }`}>
          <GoalIcon className={`h-3.5 w-3.5 ${isSelected ? 'text-accent' : 'text-secondary'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none truncate max-w-full ${
              play.opportunityId
                ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
            }`}>
              {play.opportunityId ? `${tPlay(en, '商机级', 'Opportunity-level')}${opportunityName ? ` · ${opportunityName}` : ''}` : tPlay(en, '客户级', 'Account-level')}
            </span>
          </div>
          <p className="text-xs font-semibold text-foreground truncate leading-tight">
            {displayText(play.goalDescription)}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none ${statusConfig.style}`}>
              {en ? (PLAY_STATUS_LABEL_EN[play.status] ?? statusConfig.label) : statusConfig.label}
            </span>
            <span className="text-[12px] text-muted">{play.confidence}%</span>
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-border/50">
              <div
                className="h-1 rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-muted shrink-0">{completedSteps}/{play.steps.length}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
