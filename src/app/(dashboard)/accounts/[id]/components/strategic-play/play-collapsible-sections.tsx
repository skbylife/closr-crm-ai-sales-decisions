'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, AlertTriangle, Network, Lightbulb } from 'lucide-react';
import { tPlay } from './labels';
import { displayText } from './text';
import type { StrategicPlay, PlayRelationship } from '@/lib/babel-engine/types';
import type { StrategicPlayWithRoutePlan } from './deal-path';

// ─── Learnings Section ──────────────────────────────────────────────

export function PlayLearningsSection({
  play,
  en,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
}) {
  const [learningsOpen, setLearningsOpen] = useState(false);

  if ((play.learnings ?? []).filter(l => (l.learning?.trim() || (l as unknown as Record<string, string>).content?.trim())).length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setLearningsOpen(!learningsOpen)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-sidebar/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-secondary" />
          <span className="text-sm font-semibold text-foreground">{tPlay(en, '学习记录', 'Learning records')}</span>
          <span className="text-xs text-muted">{tPlay(en, `${(play.learnings ?? []).filter(l => (l.learning?.trim() || (l as unknown as Record<string, string>).content?.trim())).length} 条`, `${(play.learnings ?? []).filter(l => (l.learning?.trim() || (l as unknown as Record<string, string>).content?.trim())).length} items`)}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/[0.1]">
          {learningsOpen ? tPlay(en, '折叠', 'Collapse') : tPlay(en, '展开', 'Expand')}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${learningsOpen ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {learningsOpen && (
        <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
          {(play.learnings ?? []).filter(l => (l.learning?.trim() || (l as unknown as Record<string, string>).content?.trim())).map((l, i) => (
            <div key={i} className="flex items-start gap-2">
              <Lightbulb className="h-3 w-3 shrink-0 mt-0.5 text-yellow-500" />
              <div className="min-w-0">
                <span className="text-xs text-foreground">{displayText(l.learning || (l as unknown as Record<string, string>).content || '')}</span>
                {l.newSignal && (
                  <span className="ml-1 inline-flex rounded bg-accent/10 px-1.5 py-0.5 text-[12px] text-accent">{displayText(l.newSignal)}</span>
                )}
                <span className="ml-1.5 text-[12px] text-muted">{tPlay(en, '步骤', 'Step')} {typeof l.stepIndex === 'number' ? l.stepIndex + 1 : '?'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Relationships Section ──────────────────────────────────────────

export function PlayRelationshipsSection({
  play,
  relationships,
  allPlays,
  blockedUpstream,
}: {
  play: StrategicPlayWithRoutePlan;
  relationships?: PlayRelationship[];
  allPlays?: StrategicPlayWithRoutePlan[];
  blockedUpstream: { play: StrategicPlay; daysSince: number }[];
}) {
  const [relationshipsOpen, setRelationshipsOpen] = useState(false);

  const hasBlockedUpstream = blockedUpstream.length > 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 沿用拆分前的自动展开行为
    if (hasBlockedUpstream) setRelationshipsOpen(true);
  }, [hasBlockedUpstream]);

  if (!relationships || relationships.filter(r => r.sourcePlayId === play.id || r.targetPlayId === play.id).length === 0) return null;

  const playRels = relationships.filter(r => r.sourcePlayId === play.id || r.targetPlayId === play.id);
  const relLabels: Record<string, string> = { supports: '支持', depends_on: '依赖', conflicts: '冲突' };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setRelationshipsOpen(!relationshipsOpen)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-sidebar/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Network className="h-3.5 w-3.5 text-secondary" />
          <span className="text-sm font-semibold text-foreground">谋局关系</span>
          <span className="text-xs text-muted">{playRels.length} 个关联</span>
          {hasBlockedUpstream && <span className="text-[12px] text-warning font-medium">⚠ 上游阻塞</span>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/[0.1]">
          {relationshipsOpen ? '折叠' : '展开'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${relationshipsOpen ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {relationshipsOpen && (
        <div className="px-4 pb-4 space-y-2">
          {playRels.map((r) => {
            const isSource = r.sourcePlayId === play.id;
            const otherPlayId = isSource ? r.targetPlayId : r.sourcePlayId;
            const otherPlay = allPlays?.find(p => p.id === otherPlayId);
            const otherLabel = otherPlay?.goalDescription ?? otherPlayId.slice(0, 8);
            const blocked = blockedUpstream.some(b => b.play.id === otherPlayId);
            return (
              <div key={r.id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${blocked ? 'border-warning/30 bg-warning/5' : 'border-border'}`}>
                {blocked && <AlertTriangle className="h-3 w-3 text-warning shrink-0" />}
                <span className="text-secondary">{isSource ? '→' : '←'}</span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-medium ${r.relationship === 'conflicts' ? 'bg-danger/10 text-danger' : r.relationship === 'depends_on' ? 'bg-warning/10 text-warning' : 'bg-positive/10 text-positive'}`}>
                  {relLabels[r.relationship] ?? r.relationship}
                </span>
                <span className="text-foreground truncate">{otherLabel}</span>
                {r.note && <span className="text-muted truncate">— {r.note}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
