import type { SalesAgentToolName } from '@/lib/agent/tools';

export type PallasJson =
  | string
  | number
  | boolean
  | null
  | PallasJson[]
  | { [key: string]: PallasJson };

export type PallasArtifactKind =
  | 'customer_research_card'
  | 'strategic_play_action_board'
  | 'communication_draft_preview'
  | 'evidence_pack'
  | 'ask_data_result';

export type PallasEntityType =
  | 'account'
  | 'contact'
  | 'opportunity'
  | 'strategic_play'
  | 'task'
  | 'global';

export type PallasProposalRiskLevel = 'low' | 'medium' | 'high' | 'external';

export type PallasProposalStatus =
  | 'draft'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'expired';

export type PallasToolRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface PallasEntityContext {
  entityType: PallasEntityType;
  entityId: string | null;
  accountId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  strategicPlayId?: string | null;
}

export interface PallasSourceRef {
  kind: 'user_message' | 'closr_record' | 'external_connector' | 'system';
  label: string;
  quote?: string;
  url?: string;
  entityType?: PallasEntityType;
  entityId?: string;
}

export interface PallasArtifact<TData extends PallasJson = PallasJson> {
  id: string;
  orgId: string;
  userId: string;
  kind: PallasArtifactKind;
  title: string;
  context: PallasEntityContext;
  data: TData;
  sourceRefs: PallasSourceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface PallasArtifactVersion<TData extends PallasJson = PallasJson> {
  id: string;
  artifactId: string;
  version: number;
  data: TData;
  sourceRefs: PallasSourceRef[];
  createdAt: string;
  createdBy: string;
}

export interface PallasProposalField {
  field: string;
  value: string | null;
  confidence: 'explicit' | 'implied';
  source_quote: string;
  needsClarification?: string;
  needs_clarification?: string;
}

export interface PallasProposedAction {
  toolName: SalesAgentToolName;
  displayName: string;
  fields: PallasProposalField[];
  requiresConfirmation: true;
  args?: Record<string, unknown>;
}

export interface PallasActionProposal {
  id: string;
  orgId: string;
  userId: string;
  artifactId: string | null;
  conversationId: string;
  reuseKey?: string | null;
  context: PallasEntityContext;
  status: PallasProposalStatus;
  riskLevel: PallasProposalRiskLevel;
  actions: PallasProposedAction[];
  sourceRefs: PallasSourceRef[];
  createdAt: string;
  expiresAt?: string | null;
  confirmedAt?: string | null;
  confirmedBy?: string | null;
  resultSummary?: string | null;
}

export interface PallasToolRun {
  id: string;
  proposalId: string;
  toolName: SalesAgentToolName;
  status: PallasToolRunStatus;
  input: PallasJson;
  result?: PallasJson;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface PallasProposalDraftInput {
  orgId: string;
  userId: string;
  conversationId: string;
  context: PallasEntityContext;
  artifactId?: string | null;
  actions: PallasProposedAction[];
  sourceRefs?: PallasSourceRef[];
  now?: Date;
}
