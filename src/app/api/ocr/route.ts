import { requireAuth, guardResponse } from '@/lib/api-guard';
import { isOcrEnabled, OCR_DISABLED_MESSAGE } from '@/lib/ocr-config';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    await requireAuth();

    if (!isOcrEnabled()) {
      return NextResponse.json(
        { error: OCR_DISABLED_MESSAGE, ocrDisabled: true },
        { status: 410 },
      );
    }

    const formData = await request.formData();
    const image = formData.get('image') as File;
    if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    // Convert image to base64
    const buffer = await image.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = image.type || 'image/png';

    // Vision needs a multimodal model. Do not fall back to text-only DeepSeek config.
    const baseUrl = process.env.VISION_BASE_URL;
    const apiKey = process.env.VISION_API_KEY;
    const model = process.env.VISION_MODEL;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请提取这张图片中的所有文字内容。只输出原文文字，不要添加任何解释、标注或格式化。保持原始换行和段落结构。如果是聊天记录截图，按"发送者: 内容"格式输出每条消息。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[ocr] AI error:', errText);
      // Return a specific error code so frontend can detect vision not supported,
      // but do not leak internal AI provider error text to clients.
      return NextResponse.json(
        { error: 'OCR failed', visionUnsupported: !process.env.VISION_MODEL },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';

    return NextResponse.json({ text });
  } catch (err) {
    return guardResponse(err);
  }
}
