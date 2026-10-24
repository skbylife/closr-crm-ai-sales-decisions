import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { logError, safeCatch } from '@/lib/error-monitor';

export const maxDuration = 300;

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

interface NewsItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  score: number;
  originalTitle?: string;
  originalSummary?: string;
}

interface TranslatedNewsItem {
  title: string;
  summary: string;
}

interface TranslatedNewsResponse {
  items: TranslatedNewsItem[];
}

const ASCII_RE = /[A-Za-z]{3,}/;

function needsChineseTranslation(value: string): boolean {
  return ASCII_RE.test(value);
}

function localFallbackTranslate(text: string): string {
  return text
    .replace(/Wall Street/gi, '华尔街')
    .replace(/Inflation/gi, '通胀')
    .replace(/stock market/gi, '股市')
    .replace(/stock stories/gi, '股票动态')
    .replace(/market/gi, '市场')
    .replace(/technology|tech/gi, '科技')
    .replace(/futures/gi, '期货')
    .replace(/oil/gi, '原油')
    .replace(/investor/gi, '投资者')
    .replace(/business/gi, '商业')
    .replace(/daily open/gi, '每日开盘')
    .replace(/Wednesday/gi, '周三')
    .replace(/CNBC/gi, 'CNBC')
    .replace(/Investor's Business Daily/gi, '投资者商业日报');
}

async function translateNewsToChinese(results: NewsItem[]): Promise<NewsItem[]> {
  const candidates = results.slice(0, 8);
  if (!candidates.some((item) => needsChineseTranslation(`${item.title} ${item.summary}`))) return results;

  try {
    const translated = await callAIWithFallback<TranslatedNewsResponse>({
      systemPrompt: '你是中文B2B销售情报编辑。把英文新闻标题和摘要翻译/改写成简洁中文，保留公司名、媒体名和关键数字；不要添加原文没有的信息；返回严格JSON。',
      userPrompt: JSON.stringify({
        items: candidates.map((item) => ({ title: item.title, summary: item.summary })),
        outputShape: { items: [{ title: '中文标题', summary: '中文摘要，80字以内' }] },
      }),
    });
    const items = Array.isArray(translated.items) ? translated.items : [];
    return results.map((item, index) => {
      const zh = items[index];
      if (!zh?.title && !zh?.summary) return item;
      return {
        ...item,
        originalTitle: item.title,
        originalSummary: item.summary,
        title: zh.title?.trim() || item.title,
        summary: zh.summary?.trim() || item.summary,
      };
    });
  } catch (error) {
    logError('accounts-news', 'translate-news-failed', { error: error instanceof Error ? error.message : String(error) });
    return results.map((item) => ({
      ...item,
      originalTitle: item.title,
      originalSummary: item.summary,
      title: localFallbackTranslate(item.title),
      summary: localFallbackTranslate(item.summary),
    }));
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    await requireAccountAccess(ctx, id);

    const admin = requireAdmin();

    // Get account name for search query
    const { data: account, error: accountError } = await admin
      .from('accounts')
      .select('name')
      .eq('id', id)
      .eq('org_id', ctx.orgId)
      .single();

    if (accountError || !account) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    const companyName = account.name as string;

    if (!TAVILY_API_KEY) {
      console.warn('[api/accounts/news] TAVILY_API_KEY not configured');
      return Response.json({ results: [], companyName });
    }

    // Search via Tavily API (with 10s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let tavilyRes: Response;
    try {
      tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: `${companyName} 最新动态`,
          search_depth: 'basic',
          max_results: 8,
          include_answer: false,
          topic: 'news',
          include_domains: [],
          exclude_domains: [],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      logError('accounts-news', `Tavily API ${tavilyRes.status}`, { status: tavilyRes.status, body: errText.slice(0, 500), accountId: id });
      return Response.json({ error: 'News search failed' }, { status: 502 });
    }

    const tavilyData: TavilyResponse = await tavilyRes.json();
    const rawResults: NewsItem[] = (tavilyData.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      summary: r.content?.slice(0, 300) ?? '',
      publishedAt: r.published_date ?? null,
      score: r.score ?? 0,
    }));
    const results = await translateNewsToChinese(rawResults);

    // Save to intel_items in background (don't block response)
    saveNewsToIntel(admin, ctx, id, companyName, results).catch(
      safeCatch('accounts-news', 'save-intel', { accountId: id, companyName })
    );

    return Response.json({ results, companyName });
  } catch (err) {
    console.error('[api/accounts/news] error:', err);
    return guardResponse(err);
  }
}

async function saveNewsToIntel(
  admin: ReturnType<typeof requireAdmin>,
  ctx: { userId: string; orgId: string },
  accountId: string,
  accountName: string,
  results: NewsItem[]
) {
  if (results.length === 0) return;

  // Check existing news intel to avoid duplicates (by title match)
  const { data: existing } = await admin
    .from('intel_items')
    .select('title')
    .eq('account_id', accountId)
    .eq('type', 'news')
    .eq('org_id', ctx.orgId);

  const existingTitles = new Set((existing ?? []).map((e: { title: string }) => e.title));

  const newItems = results
    .filter((r) => !existingTitles.has(r.title))
    .slice(0, 5)
    .map((r) => ({
      account_id: accountId,
      account_name: accountName,
      type: 'news' as const,
      source: 'news' as const,
      title: r.title,
      content: `${r.summary}${r.originalTitle ? `\n\n原文标题：${r.originalTitle}` : ''}${r.url ? `\n来源：${r.url}` : ''}`,
      summary: r.summary,
      credibility: 'medium' as const,
      urgency: 'low' as const,
      relevance: `${accountName}相关新闻（自动抓取）`,
      date: r.publishedAt ?? new Date().toISOString().split('T')[0],
      user_id: ctx.userId,
      org_id: ctx.orgId,
    }));

  if (newItems.length > 0) {
    const { error } = await admin.from('intel_items').insert(newItems);
    if (error) logError('accounts-news', error.message, { action: 'intel-insert', accountId, count: newItems.length });
  }
}
