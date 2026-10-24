declare module "mammoth" {
  interface ConversionResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  interface Options {
    buffer?: Buffer;
  }
  export function extractRawText(options: Options): Promise<ConversionResult>;
}
