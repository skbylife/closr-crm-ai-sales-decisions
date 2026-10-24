// Error message translator for user-friendly display
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  
  // API key not configured
  if (msg.includes('API_KEY') || msg.includes('api_key') || msg.includes('not configured')) {
    return '🔑 AI 服务未配置，请前往「设置」页面配置 API Key';
  }
  
  // Network errors
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return '🌐 网络连接失败，请检查网络后重试';
  }
  
  // Rate limiting
  if (msg.includes('429') || msg.includes('频繁') || msg.includes('rate limit')) {
    return '⏳ 请求过于频繁，请稍等片刻后重试';
  }
  
  // Timeout
  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return '⏱️ 请求超时，请重试';
  }
  
  // Generic server error
  if (msg.includes('500') || msg.includes('Internal')) {
    return '⚠️ 服务器出现问题，请稍后重试';
  }
  
  // Never expose raw error messages to users
  return '操作失败，请稍后重试';
}
