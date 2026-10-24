import { requireAuth, guardResponse } from "@/lib/api-guard";
import { callGeminiWithImage } from "@/lib/babel-engine/gemini";
import { normalizeOutputLocale, outputLocaleInstruction } from "@/lib/output-locale";
import { isOcrEnabled, OCR_DISABLED_MESSAGE } from "@/lib/ocr-config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    await requireAuth();

    if (!isOcrEnabled()) {
      return Response.json(
        { error: OCR_DISABLED_MESSAGE, ocrDisabled: true },
        { status: 410 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const locale = normalizeOutputLocale(formData.get("outputLocale"));

    if (!file) {
      return Response.json({ error: locale === "en" ? "No image uploaded" : "未上传图片" }, { status: 400 });
    }

    const mimeType = file.type;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
      return Response.json(
        { error: locale === "en" ? "Unsupported image format. Please upload jpg/png/webp/gif" : "不支持的图片格式，请上传 jpg/png/webp/gif" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const result = await callGeminiWithImage<{ extractedText: string; salesInsights: string }>({
      systemPrompt:
        `You are a professional sales intelligence analyst. Extract text from images and analyze the sales value.\n\n${outputLocaleInstruction(locale)}`,
      userPrompt: `This is a sales-related image or screenshot. Please:
1. Extract all recognizable text from the image
2. Analyze the information that is valuable for B2B sales

Return JSON:
{
  "extractedText": "Full text extracted from the image",
  "salesInsights": "B2B sales-value analysis covering customer information, product information, competitive intelligence, opportunity signals, or similar insights"
}

${outputLocaleInstruction(locale)}`,
      images: [{ base64, mimeType }],
      tier: "flash",
    });

    return Response.json(result);
  } catch (err) {
    return guardResponse(err);
  }
}
