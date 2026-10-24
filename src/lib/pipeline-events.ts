// Pipeline Events — 前端触发的事件辅助函数
// 用于在 Pipeline 页面操作时触发 AI 事件

export async function emitDealStageChanged(
  dealId: string,
  previousStage: string,
  newStage: string,
) {
  try {
    // 通过 AI Insights API 触发事件
    await fetch('/api/ai-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityType: 'opportunity',
        entityId: dealId,
        action: 'refresh',
        metadata: {
          previousStage,
          newStage,
        },
      }),
    });
  } catch (err) {
    // fire-and-forget
    console.error('[pipeline-events] Stage change event failed:', err);
  }
}
