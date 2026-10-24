'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { genId } from '@/lib/gen-id';
import type { Message, ActionResultItem } from './types';
import { ActionButtonGroup } from './action-buttons';
import { ProgressCard } from './progress-card';
import { SummaryCard } from './summary-card';
import { useChatContext } from './use-chat-context';
import type { AccountContextInfo } from './use-chat-context';
import { useNotifications } from './use-notifications';
import { ConfirmationCard } from '@/components/chat/ConfirmationCard';
import { ActionResult } from '@/components/chat/ActionResult';
import type { PendingAction } from '@/components/chat/ConfirmationCard';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { loadChatHistory, saveChatHistory } from '@/lib/user-settings';
import type { StoredChatMessage } from '@/lib/user-settings';
import { visibleBusinessText } from '@/lib/visible-business-text';
import { useLocale } from '@/lib/i18n';
import {
  ListChecks,
  MessageSquareText,
  PencilLine,
  Search,
  Sparkles,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────

const HISTORY_KEY = 'closr-chat-history';
const MAX_HISTORY = 50;

type ChatHistoryScope = {
  key: string;
  accountId?: string;
  accountName?: string;
};

const BLOCKER_LABELS: Record<string, string> = {
  no_champion: '缺 Champion',
  no_decision_maker: '缺决策层',
  budget_unknown: '预算未明',
  timeline_unclear: '时间线不清',
  stalled_progress: '推进停滞',
  single_threaded: '单线程推进',
  missing_signal: '缺关键信号',
  unknown: '阻塞待确认',
};

const QUICK_COMMANDS = [
  { cmd: '/记录沟通', desc: '把客户原话转成可确认的更新' },
  { cmd: '/更新商机', desc: '修改阶段、金额、概率或联系人' },
  { cmd: '/创建任务', desc: '把下一步动作变成任务' },
  { cmd: '/查关系', desc: '查商机联系人、关键人和推动路径' },
  { cmd: '/解读', desc: '解读客户邮件、微信或会议纪要' },
  { cmd: '/谋局', desc: '制定客户推进路径' },
  { cmd: '/会前准备', desc: '准备会议要点' },
  { cmd: '/帮我写邮件', desc: '起草商务邮件' },
];

const QUICK_COMMANDS_EN: typeof QUICK_COMMANDS = [
  { cmd: '/log', desc: 'Turn customer language into a confirmable account update' },
  { cmd: '/update opportunity', desc: 'Change stage, amount, probability, or contacts' },
  { cmd: '/create task', desc: 'Turn the next step into an owned task' },
  { cmd: '/inspect relationships', desc: 'Review contacts, key people, and influence paths' },
  { cmd: '/decode', desc: 'Analyze customer email, chat, or meeting notes' },
  { cmd: '/strategy', desc: 'Build an account advancement path' },
  { cmd: '/meeting prep', desc: 'Prepare meeting talking points' },
  { cmd: '/draft email', desc: 'Draft a business email' },
];

// ─── Markdown helpers ────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = visibleBusinessText(text).split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isMarkdownTableStart(lines, i)) {
      const { node, nextIndex } = renderMarkdownTable(lines, i);
      elements.push(node);
      i = nextIndex - 1;
      continue;
    }
    const ulMatch = line.match(/^[-*] (.+)/);
    if (ulMatch) {
      elements.push(<li key={i} className="ml-4 list-disc">{renderInline(ulMatch[1])}</li>);
      continue;
    }
    const olMatch = line.match(/^(\d+)\. (.+)/);
    if (olMatch) {
      elements.push(<li key={i} className="ml-4 list-decimal">{renderInline(olMatch[2])}</li>);
      continue;
    }
    if (i > 0) elements.push(<br key={`br-${i}`} />);
    elements.push(<span key={i}>{renderInline(line)}</span>);
  }

  return <>{elements}</>;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const header = lines[index]?.trim() ?? '';
  const divider = lines[index + 1]?.trim() ?? '';
  return /^\|.+\|$/.test(header)
    && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(divider);
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderMarkdownTable(lines: string[], startIndex: number): { node: React.ReactNode; nextIndex: number } {
  const headers = splitMarkdownTableRow(lines[startIndex] ?? '');
  const rows: string[][] = [];
  let i = startIndex + 2;

  while (i < lines.length && /^\|.+\|$/.test(lines[i]?.trim() ?? '')) {
    rows.push(splitMarkdownTableRow(lines[i] ?? ''));
    i++;
  }

  return {
    nextIndex: i,
    node: (
      <div key={`table-${startIndex}`} className="my-2 max-w-full overflow-x-auto rounded-lg border border-border bg-background/60">
        <table className="min-w-[560px] w-full border-collapse text-left text-xs">
          <thead className="bg-muted/60 text-foreground">
            <tr>
              {headers.map((header, idx) => (
                <th key={idx} className="border-b border-border px-2.5 py-2 font-semibold align-top whitespace-nowrap">
                  {renderInline(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-t border-border/70 odd:bg-background/40">
                {headers.map((_, cellIdx) => (
                  <td key={cellIdx} className="px-2.5 py-2 align-top text-foreground/90">
                    {renderInline(row[cellIdx] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  };
}

/** Internal Closr path patterns used in AI replies */
const INTERNAL_ENTITY_SEGMENTS = 'contacts|contact|pipeline|pipelines|accounts|account|customers|customer';
const INTERNAL_PATH_RE = new RegExp(`\\/(${INTERNAL_ENTITY_SEGMENTS})\\/([A-Za-z0-9-]{6,})(?:\\?[\\w=&%-]+)?(?:#[\\w-]+)?`, 'g');

function normalizeEntitySegment(entityType: string): 'contacts' | 'pipeline' | 'accounts' {
  if (entityType === 'contact' || entityType === 'contacts') return 'contacts';
  if (entityType === 'pipeline' || entityType === 'pipelines') return 'pipeline';
  return 'accounts';
}

function getEntityLabel(entityType: string): string {
  const normalized = normalizeEntitySegment(entityType);
  if (normalized === 'contacts') return '联系人';
  if (normalized === 'pipeline') return '商机';
  return '客户';
}

function renderChatLink(label: string, href: string, key: string): React.ReactNode {
  const isInternal = href.startsWith('/');
  const displayLabel = label.trim() || (isInternal ? getEntityLabel((href.match(/^\/([^/]+)\//)?.[1] ?? '')) : href);

  return isInternal ? (
    <Link
      key={key}
      href={href}
      className="text-accent underline underline-offset-2 hover:text-accent-hover font-medium"
      onClick={(e) => e.stopPropagation()}
    >
      {displayLabel} ↗
    </Link>
  ) : (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent underline underline-offset-2 hover:text-accent-hover font-medium"
    >
      {displayLabel} ↗
    </a>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Support: **bold**, *italic*, `code`, [text](url), bare internal paths, and loose `名称 /entity/id` forms
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[([^\]]+)\]\s*\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // Process plain text segment for bare internal paths
      parts.push(...linkifyPlainText(text.slice(lastIndex, match.index), lastIndex));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`b-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[') && match[2] && match[3]) {
      parts.push(renderChatLink(match[2], match[3].trim(), `l-${match.index}`));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={`i-${match.index}`}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={`c-${match.index}`} className="bg-muted px-1 rounded text-sm">{token.slice(1, -1)}</code>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...linkifyPlainText(text.slice(lastIndex), lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Turn internal Closr paths in plain text into links.
 * Also handles loose forms like `张三 /contacts/...`, `张三（/contacts/...）`, `张三 (/contacts/...)`.
 */
const NAME_WITH_PATH_RE = new RegExp(`([^\\n\\r()（）\\[\\]]+?)\\s*[（(]?(\\/(${INTERNAL_ENTITY_SEGMENTS})\\/[A-Za-z0-9-]{6,}(?:\\?[\\w=&%-]+)?(?:#[\\w-]+)?)[)）]?`, 'gu');

function linkifyPlainText(segment: string, keyOffset: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const namedRe = new RegExp(NAME_WITH_PATH_RE.source, NAME_WITH_PATH_RE.flags);

  while ((m = namedRe.exec(segment)) !== null) {
    const fullMatch = m[0];
    const label = (m[1] ?? '').trim();
    const href = m[2] ?? '';

    if (!label || label.endsWith(':') || label.endsWith('：')) continue;

    if (m.index > last) nodes.push(segment.slice(last, m.index));
    nodes.push(renderChatLink(label, href, `named-${keyOffset}-${m.index}`));
    last = m.index + fullMatch.length;
  }

  const re = new RegExp(INTERNAL_PATH_RE.source, 'g');
  re.lastIndex = last;
  while ((m = re.exec(segment)) !== null) {
    if (m.index > last) nodes.push(segment.slice(last, m.index));
    const entityType = m[1] ?? '';
    const entityId = m[2] ?? '';
    const href = `/${normalizeEntitySegment(entityType)}/${entityId}`;
    nodes.push(renderChatLink(getEntityLabel(entityType), href, `auto-${keyOffset}-${m.index}`));
    last = re.lastIndex;
  }

  if (last < segment.length) nodes.push(segment.slice(last));
  return nodes;
}

// ─── Timestamp helper ────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatFullDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── History helpers (Supabase + localStorage fallback) ─────────────

function getHistoryScope(accountId?: string, accountName?: string, locale: 'zh' | 'en' = 'zh'): ChatHistoryScope {
  const localeSuffix = locale === 'en' ? ':en' : '';
  if (!accountId) return { key: `global${localeSuffix}` };
  return {
    key: `account:${accountId}${localeSuffix}`,
    accountId,
    accountName,
  };
}

function scopedHistoryKey(scopeKey: string): string {
  return `${HISTORY_KEY}:${scopeKey}`;
}

function isAccountScopedLegacyMessage(message: StoredChatMessage): boolean {
  return /\b(?:acc|opp|con)_[a-z0-9_-]{3,}\b/i.test(message.content)
    || /当前上下文|根据当前上下文/.test(message.content);
}

function belongsToScope(message: StoredChatMessage, scopeKey: string): boolean {
  if (message.contextKey) return message.contextKey === scopeKey;
  // Legacy messages had no scope. Keep only clearly generic legacy chat in the global assistant.
  return scopeKey === 'global' && !isAccountScopedLegacyMessage(message);
}

function mergeScopedHistory(
  existing: StoredChatMessage[],
  scopeKey: string,
  scopedMessages: StoredChatMessage[],
): StoredChatMessage[] {
  const preserved = existing.filter((message) => !belongsToScope(message, scopeKey));
  return [...preserved, ...scopedMessages]
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(-MAX_HISTORY);
}

function saveHistoryLocal(messages: Message[], scope: ChatHistoryScope) {
  try {
    localStorage.setItem(scopedHistoryKey(scope.key), JSON.stringify(toStoredMessages(messages, scope)));
  } catch { /* quota exceeded */ }
}

function loadHistoryLocal(scope: ChatHistoryScope): Message[] {
  try {
    const raw = localStorage.getItem(scopedHistoryKey(scope.key))
      ?? (scope.key === 'global' ? localStorage.getItem(HISTORY_KEY) : null);
    if (!raw) return [];
    const stored: StoredChatMessage[] = JSON.parse(raw);
    if (!Array.isArray(stored)) return [];
    return stored.filter((m) => belongsToScope(m, scope.key)).map((m) => ({
      id: m.id,
      role: m.role as Message['role'],
      content: m.content,
      type: m.type as Message['type'],
      timestamp: m.timestamp,
    }));
  } catch {
    return [];
  }
}

function toStoredMessages(messages: Message[], scope: ChatHistoryScope): StoredChatMessage[] {
  return messages.slice(-MAX_HISTORY).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    type: m.type,
    timestamp: m.timestamp ?? Date.now(),
    contextKey: scope.key,
    accountId: scope.accountId,
    accountName: scope.accountName,
  }));
}

const CAPABILITY_GROUPS = [
  {
    title: '查局势',
    icon: Search,
    tone: 'text-sky-600 bg-sky-500/10 border-sky-500/15',
    description: '客户、商机、关键人、风险、下一步',
    examples: ['这个商机有哪些关键人？', '本周我该优先盯哪几个客户？'],
  },
  {
    title: '记沟通',
    icon: MessageSquareText,
    tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/15',
    description: '粘贴客户原话，生成可确认的客户情报',
    examples: ['李总说预算要等 Q2，但认可方案方向。', '客户反馈竞品报价低 15%，采购月底前定。'],
  },
  {
    title: '改数据',
    icon: PencilLine,
    tone: 'text-amber-600 bg-amber-500/10 border-amber-500/15',
    description: '更新商机阶段、金额、概率、联系人信息',
    examples: ['把这个商机阶段改成商务谈判。', '把赢率改到 70%，原因是技术评审已通过。'],
  },
  {
    title: '推执行',
    icon: ListChecks,
    tone: 'text-violet-600 bg-violet-500/10 border-violet-500/15',
    description: '把建议拆成任务、提醒和负责人动作',
    examples: ['明天提醒我跟进周总报价反馈。', '把下一步动作变成一个高优先级任务。'],
  },
];

const OPERATION_STEPS = [
  { label: '识别意图', detail: '自动判断你是在查询、记录、更新、执行还是解读' },
  { label: '匹配对象', detail: '查找客户、商机、联系人和当前页面上下文' },
  { label: '生成结果', detail: '准备答案或写入确认卡' },
  { label: '等待确认', detail: '涉及写入时，只在你确认后更新 Closr' },
];

const CAPABILITY_GROUPS_EN: typeof CAPABILITY_GROUPS = [
  {
    title: 'Inspect',
    icon: Search,
    tone: 'text-sky-600 bg-sky-500/10 border-sky-500/15',
    description: 'Accounts, opportunities, key people, risks, and next steps',
    examples: ['Who are the key people in this opportunity?', 'Which accounts should I prioritize this week?'],
  },
  {
    title: 'Log',
    icon: MessageSquareText,
    tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/15',
    description: 'Paste customer language and turn it into confirmable intelligence',
    examples: ['The buyer said budget waits for Q2, but the solution direction is accepted.', 'The customer said the competitor quote is 15% lower and procurement decides by month-end.'],
  },
  {
    title: 'Update',
    icon: PencilLine,
    tone: 'text-amber-600 bg-amber-500/10 border-amber-500/15',
    description: 'Update stage, amount, probability, and contact data',
    examples: ['Move this opportunity to negotiation.', 'Set win rate to 70% because technical review passed.'],
  },
  {
    title: 'Execute',
    icon: ListChecks,
    tone: 'text-violet-600 bg-violet-500/10 border-violet-500/15',
    description: 'Turn recommendations into tasks, reminders, and owner actions',
    examples: ['Remind me tomorrow to follow up on pricing feedback.', 'Turn the next step into a high-priority task.'],
  },
];

const OPERATION_STEPS_EN: typeof OPERATION_STEPS = [
  { label: 'Detect intent', detail: 'Classifying whether this is a query, note, update, execution, or analysis' },
  { label: 'Match context', detail: 'Finding accounts, opportunities, contacts, and current page context' },
  { label: 'Generate result', detail: 'Preparing the answer or write-confirmation card' },
  { label: 'Await confirmation', detail: 'For writes, Closr updates only after your confirmation' },
];

// ─── Component ───────────────────────────────────────────────────────

export function ChatBubble() {
  const { locale } = useLocale();
  const en = locale === 'en';
  const capabilityGroups = en ? CAPABILITY_GROUPS_EN : CAPABILITY_GROUPS;
  const operationSteps = en ? OPERATION_STEPS_EN : OPERATION_STEPS;
  const quickCommands = en ? QUICK_COMMANDS_EN : QUICK_COMMANDS;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [userInitial, setUserInitial] = useState('我');
  const [historyHint, setHistoryHint] = useState<number | null>(null);
  const [showCommands, setShowCommands] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [manualContextOverride, setManualContextOverride] = useState<AccountContextInfo | null | 'cleared'>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);

  // Extracted hooks
  const { buildContext, accountContext } = useChatContext();
  const { unreadCount, notificationMessages } = useNotifications(open);
  const historyScope = useMemo(
    () => getHistoryScope(accountContext?.accountId, accountContext?.accountName, locale),
    [accountContext?.accountId, accountContext?.accountName, locale],
  );

  // Effective context: manual override > auto-detected
  const effectiveContext: AccountContextInfo | null =
    manualContextOverride === 'cleared' ? null : (manualContextOverride ?? accountContext);

  // Fetch user initial from Supabase session
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name
        ?? data.user?.user_metadata?.name
        ?? data.user?.email;
      if (name && typeof name === 'string') {
        setUserInitial(name.charAt(0).toUpperCase());
      }
    });
  }, []);

  // ── Load history from Supabase (fallback: localStorage) per page/account scope ──
  useEffect(() => {
    let cancelled = false;
    setLoadedScopeKey(null);
    setHistoryHint(null);
    setMessages([]);

    (async () => {
      // Try Supabase first
      try {
        const remote = await loadChatHistory();
        const scoped = (remote ?? []).filter((m) => belongsToScope(m, historyScope.key));
        if (!cancelled && scoped.length > 0) {
          const msgs: Message[] = scoped.map((m) => ({
            id: m.id,
            role: m.role as Message['role'],
            content: m.content,
            type: m.type as Message['type'],
            timestamp: m.timestamp,
          }));
          setMessages(msgs);
          setHistoryHint(msgs.length);
          setLoadedScopeKey(historyScope.key);
          return;
        }
      } catch { /* fall through */ }

      // Fallback: localStorage
      const restored = loadHistoryLocal(historyScope);
      if (!cancelled) {
        if (restored.length > 0) {
          setMessages(restored);
          setHistoryHint(restored.length);
        }
        setLoadedScopeKey(historyScope.key);
      }
    })();

    return () => { cancelled = true; };
  }, [historyScope]);

  // ── Persist messages to Supabase + localStorage on change ────────
  useEffect(() => {
    if (loadedScopeKey !== historyScope.key || messages.length === 0) return;

    const scopedMessages = toStoredMessages(messages, historyScope);
    // localStorage (sync, immediate)
    saveHistoryLocal(messages, historyScope);
    // Supabase (async, best-effort): merge the current scope instead of overwriting other page scopes.
    (async () => {
      const remote = await loadChatHistory().catch(() => null);
      await saveChatHistory(mergeScopedHistory(remote ?? [], historyScope.key, scopedMessages));
    })().catch((err) => console.error('[chat] Supabase 聊天历史保存失败:', err));
  }, [messages, loadedScopeKey, historyScope]);

  // ── Auto-dismiss history hint ───────────────────────────────────
  useEffect(() => {
    if (historyHint !== null) {
      const t = setTimeout(() => setHistoryHint(null), 3000);
      return () => clearTimeout(t);
    }
  }, [historyHint]);

  // Merge notification messages into chat on first load
  useEffect(() => {
    if (notificationMessages.length > 0) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newNotifs = notificationMessages.filter((m) => !existingIds.has(m.id));
        return newNotifs.length > 0 ? [...newNotifs, ...prev] : prev;
      });
    }
  }, [notificationMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, streaming]);

  useEffect(() => {
    if (!loading && !streaming) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, operationSteps.length - 1));
    }, 900);
    return () => clearInterval(interval);
  }, [loading, streaming, operationSteps.length]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // ── Quick commands: show on "/" input ────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setShowCommands(val === '/');
  }, []);

  const selectCommand = useCallback((cmd: string) => {
    const suffix = effectiveContext ? ` ${effectiveContext.accountName}` : '';
    setInput(cmd + suffix);
    setShowCommands(false);
    inputRef.current?.focus();
  }, [effectiveContext]);

  const prepareExample = useCallback((example: string) => {
    setInput(example);
    setShowCommands(false);
    inputRef.current?.focus();
  }, []);

  // ── Clear chat history ──────────────────────────────────────────
  const clearHistory = useCallback(() => {
    setMessages([]);
    integrationSessionRef.current = null;
    try {
      localStorage.removeItem(scopedHistoryKey(historyScope.key));
      if (historyScope.key === 'global') localStorage.removeItem(HISTORY_KEY);
    } catch { /* ignore */ }
    (async () => {
      const remote = await loadChatHistory().catch(() => null);
      await saveChatHistory(mergeScopedHistory(remote ?? [], historyScope.key, []));
    })().catch((err) => console.error('[chat] 清空聊天历史失败:', err));
  }, [historyScope]);

  // ── Integration session state ────────────────────────────────────

  const integrationSessionRef = useRef<Record<string, unknown> | null>(null);

  // ── Send message ─────────────────────────────────────────────────

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setShowCommands(false);

      const userMsg: Message = { id: genId(), role: 'user', content: text.trim(), timestamp: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        let context: Record<string, unknown> = {};
        try {
          context = await buildContext();
        } catch (ctxErr) {
          console.warn('[chat] buildContext failed, sending without context:', ctxErr);
        }

        const body = {
          message: userMsg.content,
          context: { ...context, stream: true },
          history: [...messages, userMsg]
            .slice(-6) // 最近 6 轮，节省 token
            .map((m) => ({ role: m.role, content: m.content })),
          integrationSession: integrationSessionRef.current,
        };

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('请求失败');

        const contentType = res.headers.get('content-type') ?? '';

        // ── SSE streaming path ──
        if (contentType.includes('text/event-stream') && res.body) {
          setLoading(false);
          setStreaming(true);

          const aiMsgId = genId();
          setMessages((prev) => [
            ...prev,
            { id: aiMsgId, role: 'assistant', content: '', timestamp: Date.now() },
          ]);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const payload = trimmed.slice(6);
                if (payload === '[DONE]') continue;
                try {
                  const json = JSON.parse(payload);
                  if (json.text) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === aiMsgId ? { ...m, content: m.content + json.text } : m,
                      ),
                    );
                  }
                } catch { /* skip malformed */ }
              }
            }
          } catch (streamErr) {
            console.error('[chat] stream read error:', streamErr);
          }

          setStreaming(false);
          return;
        }

        // ── JSON fallback path ──
        const data = await res.json();

        // Persist integration session state across turns
        if (data.integrationSession !== undefined) {
          integrationSessionRef.current = data.integrationSession;
        }

        const aiMsg: Message = {
          id: genId(),
          role: 'assistant',
          content: data.reply ?? '抱歉，我无法处理这个请求。',
          timestamp: Date.now(),
          type: data.actions?.length ? 'action' : undefined,
          progression: data.mode === 'progression' ? data.progression : undefined,
          actions: data.actions?.map((a: Record<string, string>) => ({
            id: a.value ?? a.label,
            label: a.label,
            icon: a.type === 'select_service' ? (a.value === 'outlook' ? '📧' : '💬') : undefined,
            style: 'primary' as const,
            action: { type: 'reply' as const, text: a.label },
          })),
          pendingActions: data.pendingActions ?? undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: genId(), role: 'assistant', content: '网络错误，请稍后重试。', timestamp: Date.now() },
        ]);
      } finally {
        setLoading(false);
        setStreaming(false);
      }
    },
    [loading, messages, buildContext],
  );

  // ── Confirm pending actions ──────────────────────────────────────

  const [conversationId] = useState(() => genId());

  const handleConfirmActions = useCallback(
    async (msgId: string, confirmedActions: PendingAction[]) => {
      try {
        const res = await fetch('/api/agent/execute-tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actions: confirmedActions,
            conversationId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? '执行失败');
        }

        const apiResults = (data.results ?? []) as ActionResultItem[];

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            return {
              ...m,
              pendingActions: undefined,
              actionResults: apiResults,
            };
          }),
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== msgId) return m;
            return {
              ...m,
              pendingActions: undefined,
              actionResults: [
                {
                  toolName: 'execute-tools',
                  displayName: '执行操作',
                  success: false,
                  message: `执行失败：${errMsg}`,
                  canUndo: false,
                  undoExpiresAt: new Date().toISOString(),
                },
              ],
            };
          }),
        );
      }
    },
    [conversationId],
  );

  const handleModifyField = useCallback(
    (msgId: string, actionIndex: number, fieldIndex: number, newValue: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.pendingActions) return m;
          const updated = m.pendingActions.map((action, ai) => {
            if (ai !== actionIndex) return action;
            return {
              ...action,
              fields: action.fields.map((f, fi) =>
                fi !== fieldIndex ? f : { ...f, value: newValue },
              ),
            };
          });
          return { ...m, pendingActions: updated };
        }),
      );
    },
    [],
  );

  // ── Render ───────────────────────────────────────────────────────

  return (
    <>
      {/* Chat window */}
      <div
        className={`fixed bottom-20 right-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-colors duration-250 origin-bottom-right
          ${open ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-90 opacity-0 pointer-events-none'}
          w-[calc(100vw-2rem)] max-w-[560px] h-[min(720px,calc(100dvh-5rem))]
          max-sm:fixed max-sm:inset-0 max-sm:w-full max-sm:max-w-none max-sm:h-full max-sm:rounded-none max-sm:bottom-0 max-sm:right-0`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-sidebar">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
              AI
            </div>
            <span className="font-semibold text-foreground text-sm">{en ? 'AI Assistant' : 'AI 助手'}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Clear history button */}
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
              title={en ? 'Clear chat' : '清空对话'}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M5 4V2.5A.5.5 0 015.5 2h3a.5.5 0 01.5.5V4M3.5 4v7.5a1 1 0 001 1h5a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Context tag */}
        {effectiveContext && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-accent/5 border-b border-border text-xs">
            <span className="text-muted-foreground">{en ? 'Current context:' : '当前上下文：'}</span>
            <span className="font-medium text-foreground truncate">{effectiveContext.accountName}</span>
            {effectiveContext.industry && (
              <span className="text-muted-foreground">({effectiveContext.industry})</span>
            )}
            <button
              onClick={() => setManualContextOverride('cleared')}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={en ? 'Clear context' : '清除上下文'}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 pb-6 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                  <Sparkles className="h-3.5 w-3.5" />
                  {en ? 'Auto-detects sales intent' : '自动识别销售意图'}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">{en ? 'Ask, log, update, and execute from here' : '问、记、改、做，都可以从这里开始'}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {en ? 'Enter customer communication, opportunity changes, next actions, or questions. AI will decide how to handle it.' : '直接输入客户沟通、商机变化、下一步动作或要查询的问题；AI 会自动判断该怎么处理。'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                {capabilityGroups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.title} className="rounded-xl border border-border bg-background/60 p-3">
                      <div className="flex items-start gap-2">
                        <span className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', group.tone].join(' ')}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{group.title}</div>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{group.description}</p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        {group.examples.map((example) => (
                          <button
                            key={example}
                            onClick={() => prepareExample(example)}
                            className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[11px] text-secondary transition-colors hover:bg-sidebar hover:text-foreground"
                            title={example}
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
              {/* AI avatar */}
              {msg.role === 'assistant' && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold mt-1">
                  AI
                </div>
              )}

              <div className={`flex flex-col min-w-0 ${msg.role === 'user' ? 'items-end max-w-[85%]' : 'items-start max-w-[92%]'}`}>
                <div
                  className={`min-w-0 max-w-full text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent text-white rounded-2xl rounded-br-md px-3 py-2'
                      : msg.type === 'summary'
                        ? ''
                        : 'bg-sidebar text-foreground rounded-2xl rounded-bl-md px-3 py-2'
                  }`}
                >
                  {(!msg.type || msg.type === 'text') && (
                    msg.progression ? (
                      <div className="space-y-2">
                        <div className="rounded-xl border border-accent/15 bg-accent/5 p-3 text-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">{en ? 'Progress Judgment' : '推进判断'}</div>
                            {msg.progression.blockerCode && (
                              <span className="rounded-full bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground border border-border">
                                {BLOCKER_LABELS[msg.progression.blockerCode] ?? msg.progression.blockerCode}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-2 text-sm">
                            <div><span className="font-medium">{en ? 'Current judgment: ' : '当前判断：'}</span>{visibleBusinessText(msg.progression.currentJudgment, locale)}</div>
                            <div><span className="font-medium">{en ? 'Main blocker: ' : '最大阻塞：'}</span>{visibleBusinessText(msg.progression.mainBlocker, locale)}</div>
                            <div><span className="font-medium">{en ? 'Next best action: ' : '下一步动作：'}</span>{visibleBusinessText(msg.progression.nextBestAction, locale)}</div>
                            <div>
                              <span className="font-medium">{en ? 'Recommended target: ' : '推荐推进对象：'}</span>
                              <span className="inline-flex items-center gap-1">
                                {visibleBusinessText(msg.progression.recommendedTarget, locale)}
                                <span className="text-[10px] text-muted-foreground">
                                  {en ? (msg.progression.recommendedTarget === '当前关键联系人' || msg.progression.recommendedTarget.includes('负责人') || msg.progression.recommendedTarget.includes('联系人') ? ' (generalized target)' : ' (matched contact)') : (msg.progression.recommendedTarget === '当前关键联系人' || msg.progression.recommendedTarget.includes('负责人') || msg.progression.recommendedTarget.includes('联系人') ? '（泛化对象）' : '（已匹配联系人）')}
                                </span>
                              </span>
                            </div>
                            <div><span className="font-medium">{en ? 'Reason: ' : '理由：'}</span>{visibleBusinessText(msg.progression.reason, locale)}</div>
                            <div><span className="font-medium">{en ? 'Risk note: ' : '风险提示：'}</span>{visibleBusinessText(msg.progression.riskNote, locale)}</div>
                          </div>
                          {msg.progression.nextAction && (
                            <div className="mt-2 rounded-lg border border-accent/20 bg-background/60 p-2.5">
                              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-accent mb-1.5">
                                {en ? 'Suggested Execution' : '建议执行'}
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  msg.progression.nextAction.urgency === 'high'
                                    ? 'bg-danger/10 text-danger'
                                    : msg.progression.nextAction.urgency === 'medium'
                                      ? 'bg-warning/10 text-warning'
                                      : 'bg-muted/10 text-muted-foreground'
                                }`}>
                                  {msg.progression.nextAction.urgency === 'high' ? (en ? 'Urgent' : '紧急') : msg.progression.nextAction.urgency === 'medium' ? (en ? 'Soon' : '建议尽快') : (en ? 'Planned' : '可计划')}
                                </span>
                              </div>
                              <p className="text-sm text-foreground">{visibleBusinessText(msg.progression.nextAction.description, locale)}</p>
                              {msg.progression.nextAction.targetEntityName && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {en ? 'Target: ' : '对象：'}
                                  {msg.progression.nextAction.targetEntityId ? (
                                    <Link
                                      href={`/${msg.progression.nextAction.targetEntityType === 'contact' ? 'contacts' : msg.progression.nextAction.targetEntityType === 'opportunity' ? 'pipeline' : 'accounts'}/${msg.progression.nextAction.targetEntityId}`}
                                      className="text-accent underline underline-offset-2 hover:text-accent-hover font-medium"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {visibleBusinessText(msg.progression.nextAction.targetEntityName, locale)} ↗
                                    </Link>
                                  ) : (
                                    <span className="font-medium">{visibleBusinessText(msg.progression.nextAction.targetEntityName, locale)}</span>
                                  )}
                                </p>
                              )}
                              {msg.progression.nextAction.evidence && (
                                <p className="mt-1 text-xs text-muted-foreground">{en ? 'Evidence: ' : '依据：'}{visibleBusinessText(msg.progression.nextAction.evidence, locale)}</p>
                              )}
                              {msg.progression.nextAction.quickActionText && (
                                <button
                                  onClick={() => send(msg.progression!.nextAction!.quickActionText!)}
                                  className="mt-2 w-full rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                                >
                                  {en ? 'Execute This Recommendation' : '执行此建议'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {msg.content && renderMarkdown(msg.content)}
                      </div>
                    ) : renderMarkdown(msg.content)
                  )}

                  {msg.type === 'action' && (
                    <>
                      {renderMarkdown(msg.content)}
                      {msg.actions && <ActionButtonGroup actions={msg.actions} onSend={send} />}
                    </>
                  )}

                  {msg.type === 'progress' && (
                    <>
                      {msg.content && renderMarkdown(msg.content)}
                      {msg.metadata && <ProgressCard metadata={msg.metadata} />}
                    </>
                  )}

                  {msg.type === 'summary' && (
                    <div className="space-y-2">
                      {msg.metadata && <SummaryCard metadata={msg.metadata} />}
                      {msg.actions && <ActionButtonGroup actions={msg.actions} onSend={send} />}
                    </div>
                  )}

                  {/* Streaming cursor */}
                  {streaming && msg === messages[messages.length - 1] && msg.role === 'assistant' && (
                    <span className="inline-block w-0.5 h-4 bg-foreground/60 animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>

                {/* Timestamp */}
                {msg.timestamp && (
                  <span
                    className="text-[10px] text-muted-foreground/60 mt-0.5 px-1"
                    title={formatFullDate(msg.timestamp)}
                  >
                    {formatTime(msg.timestamp)}
                  </span>
                )}

                {/* Confirmation card */}
                {msg.role === 'assistant' && msg.pendingActions && msg.pendingActions.length > 0 && (
                  <div className="w-full">
                    <ConfirmationCard
                      actions={msg.pendingActions}
                      onConfirm={(confirmed) => handleConfirmActions(msg.id, confirmed)}
                      onCancel={() =>
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id ? { ...m, pendingActions: undefined } : m,
                          ),
                        )
                      }
                      onModify={(ai, fi, val) => handleModifyField(msg.id, ai, fi, val)}
                    />
                  </div>
                )}

                {/* Action results */}
                {msg.role === 'assistant' && msg.actionResults && msg.actionResults.length > 0 && (
                  <div className="w-full">
                    <ActionResult
                      results={msg.actionResults.map((r) => ({
                        ...r,
                        undoExpiresAt: new Date(r.undoExpiresAt),
                        onUndo: async () => {
                          console.log('[undo] Tool:', r.toolName);
                        },
                      }))}
                    />
                  </div>
                )}
              </div>

              {/* User avatar */}
              {msg.role === 'user' && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/80 text-background text-[10px] font-bold mt-1">
                  {userInitial}
                </div>
              )}
            </div>
          ))}

          {loading && !streaming && (
            <div className="flex justify-start items-end gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold">
                AI
              </div>
              <div className="w-full max-w-[420px] rounded-2xl rounded-bl-md border border-border bg-sidebar px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-foreground">{operationSteps[loadingStep]?.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{operationSteps[loadingStep]?.detail}</div>
                  </div>
                  <span className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1">
                  {operationSteps.map((step, index) => (
                    <div
                      key={step.label}
                      className={['h-1 rounded-full transition-colors', index <= loadingStep ? 'bg-accent' : 'bg-border'].join(' ')}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* History loaded hint */}
          {historyHint !== null && (
            <div className="text-center">
              <span className="inline-block text-[11px] text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                {en ? `Loaded ${historyHint} history messages` : `加载了 ${historyHint} 条历史消息`}
              </span>
            </div>
          )}
        </div>

        {/* Quick commands panel */}
        {showCommands && (
          <div className="border-t border-border bg-card px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
            {quickCommands.map((c) => (
              <button
                key={c.cmd}
                onClick={() => selectCommand(c.cmd)}
                className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-sidebar transition-colors"
              >
                <span className="font-mono text-accent text-xs shrink-0">{c.cmd}</span>
                <span className="text-muted-foreground text-xs truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-3 py-3 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            {/* Quick command trigger button */}
            <button
              type="button"
              onClick={() => { setShowCommands((v) => !v); inputRef.current?.focus(); }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-sidebar transition-colors text-sm font-mono"
              title={en ? 'Quick commands' : '快捷指令'}
            >
              /
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={en ? 'Enter a question, communication note, opportunity update, or next action...' : '直接输入问题、沟通记录、商机更新或下一步动作...'}
              className="form-input max-h-28 min-h-10 flex-1 resize-none rounded-xl border-border bg-background px-3 py-2 text-sm leading-5 focus:border-accent focus:ring-accent"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || streaming}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity disabled:opacity-40"
              title={loading || streaming ? (en ? 'Processing' : '正在处理') : (en ? 'Send' : '发送')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Floating bubble button */}
      <button
        data-tour="ai-assistant"
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-accent/80 text-white shadow-md transition-all hover:bg-accent hover:scale-105 hover:shadow-lg active:scale-95 opacity-60 hover:opacity-100 ${
          open ? 'rotate-0' : ''
        }`}
        aria-label={en ? 'AI Assistant' : 'AI 助手'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M4 4l14 14M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 5.58 2 10c0 2.24 1.12 4.26 2.94 5.7L4 20l4.3-2.15C9.48 18.26 10.7 18.5 12 18.5c5.52 0 10-3.58 10-8S17.52 2 12 2z"
              fill="currentColor"
              opacity="0.9"
            />
            <circle cx="8" cy="10" r="1.2" fill="white" />
            <circle cx="12" cy="10" r="1.2" fill="white" />
            <circle cx="16" cy="10" r="1.2" fill="white" />
          </svg>
        )}

        {/* Unread notification badge */}
        {unreadCount > 0 && !open && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
