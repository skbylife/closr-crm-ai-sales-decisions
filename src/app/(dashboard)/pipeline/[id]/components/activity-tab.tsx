'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useRoleFilteredData } from '@/hooks/use-role-filtered-data';
import { Plus, Clock, X } from 'lucide-react';
import type { Opportunity } from '@/lib/babel-engine/types';

export function ActivityTab({ opp }: { opp: Opportunity }) {
  const router = useRouter();
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const { intelItems: visibleIntelItems, emailDecodes, composedEmails: visibleComposedEmails } = useRoleFilteredData();
  const intelItems = visibleIntelItems.filter((i) => i.accountId === opp.accountId && (!i.opportunityId || i.opportunityId === opp.id));
  const allDecodes = emailDecodes.filter((d) => d.accountId === opp.accountId);
  const decodes = allDecodes.filter((d) => d.opportunityId === opp.id);
  const composedEmails = visibleComposedEmails.filter((e) => e.accountId === opp.accountId && e.opportunityId === opp.id);
  const updateComposedEmail = useStore((s) => s.updateComposedEmail);

  const EMAIL_TYPE_LABEL: Record<string, string> = {
    cold_outreach: '首次接触', follow_up: '跟进', meeting_invite: '会议邀请',
    proposal_send: '方案发送', quote_follow_up: '报价跟进', holiday_greeting: '节日问候',
    reactivation: '重新激活', custom: '自定义',
  };

  type Activity = { type: 'intel' | 'decode' | 'email'; date: string; title: string; detail: string; fullDetail: string; emailId?: string; emailStatus?: 'draft' | 'sent' };
  const activities: Activity[] = [
    ...intelItems.map((i) => ({ type: 'intel' as const, date: i.date, title: i.title, detail: i.content.slice(0, 100), fullDetail: i.content })),
    ...decodes.map((d) => ({ type: 'decode' as const, date: d.date, title: d.clientName || '邮件解读', detail: d.emailText?.slice(0, 100) || '', fullDetail: d.emailText || '' })),
    ...composedEmails.map((e) => ({
      type: 'email' as const, date: e.createdAt,
      title: `→ ${e.contactName}：${e.subject}`,
      detail: `${EMAIL_TYPE_LABEL[e.type] ?? e.type} | ${e.goal}`,
      fullDetail: `类型：${EMAIL_TYPE_LABEL[e.type] ?? e.type}\n目标：${e.goal}\n\n${e.body || ''}`, emailId: e.id, emailStatus: e.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">活动时间线</h3>
        <button
          onClick={() => router.push('/decode')}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-background"
        >
          <Plus className="h-3 w-3" /> 新建解读
        </button>
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12">
          <Clock className="h-10 w-10 text-muted/30" />
          <p className="mt-3 text-sm text-muted">暂无相关活动</p>
        </div>
      ) : (
        <div className="relative max-h-[600px] overflow-y-auto">
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-border" />
          <div className="space-y-3">
            {activities.map((a, i) => (
              <div key={i} className="relative pl-8">
                <div className={`absolute left-1.5 top-3 h-3 w-3 rounded-full border-2 border-card ${
                  a.type === 'intel' ? 'bg-accent-amber' : a.type === 'email' ? 'bg-green-500' : 'bg-accent'
                }`} />
                <div className="rounded-lg border border-border bg-card p-3 cursor-pointer hover:shadow-md hover:border-accent/30 transition-all" onClick={() => setSelectedActivity(a)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        a.type === 'intel' ? 'bg-amber-50 text-amber-700'
                          : a.type === 'email' ? 'bg-green-50 text-green-700'
                          : 'bg-accent/10 text-accent'
                      }`}>
                        {a.type === 'intel' ? '情报' : a.type === 'email' ? '主动邮件' : '邮件解读'}
                      </span>
                      <span className="text-sm font-medium">{a.title}</span>
                      {a.type === 'email' && (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          a.emailStatus === 'sent' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {a.emailStatus === 'sent' ? '已发送' : '草稿'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.type === 'email' && a.emailStatus === 'draft' && a.emailId && (
                        <button
                          onClick={() => updateComposedEmail(a.emailId!, { status: 'sent' })}
                          className="rounded px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50"
                        >
                          标记已发送
                        </button>
                      )}
                      <span className="text-xs text-muted">{new Date(a.date).toLocaleDateString('zh-CN')}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{a.detail}...</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Detail Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedActivity(null)}>
          <div className="relative mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6" style={{ boxShadow: 'var(--shadow-floating)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedActivity(null)} className="absolute right-3 top-3 rounded-lg p-1 text-muted hover:bg-stripe hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                selectedActivity.type === 'intel' ? 'bg-amber-50 text-amber-700'
                  : selectedActivity.type === 'email' ? 'bg-green-50 text-green-700'
                  : 'bg-accent/10 text-accent'
              }`}>
                {selectedActivity.type === 'intel' ? '情报' : selectedActivity.type === 'email' ? '主动邮件' : '邮件解读'}
              </span>
              <span className="text-xs text-muted">{new Date(selectedActivity.date).toLocaleDateString('zh-CN')}</span>
            </div>
            <h3 className="text-base font-semibold text-foreground mb-3">{selectedActivity.title}</h3>
            <p className="text-sm text-secondary leading-relaxed whitespace-pre-wrap">{selectedActivity.fullDetail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
