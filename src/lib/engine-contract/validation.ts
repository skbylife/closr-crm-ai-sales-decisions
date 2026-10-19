import type { EngineStrategicPlayInput, EngineStrategicPlayResult } from './dto';
type Check = (x: unknown) => boolean;
const str: Check = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 8192;
const id: Check = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x);
const choice = (...values: string[]): Check => x => typeof x === 'string' && values.includes(x);
const arr = (check: Check, max = 32): Check => x => Array.isArray(x) && x.length <= max && x.every(check);
const optional = (check: Check): Check => x => x === undefined || check(x);
function object(fields: Record<string, Check>): Check {
  return x => typeof x === 'object' && x !== null && !Array.isArray(x)
    && Object.keys(x).every(key => Object.hasOwn(fields, key))
    && Object.entries(fields).every(([key, check]) => check((x as Record<string, unknown>)[key]));
}
const scope = { orgId: id, accountId: id, opportunityId: optional(id) };
const judgment = object({ ...scope, id, dimension: choice('commercial','relationship','process','competition','evidence','progression','finance','security','rfp'), answer: str, status: choice('proposed','accepted','challenged','revised','invalidated','confirmed'), confidence: x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1, impact: choice('low','medium','high','critical'), supportEvidenceIds: arr(id), counterEvidenceIds: arr(id), missingEvidence: arr(str), rationale: str });
const gap = object({ ...scope, id, dimension: str, currentState: str, desiredState: str, impact: str, linkedJudgmentIds: arr(id), evidenceGap: str, status: choice('open','addressed','invalidated','accepted_risk') });
const move = object({ ...scope, id, winGapId: id, intent: str, targetPerson: str, ask: str, expectedJudgmentDelta: str, successTest: str, failureTest: str, status: choice('proposed','approved','in_progress','done','failed','skipped'), approvalRequired: x => typeof x === 'boolean' });
const input = object({ ...scope, playGoal: optional(str), judgments: arr(judgment, 8), winGaps: arr(gap, 8) });
const result = object({ ...scope, schemaVersion: choice('closr_judgment_engine_v1'), judgments: arr(judgment, 8), winGaps: arr(gap, 8), moves: arr(move, 64) });
function assertScope(value: EngineStrategicPlayInput | EngineStrategicPlayResult) {
  const rows = [...value.judgments, ...value.winGaps, ...('moves' in value ? value.moves : [])];
  if (rows.some(row => row.orgId !== value.orgId || row.accountId !== value.accountId || row.opportunityId !== value.opportunityId)) throw new Error('invalid_scope');
  const ids = value.judgments.map(row => row.id);
  const gaps = value.winGaps.map(row => row.id);
  if (new Set(ids).size !== ids.length || new Set(gaps).size !== gaps.length || value.winGaps.some(row => row.linkedJudgmentIds.some(key => !ids.includes(key)))) throw new Error('invalid_references');
  if ('moves' in value && value.moves.some(row => !gaps.includes(row.winGapId))) throw new Error('invalid_references');
}
export function parseInput(value: unknown): EngineStrategicPlayInput {
  if (!input(value)) throw new Error('invalid_input');
  const typed = value as EngineStrategicPlayInput;
  if (!typed.judgments.length || !typed.winGaps.length) throw new Error('invalid_input');
  assertScope(typed);
  return typed;
}
export function parseResult(value: unknown): EngineStrategicPlayResult {
  if (!result(value)) throw new Error('invalid_result');
  const typed = value as EngineStrategicPlayResult;
  assertScope(typed);
  return typed;
}
export async function readBounded(stream: ReadableStream<Uint8Array> | null, limit = 131072): Promise<string> {
  if (!stream) throw new Error('empty_body');
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
