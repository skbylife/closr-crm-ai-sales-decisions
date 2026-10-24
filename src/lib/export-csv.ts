/**
 * CSV 导出工具（统一入口）
 * - 前端：downloadCsv() 触发浏览器下载
 * - 后端：escapeCsvField() + toCsvString() 构建 CSV 字符串
 * 支持 UTF-8 BOM（兼容中文 Excel 打开）
 */

type CellValue = string | number | null | undefined;

/** 转义 CSV 字段：防止公式注入，包含逗号、引号、换行时用双引号包裹 */
export function escapeCsvField(value: string): string {
  // Neutralize formula injection: prefix dangerous leading characters with a single quote
  if (/^[=+\-@\t\r]/.test(value)) {
    value = "'" + value;
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** 将二维数组转为 CSV 字符串 */
export function toCsvString(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}

/** 获取今日日期字符串 yyyy-MM-dd */
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 触发浏览器下载 CSV 文件
 * @param filename 文件名（不含扩展名）
 * @param headers  表头
 * @param rows     数据行（支持 string / number / null / undefined）
 */
export function downloadCsv(filename: string, headers: string[], rows: CellValue[][]): void {
  const stringRows = rows.map(row => row.map(cell => String(cell ?? '')));
  const csv = toCsvString(headers, stringRows);
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${todayString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
