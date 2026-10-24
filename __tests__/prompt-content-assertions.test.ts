/**
 * P0: Prompt 内容级可验证断言
 *
 * 1. OCR 提取文本 → emailText 合并 → parseEmailToMessages → decodeMessages prompt
 * 2. Strategy prompt builder: intelItems / tasks / contactDiscType 拼接顺序与截断
 */
import { describe, it, expect } from 'vitest';
import { parseEmailToMessages, mergeOcrTextIntoEmailText, OCR_APPEND_MARKER, buildDecodePrompt } from '@/lib/babel-engine/decode';
import { buildStrategyPrompt } from '@/lib/babel-engine/strategy';
import type { IntelSummaryForStrategy, TaskSummaryForStrategy } from '@/lib/babel-engine/types';

// ─── 1a. mergeOcrTextIntoEmailText — OCR 合并纯函数 ─────────────────

describe('mergeOcrTextIntoEmailText — pure function', () => {
  it('appends OCR text with separator when emailText exists', () => {
    const result = mergeOcrTextIntoEmailText('原始邮件', '图片文字');
    expect(result).toBe(`原始邮件\n\n${OCR_APPEND_MARKER}\n图片文字`);
  });

  it('returns just OCR text when emailText is empty', () => {
    const result = mergeOcrTextIntoEmailText('', '图片文字');
    expect(result).toBe('图片文字');
  });

  it('returns original emailText when OCR text is empty', () => {
    expect(mergeOcrTextIntoEmailText('原始邮件', '')).toBe('原始邮件');
    expect(mergeOcrTextIntoEmailText('原始邮件', undefined)).toBe('原始邮件');
    expect(mergeOcrTextIntoEmailText('原始邮件', '   ')).toBe('原始邮件');
  });

  it('trims OCR text whitespace', () => {
    const result = mergeOcrTextIntoEmailText('邮件', '  图片文字  \n ');
    expect(result).toBe(`邮件\n\n${OCR_APPEND_MARKER}\n图片文字`);
  });
});

// ─── 1b. OCR → emailText → parseEmailToMessages → decode prompt ────

describe('parseEmailToMessages — pure function', () => {
  it('single message (no delimiter) → one "them" message with full text', () => {
    const msgs = parseEmailToMessages('Hello, please send the proposal.');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].speaker).toBe('them');
    expect(msgs[0].text).toBe('Hello, please send the proposal.');
  });

  it('thread with --- delimiter → splits and reverses to chronological', () => {
    const emailText = 'Latest reply from client\n---\nMy earlier response\n---\nOriginal client message';
    const msgs = parseEmailToMessages(emailText);
    expect(msgs.length).toBe(3);
    // Reversed: oldest first
    expect(msgs[0].text).toBe('Original client message');
    expect(msgs[0].speaker).toBe('them');
    expect(msgs[1].text).toBe('My earlier response');
    expect(msgs[1].speaker).toBe('me');
    expect(msgs[2].text).toBe('Latest reply from client');
    expect(msgs[2].speaker).toBe('them');
  });

  it('OCR text appended with "【图片内容（OCR）】" marker is preserved in parsed messages', () => {
    const ocrText = '图片中提取的合同条款内容';
    const emailText = `Subject: Contract Review\n\nPlease review the attached.\n\n【图片内容（OCR）】\n${ocrText}`;
    const msgs = parseEmailToMessages(emailText);
    // The --- delimiter will split the text
    // What matters: OCR text must appear in at least one message
    const allText = msgs.map((m) => m.text).join(' ');
    expect(allText).toContain(ocrText);
  });

  it('OCR-only input (no original emailText) → single message containing OCR text', () => {
    const ocrText = '截图中的聊天记录：客户说下周三前给答复';
    const msgs = parseEmailToMessages(ocrText);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toContain('客户说下周三前给答复');
    expect(msgs[0].speaker).toBe('them');
  });

  it('emailText + OCR merged format flows correctly into buildDecodePrompt', () => {
    const originalEmail = 'Subject: Pricing\n\nCan you send updated pricing?';
    const ocrExtracted = '报价单截图：总价 ¥500,000，有效期至 2026-04-30';
    // This is the exact merge format from the decode route
    const mergedEmailText = mergeOcrTextIntoEmailText(originalEmail, ocrExtracted);

    const messages = parseEmailToMessages(mergedEmailText);
    const allMessageText = messages.map((m) => m.text).join(' ');

    // OCR text must be present in parsed messages
    expect(allMessageText).toContain('报价单截图');
    expect(allMessageText).toContain('¥500,000');

    // Now verify it flows into the decode prompt
    const { user } = buildDecodePrompt({
      messages,
      mode: 'strategic',
      domain: 'b2b_sales',
    });

    // The user prompt must contain the OCR content
    expect(user).toContain('报价单截图');
    expect(user).toContain('¥500,000');
    // And the original email content
    expect(user).toContain('Pricing');
  });
});

