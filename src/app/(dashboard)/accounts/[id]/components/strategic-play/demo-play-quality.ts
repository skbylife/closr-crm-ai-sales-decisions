import type {
  StrategicPlay,
} from '@/lib/babel-engine/types';

export const ENGLISH_PLACEHOLDER_PLAY_PATTERNS = [
  /^Review customer evidence$/i,
  /^Review supporting evidence$/i,
  /^Customer evidence$/i,
  /^Customer signal$/i,
  /Account analysis for this sales scenario/i,
  /Sales-context summary/i,
  /Customer-facing detail/i,
  /Named account record/i,
  /Account evidence item \d+/i,
  /\bevidence item \d+\b/i,
  /^Sales signal$/i,
  /Account evidence detail/i,
  /Evidence-backed account note/i,
  /Sanitized customer communication excerpt/i,
  /Stakeholder contact/i,
  /Stakeholder owner/i,
  /Business context detail/i,
  /Evidence review step/i,
  /Strategic play detail/i,
  /customerStatus:/i,
  /\bNEXT STEPACTION\b/i,
  /\bCustomer value\b/i,
  /\bCustomer signal\b/i,
  /\bCustomer stakeholder\b/i,
  /\bStrategic play value\b/i,
] as const;

export function playTextBlob(play: StrategicPlay): string {
  return [
    play.goalDescription,
    play.situationJudgment,
    play.strategicObjective,
    ...(play.steps ?? []).flatMap((step) => [step.title, step.action, step.purpose, step.risk, step.expectedOutcome, step.successSignal]),
    ...(play.assumptions ?? []).map((assumption) => assumption.text),
    ...(play.riskCounterEvidence ?? []),
  ].filter(Boolean).join('\n');
}

export function isPlaceholderEnglishPlay(play: StrategicPlay): boolean {
  const blob = playTextBlob(play);
  const placeholderHits = ENGLISH_PLACEHOLDER_PLAY_PATTERNS.reduce(
    (total, pattern) => total + (blob.match(pattern)?.length ?? 0),
    0,
  );
  return placeholderHits >= 1;
}

export function isCrossAccountEnglishDemoPlay(play: StrategicPlay): boolean {
  if (play.opportunityId !== 'opp_cmcc_5g_003') return false;
  return /Meridian Bank|Rachel Kim|Marcus Reed|Priya Nair|bank/i.test(playTextBlob(play));
}

export function filterLowQualityDemoPlays(plays: StrategicPlay[]): StrategicPlay[] {
  const cleaned = plays.filter((play) => !isPlaceholderEnglishPlay(play) && !isCrossAccountEnglishDemoPlay(play));
  return cleaned.length > 0 ? cleaned : plays;
}
