import { requireAuth, requireAccountAccess, requireContactAccess, requireOpportunityAccess, guardResponse } from '@/lib/api-guard';
import { mergeOcrTextIntoEmailText } from '@/lib/babel-engine/decode';
import { runDecodePipeline } from '@/lib/babel-engine/decode-service';
import { callGeminiWithImage } from '@/lib/babel-engine/gemini';
import { applyAIRateLimit } from '@/lib/rate-limit';
import type { SavedDecode } from '@/lib/babel-engine/types';
import { normalizeOutputLocale } from '@/lib/output-locale';

export const maxDuration = 300;

interface DecodeRequestBody {
  emailText: string;
  context?: string;
  clientName?: string;
  dealStage?: string;
  signalSource?: SavedDecode['signalSource'];
  analysisGoal?: SavedDecode['analysisGoal'];
  signalContext?: string;
  knowledgeBase?: string;
  matchedContactId?: string;
  matchedAccountId?: string;
  opportunityId?: string;
  outputLocale?: 'zh' | 'en';
}


export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);

    let body: DecodeRequestBody;
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      let emailText = (formData.get('emailText') as string) ?? '';

      // Extract images and OCR them
      const imageFiles: File[] = [];
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('image') && value instanceof File) {
          imageFiles.push(value);
        }
      }

      if (imageFiles.length > 0) {
        const images = await Promise.all(
          imageFiles.map(async (file) => {
            const buffer = await file.arrayBuffer();
            return {
              base64: Buffer.from(buffer).toString('base64'),
              mimeType: file.type || 'image/png',
            };
          })
        );

        // OCR: extract text from images via AI vision
        const ocrResult = await callGeminiWithImage<{ extractedText: string }>({
          systemPrompt: '你是一个 OCR 文字提取助手。从图片中提取所有可见文字，保持原始格式和换行。返回 JSON: {"extractedText": "提取的文字内容"}。如果图片中没有文字，返回 {"extractedText": ""}。保留原文语言，不翻译 OCR 结果。',
          userPrompt: '请提取这些图片中的所有文字内容。',
          images,
          tier: 'flash',
          invocation: {
            orgId: ctx.orgId,
            userId: ctx.userId,
            route: '/api/decode',
            useCase: 'decode.ocr',
            metadata: { imageCount: images.length, requestFormat: 'multipart-form' },
          },
        });

        emailText = mergeOcrTextIntoEmailText(emailText, ocrResult.extractedText);
      }

      body = {
        emailText,
        clientName: (formData.get('clientName') as string) || undefined,
        dealStage: (formData.get('dealStage') as string) || undefined,
        context: (formData.get('context') as string) || undefined,
        signalSource: ((formData.get('signalSource') as string) || undefined) as SavedDecode['signalSource'],
        analysisGoal: ((formData.get('analysisGoal') as string) || undefined) as SavedDecode['analysisGoal'],
        signalContext: (formData.get('signalContext') as string) || undefined,
        knowledgeBase: (formData.get('knowledgeBase') as string) || undefined,
        matchedContactId: (formData.get('matchedContactId') as string) || undefined,
        matchedAccountId: (formData.get('matchedAccountId') as string) || undefined,
        opportunityId: (formData.get('opportunityId') as string) || undefined,
        outputLocale: normalizeOutputLocale(formData.get('outputLocale')),
      };
    } else {
      body = (await request.json()) as DecodeRequestBody;
    }

    if (!body.emailText || typeof body.emailText !== 'string' || body.emailText.trim().length === 0) {
      return Response.json(
        { error: '请输入邮件内容或上传图片。' },
        { status: 400 }
      );
    }

    if (body.emailText.length > 50_000) {
      return Response.json(
        { error: '邮件内容过长，最多支持 50,000 个字符。' },
        { status: 400 }
      );
    }

    // P0 权限收口：请求中的关联资源 ID 只能指向当前 org 且当前用户可见的资源。
    const contactAccess = body.matchedContactId
      ? await requireContactAccess(ctx, body.matchedContactId)
      : null;
    const matchedAccountId = body.matchedAccountId || undefined;
    if (matchedAccountId) {
      await requireAccountAccess(ctx, matchedAccountId);
    }
    const opportunityAccess = body.opportunityId
      ? await requireOpportunityAccess(ctx, body.opportunityId)
      : null;

    const authorizedAccountIds = new Set(
      [contactAccess?.account_id, matchedAccountId, opportunityAccess?.account_id].filter(
        (accountId): accountId is string => Boolean(accountId),
      ),
    );
    if (authorizedAccountIds.size > 1) {
      return Response.json({ error: '关联联系人、客户或商机不属于同一客户' }, { status: 400 });
    }
    const authorizedAccountId = [...authorizedAccountIds][0];
    const resolvedAccountId = authorizedAccountId;

    const { decode } = await runDecodePipeline({
      ...body,
      accountId: resolvedAccountId,
      matchedAccountId: matchedAccountId,
      requestContext: ctx,
      actor: ctx,
      route: '/api/decode',
      useCase: 'decode.messages',
      persist: false,
      outputLocale: normalizeOutputLocale(body.outputLocale),
    });

    return Response.json(decode);
  } catch (err) {
    return guardResponse(err);
  }
}
