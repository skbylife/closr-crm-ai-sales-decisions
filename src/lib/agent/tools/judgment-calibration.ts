import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getOrgIdForUser } from '@/lib/get-org-id';
import type { ToolResult } from './types';
import {
  buildJudgmentFeedbackSourceRecord,
  buildRevisedJudgmentPreview,
  parseJudgmentFeedbackOnly,
} from '@/lib/judgment/feedback';
import {
  buildWinLossCalibrationSourceRecord,
  parseWinLossCalibration,
  type WinLossOutcome,
} from '@/lib/judgment/win-loss-calibration';

export type { ToolResult };

export interface RecordJudgmentFeedbackArgs {
  accountId: string;
  targetType?: string | null;
  targetId?: string | null;
  kind?: string | null;
  content: string;
  previousSummary?: string | null;
  source_quote: string;
  conversation_id?: string;
}

export interface RecordWinLossCalibrationArgs {
  accountId: string;
  opportunityId?: string | null;
  outcome: WinLossOutcome;
  notes: string;
  previousJudgment?: string | null;
  previousRisk?: string | null;
  previousNextAction?: string | null;
  source_quote: string;
  conversation_id?: string;
}

async function resolveAuthenticatedScope(): Promise<{ userId: string; orgId: string } | { error: ToolResult }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { success: false, message: '未登录，无法记录校准' } };

  const orgId = await getOrgIdForUser(user.id);
  if (!orgId) return { error: { success: false, message: '无法确定用户所属组织，已拒绝写入' } };
  return { userId: user.id, orgId };
}

async function accountBelongsToOrg(params: { accountId: string; orgId: string }): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin
    .from('accounts')
    .select('id')
    .eq('id', params.accountId)
    .eq('org_id', params.orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function opportunityBelongsToAccount(params: { opportunityId: string; accountId: string; orgId: string }): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin
    .from('opportunities')
    .select('id, account_id')
    .eq('id', params.opportunityId)
    .eq('org_id', params.orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data && data.account_id === params.accountId);
}

export async function executeRecordJudgmentFeedback(args: RecordJudgmentFeedbackArgs): Promise<ToolResult> {
  const scope = await resolveAuthenticatedScope();
  if ('error' in scope) return scope.error;
  const admin = getSupabaseAdmin();
  if (!admin) return { success: false, message: '数据库暂时不可用，无法记录校准' };

  if (!args.accountId || !args.content?.trim()) {
    return { success: false, message: '缺少必要参数：客户或修正内容' };
  }
  if (!await accountBelongsToOrg({ accountId: args.accountId, orgId: scope.orgId })) {
    return { success: false, message: '客户不存在或不属于当前组织，已拒绝写入' };
  }

  const now = new Date().toISOString();
  const feedbackId = crypto.randomUUID();
  const parsed = parseJudgmentFeedbackOnly({
    accountId: args.accountId,
    targetType: args.targetType || 'judgment',
    targetId: args.targetId || `account:${args.accountId}`,
    kind: args.kind || 'inaccurate',
    content: args.content,
    scope: 'account',
  }, {
    id: feedbackId,
    accountId: args.accountId,
    orgId: scope.orgId,
    createdBy: scope.userId,
    createdAt: now,
  });

  if (!parsed.ok) return { success: false, message: parsed.error };

  const revisedPreview = buildRevisedJudgmentPreview({
    kind: parsed.feedback.kind,
    targetType: parsed.feedback.targetType,
    previousSummary: args.previousSummary,
    content: parsed.feedback.content,
    scope: parsed.feedback.scope,
  });

  const row = buildJudgmentFeedbackSourceRecord({
    orgId: scope.orgId,
    feedback: parsed.feedback,
    revisedPreview,
    revisionStatus: 'ready',
    previousSummary: args.previousSummary,
  });

  const { error } = await admin.from('source_records').insert(row);
  if (error) return { success: false, message: `记录判断修正失败：${error.message}` };

  return {
    success: true,
    message: '已记录为当前客户的判断修正，后续回答会优先参考这条反馈。',
    data: { accountId: args.accountId, feedbackId },
  };
}

export async function executeRecordWinLossCalibration(args: RecordWinLossCalibrationArgs): Promise<ToolResult> {
  const scope = await resolveAuthenticatedScope();
  if ('error' in scope) return scope.error;
  const admin = getSupabaseAdmin();
  if (!admin) return { success: false, message: '数据库暂时不可用，无法记录成交/丢单复盘' };

  if (!args.accountId || !args.outcome || !args.notes?.trim()) {
    return { success: false, message: '缺少必要参数：客户、结果或原因' };
  }
  if (!await accountBelongsToOrg({ accountId: args.accountId, orgId: scope.orgId })) {
    return { success: false, message: '客户不存在或不属于当前组织，已拒绝写入' };
  }
  if (args.opportunityId && !await opportunityBelongsToAccount({ opportunityId: args.opportunityId, accountId: args.accountId, orgId: scope.orgId })) {
    return { success: false, message: '商机不属于当前客户，已拒绝写入' };
  }

  const now = new Date().toISOString();
  const calibrationId = crypto.randomUUID();
  const parsed = parseWinLossCalibration({
    id: calibrationId,
    accountId: args.accountId,
    opportunityId: args.opportunityId || undefined,
    outcome: args.outcome,
    outcomeAt: now,
    notes: args.notes,
    previousJudgment: args.previousJudgment || undefined,
    previousRisk: args.previousRisk || undefined,
    previousNextAction: args.previousNextAction || undefined,
  }, {
    id: calibrationId,
    accountId: args.accountId,
    orgId: scope.orgId,
    createdBy: scope.userId,
    createdAt: now,
  });

  if (!parsed.ok) return { success: false, message: parsed.error };

  const row = buildWinLossCalibrationSourceRecord({
    orgId: scope.orgId,
    calibration: parsed.calibration,
  });

  const { error } = await admin.from('source_records').insert(row);
  if (error) return { success: false, message: `记录成交/丢单复盘失败：${error.message}` };

  return {
    success: true,
    message: '已记录为当前客户的成交/丢单复盘，后续判断会参考这条结果。',
    data: { accountId: args.accountId, opportunityId: args.opportunityId, calibrationId },
  };
}
