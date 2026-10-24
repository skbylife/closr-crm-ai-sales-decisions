import { describe, expect, it } from 'vitest';

import {
  applyStrategicPlayAttributionCalibration,
  buildExecutionSourceRef,
  normalizeCalibrationTargetFields,
  normalizeEvidenceProvenanceForCalibration,
} from './strategic-play-attribution-calibration';

const sourceRef = buildExecutionSourceRef({
  sourceId: 'play_1:0:done:2026-05-06T06:00:00.000Z',
  sourceType: 'play_execution_event',
  sourceKind: 'source_record',
  sourceTable: 'source_records',
  sourceRowId: 'play_1:0:done:2026-05-06T06:00:00.000Z',
  title: '谋局执行 · 已完成',
  excerpt: '已完成：采购确认 Q2 预算还在',
  occurredAt: '2026-05-06T06:00:00.000Z',
});

describe('strategic-play attribution calibration', () => {
  it('normalizes old plays without evidence_provenance', () => {
    expect(normalizeEvidenceProvenanceForCalibration(null, '2026-05-06T06:00:00.000Z')).toMatchObject({
      fieldEvidenceAttributions: [],
      generatedAt: '2026-05-06T06:00:00.000Z',
    });
  });

  it('defaults target fields to step expectedOutcome and supports risk/fallback request fields', () => {
    expect(normalizeCalibrationTargetFields({ stepIndex: 2, fields: ['risk', 'steps[2].fallback', 'bad.field'] })).toEqual([
      'steps[2].expectedOutcome',
      'steps[2].risk',
      'steps[2].fallback',
    ]);
  });

  it('upgrades matched expected done execution to fact with verified calibration history', () => {
    const result = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: {
        evidenceIds: [],
        sourceIds: [],
        sourceTypes: [],
        confidence: 0.5,
        contradictions: [],
        tensions: [],
        rationale: 'old',
        traces: [],
        generatedAt: '2026-05-01T00:00:00.000Z',
        fieldEvidenceAttributions: [{ field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [], gaps: [], rationale: 'expected outcome 是推断' }],
      },
      stepIndex: 0,
      executionStatus: 'done',
      outcomeAssessment: 'matched_expected',
      sourceRef,
      targetFields: ['steps[0].expectedOutcome'],
      note: '真实执行结果命中预期',
      occurredAt: '2026-05-06T06:00:00.000Z',
      createdBy: 'user_1',
    });

    const attribution = result.attributions.find((item) => item.field === 'steps[0].expectedOutcome');
    expect(attribution).toMatchObject({
      classification: 'fact',
      calibrations: [expect.objectContaining({
        executionStatus: 'done',
        outcomeAssessment: 'matched_expected',
        previousClassification: 'inference',
        calibratedClassification: 'verified',
        createdBy: 'user_1',
      })],
    });
    expect(attribution?.evidenceRefs).toEqual([expect.objectContaining({ sourceType: 'play_execution_event' })]);
  });

  it('records unknown done execution as observed without auto-fact upgrade', () => {
    const result = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: {
        evidenceIds: [],
        sourceIds: [],
        sourceTypes: [],
        confidence: 0.5,
        contradictions: [],
        tensions: [],
        rationale: 'old',
        traces: [],
        generatedAt: '2026-05-01T00:00:00.000Z',
        fieldEvidenceAttributions: [{ field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [], gaps: [], rationale: 'expected outcome 是推断' }],
      },
      stepIndex: 0,
      executionStatus: 'done',
      outcomeAssessment: 'unknown',
      sourceRef,
      occurredAt: '2026-05-06T06:00:00.000Z',
    });

    const attribution = result.attributions.find((item) => item.field === 'steps[0].expectedOutcome');
    expect(attribution?.classification).toBe('mixed');
    expect(attribution?.classification).not.toBe('fact');
    expect(attribution?.calibrations?.[0]).toMatchObject({ calibratedClassification: 'observed', outcomeAssessment: 'unknown' });
  });

  it('marks blocked execution as mixed/gap and invalidated execution as gap with calibration history', () => {
    const blocked = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: { fieldEvidenceAttributions: [{ field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [], gaps: [], rationale: 'old' }] },
      stepIndex: 0,
      executionStatus: 'blocked',
      outcomeAssessment: 'blocked',
      sourceRef,
      occurredAt: '2026-05-06T06:00:00.000Z',
    });
    expect(blocked.attributions.find((item) => item.field === 'steps[0].expectedOutcome')).toMatchObject({
      classification: 'mixed',
      calibrations: [expect.objectContaining({ calibratedClassification: 'blocked' })],
    });

    const invalidated = applyStrategicPlayAttributionCalibration({
      evidenceProvenance: { fieldEvidenceAttributions: [{ field: 'steps[0].expectedOutcome', classification: 'inference', evidenceRefs: [], gaps: [], rationale: 'old' }] },
      stepIndex: 0,
      executionStatus: 'invalidated',
      outcomeAssessment: 'invalidated',
      sourceRef,
      occurredAt: '2026-05-06T06:00:00.000Z',
    });
    expect(invalidated.attributions.find((item) => item.field === 'steps[0].expectedOutcome')).toMatchObject({
      classification: 'gap',
      calibrations: [expect.objectContaining({ calibratedClassification: 'invalidated' })],
    });
  });
});
