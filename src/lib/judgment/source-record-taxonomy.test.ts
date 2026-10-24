import { describe, expect, it } from 'vitest';
import {
  AI_INSIGHT_NON_AUTHORITATIVE_METADATA,
  assertAllowedSourceRecordKinds,
  getSourceRecordKindDefinition,
  isAllowedSourceRecordKind,
  isAuthoritativeJudgmentSource,
  markAIInsightAsNonAuthoritative,
} from './source-record-taxonomy';

describe('source_records taxonomy', () => {
  it('accepts active trace kinds used by judgment pattern readers', () => {
    expect(isAllowedSourceRecordKind('manager_intervention')).toBe(true);
    expect(isAllowedSourceRecordKind('executive_intervention')).toBe(true);
    expect(isAllowedSourceRecordKind('intervention_outcome')).toBe(true);

    expect(() => assertAllowedSourceRecordKinds([
      'manager_intervention',
      'executive_intervention',
      'intervention_outcome',
    ], 'judgment-patterns')).not.toThrow();
  });

  it('separates authoritative traces from derived/legacy/cache-like sources', () => {
    expect(isAuthoritativeJudgmentSource({ sourceKind: 'email_decode', sourceTable: 'email_decodes' })).toBe(true);
    expect(isAuthoritativeJudgmentSource({ sourceKind: 'judgment_memory', sourceTable: 'source_records' })).toBe(false);
    expect(isAuthoritativeJudgmentSource({ sourceKind: 'email_decode', sourceTable: 'ai_insights' })).toBe(false);
    expect(getSourceRecordKindDefinition('email').writePolicy).toBe('legacy_read_only');
  });

  it('documents meeting_prep as the registry kind for meeting evidence traces', () => {
    const definition = getSourceRecordKindDefinition('meeting_prep');

    expect(definition.authority).toBe('authoritative_trace');
    expect(definition.writePolicy).toBe('active');
    expect(definition.description).toContain('meeting prep');
    expect(definition.description).toContain('meeting recording');
    expect(definition.description).toContain('call transcript');
  });

  it('marks ai_insights payloads as cache/display material, not judgment memory', () => {
    const marked = markAIInsightAsNonAuthoritative({ patterns: [], recommendations: 'sample' });

    expect(marked.__closrAuthority).toEqual(AI_INSIGHT_NON_AUTHORITATIVE_METADATA);
    expect(marked.__closrAuthority.authoritativeForJudgmentMemory).toBe(false);
  });

  it('throws on unsupported new source kind labels', () => {
    expect(() => assertAllowedSourceRecordKinds(['ai_generated_strategy'], 'new-writer')).toThrow(
      'new-writer uses unsupported source_records.source_kind: ai_generated_strategy',
    );
  });
});
