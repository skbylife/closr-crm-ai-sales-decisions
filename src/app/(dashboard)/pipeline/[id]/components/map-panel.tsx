'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import {
  Plus,
  Calendar,
  Edit3,
} from 'lucide-react';
import type {
  Opportunity,
  MapMilestone,
  MilestoneCategory,
  MilestoneOwner,
  MilestoneStatus,
} from '@/lib/babel-engine/types';
import {
  uid,
  daysBetween,
  MILESTONE_CATEGORY_LABELS,
  MILESTONE_CATEGORY_ICONS,
  MILESTONE_OWNER_LABELS,
  MILESTONE_STATUS_COLORS,
  MILESTONE_STATUS_LABELS,
} from '@/lib/meddicc';
import { useLocale } from '@/lib/i18n';
import { visibleBusinessText } from '@/lib/visible-business-text';

const MILESTONE_CATEGORY_LABELS_EN: Record<MilestoneCategory, string> = {
  discovery: 'Discovery',
  technical: 'Technical',
  procurement: 'Procurement',
  legal: 'Legal',
  security: 'Security',
  implementation: 'Implementation',
  signature: 'Signature',
  other: 'Other',
};

const MILESTONE_OWNER_LABELS_EN: Record<MilestoneOwner, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  both: 'Both',
};

const MILESTONE_STATUS_LABELS_EN: Record<MilestoneStatus, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  pending: 'Pending',
  blocked: 'Blocked',
  at_risk: 'At risk',
};

