import type { PendingAction } from '@/components/chat/ConfirmationCard';
import type { SalesAgentToolName } from '@/lib/agent/tools';
import type {
  PallasActionProposal,
  PallasProposalDraftInput,
  PallasProposalField,
  PallasProposalRiskLevel,
  PallasProposedAction,
} from './types';

const HIGH_RISK_TOOLS = new Set<SalesAgentToolName>([
  'update_deal_stage',
  'update_opportunity',
  'create_opportunity',
  'update_account',
  'update_account_info',
  'update_meddicc',
]);

const MEDIUM_RISK_TOOLS = new Set<SalesAgentToolName>([
  'update_contact',
  'update_contact_profile',
  'create_contact',
  'add_intel',
  'add_discovery_note',
  'record_judgment_feedback',
  'record_win_loss_calibration',
  'record_task_outcome',
]);

export function classifyPallasRisk(actions: Pick<PallasProposedAction, 'toolName'>[]): PallasProposalRiskLevel {
  if (actions.some((action) => HIGH_RISK_TOOLS.has(action.toolName))) return 'high';
  if (actions.some((action) => MEDIUM_RISK_TOOLS.has(action.toolName))) return 'medium';
  return 'low';
}

export function toPallasProposedAction(action: PendingAction): PallasProposedAction | null {
  const fields = action.fields
    .filter((field): field is PallasProposalField =>
      (field.confidence === 'explicit' || field.confidence === 'implied') && !field.isBlocked,
    )
    .map((field) => ({
      field: field.field,
      value: field.value,
      confidence: field.confidence,
      source_quote: field.source_quote,
      needsClarification: field.needsClarification,
      needs_clarification: field.needs_clarification,
    }));

  if (fields.length === 0) return null;

  return {
    toolName: action.toolName as SalesAgentToolName,
    displayName: action.displayName,
    fields,
    requiresConfirmation: true,
    args: action.args,
  };
}

export function toPallasProposedActions(actions: PendingAction[]): PallasProposedAction[] {
  return actions
    .map(toPallasProposedAction)
    .filter((action): action is PallasProposedAction => action !== null);
}

export function createPallasProposalDraft(input: PallasProposalDraftInput): PallasActionProposal {
  const now = (input.now ?? new Date()).toISOString();
  const suffix = Math.random().toString(36).slice(2, 10);

  return {
    id: `draft_${suffix}`,
    orgId: input.orgId,
    userId: input.userId,
    artifactId: input.artifactId ?? null,
    conversationId: input.conversationId,
    context: input.context,
    status: 'draft',
    riskLevel: classifyPallasRisk(input.actions),
    actions: input.actions,
    sourceRefs: input.sourceRefs ?? [],
    createdAt: now,
  };
}
