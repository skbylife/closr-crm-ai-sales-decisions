import type { CoverageAssignment, CoverageGap, NextBestMove, RelationshipContact, RelationshipEdge, RelationshipTeamMember } from './types';

const KEY_ROLE_LABELS: Record<string, string> = {
  economic_buyer: '预算负责人',
  decision_maker: '决策负责人',
  executive_sponsor: '高层支持者',
  technical_evaluator: '技术评估者',
  procurement: '采购负责人',
  legal: '法务把关人',
  finance: '财务把关人',
};

function priorityFromSeverity(severity: CoverageGap['severity']): NextBestMove['priority'] {
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'medium';
  return 'low';
}

function ownerFallback(params: {
  gapOwnerId?: string | null;
  assignments: CoverageAssignment[];
  edges: RelationshipEdge[];
  ourTeam: RelationshipTeamMember[];
}): string | null {
  if (params.gapOwnerId) return params.gapOwnerId;
  const strongest = params.edges.find((edge) => edge.fromUserId && edge.relationshipStatus !== 'unknown' && edge.relationshipStatus !== 'none');
  if (strongest?.fromUserId) return strongest.fromUserId;
  const assignmentOwner = params.assignments.find((assignment) => assignment.primaryUserId || assignment.backupUserId);
  if (assignmentOwner?.primaryUserId || assignmentOwner?.backupUserId) return assignmentOwner.primaryUserId ?? assignmentOwner.backupUserId;
  return params.ourTeam[0]?.userId ?? null;
}