// ─── 2. Strategy prompt builder: intelItems / tasks / contactDiscType ──

describe('buildStrategyPrompt — intelItems, tasks, contactDiscType content assertions', () => {
  const baseDecoded = {
    messages: [
      {
        speaker: 'them' as const,
        original: 'We are still evaluating options.',
        decode: { meaning: '仍在比较方案', emotion: '观望', urgency: 5, confidence: 0.8 },
      },
    ],
    threadAnalysis: {
      sentimentTrend: 'stable' as const,
      riskLevel: 'medium' as const,
      buyerState: 'evaluating' as const,
      keySignal: '尚未做出最终决定',
    },
  };

  it('intelItems appear in user prompt with type/urgency/title/summary', () => {
    const intelItems: IntelSummaryForStrategy[] = [
      { title: '竞品降价', summary: 'Oracle 降价 20%', type: 'competitive', date: '2026-04-01', urgency: 'high' },
      { title: '预算批准', summary: '客户 Q2 预算已经批复', type: 'budget', date: '2026-03-28', urgency: 'medium' },
    ];

    const { user } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      intelItems,
    });

    // All intel items present
    expect(user).toContain('竞品降价');
    expect(user).toContain('Oracle 降价 20%');
    expect(user).toContain('预算批准');
    expect(user).toContain('客户 Q2 预算已经批复');
    // Section header
    expect(user).toContain('最新情报');
  });

  it('tasks appear in user prompt with status/priority/due dates', () => {
    const tasks: TaskSummaryForStrategy[] = [
      { title: '发送定制方案', status: 'pending', priority: 'high', dueDate: '2026-04-08', isOverdue: false },
      { title: '跟进法务审批', status: 'done', priority: 'medium', dueDate: '2026-04-01', isOverdue: false },
      { title: '准备 POC 环境', status: 'pending', priority: 'urgent', dueDate: '2026-03-30', isOverdue: true },
    ];

    const { user } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      tasks,
    });

    // Tasks section present
    expect(user).toContain('相关任务执行情况');
    // Active tasks listed by title
    expect(user).toContain('发送定制方案');
    // Completed tasks are only counted, not listed by title
    expect(user).toContain('已完成: 1');
    // Overdue task highlighted
    expect(user).toContain('逾期任务');
    expect(user).toContain('准备 POC 环境');
  });

  it('contactDiscType injects DISC hint into system prompt', () => {
    const { system: systemD } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      contactDiscType: 'D',
    });
    expect(systemD).toContain('D 型（支配型）');
    expect(systemD).toContain('直接、简洁');

    const { system: systemI } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      contactDiscType: 'I',
    });
    expect(systemI).toContain('I 型（影响型）');

    const { system: systemS } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      contactDiscType: 'S',
    });
    expect(systemS).toContain('S 型（稳定型）');

    const { system: systemC } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      contactDiscType: 'C',
    });
    expect(systemC).toContain('C 型（谨慎型）');
  });

  it('no DISC type → no DISC block in system prompt', () => {
    const { system } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
    });
    expect(system).not.toContain('DISC 沟通风格适配');
  });

  it('ordering: threadAnalysis before tasks before intelItems before cilContext in user prompt', () => {
    const intelItems: IntelSummaryForStrategy[] = [
      { title: '情报A', summary: '内容A', type: 'intel', date: '2026-04-01', urgency: 'medium' },
    ];
    const tasks: TaskSummaryForStrategy[] = [
      { title: '任务B', status: 'pending', priority: 'high', dueDate: '2026-04-10', isOverdue: false },
    ];
    const cilContext = '\n\n=== 编译智能层（CIL）上下文 ===\nCIL 内容在此';

    const { user } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      intelItems,
      tasks,
      cilContext,
    });

    const threadPos = user.indexOf('Thread Analysis:');
    const taskPos = user.indexOf('相关任务执行情况');
    const intelPos = user.indexOf('最新情报');
    const cilPos = user.indexOf('编译智能层（CIL）上下文');

    // All must be present
    expect(threadPos).toBeGreaterThan(-1);
    expect(taskPos).toBeGreaterThan(-1);
    expect(intelPos).toBeGreaterThan(-1);
    expect(cilPos).toBeGreaterThan(-1);

    // Verify ordering: thread < tasks < intel < CIL
    expect(threadPos).toBeLessThan(taskPos);
    expect(taskPos).toBeLessThan(intelPos);
    expect(intelPos).toBeLessThan(cilPos);
  });

  it('empty intelItems / tasks → no section headers in user prompt', () => {
    const { user } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      intelItems: [],
      tasks: [],
    });
    expect(user).not.toContain('最新情报');
    expect(user).not.toContain('相关任务执行情况');
  });

  it('many overdue tasks are listed; completed tasks are counted', () => {
    const tasks: TaskSummaryForStrategy[] = [
      { title: '过期任务1', status: 'pending', priority: 'high', dueDate: '2026-03-20', isOverdue: true },
      { title: '过期任务2', status: 'pending', priority: 'urgent', dueDate: '2026-03-22', isOverdue: true, assignedTo: '张三' },
      { title: '已完成任务', status: 'done', priority: 'medium', dueDate: '2026-03-15', isOverdue: false },
    ];

    const { user } = buildStrategyPrompt({
      decodedMessage: baseDecoded,
      tasks,
    });

    expect(user).toContain('已完成: 1');
    expect(user).toContain('逾期: 2');
    expect(user).toContain('过期任务1');
    expect(user).toContain('过期任务2');
    expect(user).toContain('张三');
  });
});

