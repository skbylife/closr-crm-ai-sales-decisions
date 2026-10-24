import { requireAuth, guardResponse } from "@/lib/api-guard";
import { callAIWithFallback } from "@/lib/babel-engine/ai-fallback";
import { normalizeOutputLocale, outputLocaleInstruction } from "@/lib/output-locale";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    await requireAuth();
    const { type, content, outputLocale } = await request.json();
    const locale = normalizeOutputLocale(outputLocale);

    let inputText = content;

    // 检测微信聊天记录格式
    const wechatPattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}/m;
    const isWechatChat = type === "text" && wechatPattern.test(inputText);

    // If URL, fetch page content via Jina Reader (bypasses anti-scraping, returns Markdown)
    if (type === "url") {
      // Validate URL: http(s) only, reject internal/private addresses to prevent SSRF
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(content);
      } catch {
        return Response.json({ error: locale === "en" ? "Invalid URL format" : "URL 格式不正确" }, { status: 400 });
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return Response.json({ error: locale === "en" ? "Only http/https URLs are supported" : "仅支持 http/https URL" }, { status: 400 });
      }

      const host = parsedUrl.hostname.toLowerCase();
      // Block private IP ranges, localhost, and cloud metadata endpoints
      const blockedHosts = [
        /^localhost$/,
        /^127\./,
        /^10\./,
        /^192\.168\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^169\.254\./,        // link-local incl. cloud metadata
        /^0\./,
        /^::1$/,
        /^fe80:/,
        /^fc00:/, /^fd00:/,
        /\.internal$/,
        /\.local$/,
      ];
      if (blockedHosts.some((re) => re.test(host))) {
        return Response.json({ error: locale === "en" ? "Unable to access this URL" : "无法访问该 URL" }, { status: 400 });
      }

      try {
        const jinaUrl = `https://r.jina.ai/${parsedUrl.toString()}`;
        const res = await fetch(jinaUrl, {
          signal: AbortSignal.timeout(15000),
          headers: { Accept: "text/plain" },
        });
        if (!res.ok) {
          throw new Error(`Jina Reader returned ${res.status}`);
        }
        const markdown = await res.text();
        inputText = markdown.trim().slice(0, 8000);
      } catch {
        return Response.json({ error: locale === "en" ? "Unable to access this URL. Please check the link." : "无法访问该URL，请检查链接是否正确" }, { status: 400 });
      }
    }

    const systemPrompt = isWechatChat
      ? `You are a sales conversation analyst. This is a WeChat chat transcript. Extract key sales information and return JSON.\n\n${outputLocaleInstruction(locale)}`
      : `You are a sales intelligence analyst. Extract B2B enterprise sales insights from the provided content and return JSON.\n\n${outputLocaleInstruction(locale)}`;

    const userPrompt = isWechatChat
      ? `This is a WeChat chat transcript. Analyze the sales conversation and extract customer needs, pain points, key decision makers, timeline, and competitor information.

${inputText.slice(0, 6000)}

Return JSON:
{
  "title": "[Chat] One-sentence topic summary (short)",
  "summary": "Conversation analysis summary focused on customer needs, pain points, decision makers, timeline, and competitor information",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "suggestedCategory": "other"
}

${outputLocaleInstruction(locale)}`
      : `Extract sales intelligence from the following content:

${inputText.slice(0, 6000)}

Return JSON:
{
  "title": "One-sentence title",
  "summary": "Core sales-value summary covering customer pain, value proposition, differentiation, competitive information, or other sales-relevant insights",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "suggestedCategory": "product_proposal or competitor or industry or sales_tools or other"
}

${outputLocaleInstruction(locale)}`;

    const result = await callAIWithFallback<{
      title: string;
      summary: string;
      keyPoints: string[];
      suggestedCategory: string;
    }>(
      {
        systemPrompt,
        userPrompt,
        tier: "flash",
      },
      { timeoutMs: 30000 }
    );

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
