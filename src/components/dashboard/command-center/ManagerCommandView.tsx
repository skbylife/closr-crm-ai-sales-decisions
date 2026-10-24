"use client";

/**
 * Manager 团队管理视图
 *
 * 聚焦团队管理：团队 Pipeline 健康度 + 需辅导 Deal + 团队行动队列 + 情报
 */

import { MorningBriefing } from "@/components/agent/MorningBriefing";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { IntelSignals } from "@/components/agent/IntelSignals";
import { TeamPipelineHealth } from "./TeamPipelineHealth";
import { PlayProgressSection } from "./PlayProgressSection";
import { PortfolioJudgmentCommand } from "@/components/dashboard/portfolio-judgment-command";

interface ManagerCommandViewProps {
  accounts: { id: string; name: string }[];
  opportunities: { id: string; name: string; accountId: string }[];
  refreshKey: number;
}

export function ManagerCommandView({ accounts, opportunities, refreshKey }: ManagerCommandViewProps) {
  return (
    <div className="p-4 space-y-4">
      {/* 团队 Pipeline 健康度 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          团队概览
        </h3>
        <TeamPipelineHealth key={`mgr-health-${refreshKey}`} />
      </section>

      {/* 需辅导的 Deal */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          需要关注的单子
        </h3>
        <MorningBriefing
          key={`mgr-briefing-${refreshKey}`}
          accounts={accounts}
          opportunities={opportunities}
          roleLevel="director"
          embedded
        />
      </section>

      {/* 管理判断队列 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          管理判断队列
        </h3>
        <PortfolioJudgmentCommand role="manager" refreshKey={refreshKey} surface="management-queue" />
      </section>

      {/* 谋局进度 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          谋局进度
        </h3>
        <PlayProgressSection key={`mgr-plays-${refreshKey}`} />
      </section>

      {/* 团队行动队列 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          团队行动
        </h3>
        <ActionQueue key={`mgr-actions-${refreshKey}`} embedded scope="team" />
      </section>

      {/* 情报信号 */}
      <section>
        <h3 className="mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.12em]">
          情报动态
        </h3>
        <IntelSignals key={`mgr-intel-${refreshKey}`} />
      </section>
    </div>
  );
}
