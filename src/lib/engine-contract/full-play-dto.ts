// Candidate wire contract only. No prompts, rules, source records or model traces.
export type FullPlayRequest = {
  accountId: string;
  goalType: string;
  goalDescription: string;
  targetContactId?: string;
  opportunityId?: string;
  successCriteria?: string;
};
export type FullPlayResponse = {
  orgId: string;
  accountId: string;
  situationJudgment: string;
  strategicObjective: string;
  confidence: number;
  steps: { title: string; description: string; status: string }[];
};

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const goalTypes = new Set(['reach_key_person','remove_blocker','create_urgency','block_competitor','expand_deal','reactivate','build_relationship','build_executive_relationship','expand_network','org_mapping','competitive_defense','custom']);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function parseFullPlayRequest(value: unknown): FullPlayRequest {
  if (!record(value) || Object.keys(value).some(key => !['accountId','goalType','goalDescription','targetContactId','opportunityId','successCriteria'].includes(key)) ||
      !id(value.accountId) || !goalTypes.has(String(value.goalType)) || !text(value.goalDescription, 4096) ||
      (value.targetContactId !== undefined && !id(value.targetContactId)) ||
      (value.opportunityId !== undefined && !id(value.opportunityId)) ||
      (value.successCriteria !== undefined && !text(value.successCriteria, 2048))) throw new Error('invalid_input');
  return value as FullPlayRequest;
}
export function projectFullPlayResult(raw: unknown, orgId: string, accountId: string): FullPlayResponse {
  if (!record(raw) || !text(raw.situationJudgment, 8192) || !text(raw.strategicObjective, 8192) ||
      typeof raw.confidence !== 'number' || !Number.isFinite(raw.confidence) || raw.confidence < 0 || raw.confidence > 1 ||
      !Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > 20) throw new Error('invalid_result');
  const steps = raw.steps.map(value => {
    if (!record(value) || !text(value.title, 512) || !text(value.description, 4096) ||
        !text(value.status, 32)) throw new Error('invalid_result');
    return { title: value.title, description: value.description, status: value.status };
  });
  return { orgId, accountId, situationJudgment: raw.situationJudgment,
    strategicObjective: raw.strategicObjective, confidence: raw.confidence, steps };
}
