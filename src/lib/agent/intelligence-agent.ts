/**
 * Intelligence Agent — 核心扫描逻辑
 *
 * 职责：
 *   1. 读取需要扫描的联系人（优先扫描有活跃 deal 关联的联系人）
 *   2. 对每个联系人，用 Tavily 搜索其名字 + 公司名
 *   3. LLM 分析搜索结果，判断是否有重要信号
 *   4. 评级（high/medium/low）
 *   5. 写入 intel 表（去重：同内容24小时内不重复写入）
 *
 * 成本控制：
 *   - 每个联系人每次 Tavily 调用最多1次
 *   - 评级用 flash 模型（deepseek-v4-flash）
 *   - 每次扫描最多50个联系人
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { callGemini } from '@/lib/babel-engine/gemini';
import { runCILIngest } from '@/lib/compiled-intelligence/ingest';

// ─── 类型定义 ─────────────────────────────────────────────────────────

export type SignalType =
  | 'job_change'
  | 'funding'
  | 'layoff'
  | 'competitor_news'
  | 'post'
  | 'news'
  | 'other';

export type SignalPriority = 'high' | 'medium' | 'low';

export interface IntelSignal {
  contactId?: string;
  accountId?: string;
  signalType: SignalType;
  priority: SignalPriority;
  content: string;
  sourceUrl?: string;
  expiresAt?: Date;
}

export interface ScanResult {
  scanned: number;
  signals: IntelSignal[];
  written: number;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

interface ContactRow {
  id: string;
  name: string;
  title?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  relationship_strength?: number | null;
}

function inferJobLevel(title: string): number | null {
  const t = title.toLowerCase();
  if (/\b(ceo|cfo|cto|coo|cmo|chief|c-level)\b/i.test(t)) return 4;
  if (/\b(vp|vice president|svp|evp)\b/i.test(t)) return 3;
  if (/\b(director|head of)\b/i.test(t)) return 2;
  if (/\b(manager|lead|supervisor)\b/i.test(t)) return 1;
  return 0;
}

// ─── 常量 ─────────────────────────────────────────────────────────────

const MAX_CONTACTS_PER_SCAN = 50;
const DEDUP_WINDOW_HOURS = 24;

// ─── Tavily 搜索 ──────────────────────────────────────────────────────

async function searchContactNews(
  contactName: string,
  companyName: string | null,
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn('[IntelAgent] TAVILY_API_KEY not configured');
    return [];
  }

  const year = new Date().getFullYear();
  const query = companyName
    ? `"${contactName}" ${companyName} ${year}`
    : `"${contactName}" ${year} news`;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 5,
      days: 30,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[IntelAgent] Tavily error:', res.status, errText);
    return [];
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results ?? [];
}

// ─── LLM 信号分析 ──────────────────────────────────────────────────────

interface LLMSignalAnalysis {
  hasSignal: boolean;
  signalType: SignalType;
  priority: SignalPriority;
  summary: string;
}

async function analyzeSearchResults(
  searchResults: TavilyResult[],
  contactName: string,
  contactContext: string,
): Promise<LLMSignalAnalysis | null> {
  if (searchResults.length === 0) return null;

  const snippets = searchResults
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content.slice(0, 300)}`)
    .join('\n\n');

  const systemPrompt = `你是一个 B2B 销售情报分析师。分析搜索结果，判断联系人是否有值得关注的销售信号。

信号类型：
- job_change: 跳槽、晋升、职位变动
- funding: 融资、IPO、并购
- layoff: 裁员、重组
- competitor_news: 竞争对手动态
- post: 发表观点、文章
- news: 其他新闻
- other: 其他

优先级规则：
- high: 直接影响销售机会（跳槽到目标公司、大额融资、关键职位变动）
- medium: 间接影响（公司扩张、行业新闻、观点发表）
- low: 背景信息（一般新闻、无明显关联）

如果没有值得关注的信号，hasSignal 返回 false。

返回 JSON：
{
  "hasSignal": true/false,
  "signalType": "job_change|funding|layoff|competitor_news|post|news|other",
  "priority": "high|medium|low",
  "summary": "一句话总结信号内容（中文，50字以内）"
}`;

  const userPrompt = `联系人：${contactName}
背景：${contactContext}

搜索结果：
${snippets}

分析是否有值得关注的销售信号：`;

  try {
    const result = await callGemini<string>({
      systemPrompt,
      userPrompt,
      tier: 'flash',
      temperature: 0.3,
    });

    // 解析 JSON（兼容 markdown 代码块）
    const raw = typeof result === 'string' ? result : JSON.stringify(result);
    const jsonStr = raw.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as LLMSignalAnalysis;
    return parsed;
  } catch (err) {
    console.error('[IntelAgent] LLM analysis failed:', err);
    return null;
  }
}

// ─── 信号评级（独立暴露，便于测试） ──────────────────────────────────

export async function rateSignalPriority(
  signalContent: string,
  contactContext: string,
): Promise<SignalPriority> {
  const systemPrompt = `你是销售情报优先级评估专家。根据内容和联系人背景评估信号重要性。
返回 JSON: {"priority": "high|medium|low", "reason": "一句话原因"}`;

  const userPrompt = `信号：${signalContent}\n联系人背景：${contactContext}`;

  try {
    const result = await callGemini<string>({
      systemPrompt,
      userPrompt,
      tier: 'flash',
      temperature: 0.2,
    });
    const raw2 = typeof result === 'string' ? result : JSON.stringify(result);
    const jsonStr = raw2.replace(/```(?:json)?\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { priority: SignalPriority };
    return parsed.priority ?? 'medium';
  } catch {
    return 'medium';
  }
}

// ─── 去重检查 ──────────────────────────────────────────────────────────

async function isDuplicate(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  contactId: string,
  contentPrefix: string, // 内容前100字符用于去重
): Promise<boolean> {
  if (!admin) return false;

  const since = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data } = await admin
    .from('intel_items')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .gte('created_at', since)
    .ilike('content', `${contentPrefix.slice(0, 50)}%`)
    .limit(1);

  return (data?.length ?? 0) > 0;
}

// ─── 写入 intel 表 ─────────────────────────────────────────────────────

async function writeSignal(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  signal: IntelSignal,
): Promise<boolean> {
  if (!admin) return false;

  const { error } = await admin.from('intel_items').insert({
    user_id: userId,
    contact_id: signal.contactId ?? null,
    account_id: signal.accountId ?? null,
    content: signal.content,
    signal_type: signal.signalType,
    priority: signal.priority,
    triggered_by: 'scheduled',
    source_url: signal.sourceUrl ?? null,
    expires_at: signal.expiresAt?.toISOString() ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[IntelAgent] Failed to write signal:', error.message);
    return false;
  }
  return true;
}

// ─── 联系人资料自动丰富 ──────────────────────────────────────────────────

/**
 * 当情报扫描发现 job_change 信号时，提取新职位并回写 contacts 表。
 * 同时尝试用 Tavily 搜索 LinkedIn URL（如果当前为空）。
 */
