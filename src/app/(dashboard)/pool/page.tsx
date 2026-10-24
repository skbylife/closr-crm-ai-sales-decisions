'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { timeAgo } from '@/lib/time-utils';
import { useState } from 'react';
import { UserPlus, Clock, AlertCircle, Building2, Users } from 'lucide-react';
interface PoolAccount {
  id: string;
  name: string;
  industry: string;
  dealCount: number;
  totalValue: number;
  contactCount: number;
  lastActivityAt: string | null;
  previousOwner: string | null;
  reclaimReason: string;
}

// Demo 公海数据（软通动力IT服务业务）
const DEMO_POOL: PoolAccount[] = [{
  id: 'pool1',
  name: '中国电信集团',
  industry: '电信运营商',
  dealCount: 1,
  totalValue: 8000000,
  contactCount: 3,
  lastActivityAt: '2026-01-15',
  previousOwner: '孙浩然',
  reclaimReason: '30天无活动'
}, {
  id: 'pool2',
  name: '浦发银行',
  industry: '金融',
  dealCount: 0,
  totalValue: 0,
  contactCount: 2,
  lastActivityAt: '2025-12-20',
  previousOwner: '赵敏',
  reclaimReason: '人员离职'
}, {
  id: 'pool3',
  name: '中国中车',
  industry: '轨道交通',
  dealCount: 1,
  totalValue: 5000000,
  contactCount: 4,
  lastActivityAt: '2026-02-01',
  previousOwner: '陈思远',
  reclaimReason: '超过认领上限'
}, {
  id: 'pool4',
  name: '万科集团',
  industry: '房地产',
  dealCount: 0,
  totalValue: 0,
  contactCount: 1,
  lastActivityAt: null,
  previousOwner: null,
  reclaimReason: '新线索未分配'
}, {
  id: 'pool5',
  name: '比亚迪汽车',
  industry: '新能源汽车',
  dealCount: 2,
  totalValue: 12000000,
  contactCount: 5,
  lastActivityAt: '2026-01-30',
  previousOwner: '刘佳',
  reclaimReason: '30天无活动'
}];
export default function PoolPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(s => s.currencyCode);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());
  const myClaimedCount = 8; // demo: 已认领 8 个
  const maxClaim = 50;
  const handleClaim = (id: string) => {
    setClaimed(prev => new Set([...prev, id]));
  };
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tx("📥 客户公海")}</h1>
          <p className="text-sm text-muted mt-1">{tx("未分配或被回收的客户，可认领跟进")}</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2">
          <p className="text-[12px] text-muted">{tx("已认领 / 上限")}</p>
          <p className="text-lg font-bold text-foreground">{myClaimedCount + claimed.size} / {maxClaim}</p>
        </div>
      </div>

      {/* 公海规则提示 */}
      <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-xs font-semibold text-accent mb-1.5">{tx("📋 公海规则")}</p>
        <div className="grid grid-cols-3 gap-4 text-xs text-foreground">
          <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted" />{tx("30 天无活动自动回收")}</div>
          <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted" />{tx("每人最多认领")}{maxClaim}{tx("个客户")}</div>
          <div className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-muted" />{tx("认领冷却期 24 小时")}</div>
        </div>
      </div>

      {/* 公海客户列表 */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary">{tx("可认领客户 (")}{DEMO_POOL.length})</p>
        {DEMO_POOL.map(account => <div key={account.id} className={`rounded-xl border bg-card p-4 transition-all ${claimed.has(account.id) ? 'border-positive/30 bg-positive/5 opacity-60' : 'border-border hover:border-accent/30 hover:shadow-sm'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar">
                  <Building2 className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{account.name}</p>
                  <p className="text-[12px] text-muted">{account.industry} · {account.contactCount}{tx("联系人")}{account.dealCount > 0 ? ` · ${account.dealCount} 商机 (${formatCurrency(account.totalValue, currency)})` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-[12px] text-muted">{tx("最后活动")}</p>
                  <p className="text-xs text-secondary">{timeAgo(account.lastActivityAt)}</p>
                </div>
                {claimed.has(account.id) ? <span className="rounded-lg bg-positive/10 px-3 py-1.5 text-xs font-semibold text-positive">{tx("✅ 已认领")}</span> : <button onClick={() => handleClaim(account.id)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover flex items-center gap-1">
                    <UserPlus className="h-3.5 w-3.5" />{tx("认领")}</button>}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-muted">
              <span>{tx("回收原因:")}{account.reclaimReason}</span>
              {account.previousOwner && <span>{tx("原负责人:")}{account.previousOwner}</span>}
            </div>
          </div>)}
      </div>
    </div>;
}