// ─── 3. Decode prompt builder: CIL + DISC + cultural context ordering ──

describe('buildDecodePrompt — CIL and context layering', () => {
  it('cilContext is included in system prompt alongside other contexts', () => {
    const cilContext = '\n\n=== 编译智能层（CIL）上下文 ===\n客户预算已经锁定';
    const contextMemory = '上次对话：对方要求下周一前回复';
    const culturalContext = '日式商务文化：间接表达偏好';

    const { system } = buildDecodePrompt(
      {
        messages: [{ speaker: 'them', text: 'お疲れ様です。ご提案について検討中です。' }],
        mode: 'strategic',
        domain: 'b2b_sales',
        contactDiscType: 'C',
      },
      contextMemory,
      culturalContext,
      cilContext,
    );

    // All context layers present
    expect(system).toContain('编译智能层（CIL）上下文');
    expect(system).toContain('客户预算已经锁定');
    expect(system).toContain('上次对话');
    expect(system).toContain('日式商务文化');
    expect(system).toContain('C 型（谨慎型');
    // Core prompt structure intact
    expect(system).toContain('## Output Schema');
    expect(system).toContain('## 输出语言');
  });

  it('missing optional contexts → prompt still valid', () => {
    const { system, user } = buildDecodePrompt({
      messages: [{ speaker: 'them', text: 'Quick question about pricing.' }],
      mode: 'real',
      domain: 'b2b_sales',
    });

    expect(system).toContain('## Output Schema');
    expect(system).not.toContain('编译智能层');
    expect(system).not.toContain('DISC 性格适配');
    expect(user).toContain('Quick question about pricing');
  });

  it('outputLocale=en requests English analysis while preserving schema keys', () => {
    const { system } = buildDecodePrompt({
      messages: [{ speaker: 'them', text: 'Can you send the pricing breakdown by Friday?' }],
      mode: 'strategic',
      domain: 'b2b_sales',
      outputLocale: 'en',
    });

    expect(system).toContain('## Output Language');
    expect(system).toContain('Produce all analysis');
    expect(system).toContain('"sentiment_trend"');
    expect(system).not.toContain('所有解读输出必须使用中文');
  });
});
