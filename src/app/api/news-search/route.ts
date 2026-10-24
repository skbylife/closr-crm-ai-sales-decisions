import { requireAuth, guardResponse } from '@/lib/api-guard';
import { emitEvent } from '@/lib/ai-event-hub';
import { safeCatch } from '@/lib/error-monitor';

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

interface NewsSearchRequest {
  query?: string;
  accountName?: string;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = (await request.json()) as NewsSearchRequest;
    const { query, accountName } = body;

    // Build search query
    let searchQuery = query?.trim() || "";
    if (!searchQuery && accountName) {
      const year = new Date().getFullYear();
      searchQuery = `${accountName} ${year} latest news`;
    }
    if (!searchQuery) {
      return Response.json({ error: "请提供搜索关键词或客户名称" }, { status: 400 });
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "TAVILY_API_KEY 未配置" }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let tavilyRes: Response;
    try {
      tavilyRes = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: searchQuery,
          search_depth: "basic",
          max_results: 10,
          days: 180,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text().catch(() => "");
      console.error("Tavily API error:", tavilyRes.status, errText);
      return Response.json(
        { error: `Tavily API 请求失败 (${tavilyRes.status})` },
        { status: 502 }
      );
    }

    const tavilyData = (await tavilyRes.json()) as TavilyResponse;

    const results = (tavilyData.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
      publishedDate: r.published_date || undefined,
    }));

    // AI Event Pipeline: 新闻发现事件（仅在有结果时触发）
    if (results.length > 0) {
      if (ctx.orgId) {
        void emitEvent({
          orgId: ctx.orgId,
          userId: ctx.userId,
          eventType: 'news.discovered',
          entityType: 'news',
          entityId: accountName ?? searchQuery,
          payload: {
            accountName,
            query: searchQuery,
            resultCount: results.length,
          },
        }).catch(safeCatch('news-search', 'event-emit', { accountName, query: searchQuery }));
      }
    }

    return Response.json({ results });
  } catch (err) {
    return guardResponse(err);
  }
}
