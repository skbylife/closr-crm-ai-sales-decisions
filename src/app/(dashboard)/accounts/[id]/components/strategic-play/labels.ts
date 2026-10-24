import { Target, ArrowRight, Users, Zap, Shield, AlertTriangle, RotateCcw, Crown, Network, Building2, ShieldCheck, Settings2 } from 'lucide-react';
import { STRATEGIC_GOAL_LABELS } from '@/lib/babel-engine/types';
import { displayText } from './text';
import type {
  Contact,
  StrategicGoalType,
  PlayStatus,
  PlayReview,
} from '@/lib/babel-engine/types';

// ─── Constants ──────────────────────────────────────────────────────

export const GOAL_ICONS: Record<StrategicGoalType, typeof Target> = {
  reach_key_person: Target,
  remove_blocker: Shield,
  create_urgency: Zap,
  block_competitor: AlertTriangle,
  expand_deal: ArrowRight,
  reactivate: RotateCcw,
  build_relationship: Users,
  build_executive_relationship: Crown,
  expand_network: Network,
  org_mapping: Building2,
  competitive_defense: ShieldCheck,
  custom: Settings2,
};

export const STATUS_CONFIG: Record<string, { label: string; icon: string; style: string }> = {
  pending: { label: '计划中', icon: '⏳', style: 'text-secondary' },
  planned: { label: '计划中', icon: '⏳', style: 'text-secondary' },
  in_progress: { label: '执行中', icon: '🔄', style: 'text-accent' },
  completed: { label: '已完成', icon: '✅', style: 'text-positive' },
  done: { label: '已完成', icon: '✅', style: 'text-positive' },
  skipped: { label: '已跳过', icon: '⏭️', style: 'text-muted line-through' },
  blocked: { label: '受阻', icon: '🚧', style: 'text-warning' },
  invalidated: { label: '打法失效', icon: '⚠️', style: 'text-danger' },
};

export const PLAY_STATUS_CONFIG: Record<PlayStatus, { label: string; style: string }> = {
  active: { label: '活跃', style: 'bg-accent text-white' },
  in_progress: { label: '执行中', style: 'bg-blue-600 text-white' },
  completed: { label: '已完成', style: 'bg-positive text-white' },
  abandoned: { label: '已放弃', style: 'bg-neutral-600 text-white' },
};

export const STATUS_LABEL_EN: Record<string, string> = {
  pending: 'Planned',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  done: 'Completed',
  skipped: 'Skipped',
  blocked: 'Blocked',
  invalidated: 'Invalidated',
};

export const PLAY_STATUS_LABEL_EN: Record<string, string> = {
  active: 'Active',
  in_progress: 'In progress',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

export const STRATEGIC_GOAL_LABELS_EN: Record<StrategicGoalType, string> = {
  reach_key_person: 'Reach Key Person',
  remove_blocker: 'Remove Blocker',
  create_urgency: 'Create Urgency',
  block_competitor: 'Block Competitor',
  expand_deal: 'Expand Deal Scope',
  reactivate: 'Reactivate',
  build_relationship: 'Build Relationship',
  build_executive_relationship: 'Build Executive Relationship',
  expand_network: 'Expand Network',
  org_mapping: 'Org Mapping',
  competitive_defense: 'Competitive Defense',
  custom: 'Custom',
};

export const MOMENTUM_LABEL_EN: Record<string, string> = {
  active: 'Active',
  stalled: 'Stalled',
  at_risk: 'At risk',
  completed: 'Completed',
};

export const tPlay = (en: boolean, zh: string, english: string) => en ? english : zh;

export function strategicGoalLabel(goalType: StrategicGoalType, en: boolean) {
  return en ? (STRATEGIC_GOAL_LABELS_EN[goalType] ?? STRATEGIC_GOAL_LABELS[goalType]) : STRATEGIC_GOAL_LABELS[goalType];
}

export const CONTACT_ROLE_LABELS: Partial<Record<NonNullable<Contact['role']>, string>> = {
  decision_maker: '决策人',
  economic_buyer: '预算负责人',
  executive_sponsor: '高层支持者',
  champion: '内部推动者',
  coach: '内部教练',
  technical_evaluator: '技术评估人',
  procurement: '采购负责人',
  legal: '法务把关人',
  finance: '财务把关人',
  influencer: '影响者',
  gate_keeper: '入口把关人',
  blocker: '阻力点',
  project_manager: '项目经理',
  it_admin: 'IT 管理人',
  operations: '运营联系人',
  committee_member: '评审委员',
  end_user: '终端用户',
  contact: '联系人',
  unknown: '角色待确认',
};

// ─── Goal type scoping ──────────────────────────────────────────────

export const OPPORTUNITY_GOAL_TYPES: StrategicGoalType[] = [
  'reach_key_person', 'remove_blocker', 'create_urgency',
  'block_competitor', 'expand_deal', 'reactivate',
  'build_relationship', 'custom',
];

export const ACCOUNT_ONLY_GOAL_TYPES: StrategicGoalType[] = [
  'build_executive_relationship', 'expand_network',
  'org_mapping', 'competitive_defense',
];

export function displayContactRole(role?: Contact['role']): string {
  return role ? CONTACT_ROLE_LABELS[role] ?? displayText(role) : '';
}

// ─── Review Constants & Helper ───────────────────────────────────────

export const REVIEW_RESULT_LABELS: Record<PlayReview['result'], string> = {
  achieved: '达成',
  partially_achieved: '部分达成',
  failed: '未达成',
  abandoned: '已放弃',
};

export const REVIEW_RESULT_OPTIONS: { value: PlayReview['result']; label: string }[] = [
  { value: 'achieved', label: '达成' },
  { value: 'partially_achieved', label: '部分达成' },
  { value: 'failed', label: '未达成' },
  { value: 'abandoned', label: '已放弃' },
];

export const REVIEW_RESULT_LABELS_EN: Record<PlayReview['result'], string> = {
  achieved: 'Achieved',
  partially_achieved: 'Partially achieved',
  failed: 'Failed',
  abandoned: 'Abandoned',
};

export function reviewResultLabel(result: PlayReview['result'], en: boolean) {
  return en ? REVIEW_RESULT_LABELS_EN[result] : REVIEW_RESULT_LABELS[result];
}
