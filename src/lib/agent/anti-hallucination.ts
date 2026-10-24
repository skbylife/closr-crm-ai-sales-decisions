/**
 * 防幻觉验证层 (Anti-Hallucination Layer)
 *
 * 三层防护：
 * 1. 拒绝 inferred 字段写入（AI 自行推断的事实）
 * 2. 非 explicit 字段检查 source_quote 是否存在
 * 3. 所有写操作必须经过用户确认（前端渲染确认卡片）
 */

export type Confidence = 'explicit' | 'implied' | 'inferred';

export interface ExtractedField {
  field: string;
  value: string | null;
  confidence: Confidence;
  source_quote: string; // 必填，用户原话
  needs_clarification?: string; // 有歧义时的说明
}

export interface ToolCallValidation {
  toolName: string;
  displayName?: string;
  args: Record<string, unknown>;
  fields: ExtractedField[];
  requiresConfirmation: boolean;
  blockedFields: ExtractedField[]; // inferred 字段，禁止写入
  missingSourceQuotes: string[]; // 没有 source_quote 的字段名
}

/**
 * 从 tool call 的 args 中提取 ExtractedField 列表
 * 支持顶层字段或 fields 数组两种格式
 */
function extractFields(args: Record<string, unknown>): ExtractedField[] {
  // 如果 args 中直接带有 confidence 和 source_quote，视为单字段调用
  if (typeof args.confidence === 'string' && typeof args.source_quote === 'string') {
    const field = (args.field as string) ?? 'value';
    const value = args.value !== undefined ? String(args.value) : null;
    return [
      {
        field,
        value,
        confidence: args.confidence as Confidence,
        source_quote: args.source_quote as string,
        needs_clarification: args.needs_clarification as string | undefined,
      },
    ];
  }

  // 如果 args 中有 fields 数组（多字段批量更新）
  if (Array.isArray(args.fields)) {
    return args.fields as ExtractedField[];
  }

  // 兜底：对每个 non-meta key 生成一个 explicit 字段（无 source_quote）
  const metaKeys = new Set(['opportunityId', 'contactId', 'accountId', 'conversation_id']);
  return Object.entries(args)
    .filter(([k]) => !metaKeys.has(k))
    .map(([k, v]) => ({
      field: k,
      value: v !== null && v !== undefined ? String(v) : null,
      confidence: 'explicit' as Confidence,
      source_quote: '', // 空 source_quote，会被 missingSourceQuotes 捕获
    }));
}

/**
 * 验证 tool call
 *
 * 规则：
 * 1. confidence = 'inferred' → 移入 blockedFields，不允许写入
 * 2. 非 explicit 字段检查 source_quote，缺失记入 missingSourceQuotes
 * 3. 所有写操作一律需要用户确认（requiresConfirmation 恒为 true）
 */
export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>
): ToolCallValidation {
  const allFields = extractFields(args);
  const blockedFields: ExtractedField[] = [];
  const allowedFields: ExtractedField[] = [];
  const missingSourceQuotes: string[] = [];

  for (const field of allFields) {
    if (field.confidence === 'inferred') {
      blockedFields.push(field);
      continue;
    }

    // explicit = 用户主动陈述，跳过 source_quote 验证
    // implied = AI 从上下文推断，需要 source_quote
    if (field.confidence !== 'explicit') {
      if (!field.source_quote || field.source_quote.trim() === '') {
        missingSourceQuotes.push(field.field);
      }
    }

    allowedFields.push(field);
  }

  return {
    toolName,
    displayName: toolName,
    args,
    fields: allowedFields,
    // 🔒 所有写操作必须经过用户确认，无例外
    requiresConfirmation: true,
    blockedFields,
    missingSourceQuotes,
  };
}

