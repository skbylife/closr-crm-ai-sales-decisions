export const OCR_DISABLED_MESSAGE = '图片识别功能已停用，请粘贴或上传可提取文本的文件。';

export function isOcrEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OCR_ENABLED === '1';
}
