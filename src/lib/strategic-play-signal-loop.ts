import type { PlayAssumption } from '@/lib/babel-engine/types';
import type { JudgmentMemorySourceKind } from '@/lib/judgment/memory';

export interface BuildSignalLoopAssumptionInput {
  id: string;
  now: string;
  sourceKind: JudgmentMemorySourceKind;
  sourceId: string;
  signalStatement: string;
  affectedJudgment: string;
  evidence: string;
  question: string;
  nextMove: string;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparable(value: string): string {
  return compactText(value)
    .replace(/^待验证[：:]/, '')
    .toLowerCase();
}

function sourceLabel(sourceKind: JudgmentMemorySourceKind): string {
  if (sourceKind === 'rfp_analysis') return 'RFP 判断';
  if (sourceKind === 'decode') return 'Decode 解读';
  return 'Strategic Play';
}

export function buildSignalLoopAssumption(input: BuildSignalLoopAssumptionInput): PlayAssumption {
  const question = compactText(input.question);
  const signal = compactText(input.signalStatement);
  const evidence = compactText(input.evidence);
  const affectedJudgment = compactText(input.affectedJudgment);
  const nextMove = compactText(input.nextMove);
  const sourceRef = `${input.sourceKind}:${input.sourceId}`;

  return {
    id: input.id,
    text: `待验证：${question}`,
    status: 'pending',
    evidence: `${sourceLabel(input.sourceKind)}「${signal}」；证据：${evidence}`,
    impact: `来源 ${sourceRef} 已提示可能影响「${affectedJudgment}」。下一步：${nextMove}`,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function hasSignalLoopAssumption(params: {
  assumptions: PlayAssumption[];
  sourceKind: JudgmentMemorySourceKind;
  sourceId: string;
  question: string;
}): boolean {
  const normalizedQuestion = normalizeComparable(params.question);
  const sourceRef = `${params.sourceKind}:${params.sourceId}`;

  return params.assumptions.some((assumption) => {
    const text = normalizeComparable(assumption.text);
    const evidence = assumption.evidence ?? '';
    const impact = assumption.impact ?? '';
    return text === normalizedQuestion
      || text.includes(normalizedQuestion)
      || evidence.includes(sourceRef)
      || impact.includes(sourceRef);
  });
}
