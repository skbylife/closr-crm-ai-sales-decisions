"use client";

/**
 * AE 个人执行视图
 *
 * 聚焦"今天做什么"：个人简报 + 行动队列 + 我的情报
 */

import { MorningBriefing } from "@/components/agent/MorningBriefing";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { IntelSignals } from "@/components/agent/IntelSignals";
import { PlayProgressSection } from "./PlayProgressSection";

interface AeCommandViewProps {
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  refreshKey: number;
}

export function AeCommandView({ accounts, opportunities, refreshKey }: AeCommandViewProps) {
  return (
    <div className="space-y-4 p-4">
      {/* 今日行动摘要 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          今日行动
        </h3>
        <MorningBriefing
          key={`ae-briefing-${refreshKey}`}
          accounts={accounts}
          opportunities={opportunities}
          roleLevel="ae"
          embedded
        />
      </section>

      {/* 待办行动队列 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          我的待办
        </h3>
        <ActionQueue key={`ae-actions-${refreshKey}`} embedded scope="personal" />
      </section>

      {/* 谋局进度 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          谋局进度
        </h3>
        <PlayProgressSection key={`ae-plays-${refreshKey}`} />
      </section>

      {/* 我的情报信号 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          相关情报
        </h3>
        <IntelSignals key={`ae-intel-${refreshKey}`} />
      </section>
    </div>
  );
}