async function enrichContactFromSignal(
  admin: ReturnType<typeof getSupabaseAdmin>,
  contact: ContactRow,
  signalSummary: string,
  orgId: string,
): Promise<void> {
  if (!admin) return;

  const { writebackField } = await import('@/lib/enrichment/writeback');

  // 1. 从信号摘要中提取新职位
  const titleMatch = signalSummary.match(/(?:升任|晋升为?|出任|担任|加入.*?任|新职位[：:]\s*)([^\s,，。；]+)/);
  if (titleMatch?.[1]) {
    await writebackField({
      contactId: contact.id,
      orgId,
      fieldName: 'title',
      newValue: titleMatch[1],
      source: 'intel_agent',
      evidence: signalSummary,
    });

    // Also infer and write job_level
    const jobLevel = inferJobLevel(titleMatch[1]);
    if (jobLevel !== null) {
      await writebackField({
        contactId: contact.id,
        orgId,
        fieldName: 'job_level',
        newValue: String(jobLevel),
        source: 'intel_agent',
        evidence: `Title: ${titleMatch[1]}`,
      });
    }
  }

  // 2. 如果 LinkedIn URL 为空，尝试搜索
  const { data: fullContact } = await admin
    .from('contacts')
    .select('linkedin')
    .eq('id', contact.id)
    .single();

  if (!fullContact?.linkedin) {
    try {
      const linkedinUrl = await searchLinkedInProfile(contact.name, contact.account_name ?? contact.title ?? null);
      if (linkedinUrl) {
        await writebackField({
          contactId: contact.id,
          orgId,
          fieldName: 'linkedin',
          newValue: linkedinUrl,
          source: 'intel_agent',
          evidence: 'Tavily LinkedIn search',
        });
      }
    } catch (err) {
      console.warn(`[IntelAgent] LinkedIn search failed for ${contact.name}:`, err);
    }
  }
}

