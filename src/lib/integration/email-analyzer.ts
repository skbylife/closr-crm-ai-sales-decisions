/**
 * Email Analyzer — LLM 邮件分析
 *
 * 使用项目已有的 callAI 接口分析邮件。
 * 不存原文，只存分析结果。
 */

import { callAI } from '@/lib/babel-engine/gemini';

// ─── Types ──────────────────────────────────────────────────────────

export interface EmailAnalysis {
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  intent: string;
  keyInfo: string[];
}

// ─── Analyzer ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `你是一个邮件分析助手。根据邮件的主题、摘要和发件人信息，提取关键信息。

你的任务：
1. 用一句话概括邮件核心内容
2. 判断情绪：positive（积极/合作意向/推进）、negative（消极/拒绝/推迟）、neutral（中性/信息传递）
3. 判断意图分类：询价、跟进、拒绝、安排会议、合同相关、信息分享、需求确认、技术讨论、投诉、其他
4. 提取关键信息点（日期、金额、人名、决策、时间线等）

返回 JSON 格式，字段：summary, sentiment, intent, keyInfo（数组）

所有输出必须为中文。`;

export async function analyzeEmail(
  subject: string,
  bodyPreview: string,
  from: string,
  context?: { accountName?: string; contactName?: string },
): Promise<EmailAnalysis> {
  const contextInfo = context
    ? `\n关联客户: ${context.accountName ?? '未知'}\n联系人: ${context.contactName ?? '未知'}`
    : '';

  // 截断 body 到 2000 字符，避免 token 浪费
  const truncatedBody = bodyPreview.length > 2000 ? bodyPreview.slice(0, 2000) + '…' : bodyPreview;

  const userPrompt = `请分析以下邮件：

主题: ${subject}
发件人: ${from}
邮件摘要: ${truncatedBody}${contextInfo}`;

  const result = await callAI<EmailAnalysis>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    tier: 'flash',
    temperature: 0.3,
  });

  // 验证并规范化返回值
  return {
    summary: result.summary || '无法解析',
    sentiment: (['positive', 'negative', 'neutral'].includes(result.sentiment)
      ? result.sentiment
      : 'neutral') as EmailAnalysis['sentiment'],
    intent: result.intent || '其他',
    keyInfo: Array.isArray(result.keyInfo) ? result.keyInfo : [],
  };
}
