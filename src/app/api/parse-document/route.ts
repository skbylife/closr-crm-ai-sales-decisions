import { requireAuth, guardResponse } from '@/lib/api-guard';
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireAuth();

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "请使用 multipart/form-data 格式上传文件" },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    const filename = file.name;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    if (!["pdf", "csv", "txt", "docx", "xlsx", "xls"].includes(ext)) {
      return NextResponse.json(
        { error: "不支持的文件格式，请上传 PDF、Word、Excel (.xlsx)、CSV 或 TXT 文件" },
        { status: 400 }
      );
    }

    let text = "";
    let pageCount: number | undefined;

    if (ext === "pdf") {
      try {
        // 使用 LiteParse 解析 PDF（支持 OCR 扫描件）
        const { LiteParse } = await import("@llamaindex/liteparse");
        const buffer = Buffer.from(await file.arrayBuffer());
        const parser = new LiteParse({ ocrEnabled: true });
        const result = await parser.parse(buffer);
        text = result.text?.trim() ?? "";
        pageCount = result.pages?.length;
      } catch (parseErr) {
        console.error("PDF parse error:", parseErr);
        return NextResponse.json(
          { error: "PDF 解析失败，可能是加密文件或格式不支持，请手动输入内容" },
          { status: 422 }
        );
      }
    } else if (ext === "docx") {
      try {
        const mammoth = await import("mammoth");
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await mammoth.extractRawText({ buffer });
        text = result.value?.trim() ?? "";
      } catch (parseErr) {
        console.error("DOCX parse error:", parseErr);
        return NextResponse.json(
          { error: "Word 文件解析失败，请确认文件格式正确" },
          { status: 422 }
        );
      }
    } else if (ext === "xls") {
      return NextResponse.json(
        { error: "暂不支持旧版 .xls 格式，请在 Excel 中另存为 .xlsx 后重新上传" },
        { status: 422 }
      );
    } else if (ext === "xlsx") {
      try {
        const ExcelJS = (await import("exceljs")).default;
        const arrayBuffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const escapeCsv = (v: string) =>
          /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

        const cellToString = (value: unknown): string => {
          if (value == null) return "";
          if (typeof value === "string") return value;
          if (typeof value === "number" || typeof value === "boolean") return String(value);
          if (value instanceof Date) return value.toISOString();
          if (typeof value === "object") {
            const v = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }>; hyperlink?: string };
            if (Array.isArray(v.richText)) return v.richText.map((r) => r.text ?? "").join("");
            if (typeof v.text === "string") return v.text;
            if (typeof v.result === "string" || typeof v.result === "number") return String(v.result);
            if (typeof v.hyperlink === "string") return v.hyperlink;
          }
          return String(value);
        };

        const sheets: string[] = [];
        workbook.eachSheet((worksheet) => {
          const lines: string[] = [];
          worksheet.eachRow({ includeEmpty: false }, (row) => {
            const cells: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              cells.push(escapeCsv(cellToString(cell.value)));
            });
            lines.push(cells.join(","));
          });
          sheets.push(`${worksheet.name}：\n${lines.join("\n")}`);
        });

        text = sheets.join("\n\n");
      } catch (parseErr) {
        console.error("Excel parse error:", parseErr);
        return NextResponse.json(
          { error: "Excel 文件解析失败，请确认文件格式正确" },
          { status: 422 }
        );
      }
    } else {
      // txt / csv
      text = await file.text();
    }

    return NextResponse.json({ text, content: text, filename, pageCount });
  } catch (err) {
    return guardResponse(err);
  }
}
