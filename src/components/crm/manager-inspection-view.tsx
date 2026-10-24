'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency, type CurrencyCode } from '@/lib/format-currency';
import type { OpportunityStage } from '@/lib/babel-engine/types';
import type { ManagerInspectionItem } from '@/lib/crm-foundation/manager-inspection';

export function inspectionPriorityClass(priority: ManagerInspectionItem['priority']): string {
  if (priority === 'critical') return 'border-danger/20 bg-danger/5 text-danger';
  if (priority === 'watch') return 'border-warning/20 bg-warning/5 text-warning';
  return 'border-positive/20 bg-positive/5 text-positive';
}

export function inspectionPriorityLabel(priority: ManagerInspectionItem['priority'], en: boolean): string {
  if (priority === 'critical') return en ? 'Critical' : '紧急';
  if (priority === 'watch') return en ? 'Watch' : '关注';
  return en ? 'Healthy' : '健康';
}

export function ManagerInspectionView({
  items,
  getStageLabel,
  en,
  detailed = false,
  resolveOwnerName,
}: {
  items: ManagerInspectionItem[];
  getStageLabel: (stage: OpportunityStage) => string;
  en: boolean;
  /** Full-page mode adds owner and close-date columns. */
  detailed?: boolean;
  resolveOwnerName?: (owner?: string) => string;
}) {
  const criticalCount = items.filter((item) => item.priority === 'critical').length;
  const watchCount = items.filter((item) => item.priority === 'watch').length;
  const ownerName = (owner?: string) => (resolveOwnerName ? resolveOwnerName(owner) : owner ?? '—');
  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted">{en ? 'Critical' : '紧急复核'}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-danger">{criticalCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted">{en ? 'Watch' : '需要关注'}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-warning">{watchCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted">{en ? 'Inspection queue' : '巡检队列'}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{items.length}</p>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="table-nextadmin">
              <thead>
                <tr>
                  <th>{en ? 'Opportunity' : '商机'}</th>
                  {detailed && <th>{en ? 'Owner' : '负责人'}</th>}
                  <th>{en ? 'Priority' : '优先级'}</th>
                  <th>{en ? 'Stage' : '阶段'}</th>
                  {detailed && <th>{en ? 'Close date' : '预计关单'}</th>}
                  <th>{en ? 'Risks' : '风险'}</th>
                  <th>{en ? 'Activity' : '活动'}</th>
                  <th>{en ? 'Next step' : '下一步'}</th>
                  <th>{en ? 'Action' : '动作'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.opportunityId}>
                    <td className="min-w-[260px]">
                      <Link href={`/pipeline/${item.opportunityId}`} className="font-medium text-foreground hover:text-accent">{item.opportunityName}</Link>
                      <p className="mt-1 text-[12px] text-muted">{item.accountName} · {formatCurrency(item.value, item.currency as CurrencyCode)}</p>
                    </td>
                    {detailed && (
                      <td className="text-[12px] text-secondary">{ownerName(item.owner)}</td>
                    )}
                    <td>
                      <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${inspectionPriorityClass(item.priority)}`}>
                        {inspectionPriorityLabel(item.priority, en)}
                      </span>
                    </td>
                    <td className="text-secondary">
                      <p className="text-sm text-foreground">{getStageLabel(item.stage)}</p>
                      <p className="text-[12px] text-muted">{en ? `${item.stageAgeDays}d` : `停留 ${item.stageAgeDays} 天`}</p>
                    </td>
                    {detailed && (
                      <td className="text-[12px] text-secondary">{item.expectedCloseDate ?? '—'}</td>
                    )}
                    <td className="min-w-[260px]">
                      <div className="flex flex-wrap gap-1.5">
                        {item.risks.length > 0 ? item.risks.slice(0, 4).map((risk) => (
                          <span key={risk.id} className={risk.severity === 'high' ? 'rounded-full bg-danger/10 px-2 py-0.5 text-[12px] font-medium text-danger' : risk.severity === 'medium' ? 'rounded-full bg-warning/10 px-2 py-0.5 text-[12px] font-medium text-warning' : 'rounded-full bg-sidebar px-2 py-0.5 text-[12px] font-medium text-secondary'}>
                            {risk.label}
                          </span>
                        )) : (
                          <span className="text-[12px] text-positive">{en ? 'Clear' : '清晰'}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-[12px] text-secondary">
                      {item.lastMeaningfulActivityAt ? item.lastMeaningfulActivityAt.split('T')[0] : '—'}
                    </td>
                    <td className="text-[12px] text-secondary">
                      {item.nextTaskDue ?? '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-[12px] text-secondary">{item.primaryAction}</span>
                        <Link href={`/pipeline/${item.opportunityId}`} className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-accent-hover">
                          {en ? 'Open' : '打开'}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">{en ? 'No active opportunities to inspect' : '暂无可巡检商机'}</p>
        </div>
      )}
    </section>
  );
}
