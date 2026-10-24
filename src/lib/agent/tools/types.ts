/**
 * 工具执行结果的统一类型定义
 *
 * 所有工具执行函数都返回此接口。
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}
