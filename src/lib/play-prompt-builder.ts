// Play Prompt Builder — 关系图谱 → LLM prompt 格式化
// 从 strategic-play-engine.ts 提取的纯函数，零副作用

import type {
  RelationshipGraph,
  RelationshipNode,
  ContactProfileResult,
} from '@/lib/babel-engine/types';

/**
 * 将关系图谱格式化为 LLM 可读的 Markdown prompt
 * 包含：我方团队、客户方团队（含 Babel Decode 深度画像）、已有联系
 * 截断规则：客户方联系人最多 10 人，优先保留目标人物
 */
export function buildGraphPrompt(graph: RelationshipGraph, targetContactId?: string): string {
  const lines: string[] = [];

  // 关系图谱截断：联系人最多 10 个（优先保留目标人物）
  let cappedTheirTeam = graph.theirTeam;
  if (cappedTheirTeam.length > 10) {
    // 确保目标联系人在列表中
    const target = cappedTheirTeam.find(n => n.contactId === targetContactId);
    const rest = cappedTheirTeam.filter(n => n.contactId !== targetContactId).slice(0, target ? 9 : 10);
    cappedTheirTeam = target ? [target, ...rest] : rest;
  }

  lines.push('## 我方团队');
  for (const node of graph.ourTeam) {
    const levelLabel = node.jobLevel === 0 ? 'AE（销售代表）'
      : node.jobLevel === 1 ? '经理级'
      : node.jobLevel === 2 ? '总监/VP级'
      : (node.jobLevel === 3 || node.jobLevel === 4) ? 'C-Suite'
      : '成员';
    lines.push(`- ${node.name}（${node.title ?? '成员'}）[职级: ${levelLabel}]`);
  }

  lines.push('');
  lines.push(`## 客户方团队${graph.theirTeam.length > 10 ? `（已截断，共 ${graph.theirTeam.length} 人，显示前 10 人）` : ''}`);
  for (const node of cappedTheirTeam) {
    const parts = [`${node.name}`];
    if (node.title) parts.push(node.title);
    if (node.role && node.role !== 'contact') parts.push(`角色: ${node.role}`);
    if (node.decisionStyle) parts.push(`风格: ${node.decisionStyle}`);
    if (node.reportsTo) {
      const manager = graph.theirTeam.find(n => n.contactId === node.reportsTo);
      if (manager) parts.push(`汇报给: ${manager.name}`);
    }
    if (targetContactId && node.contactId === targetContactId) {
      parts.push('⭐ 目标人物');
    }
    lines.push(`- ${parts.join(' | ')}`);

    // Babel Decode 深度画像
    const profile = (node as RelationshipNode & { profile?: ContactProfileResult }).profile;
    if (profile) {
      lines.push(`  📋 深度画像（Babel Decode）：`);
      lines.push(`  - 决策风格: ${profile.decisionStyle.type}（置信度: ${profile.decisionStyle.confidence}%，证据: ${profile.decisionStyle.evidence}）`);
      lines.push(`  - 风险偏好: ${profile.riskAppetite}`);
      lines.push(`  - 沟通特征: 回复速度=${profile.communication.responseSpeed}，篇幅偏好=${profile.communication.lengthPreference}，正式度=${profile.communication.formality}，最佳联系时间=${profile.communication.bestContactTime}`);
      if (profile.positiveTriggers.length > 0) {
        lines.push(`  - ✅ 正面触发点: ${profile.positiveTriggers.join('、')}`);
      }
      if (profile.negativeTriggers.length > 0) {
        lines.push(`  - ❌ 负面触发点: ${profile.negativeTriggers.join('、')}`);
      }
      if (profile.landmines.length > 0) {
        lines.push(`  - 💣 雷区（绝对避免）: ${profile.landmines.join('、')}`);
      }
      if (profile.engagementTips.length > 0) {
        lines.push(`  - 💡 互动建议: ${profile.engagementTips.join('、')}`);
      }
    }
  }

  if (graph.edges.length > 0) {
    lines.push('');
    lines.push('## 已有联系');
    for (const edge of graph.edges) {
      const from = graph.ourTeam.find(n => n.contactId === edge.from);
      const to = graph.theirTeam.find(n => n.contactId === edge.to);
      if (from && to) {
        lines.push(`- ${from.name} ↔ ${to.name}（强度: ${edge.strength}/100，互动: ${edge.interactionCount}次，最近: ${edge.lastInteraction ?? '未知'}）`);
      }
    }
  }

  return lines.join('\n');
}
