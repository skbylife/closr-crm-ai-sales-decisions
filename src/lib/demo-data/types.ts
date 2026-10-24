// ═══════════════════════════════════════════════════════════════════════
// Type definitions for modular demo data
// ═══════════════════════════════════════════════════════════════════════

/**
 * CaseData — the unified shape for each case module's export.
 *
 * All fields use snake_case to match Supabase column names directly.
 * user_id / org_id are NOT included — they are injected at insert time
 * by the withUser() helper in the seed-data route.
 */
export interface CaseData {
  accounts: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  opportunities: Record<string, unknown>[];
  emailDecodes: Record<string, unknown>[];
  intelItems: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  meetingPreps: Record<string, unknown>[];
  discoveryNotes: Record<string, unknown>[];
  strategicPlays: Record<string, unknown>[];
  aiInsights: Record<string, unknown>[];
  activityLogs: Record<string, unknown>[];
  knowledgeItems: Record<string, unknown>[];
  cilClaims: Record<string, unknown>[];
  cilEvidence: Record<string, unknown>[];
  cilPages: Record<string, unknown>[];
  cilOpenQuestions: Record<string, unknown>[];
  aiForecastPoints: Record<string, unknown>[];
  sourceRecords: Record<string, unknown>[];
  knowledgeUpdateLog: Record<string, unknown>[];
  integrationEmails: Record<string, unknown>[];
  channelPartners: Record<string, unknown>[];
  dealRegistrations: Record<string, unknown>[];
}

/** Helper to create an empty CaseData with all arrays initialized */
export function emptyCaseData(): CaseData {
  return {
    accounts: [],
    contacts: [],
    opportunities: [],
    emailDecodes: [],
    intelItems: [],
    tasks: [],
    meetingPreps: [],
    discoveryNotes: [],
    strategicPlays: [],
    aiInsights: [],
    activityLogs: [],
    knowledgeItems: [],
    cilClaims: [],
    cilEvidence: [],
    cilPages: [],
    cilOpenQuestions: [],
    aiForecastPoints: [],
    sourceRecords: [],
    knowledgeUpdateLog: [],
    integrationEmails: [],
    channelPartners: [],
    dealRegistrations: [],
  };
}

/** Merge multiple CaseData objects into one by flatMapping every array */
export function mergeCaseData(...cases: CaseData[]): CaseData {
  return {
    accounts: cases.flatMap(c => c.accounts),
    contacts: cases.flatMap(c => c.contacts),
    opportunities: cases.flatMap(c => c.opportunities),
    emailDecodes: cases.flatMap(c => c.emailDecodes),
    intelItems: cases.flatMap(c => c.intelItems),
    tasks: cases.flatMap(c => c.tasks),
    meetingPreps: cases.flatMap(c => c.meetingPreps),
    discoveryNotes: cases.flatMap(c => c.discoveryNotes),
    strategicPlays: cases.flatMap(c => c.strategicPlays),
    aiInsights: cases.flatMap(c => c.aiInsights),
    activityLogs: cases.flatMap(c => c.activityLogs),
    knowledgeItems: cases.flatMap(c => c.knowledgeItems),
    cilClaims: cases.flatMap(c => c.cilClaims),
    cilEvidence: cases.flatMap(c => c.cilEvidence),
    cilPages: cases.flatMap(c => c.cilPages),
    cilOpenQuestions: cases.flatMap(c => c.cilOpenQuestions),
    aiForecastPoints: cases.flatMap(c => c.aiForecastPoints),
    sourceRecords: cases.flatMap(c => c.sourceRecords),
    knowledgeUpdateLog: cases.flatMap(c => c.knowledgeUpdateLog),
    integrationEmails: cases.flatMap(c => c.integrationEmails),
    channelPartners: cases.flatMap(c => c.channelPartners),
    dealRegistrations: cases.flatMap(c => c.dealRegistrations),
  };
}