export function MapTab({ opp }: { opp: Opportunity }) {
  const updateOpportunity = useStore((s) => s.updateOpportunity);
  const { locale } = useLocale();
  const en = locale === 'en';
  const map = opp.mutualActionPlan;
  const [editingMilestone, setEditingMilestone] = useState<string | null>(null);
  const [showGantt, setShowGantt] = useState(true);

  const updateMap = (data: Partial<typeof map>) => {
    updateOpportunity(opp.id, { mutualActionPlan: { ...map, ...data } });
  };

  const updateMilestone = (id: string, data: Partial<MapMilestone>) => {
    updateMap({ milestones: map.milestones.map((m) => m.id === id ? { ...m, ...data } : m) });
  };

  const addMilestone = () => {
    const newM: MapMilestone = {
      id: uid(), title: '', category: 'other', owner: 'seller',
      assignee: '', dueDate: '', status: 'pending', notes: '',
    };
    updateMap({ milestones: [...map.milestones, newM] });
    setEditingMilestone(newM.id);
  };

  const deleteMilestone = (id: string) => {
    updateMap({ milestones: map.milestones.filter((m) => m.id !== id) });
  };

  const sorted = [...map.milestones].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const overdue = sorted.filter((m) => m.status !== 'completed' && m.dueDate && new Date(m.dueDate) < new Date());
  const dueSoon = sorted.filter((m) => {
    if (m.status === 'completed' || !m.dueDate) return false;
    const days = daysBetween(new Date().toISOString(), m.dueDate);
    return days >= 0 && days <= 3;
  });
  const blocked = sorted.filter((m) => m.status === 'blocked');

  const completedCount = map.milestones.filter((m) => m.status === 'completed').length;
  const onTimeRate = map.milestones.length ? Math.round((completedCount / map.milestones.length) * 100) : 0;

  // Countdown
  const daysToSign = map.targetSignDate ? daysBetween(new Date().toISOString(), map.targetSignDate) : null;

  // Health score
  const healthScore = useMemo(() => {
    if (map.milestones.length === 0) return 0;
    let s = onTimeRate * 0.5;
    s += Math.max(0, (1 - blocked.length / map.milestones.length) * 25);
    s += Math.max(0, (1 - overdue.length / map.milestones.length) * 25);
    return Math.round(s);
  }, [onTimeRate, blocked.length, overdue.length, map.milestones.length]);

  // Confidence color
  const confColor = map.confidence >= 70 ? 'var(--positive)' : map.confidence >= 40 ? 'var(--accent-amber)' : 'var(--accent-red)';
  const categoryLabels = en ? MILESTONE_CATEGORY_LABELS_EN : MILESTONE_CATEGORY_LABELS;
  const ownerLabels = en ? MILESTONE_OWNER_LABELS_EN : MILESTONE_OWNER_LABELS;
  const statusLabels = en ? MILESTONE_STATUS_LABELS_EN : MILESTONE_STATUS_LABELS;
  const hasCjk = (value?: string | null) => /[\u4e00-\u9fff]/.test(value ?? '');
  const safeText = (value: string | undefined | null, fallback: string) => {
    const cleaned = visibleBusinessText(value, locale);
    return en && hasCjk(cleaned) ? fallback : cleaned || fallback;
  };

  // Gantt chart data
  // eslint-disable-next-line react-hooks/purity -- Date.now() needed for timeline positioning
  const now = Date.now();
  const ganttData = useMemo(() => {
    const withDates = sorted.filter((m) => m.dueDate);
    if (withDates.length === 0) return null;
    const dates = withDates.map((m) => new Date(m.dueDate).getTime());
    const completedDates = withDates.filter((m) => m.completedDate).map((m) => new Date(m.completedDate!).getTime());
    const allDates = [...dates, ...completedDates, now];
    const minDate = Math.min(...allDates) - 7 * 86400000;
    const maxDate = Math.max(...allDates) + 7 * 86400000;
    const range = maxDate - minDate;
    const today = now;
    const todayPct = ((today - minDate) / range) * 100;

    // Week markers
    const weeks: { date: Date; pct: number }[] = [];
    const startWeek = new Date(minDate);
    startWeek.setDate(startWeek.getDate() - startWeek.getDay());
    for (let d = startWeek.getTime(); d <= maxDate; d += 7 * 86400000) {
      weeks.push({ date: new Date(d), pct: ((d - minDate) / range) * 100 });
    }

    return { milestones: withDates, minDate, range, todayPct, weeks };
  }, [sorted, now]);

  return (
    <div className="space-y-5">
      {/* Header Control Bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div>
              <label className="mb-1 block text-xs text-muted">{en ? 'Target Sign Date' : '目标签约日期'}</label>
              <input
                type="date"
                value={map.targetSignDate}
                onChange={(e) => updateMap({ targetSignDate: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">{en ? 'Confidence' : '置信度'}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={0} max={100} step={5}
                  value={map.confidence}
                  onChange={(e) => updateMap({ confidence: Number(e.target.value) })}
                  className="w-32"
                  style={{ accentColor: confColor }}
                />
                <span className="text-sm font-bold" style={{ color: confColor }}>{map.confidence}%</span>
              </div>
            </div>
            {daysToSign !== null && (
              <div className="text-center">
                <p className="text-xs text-muted">{en ? 'Countdown' : '倒计时'}</p>
                <p className={`text-2xl font-bold ${daysToSign < 0 ? 'text-accent-red' : daysToSign <= 14 ? 'text-accent-amber' : 'text-foreground'}`}>
                  {daysToSign >= 0 ? daysToSign : Math.abs(daysToSign)}
                </p>
                <p className="text-xs text-muted">{daysToSign >= 0 ? (en ? 'days' : '天') : (en ? 'days overdue' : '天已逾期')}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-xs text-muted">{en ? 'MAP Health' : 'MAP 健康度'}</p>
              <p className={`text-2xl font-bold ${healthScore >= 70 ? 'text-positive' : healthScore >= 40 ? 'text-accent-amber' : 'text-accent-red'}`}>
                {healthScore}
              </p>
            </div>
          </div>
          <button
            onClick={addMilestone}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> {en ? 'Add Milestone' : '添加里程碑'}
          </button>
        </div>
      </div>

      {/* Gantt Chart */}
      {ganttData && showGantt && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{en ? 'Gantt Chart' : '甘特图'}</h3>
            <button onClick={() => setShowGantt(false)} className="text-xs text-muted hover:text-accent">{en ? 'Collapse' : '收起'}</button>
          </div>
          <div className="relative overflow-x-auto">
            {/* Week header */}
            <div className="relative h-6 mb-1 border-b border-border">
              {ganttData.weeks.map((w, i) => (
                <span
                  key={i}
                  className="absolute text-xs text-muted whitespace-nowrap"
                  style={{ left: `${w.pct}%`, transform: 'translateX(-50%)' }}
                >
                  {(w.date.getMonth() + 1)}/{w.date.getDate()}
                </span>
              ))}
            </div>

            {/* Milestone bars */}
            <div className="space-y-1.5 relative min-h-[60px]">
              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-accent-red z-10"
                style={{ left: `${ganttData.todayPct}%` }}
              />

              {ganttData.milestones.map((ms) => {
                const msDate = new Date(ms.dueDate).getTime();
                const startDate = ms.completedDate ? Math.min(new Date(ms.completedDate).getTime(), msDate) : msDate - 3 * 86400000;
                const endDate = ms.completedDate ? Math.max(new Date(ms.completedDate).getTime(), msDate) : msDate;
                const left = ((startDate - ganttData.minDate) / ganttData.range) * 100;
                const width = Math.max(2, ((endDate - startDate) / ganttData.range) * 100);
                const barColor = MILESTONE_STATUS_COLORS[ms.status];

                return (
                  <div key={ms.id} className="flex items-center gap-2 h-5">
                    <span className="w-28 truncate text-xs text-muted flex-shrink-0">{safeText(ms.title, en ? 'Untitled' : '未命名')}</span>
                    <div className="flex-1 relative h-3">
                      <div
                        className="absolute h-full rounded-full"
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: barColor, minWidth: '8px' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {ganttData && !showGantt && (
        <button onClick={() => setShowGantt(true)} className="text-xs text-accent hover:underline">{en ? 'Expand Gantt Chart' : '展开甘特图'}</button>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{en ? 'Timeline' : '时间线'}</h3>
        </div>
        <div className="p-4">
        {sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">{en ? 'No milestones yet. Use the button above to add one.' : '暂无里程碑，点击上方按钮添加。'}</div>
        ) : (
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />
            <div className="space-y-3">
              {sorted.map((milestone) => {
                const isEditing = editingMilestone === milestone.id;
                const isOverdue = milestone.status !== 'completed' && milestone.dueDate && new Date(milestone.dueDate) < new Date();

                return (
                  <div key={milestone.id} className="relative pl-8">
                    <div
                      className="absolute left-1.5 top-3 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: MILESTONE_STATUS_COLORS[milestone.status] }}
                    />

                    <div className={`rounded-xl border overflow-hidden ${isOverdue ? 'border-accent-red/50 bg-accent-red/5' : 'border-border'} shadow-sm hover:shadow-md transition-shadow`}>
                      <div className="flex">
                        {/* Left colored indicator bar */}
                        <div className="w-1 flex-shrink-0" style={{ backgroundColor: MILESTONE_STATUS_COLORS[milestone.status] }} />
                        <div className="flex-1 p-3">
                    {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={milestone.title}
                            onChange={(e) => updateMilestone(milestone.id, { title: e.target.value })}
                            className="w-full rounded border border-border bg-background px-2 py-1 text-sm font-medium input-glow"
                            placeholder={en ? 'Milestone title...' : '里程碑标题...'}
                            autoFocus
                          />
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <select
                              value={milestone.category}
                              onChange={(e) => updateMilestone(milestone.id, { category: e.target.value as MilestoneCategory })}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            >
                              {Object.entries(MILESTONE_CATEGORY_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{MILESTONE_CATEGORY_ICONS[k as MilestoneCategory]} {categoryLabels[k as MilestoneCategory]}</option>
                              ))}
                            </select>
                            <select
                              value={milestone.owner}
                              onChange={(e) => updateMilestone(milestone.id, { owner: e.target.value as MilestoneOwner })}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            >
                              {Object.entries(MILESTONE_OWNER_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{ownerLabels[k as MilestoneOwner]}</option>
                              ))}
                            </select>
                            <input
                              value={milestone.assignee}
                              onChange={(e) => updateMilestone(milestone.id, { assignee: e.target.value })}
                              className="rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                              placeholder={en ? 'Owner' : '负责人'}
                            />
                            <input
                              type="date"
                              value={milestone.dueDate}
                              onChange={(e) => updateMilestone(milestone.id, { dueDate: e.target.value })}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={milestone.status}
                              onChange={(e) => {
                                const status = e.target.value as MilestoneStatus;
                                updateMilestone(milestone.id, {
                                  status,
                                  ...(status === 'completed' ? { completedDate: new Date().toISOString().split('T')[0] } : {}),
                                });
                              }}
                              className="rounded border border-border bg-background px-2 py-1 text-xs"
                            >
                              {Object.entries(MILESTONE_STATUS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{statusLabels[k as MilestoneStatus]}</option>
                              ))}
                            </select>
                            <input
                              value={milestone.notes}
                              onChange={(e) => updateMilestone(milestone.id, { notes: e.target.value })}
                              className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs input-glow"
                              placeholder={en ? 'Notes...' : '备注...'}
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button onClick={() => deleteMilestone(milestone.id)} className="text-xs text-accent-red hover:underline">{en ? 'Delete' : '删除'}</button>
                            <button onClick={() => setEditingMilestone(null)} className="rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent-hover">{en ? 'Done' : '完成'}</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between cursor-pointer" onClick={() => setEditingMilestone(milestone.id)}>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm">{MILESTONE_CATEGORY_ICONS[milestone.category]}</span>
                              <span className="rounded bg-background px-1.5 py-0.5 text-xs font-medium text-muted">
                                {categoryLabels[milestone.category]}
                              </span>
                              <span className="text-sm font-medium">{safeText(milestone.title, en ? 'Untitled milestone' : '未命名里程碑')}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-muted flex-wrap">
                              <span>{ownerLabels[milestone.owner]}{milestone.assignee ? ` · ${safeText(milestone.assignee, en ? 'Owner' : '负责人')}` : ''}</span>
                              {milestone.dueDate && <span className="flex items-center gap-0.5"><Calendar className="h-3 w-3" />{milestone.dueDate}</span>}
                              {milestone.completedDate && <span className="text-positive">{en ? 'Completed' : '已完成'} {milestone.completedDate}</span>}
                              <span
                                className="rounded-full px-1.5 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: `${MILESTONE_STATUS_COLORS[milestone.status]}20`, color: MILESTONE_STATUS_COLORS[milestone.status] }}
                              >
                                {statusLabels[milestone.status]}
                              </span>
                            </div>
                            {milestone.notes && <p className="mt-1 text-xs text-muted">{safeText(milestone.notes, en ? 'Notes are not available in English yet.' : '暂无备注。')}</p>}
                          </div>
                          <Edit3 className="h-3 w-3 text-muted flex-shrink-0" />
                        </div>
                      )}
                        </div>{/* end flex-1 p-3 */}
                      </div>{/* end flex wrapper */}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>{/* end p-4 wrapper */}
      </div>

      {/* Risk Panel -- red / yellow / gray three-color sections */}
      {(overdue.length > 0 || dueSoon.length > 0 || blocked.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-accent-red/30 overflow-hidden shadow-sm">
            <div className="h-1 bg-accent-red" />
            <div className="bg-accent-red/5 p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-accent-red">{en ? 'Overdue' : '已逾期'} ({overdue.length})</h4>
              {overdue.length > 0 ? overdue.map((ms) => (
                <p key={ms.id} className="text-xs text-accent-red mb-0.5">{safeText(ms.title, en ? 'Untitled milestone' : '未命名里程碑')} · {ms.dueDate}</p>
              )) : <p className="text-xs text-muted">{en ? 'None' : '无'}</p>}
            </div>
          </div>
          <div className="rounded-xl border border-accent-amber/30 overflow-hidden shadow-sm">
            <div className="h-1 bg-accent-amber" />
            <div className="bg-accent-amber/5 p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-accent-amber">{en ? 'Due Soon' : '即将到期'} ({dueSoon.length})</h4>
              {dueSoon.length > 0 ? dueSoon.map((ms) => (
                <p key={ms.id} className="text-xs text-accent-amber mb-0.5">{safeText(ms.title, en ? 'Untitled milestone' : '未命名里程碑')} · {ms.dueDate}</p>
              )) : <p className="text-xs text-muted">{en ? 'None' : '无'}</p>}
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <div className="h-1 bg-muted" />
            <div className="bg-background p-3">
              <h4 className="mb-1.5 text-xs font-semibold text-muted">{en ? 'Blocked' : '受阻'} ({blocked.length})</h4>
              {blocked.length > 0 ? blocked.map((ms) => (
                <p key={ms.id} className="text-xs text-accent-red mb-0.5">{safeText(ms.title, en ? 'Untitled milestone' : '未命名里程碑')}</p>
              )) : <p className="text-xs text-muted">{en ? 'None' : '无'}</p>}
            </div>
          </div>
        </div>
      )}

      {/* MAP Health */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? 'MAP Health' : 'MAP 健康度'}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 text-center">
          <div>
            <p className="text-2xl font-semibold">{onTimeRate}%</p>
            <p className="text-xs text-muted">{en ? 'On-time Rate' : '按时完成率'}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-accent-red">{blocked.length}</p>
            <p className="text-xs text-muted">{en ? 'Blocked' : '受阻'}</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-accent-amber">{overdue.length}</p>
            <p className="text-xs text-muted">{en ? 'Overdue' : '逾期'}</p>
          </div>
          <div>
            <p className={`text-2xl font-semibold ${healthScore >= 70 ? 'text-positive' : healthScore >= 40 ? 'text-accent-amber' : 'text-accent-red'}`}>
              {healthScore}
            </p>
            <p className="text-xs text-muted">{en ? 'Health Score' : '健康分'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