export function buildNextBestMoves(params: {
  contacts: RelationshipContact[];
  assignments: CoverageAssignment[];
  edges: RelationshipEdge[];
  gaps: CoverageGap[];
  staleRelationships: RelationshipEdge[];
  ourTeam: RelationshipTeamMember[];
}): NextBestMove[] {
  const contactsById = new Map(params.contacts.map((contact) => [contact.id, contact]));
  const assignmentsByContact = new Map(params.assignments.map((assignment) => [assignment.contactId, assignment]));
  const edgesByContact = new Map<string, RelationshipEdge[]>();
  for (const edge of params.edges) {
    const list = edgesByContact.get(edge.toContactId) ?? [];
    list.push(edge);
    edgesByContact.set(edge.toContactId, list.sort((a, b) => b.strength - a.strength));
  }

  const moves: NextBestMove[] = [];

  for (const gap of params.gaps) {
    const contact = contactsById.get(gap.contactId);
    const relatedEdges = edgesByContact.get(gap.contactId) ?? [];
    const assignment = assignmentsByContact.get(gap.contactId) ?? null;
    const ownerId = ownerFallback({
      gapOwnerId: gap.recommendedOwnerId,
      assignments: params.assignments,
      edges: relatedEdges,
      ourTeam: params.ourTeam,
    });

    if (gap.kind === 'no_owner') {
      moves.push({
        id: `move:${gap.contactId}:coverage-owner`,
        kind: 'coverage_gap',
        priority: 'high',
        ownerUserId: ownerId,
        targetContactId: gap.contactId,
        reason: `${contact?.name ?? '该联系人'} 当前没有明确关系负责人，不能被当作可信覆盖。`,
        evidenceRefs: gap.evidenceRefs,
        goal: `为 ${contact?.name ?? '该联系人'} 指定关系负责人，并完成一次低风险确认。`,
        todo: 'TODO: 后续接 Task 创建；当前先在关系智能中展示。',
      });
      continue;
    }

    if (gap.kind === 'unknown_relationship') {
      moves.push({
        id: `move:${gap.contactId}:relationship-check`,
        kind: 'coverage_gap',
        priority: priorityFromSeverity(gap.severity),
        ownerUserId: ownerId,
        targetContactId: gap.contactId,
        reason: `${contact?.name ?? '该联系人'} 有覆盖意图，但缺少证据支撑，状态保持未知。`,
        evidenceRefs: gap.evidenceRefs,
        goal: `请 ${ownerId ? '关系负责人' : '团队负责人'} 确认是否存在真实互动、技术信任或可引荐关系。`,
        todo: 'TODO: 可接入关系校正 / 任务创建。',
      });
      continue;
    }

    if (gap.kind === 'thin_evidence') {
      moves.push({
        id: `move:${gap.contactId}:evidence-review`,
        kind: 'thin_evidence',
        priority: 'low',
        ownerUserId: ownerId,
        targetContactId: gap.contactId,
        reason: `${contact?.name ?? '该联系人'} 只有少量证据，建议复核后再依赖。`,
        evidenceRefs: gap.evidenceRefs,
        goal: '补充最近互动摘要或会议依据，让关系判断可审计。',
        todo: 'TODO: 可接入 Evidence correction。',
      });
      continue;
    }

    if (gap.kind === 'stale_relationship') {
      moves.push({
        id: `move:${gap.contactId}:refresh`,
        kind: 'stale_relationship',
        priority: priorityFromSeverity(gap.severity),
        ownerUserId: ownerId ?? assignment?.primaryUserId ?? null,
        targetContactId: gap.contactId,
        reason: `${contact?.name ?? '该联系人'} 的关系证据已过期，强关系不能直接调用。`,
        evidenceRefs: gap.evidenceRefs,
        goal: '用具体业务问题重新触达，确认关系是否仍可被可信调用。',
        todo: 'TODO: 可接入 follow-up task。',
      });
    }
  }

  for (const edge of params.staleRelationships.slice(0, 5)) {
    if (moves.some((move) => move.targetContactId === edge.toContactId && move.kind === 'stale_relationship')) continue;
    const contact = contactsById.get(edge.toContactId);
    moves.push({
      id: `move:${edge.toContactId}:${edge.fromUserId ?? 'unknown'}:stale-edge`,
      kind: 'stale_relationship',
      priority: edge.strength >= 55 ? 'medium' : 'low',
      ownerUserId: edge.fromUserId,
      targetContactId: edge.toContactId,
      reason: `${contact?.name ?? '该联系人'} 曾有关系证据，但最近互动已过期。`,
      evidenceRefs: edge.evidenceRefs,
      goal: '让原关系人重新建立上下文，而不是直接假设关系仍然有效。',
      todo: 'TODO: 可接 Task / 邮件草稿。',
    });
  }

  const coveredRoles = new Set(params.contacts
    .filter((contact) => (edgesByContact.get(contact.id) ?? []).some((edge) => edge.relationshipStatus !== 'unknown' && edge.relationshipStatus !== 'none'))
    .map((contact) => contact.role)
    .filter((role): role is string => Boolean(role)));

  for (const role of ['economic_buyer', 'decision_maker', 'technical_evaluator', 'procurement']) {
    if (coveredRoles.has(role)) continue;
    const contact = params.contacts.find((item) => item.role === role) ?? null;
    moves.push({
      id: `move:missing-role:${role}`,
      kind: 'missing_key_role',
      priority: role === 'decision_maker' || role === 'economic_buyer' ? 'high' : 'medium',
      ownerUserId: ownerFallback({ assignments: params.assignments, edges: params.edges, ourTeam: params.ourTeam }),
      targetContactId: contact?.id ?? null,
      reason: `${KEY_ROLE_LABELS[role]} 缺少可验证关系覆盖。`,
      evidenceRefs: contact ? (edgesByContact.get(contact.id)?.flatMap((edge) => edge.evidenceRefs).slice(0, 4) ?? []) : [],
      goal: contact ? `确认 ${contact.name} 是否应由现有团队成员建立可信连接。` : `识别客户内部的${KEY_ROLE_LABELS[role]}，并建立证据链。`,
      todo: 'TODO: 可接入联系人补全 / 关系路径推荐。',
    });
  }

  return moves
    .filter((move, index, all) => all.findIndex((item) => item.id === move.id) === index)
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]))
    .slice(0, 8);
}
