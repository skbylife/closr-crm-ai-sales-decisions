import { requireAuth, guardResponse } from '@/lib/api-guard';
import { NextRequest, NextResponse } from 'next/server';
import { callAIWithFallback } from '@/lib/babel-engine/ai-fallback';
import { applyAIRateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/error-monitor';
import type { LinkedInResearchResult } from '@/types/linkedin-research';
import { normalizeOutputLocale, outputLocaleInstruction, type OutputLocale } from '@/lib/output-locale';

export const maxDuration = 300;

const PROXYCURL_BASE = 'https://nubela.co/proxycurl/api';

// ─── Types ───────────────────────────────────────────────────────────

interface ProxycurlProfile {
  public_identifier?: string;
  profile_pic_url?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  headline?: string;
  summary?: string;
  occupation?: string;
  city?: string;
  state?: string;
  country?: string;
  country_full_name?: string;
  experiences?: {
    company?: string;
    title?: string;
    description?: string;
    starts_at?: { day?: number; month?: number; year?: number };
    ends_at?: { day?: number; month?: number; year?: number } | null;
  }[];
  education?: {
    school?: string;
    degree_name?: string;
    field_of_study?: string;
    description?: string;
    starts_at?: { day?: number; month?: number; year?: number };
    ends_at?: { day?: number; month?: number; year?: number } | null;
  }[];
  skills?: string[];
  activities?: {
    title?: string;
    link?: string;
    activity_status?: string;
  }[];
  articles?: {
    title?: string;
    link?: string;
    published_date?: { day?: number; month?: number; year?: number };
    author?: string;
  }[];
}

interface ProxycurlSearchResult {
  results?: {
    linkedin_profile_url?: string;
    profile?: {
      public_identifier?: string;
      first_name?: string;
      last_name?: string;
      headline?: string;
      city?: string;
      country?: string;
    };
  }[];
  total_result_count?: number;
}

interface EducationItem {
  schoolName?: string;
  degreeName?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface PostItem {
  text?: string;
  title?: string;
  url?: string;
  totalReactionCount?: number;
  commentsCount?: number;
  postedAt?: string;
  content?: string;
}

interface ArticleItem {
  title?: string;
  url?: string;
  description?: string;
  publishedAt?: string;
  content?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.PROXYCURL_API_KEY;
  if (!key) throw new Error('PROXYCURL_API_KEY is not configured');
  return key;
}

async function proxycurlFetch<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function formatDate(d?: { day?: number; month?: number; year?: number } | null): string | undefined {
  if (!d?.year) return undefined;
  const parts = [String(d.year)];
  if (d.month) parts.push(String(d.month).padStart(2, '0'));
  if (d.day) parts.push(String(d.day).padStart(2, '0'));
  return parts.join('-');
}

function buildLocation(profile: ProxycurlProfile): string {
  return [profile.city, profile.state, profile.country_full_name || profile.country]
    .filter(Boolean)
    .join(', ');
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

// ─── Proxycurl: Search Person ────────────────────────────────────────

async function searchPerson(name: string, company?: string): Promise<string | null> {
  const { firstName, lastName } = splitName(name);
  const params = new URLSearchParams();
  if (firstName) params.set('first_name', firstName);
  if (lastName) params.set('last_name', lastName);
  if (company) params.set('current_company_name', company);

  const data = await proxycurlFetch<ProxycurlSearchResult>(
    `${PROXYCURL_BASE}/search/person/?${params.toString()}`
  );

  if (!data?.results?.length) return null;
  return data.results[0].linkedin_profile_url || null;
}

// ─── Proxycurl: Get Profile ──────────────────────────────────────────

async function getProfile(linkedinUrl: string): Promise<ProxycurlProfile | null> {
  return proxycurlFetch<ProxycurlProfile>(
    `${PROXYCURL_BASE}/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}`
  );
}

// ─── Transform Proxycurl → Output ───────────────────────────────────

function transformProfile(profile: ProxycurlProfile, profileUrl: string): LinkedInResearchResult {
  const name = profile.full_name
    || [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    || 'Unknown';

  const education: EducationItem[] = (profile.education || []).map((e) => ({
    schoolName: e.school,
    degreeName: e.degree_name,
    fieldOfStudy: e.field_of_study,
    startDate: formatDate(e.starts_at),
    endDate: formatDate(e.ends_at),
    description: e.description,
  }));

  const featuredPosts: PostItem[] = (profile.activities || []).slice(0, 10).map((a) => ({
    title: a.title,
    url: a.link,
    text: a.activity_status,
  }));

  const articles: ArticleItem[] = (profile.articles || []).slice(0, 10).map((a) => ({
    title: a.title,
    url: a.link,
    publishedAt: formatDate(a.published_date),
  }));

  return {
    person: {
      name,
      headline: profile.headline || profile.occupation || '',
      location: buildLocation(profile),
      profileUrl,
      profilePicture: profile.profile_pic_url,
      urn: profile.public_identifier || '',
    },
    education,
    featuredPosts,
    articles,
    reactions: [],
    babelAnalysis: {
      communicationStyle: '数据不足，无法分析',
      topicEntryPoints: [],
      warnings: [],
      icebreakers: [],
      personality: '数据不足，无法分析',
      professionalFocus: profile.headline || profile.occupation || '',
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── AI Fallback Profile ─────────────────────────────────────────────

async function generateAIFallbackProfile(
  name: string,
  company?: string,
  linkedinUrl?: string,
  outputLocale: OutputLocale = 'zh',
): Promise<LinkedInResearchResult> {
  const prompt = [
    'Infer this person likely professional profile from the following information:',
    `Name: ${name}`,
    company ? `Company: ${company}` : '',
    linkedinUrl ? `LinkedIn: ${linkedinUrl}` : '',
    '',
    'Return JSON with these fields:',
    '- headline: likely job title',
    '- location: likely location',
    '- summary: brief professional description',
    '- communicationStyle: inferred communication style',
    '- topicEntryPoints: 3 possible conversation entry points as an array',
    '- icebreakers: 2 suggested opening lines as an array',
    '- personality: personality inference',
    '- professionalFocus: professional focus area',
    '',
    outputLocaleInstruction(outputLocale),
  ].filter(Boolean).join('\n');

  const aiResult = await callAIWithFallback<{
    headline?: string;
    location?: string;
    summary?: string;
    communicationStyle?: string;
    topicEntryPoints?: string[];
    icebreakers?: string[];
    personality?: string;
    professionalFocus?: string;
  }>({
    systemPrompt: `You are a business relationship analyst. Infer a professional profile from limited information.\n\n${outputLocaleInstruction(outputLocale)}`,
    userPrompt: prompt,
  });

  return {
    person: {
      name,
      headline: aiResult?.headline || (outputLocale === 'en' ? 'Unknown' : '未知'),
      location: aiResult?.location || (outputLocale === 'en' ? 'Unknown' : '未知'),
      profileUrl: linkedinUrl || '',
      urn: '',
    },
    education: [],
    featuredPosts: [],
    articles: [],
    reactions: [],
    babelAnalysis: {
      communicationStyle: aiResult?.communicationStyle || (outputLocale === 'en' ? 'Insufficient data to analyze' : '数据不足，无法分析'),
      topicEntryPoints: aiResult?.topicEntryPoints || [],
      warnings: [outputLocale === 'en' ? 'This profile is AI-inferred and not actual LinkedIn data' : '此画像基于 AI 推测，非 LinkedIn 实际数据'],
      icebreakers: aiResult?.icebreakers || [],
      personality: aiResult?.personality || (outputLocale === 'en' ? 'Insufficient data to analyze' : '数据不足，无法分析'),
      professionalFocus: aiResult?.professionalFocus || (outputLocale === 'en' ? 'Unknown' : '未知'),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── BABEL Analysis ──────────────────────────────────────────────────

function buildBabelSystemPrompt(outputLocale: OutputLocale): string {
  return [
    'You are a top business social intelligence analyst. Use LinkedIn data to analyze a person communication style and interest areas.',
    'Based on the provided LinkedIn data, generate:',
    '1. communicationStyle: 1-2 sentences describing communication style.',
    '2. topicEntryPoints: 3-5 topics that can start a conversation.',
    '3. warnings: 1-3 sensitive topics or avoid areas.',
    '4. icebreakers: 2-3 specific opening lines.',
    '5. personality: 1-2 sentence personality summary.',
    '6. professionalFocus: one sentence on current professional focus.',
    'Base the analysis on data. Do not invent facts. If data is limited, make a reasonable inference and label it as such.',
    'Return JSON only.',
    outputLocaleInstruction(outputLocale),
  ].join('\n');
}

// ─── Route Handler ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);
    const body = await req.json();
    const outputLocale = normalizeOutputLocale((body as { outputLocale?: unknown }).outputLocale);
    const { linkedinUrl, name, company } = body as {
      linkedinUrl?: string;
      name?: string;
      company?: string;
    };

    if (!linkedinUrl && !name) {
      return NextResponse.json(
        { error: outputLocale === 'en' ? 'Please provide a LinkedIn URL or contact name' : '请提供 LinkedIn URL 或联系人姓名' },
        { status: 400 },
      );
    }

    // Step 1: Resolve LinkedIn profile URL
    let profileUrl: string | null = null;

    if (linkedinUrl && typeof linkedinUrl === 'string' && linkedinUrl.includes('linkedin.com')) {
      profileUrl = linkedinUrl;
    }

    if (!profileUrl && name) {
      profileUrl = await searchPerson(name, company);
    }

    // Step 2: Fetch full profile from Proxycurl
    let profile: ProxycurlProfile | null = null;
    if (profileUrl) {
      profile = await getProfile(profileUrl);
    }

    // If Proxycurl failed entirely, use AI fallback
    if (!profile) {
      if (!name && linkedinUrl) {
        // Extract a rough name from the URL for AI fallback
        const vanity = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] || '';
        const fallbackName = vanity
          .replace(/[-_]/g, ' ')
          .replace(/\b\d+\b/g, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ') || 'Unknown';
        const result = await generateAIFallbackProfile(fallbackName, company, linkedinUrl, outputLocale);
        return NextResponse.json(result);
      }
      if (name) {
        const result = await generateAIFallbackProfile(name, company, linkedinUrl, outputLocale);
        return NextResponse.json(result);
      }
      return NextResponse.json(
        { error: outputLocale === 'en' ? 'Unable to find this LinkedIn user. Please check the information.' : '无法找到此 LinkedIn 用户，请检查信息是否正确' },
        { status: 404 },
      );
    }

    // Step 3: Transform profile data
    const result = transformProfile(profile, profileUrl!);
    if (outputLocale === 'en') {
      result.babelAnalysis.communicationStyle = 'Insufficient data to analyze';
      result.babelAnalysis.personality = 'Insufficient data to analyze';
    }

    // Step 4: Build context for BABEL analysis
    const contextParts: string[] = [];
    contextParts.push(`Person: ${result.person.name}`);
    contextParts.push(`Headline: ${result.person.headline}`);
    contextParts.push(`Location: ${result.person.location}`);

    if (profile.summary) {
      contextParts.push(`\nSummary: ${profile.summary}`);
    }

    if (profile.experiences?.length) {
      contextParts.push('\nExperience:');
      profile.experiences.slice(0, 5).forEach((e) => {
        const parts = [e.title, e.company].filter(Boolean);
        contextParts.push(`  - ${parts.join(' @ ')}`);
      });
    }

    if (result.education.length > 0) {
      contextParts.push('\nEducation:');
      result.education.forEach((e) => {
        const parts = [e.schoolName, e.degreeName, e.fieldOfStudy].filter(Boolean);
        contextParts.push(`  - ${parts.join(' | ')}${e.startDate ? ` (${e.startDate}–${e.endDate || 'present'})` : ''}`);
      });
    }

    if (profile.skills?.length) {
      contextParts.push(`\nSkills: ${profile.skills.slice(0, 15).join(', ')}`);
    }

    if (result.featuredPosts.length > 0) {
      contextParts.push('\nRecent posts:');
      result.featuredPosts.slice(0, 5).forEach((p) => {
        const text = p.text || p.title || '';
        contextParts.push(`  - ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
      });
    }

    if (result.articles.length > 0) {
      contextParts.push('\nArticles:');
      result.articles.slice(0, 5).forEach((a) => {
        contextParts.push(`  - ${a.title || ''}`);
      });
    }

    // Step 5: BABEL analysis
    try {
      const babelResult = await callAIWithFallback<typeof result.babelAnalysis>({
        systemPrompt: buildBabelSystemPrompt(outputLocale),
        userPrompt: contextParts.join('\n'),
      });
      if (babelResult) {
        result.babelAnalysis = {
          communicationStyle: babelResult.communicationStyle || result.babelAnalysis.communicationStyle,
          topicEntryPoints: babelResult.topicEntryPoints || [],
          warnings: babelResult.warnings || [],
          icebreakers: babelResult.icebreakers || [],
          personality: babelResult.personality || result.babelAnalysis.personality,
          professionalFocus: babelResult.professionalFocus || result.babelAnalysis.professionalFocus,
        };
      }
    } catch {
      // Non-fatal — keep default babelAnalysis
    }

    return NextResponse.json(result);
  } catch (err) {
    logError('linkedin-research', err);
    return guardResponse(err);
  }
}
