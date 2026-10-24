import type {
  StrategicPlayFieldEvidenceAttribution,
  StrategicPlayFieldEvidenceCalibration,
  StrategicPlayFieldEvidenceCalibrationClassification,
  StrategicPlayFieldEvidenceCalibrationOutcomeAssessment,
  StrategicPlayFieldEvidenceClassification,
} from '@/lib/babel-engine/types';

export type StrategicPlayCalibrationTimelineItem = {
  field: string;
  fieldLabel: string;
  calibration: StrategicPlayFieldEvidenceCalibration;
};

export type StrategicPlayCalibrationSummary = Record<StrategicPlayFieldEvidenceCalibrationOutcomeAssessment, number> & {
  total: number;
};

export const STRATEGIC_PLAY_CALIBRATION_OUTCOME_LABELS: Record<StrategicPlayFieldEvidenceCalibrationOutcomeAssessment, string> = {
  matched_expected: '符合预期',
  partially_matched: '部分符合',
  missed_expected: '未达预期',
  blocked: '受阻',
  invalidated: '已否定',
  unknown: '待判断',
};

export const STRATEGIC_PLAY_CALIBRATION_OUTCOME_ORDER: StrategicPlayFieldEvidenceCalibrationOutcomeAssessment[] = [
  'matched_expected',
  'partially_matched',
  'missed_expected',
  'blocked',
  'invalidated',
  'unknown',
];

const STRATEGIC_PLAY_FIELD_LABELS: Record<string, string> = {
  situationJudgment: '局势判断',
  strategicObjective: '战略目标',
  stakeholderPath: '关键路径',
  evidenceBasis: '证据依据',
  riskCounterEvidence: '风险/反证',
  successCriteria: '成功标准',
};

const STRATEGIC_PLAY_CLASSIFICATION_LABELS: Record<StrategicPlayFieldEvidenceCalibrationClassification, string> = {
  fact: '事实',
  inference: '推断',
  gap: '缺证据',
  mixed: '混合',
  observed: '已观察',
  verified: '已验证',
  blocked: '受阻',
  invalidated: '已否定',
};

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function strategicPlayCalibrationFieldLabel(field: string): string {
  const direct = STRATEGIC_PLAY_FIELD_LABELS[field];
  if (direct) return direct;

  const stepExpectedOutcome = field.match(/^(?:steps|actionPlan)\[(\d+)\]\.expectedOutcome$/);
  if (stepExpectedOutcome) return `步骤 ${Number(stepExpectedOutcome[1]) + 1} 预期结果`;

  const stepRisk = field.match(/^(?:steps|actionPlan)\[(\d+)\]\.risk$/);
  if (stepRisk) return `步骤 ${Number(stepRisk[1]) + 1} 风险判断`;

  const stepFallback = field.match(/^(?:steps|actionPlan)\[(\d+)\]\.fallback$/);
  if (stepFallback) return `步骤 ${Number(stepFallback[1]) + 1} 备选路径`;

  return field;
}

export function strategicPlayCalibrationClassificationLabel(
  classification: StrategicPlayFieldEvidenceCalibrationClassification | StrategicPlayFieldEvidenceClassification,
): string {
  return STRATEGIC_PLAY_CLASSIFICATION_LABELS[classification];
}

export function strategicPlayCalibrationOutcomeLabel(outcome: StrategicPlayFieldEvidenceCalibrationOutcomeAssessment): string {
  return STRATEGIC_PLAY_CALIBRATION_OUTCOME_LABELS[outcome];
}

export function flattenStrategicPlayCalibrations(
  attributions: StrategicPlayFieldEvidenceAttribution[] | undefined,
): StrategicPlayCalibrationTimelineItem[] {
  return (attributions ?? [])
    .flatMap((attribution) => (attribution.calibrations ?? []).map((calibration) => ({
      field: attribution.field,
      fieldLabel: strategicPlayCalibrationFieldLabel(attribution.field),
      calibration,
    })))
    .sort((a, b) => timestamp(b.calibration.occurredAt) - timestamp(a.calibration.occurredAt));
}

export function summarizeStrategicPlayCalibrations(
  items: StrategicPlayCalibrationTimelineItem[],
): StrategicPlayCalibrationSummary {
  return items.reduce<StrategicPlayCalibrationSummary>(
    (summary, item) => {
      summary.total += 1;
      summary[item.calibration.outcomeAssessment] += 1;
      return summary;
    },
    {
      total: 0,
      matched_expected: 0,
      partially_matched: 0,
      missed_expected: 0,
      blocked: 0,
      invalidated: 0,
      unknown: 0,
    },
  );
}
