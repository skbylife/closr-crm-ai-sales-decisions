import { requireAuth, guardResponse } from '@/lib/api-guard';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';
import { normalizeOutputLocale, outputLocaleInstruction } from '@/lib/output-locale';

export const maxDuration = 300;

interface NewsAnalysisRequest {
  companyName: string;
  industry?: string;
  dealContext?: string;
  knowledgeContext?: string;
  searchFirst?: boolean;
  outputLocale?: unknown;
}

interface NewsAnalysisResponse {
  news: { date: string; title: string; summary: string }[];
  dealRelevance: string;
  talkingPoints: string[];
  opportunities: { text: string; type: 'opportunity' | 'risk' }[];
  risks: { text: string; type: 'opportunity' | 'risk' }[];
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

function buildSystemPrompt(locale: 'zh' | 'en', withSearch: boolean): string {
  return ['You are a senior market intelligence analyst specializing in B2B enterprise sales intelligence.',
    withSearch
      ? 'Recent search results for the company are provided below. Base your analysis on those real search results.'
      : 'Use your knowledge of the company to provide a recent news and market-movement analysis. If uncertain, clearly state that the information may not be current.',
    'Your analysis must include:',
    '1. news: 3-5 key news items, each with date, title, and summary.',
    '2. dealRelevance: why the news matters to our deal and how to use it.',
    '3. talkingPoints: 3-5 topics to discuss with the customer.',
    '4. opportunities: possible opportunity signals.',
    '5. risks: risk signals to watch.',
    'Be concise, direct, and actionable. Avoid militaristic language.',
    'Return JSON with this shape:',
    '{',
    '  "news": [{"date": "2025-03", "title": "...", "summary": "..."}],',
    '  "dealRelevance": "...",',
    '  "talkingPoints": ["...", "..."],',
    '  "opportunities": [{"text": "specific opportunity", "type": "opportunity"}],',
    '  "risks": [{"text": "specific risk", "type": "risk"}]',
    '}',
    'opportunities and risks must be object arrays. Each item must have text and type. opportunity type is always "opportunity"; risk type is always "risk".',
    outputLocaleInstruction(locale),
  ].join('\n');
}

async function searchTavily(companyName: string, dealContext?: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    // Build a query that includes deal context keywords for relevance
    const contextKeywords = dealContext
      ? dealContext.replace(/[：:]/g, ' ').replace(/[；;]/g, ' ').replace(/交易阶段|相关商机|产品线/g, '').trim().slice(0, 80)
      : '';
    const searchQuery = contextKeywords
      ? `${companyName} ${contextKeywords}`
      : `${companyName} latest news`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: searchQuery,
          search_depth: "basic",
          max_results: 8,
          days: 180,
          include_answer: false,
          include_raw_content: false,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) return [];

    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as NewsAnalysisRequest;
    const locale = normalizeOutputLocale(body.outputLocale);
    applyAIRateLimit(ctx.userId);

    if (!body.companyName || body.companyName.trim().length === 0) {
      return Response.json({ error: locale === 'en' ? 'Please enter a company name.' : '请输入公司名称。' }, { status: 400 });
    }

    let searchContext = "";
    let systemPrompt = buildSystemPrompt(locale, false);

    // If searchFirst is true, search Tavily first and use results as context
    if (body.searchFirst) {
      const searchResults = await searchTavily(body.companyName, body.dealContext);
      if (searchResults.length > 0) {
        systemPrompt = buildSystemPrompt(locale, true);
        searchContext = "\n\n--- Search Results ---\n" + searchResults.map((r, i) =>
          `[${i + 1}] ${r.title}\nSource: ${r.url}\n${r.content}\n${r.published_date ? `Published: ${r.published_date}` : ''}`
        ).join("\n\n");
      }
    }

    const userPrompt = [
      `Target company: ${body.companyName}`,
      body.industry ? `Industry: ${body.industry}` : '',
      body.dealContext ? `Deal context: ${body.dealContext}` : '',
      body.knowledgeContext ? `\n--- Internal Company Materials ---\n${body.knowledgeContext}` : '',
      searchContext,
      'Analyze the company recent movement, news, and market situation. Provide intelligence relevant to our sales deal.',
      outputLocaleInstruction(locale),
    ].filter(Boolean).join('\n');

    const result = await callAIWithFallback<NewsAnalysisResponse>({
      systemPrompt,
      userPrompt,
    });

    // Normalize opportunities/risks: LLM may return string[] instead of {text,type}[]
    const normalizeItems = (items: unknown, type: 'opportunity' | 'risk'): { text: string; type: 'opportunity' | 'risk' }[] => {
      if (!Array.isArray(items)) return [];
      return items.map((item) => {
        if (typeof item === 'string') return { text: item, type };
        if (item && typeof item === 'object' && 'text' in item) return { text: String((item as { text: string }).text), type };
        return { text: String(item), type };
      });
    };

    const normalized = {
      ...result,
      opportunities: normalizeItems(result.opportunities, 'opportunity'),
      risks: normalizeItems(result.risks, 'risk'),
    };

    return Response.json(normalized);
  } catch (err) {
    return guardResponse(err);
  }
}
