import { requireAuth, guardResponse } from '@/lib/api-guard';
import { decodeCultural, enhancedCulturalDecode, detectCulture } from '@/lib/babel-engine/cultural';
import { isAIRateLimited } from '@/lib/rate-limit';
import type { CultureCode, CulturalDecodeInput, ContactProfileResult } from '@/lib/babel-engine/types';
import { buildCulturalSocialIntentSummary } from '@/lib/babel-engine/social-intent';

interface CulturalDecodeRequestBody {
  text: string;
  sourceCulture?: CultureCode;
  relationship?: string;
  formality?: 'formal' | 'informal';
  senderEmail?: string;
  /** 传入联系人画像可启用增强模式（Culture + DISC） */
  contactProfile?: ContactProfileResult;
}

const VALID_CULTURES: CultureCode[] = [
  'chinese_business',
  'american_business',
  'japanese_business',
  'korean_business',
  'middle_eastern_business',
  'european_business',
];

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (isAIRateLimited(ctx.userId)) {
      return Response.json({ error: '请求过于频繁，请稍后再试。' }, { status: 429 });
    }

    const body = (await request.json()) as CulturalDecodeRequestBody;

    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return Response.json({ error: '请输入要分析的文本。' }, { status: 400 });
    }

    if (body.text.length > 10_000) {
      return Response.json({ error: '文本内容过长，最多支持 10,000 个字符。' }, { status: 400 });
    }

    // 自动检测或使用指定的文化背景
    const culture: CultureCode = body.sourceCulture && VALID_CULTURES.includes(body.sourceCulture)
      ? body.sourceCulture
      : detectCulture(body.senderEmail ?? '', body.text);

    const input: CulturalDecodeInput = {
      text: body.text,
      sourceCulture: culture,
      relationship: body.relationship,
      formality: body.formality,
    };

    // 如果有联系人画像，使用增强模式
    const result = body.contactProfile
      ? await enhancedCulturalDecode(input, body.contactProfile)
      : await decodeCultural(input);

    return Response.json({
      ...result,
      detectedCulture: culture,
      socialIntent: buildCulturalSocialIntentSummary({
        text: body.text,
        cultural: result,
        relationship: body.relationship,
      }),
    });
  } catch (err) {
    return guardResponse(err);
  }
}