/**
 * 通过 Tavily 搜索联系人的 LinkedIn URL。
 */
async function searchLinkedInProfile(
  contactName: string,
  companyOrTitle: string | null,
): Promise<string | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  const query = companyOrTitle
    ? `"${contactName}" ${companyOrTitle} site:linkedin.com/in`
    : `"${contactName}" site:linkedin.com/in`;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as TavilyResponse;
  const linkedinResult = (data.results ?? []).find((r) =>
    r.url.includes('linkedin.com/in/'),
  );

  return linkedinResult?.url ?? null;
}

// ─── 主扫描函数 ────────────────────────────────────────────────────────

/**
 * 扫描联系人动态，生成信号并写入 intel 表。
 *
 * @param userId      当前用户 ID
 * @param contactIds  指定扫描的联系人 ID 列表；不传则扫描所有高优联系人（最多50个）
 */
export async function scanContactSignals(
  userId: string,
  contactIds?: string[],
): Promise<ScanResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error('[IntelAgent] Supabase admin not available');
    return { scanned: 0, signals: [], written: 0 };
  }

  // 1. 读取需要扫描的联系人
  let contacts: ContactRow[] = [];

  if (contactIds && contactIds.length > 0) {
    // 指定扫描
    const { data } = await admin
      .from('contacts')
      .select('id, name, title, account_id, relationship_strength')
      .eq('user_id', userId)
      .in('id', contactIds.slice(0, MAX_CONTACTS_PER_SCAN));

    contacts = (data ?? []) as ContactRow[];
  } else {
    // 优先扫描有活跃 deal 关联的联系人（relationship_strength > 0）
    const { data } = await admin
      .from('contacts')
      .select('id, name, title, account_id, relationship_strength')
      .eq('user_id', userId)
      .order('relationship_strength', { ascending: false })
      .limit(MAX_CONTACTS_PER_SCAN);

    contacts = (data ?? []) as ContactRow[];
  }

  if (contacts.length === 0) {
    return { scanned: 0, signals: [], written: 0 };
  }

  // 批量获取 account 名称
  const accountIds = [...new Set(contacts.map((c) => c.account_id).filter(Boolean))] as string[];
  const accountMap = new Map<string, string>();

  if (accountIds.length > 0) {
    const { data: accounts } = await admin
      .from('accounts')
      .select('id, name')
      .in('id', accountIds);

    for (const acc of accounts ?? []) {
      accountMap.set(acc.id as string, acc.name as string);
    }
  }

  // Fetch org_id for the user (needed by writeback + CIL)
  let orgId: string | undefined;
  try {
    const { data: membership } = await admin
      .from('org_memberships')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    orgId = (membership?.org_id as string) ?? undefined;
  } catch {
    // org_id lookup failed
  }

  // 2. 逐个联系人扫描（单个失败不影响整体）
  const allSignals: IntelSignal[] = [];
  let written = 0;

  for (const contact of contacts) {
    try {
      const companyName = contact.account_id ? (accountMap.get(contact.account_id) ?? null) : null;
      const contactContext = [
        contact.title ? `职位：${contact.title}` : '',
        companyName ? `公司：${companyName}` : '',
      ]
        .filter(Boolean)
        .join('，');

      // 2a. Tavily 搜索
      const searchResults = await searchContactNews(contact.name, companyName);

      if (searchResults.length === 0) continue;

      // 2b. LLM 分析
      const analysis = await analyzeSearchResults(searchResults, contact.name, contactContext);

      if (!analysis || !analysis.hasSignal) continue;

      // 2c. 找到最相关的 sourceUrl
      const sourceUrl = searchResults[0]?.url;

      const signal: IntelSignal = {
        contactId: contact.id,
        accountId: contact.account_id ?? undefined,
        signalType: analysis.signalType,
        priority: analysis.priority,
        content: `【${contact.name}】${analysis.summary}`,
        sourceUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
      };

      // 2d. 去重检查
      const dup = await isDuplicate(admin, userId, contact.id, signal.content);
      if (dup) {
        console.log(`[IntelAgent] Duplicate signal for ${contact.name}, skipping`);
        continue;
      }

      allSignals.push(signal);

      // 2e. 写入 intel 表
      const ok = await writeSignal(admin, userId, signal);
      if (ok) written++;

      // 2f. 自动丰富联系人资料（job_change → 更新职位）
      if (analysis.signalType === 'job_change') {
        try {
          await enrichContactFromSignal(admin, contact, analysis.summary, orgId ?? '');
        } catch (enrichErr) {
          console.error(`[IntelAgent] Contact enrichment failed for ${contact.name}:`, enrichErr);
        }
      }
    } catch (err) {
      // 单个联系人失败不中断整体
      console.error(`[IntelAgent] Error scanning contact ${contact.id}:`, err);
    }
  }

  // 3. 补全缺失的 LinkedIn URL（批量，最多10个，不阻塞）
  try {
    const { writebackField } = await import('@/lib/enrichment/writeback');
    const { data: linkedinCheck } = await admin
      .from('contacts')
      .select('id, name, title, linkedin')
      .in('id', contacts.map((c) => c.id))
      .is('linkedin', null)
      .limit(10);

    for (const c of linkedinCheck ?? []) {
      try {
        const companyName = c.id ? (accountMap.get(contacts.find((ct) => ct.id === c.id)?.account_id ?? '') ?? null) : null;
        const url = await searchLinkedInProfile(c.name as string, companyName ?? (c.title as string | null));
        if (url && orgId) {
          await writebackField({
            contactId: c.id as string,
            orgId,
            fieldName: 'linkedin',
            newValue: url,
            source: 'intel_agent',
            evidence: 'Tavily LinkedIn search (batch)',
          });
        }
      } catch {
        // Non-critical, skip
      }
    }
  } catch (err) {
    console.warn('[IntelAgent] LinkedIn batch enrichment failed:', err);
  }

  // 4. Bridge: Feed written signals into CIL ingest pipeline (fire-and-forget per account)
  if (allSignals.length > 0) {
    const signalsByAccount = new Map<string, IntelSignal[]>();
    for (const s of allSignals) {
      if (!s.accountId) continue;
      const list = signalsByAccount.get(s.accountId) ?? [];
      list.push(s);
      signalsByAccount.set(s.accountId, list);
    }

    if (orgId) {
      for (const [accountId, signals] of signalsByAccount) {
        const acctName = accountMap.get(accountId) ?? accountId;
        const rawText = signals
          .map((s) => `[${s.signalType}/${s.priority}] ${s.content}${s.sourceUrl ? ` (${s.sourceUrl})` : ''}`)
          .join('\n');

        // Fire-and-forget — do not block scan completion
        runCILIngest({
          orgId,
          accountId,
          accountName: acctName,
          sourceId: `intel-scan-${new Date().toISOString()}`,
          sourceType: 'note',
          rawText,
          context: `Intelligence Agent 扫描发现 ${signals.length} 条新信号`,
          occurredAt: new Date().toISOString(),
        }).catch((err) => {
          console.error(`[IntelAgent] CIL ingest failed for account ${accountId}:`, err);
        });
      }
      console.log(`[IntelAgent] Triggered CIL ingest for ${signalsByAccount.size} accounts`);
    }
  }

  return {
    scanned: contacts.length,
    signals: allSignals,
    written,
  };
}
