import { describe, expect, it } from 'vitest';
import type { StrategicPlayFieldEvidenceAttribution } from '@/lib/babel-engine/types';
import {
  flattenStrategicPlayCalibrations,
  strategicPlayCalibrationClassificationLabel,
  strategicPlayCalibrationFieldLabel,
  strategicPlayCalibrationOutcomeLabel,
  summarizeStrategicPlayCalibrations,
} from './strategic-play-calibration-ui';

const attributions: StrategicPlayFieldEvidenceAttribution[] = [
  {
    field: 'steps[0].expectedOutcome',
    classification: 'inference',
    evidenceRefs: [],
    gaps: [],
    calibrations: [
      {
        id: 'cal_old',
        sourceRef: {
          sourceId: 'sr_old',
          sourceType: 'source_record',
          sourceKind: 'source_record',
          sourceTable: 'source_records',
          sourceRowId: 'sr_old',
          title: '第一次执行记录',
        },
        executionStatus: 'done',
        outcomeAssessment: 'partially_matched',
        previousClassification: 'inference',
        calibratedClassification: 'mixed',
        note: 'Champion 有反馈，但 CFO 仍未出现。',
        occurredAt: '2026-05-05T10:00:00.000Z',
      },
      {
        id: 'cal_new',
        sourceRef: {
          sourceId: 'sr_new',
          sourceType: 'source_record',
          sourceKind: 'source_record',
          sourceTable: 'source_records',
          sourceRowId: 'sr_new',
          title: '第二次执行记录',
        },
        executionStatus: 'done',
        outcomeAssessment: 'matched_expected',
        previousClassification: 'mixed',
        calibratedClassification: 'verified',
        note: 'CFO 直接确认进入商务会。',
        occurredAt: '2026-05-06T10:00:00.000Z',
      },
    ],
  },
  {
    field: 'riskCounterEvidence',
    classification: 'gap',
    evidenceRefs: [],
    gaps: ['缺反证'],
    calibrations: [
      {
        id: 'cal_blocked',
        sourceRef: {
          sourceId: 'sr_blocked',
          sourceType: 'source_record',
          sourceKind: 'source_record',
          sourceTable: 'source_records',
          sourceRowId: 'sr_blocked',
          title: '法务阻塞记录',
        },
        executionStatus: 'blocked',
        outcomeAssessment: 'blocked',
        previousClassification: 'gap',
        calibratedClassification: 'blocked',
        occurredAt: '2026-05-04T10:00:00.000Z',
      },
    ],
  },
];

describe('strategic-play-calibration-ui', () => {
  it('flattens calibration history with field labels and newest-first sorting', () => {
    const items = flattenStrategicPlayCalibrations(attributions);

    expect(items.map((item) => item.calibration.id)).toEqual(['cal_new', 'cal_old', 'cal_blocked']);
    expect(items[0]).toMatchObject({ field: 'steps[0].expectedOutcome', fieldLabel: '步骤 1 预期结果' });
    expect(strategicPlayCalibrationFieldLabel('riskCounterEvidence')).toBe('风险/反证');
  });

  it('summarizes outcome buckets without changing the API shape', () => {
    const summary = summarizeStrategicPlayCalibrations(flattenStrategicPlayCalibrations(attributions));

    expect(summary).toEqual({
      total: 3,
      matched_expected: 1,
      partially_matched: 1,
      missed_expected: 0,
      blocked: 1,
      invalidated: 0,
      unknown: 0,
    });
  });

  it('keeps human labels stable for outcome and classification values', () => {
    expect(strategicPlayCalibrationOutcomeLabel('missed_expected')).toBe('未达预期');
    expect(strategicPlayCalibrationClassificationLabel('verified')).toBe('已验证');
    expect(strategicPlayCalibrationClassificationLabel('inference')).toBe('推断');
  });
});
