'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Handshake, Plus, Search, X, Edit3, Trash2, FileText } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// ─── Types ──────────────────────────────────────────────────────────

type PartnerTier = 'gold' | 'silver' | 'bronze' | 'registered';
type PartnerType = 'reseller' | 'distributor' | 'var' | 'si' | 'referral';
type DealRegStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'won' | 'lost' | 'commission_paid' | 'expired';
interface ChannelPartner {
  id: string;
  name: string;
  type: PartnerType;
  tier: PartnerTier;
  region: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  dealCount: number;
  totalRevenue: number;
  activeDeals: number;
  winRate: number;
  commissionRate: number;
  contractExpiry?: string;
  notes: string;
  createdAt: string;
}
interface DealRegistration {
  id: string;
  partnerId: string;
  partnerName: string;
  accountName: string;
  dealValue: number;
  status: DealRegStatus;
  submittedAt: string;
  expiresAt: string;
  notes: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const TIER_CONFIG: Record<PartnerTier, {
  label: string;
  style: string;
  icon: string;
}> = {
  gold: {
    label: '金牌',
    style: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: '🥇'
  },
  silver: {
    label: '银牌',
    style: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: '🥈'
  },
  bronze: {
    label: '铜牌',
    style: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: '🥉'
  },
  registered: {
    label: '注册',
    style: 'bg-background text-secondary border-border',
    icon: '📋'
  }
};
const TYPE_LABELS: Record<PartnerType, string> = {
  reseller: '经销商',
  distributor: '分销商',
  var: '增值代理',
  si: '系统集成商',
  referral: '推荐合作'
};
const REG_STATUS_CONFIG: Record<DealRegStatus, {
  label: string;
  style: string;
}> = {
  pending: {
    label: '待审核',
    style: 'bg-warning/10 text-warning'
  },
  approved: {
    label: '已批准',
    style: 'bg-positive/10 text-positive'
  },
  rejected: {
    label: '已拒绝',
    style: 'bg-danger/10 text-danger'
  },
  active: {
    label: '跟进中',
    style: 'bg-accent/10 text-accent'
  },
  won: {
    label: '已签约',
    style: 'bg-positive/10 text-positive'
  },
  lost: {
    label: '已丢单',
    style: 'bg-gray-100 text-gray-500'
  },
  commission_paid: {
    label: '已结佣',
    style: 'bg-positive/10 text-positive'
  },
  expired: {
    label: '已过期',
    style: 'bg-gray-100 text-gray-400'
  }
};
const FLOW_STEPS: DealRegStatus[] = ['pending', 'approved', 'active', 'won', 'commission_paid'];
const FLOW_LABELS = ['待审核', '已批准', '跟进中', '已签约', '已结佣'];
function mapPartners(rows: Record<string, unknown>[]): ChannelPartner[] {
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    type: r.type as PartnerType ?? 'reseller',
    tier: r.tier as PartnerTier ?? 'registered',
    region: r.region as string ?? '',
    contactName: r.contact_name as string ?? '',
    contactEmail: r.contact_email as string ?? '',
    contactPhone: r.contact_phone as string | undefined,
    website: r.website as string | undefined,
    dealCount: r.deal_count as number ?? 0,
    totalRevenue: r.total_revenue as number ?? 0,
    activeDeals: r.active_deals as number ?? 0,
    winRate: r.win_rate as number ?? 0,
    commissionRate: r.commission_rate as number ?? 10,
    contractExpiry: r.contract_expiry as string | undefined,
    notes: r.notes as string ?? '',
    createdAt: r.created_at as string ?? ''
  }));
}
function mapRegistrations(rows: Record<string, unknown>[]): DealRegistration[] {
  return rows.map(r => ({
    id: r.id as string,
    partnerId: r.partner_id as string ?? '',
    partnerName: r.partner_name as string ?? '',
    accountName: r.account_name as string ?? '',
    dealValue: r.deal_value as number ?? 0,
    status: r.status as DealRegStatus ?? 'pending',
    submittedAt: r.submitted_at as string ?? '',
    expiresAt: r.expires_at as string ?? '',
    notes: r.notes as string ?? ''
  }));
}

// ─── Partner Form ───────────────────────────────────────────────────

function PartnerForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: ChannelPartner;
  onSave: (p: ChannelPartner) => void;
  onCancel: () => void;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<PartnerType>(initial?.type ?? 'reseller');
  const [tier, setTier] = useState<PartnerTier>(initial?.tier ?? 'registered');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [contactName, setContactName] = useState(initial?.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? '');
  const [commissionRate, setCommissionRate] = useState(initial?.commissionRate?.toString() ?? '10');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id ?? `partner_${Date.now()}`,
      name: name.trim(),
      type,
      tier,
      region: region.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      commissionRate: Number(commissionRate) || 10,
      dealCount: initial?.dealCount ?? 0,
      totalRevenue: initial?.totalRevenue ?? 0,
      activeDeals: initial?.activeDeals ?? 0,
      winRate: initial?.winRate ?? 0,
      notes: notes.trim(),
      createdAt: initial?.createdAt ?? new Date().toISOString()
    });
  };
  return <div className="rounded-xl border border-accent/20 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{initial ? '编辑合作伙伴' : '新建合作伙伴'}</h3>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-secondary">{tx("公司名称")}</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("类型")}</label>
          <select value={type} onChange={e => setType(e.target.value as PartnerType)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {(Object.entries(TYPE_LABELS) as [PartnerType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("等级")}</label>
          <select value={tier} onChange={e => setTier(e.target.value as PartnerTier)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {(Object.entries(TIER_CONFIG) as [PartnerTier, {
            label: string;
          }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("区域")}</label>
          <input value={region} onChange={e => setRegion(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder={tx("例：华东/北美/欧洲")} />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("联系人")}</label>
          <input value={contactName} onChange={e => setContactName(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("邮箱")}</label>
          <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("佣金比例 (%)")}</label>
          <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("备注")}</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary hover:bg-background">{tx("取消")}</button>
        <button onClick={handleSave} disabled={!name.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50">{tx("保存")}</button>
      </div>
    </div>;
}

// ─── Deal Registration Form ─────────────────────────────────────────

function DealRegForm({
  partners,
  onSave,
  onCancel
}: {
  partners: ChannelPartner[];
  onSave: (reg: DealRegistration) => void;
  onCancel: () => void;
}) {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [accountName, setAccountName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [notes, setNotes] = useState('');
  const handleSave = () => {
    if (!partnerId || !accountName.trim()) return;
    const partner = partners.find(p => p.id === partnerId);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 90); // 90天保护期
    onSave({
      id: `reg_${Date.now()}`,
      partnerId,
      partnerName: partner?.name ?? '',
      accountName: accountName.trim(),
      dealValue: Number(dealValue) || 0,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      expiresAt: expiry.toISOString(),
      notes: notes.trim()
    });
  };
  return <div className="rounded-xl border border-accent/20 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{tx("新建 Deal 报备")}</h3>
        <button onClick={onCancel} className="text-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-secondary">{tx("合作伙伴")}</label>
          <select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("客户名称")}</label>
          <input value={accountName} onChange={e => setAccountName(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("预估金额")}</label>
          <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-secondary">{tx("备注")}</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-secondary">{tx("取消")}</button>
        <button onClick={handleSave} disabled={!partnerId || !accountName.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50">{tx("提交报备")}</button>
      </div>
    </div>;
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function ChannelsPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(s => s.currencyCode);
  const [partners, setPartners] = useState<ChannelPartner[]>([]);
  const [registrations, setRegistrations] = useState<DealRegistration[]>([]);
  const [showPartnerForm, setShowPartnerForm] = useState(false);
  const [showRegForm, setShowRegForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<ChannelPartner | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'partners' | 'registrations'>('partners');
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentTime] = useState(() => Date.now());

  // Load from API
  useEffect(() => {
    async function load() {
      try {
        const [pRes, rRes] = await Promise.all([fetch('/api/channels?type=partners'), fetch('/api/channels?type=registrations')]);
        const pData = await pRes.json();
        const rData = await rRes.json();
        setPartners(mapPartners(pData.partners ?? []));
        setRegistrations(mapRegistrations(rData.registrations ?? []));
      } catch {}
      setInitialLoading(false);
    }
    load();
  }, []);
  const refreshPartners = useCallback(async () => {
    const res = await fetch('/api/channels?type=partners');
    const data = await res.json();
    setPartners(mapPartners(data.partners ?? []));
  }, []);
  const refreshRegs = useCallback(async () => {
    const res = await fetch('/api/channels?type=registrations');
    const data = await res.json();
    setRegistrations(mapRegistrations(data.registrations ?? []));
  }, []);
  const handleSavePartner = async (p: ChannelPartner) => {
    const existing = partners.find(x => x.id === p.id);
    const payload = {
      id: p.id,
      name: p.name,
      type: p.type,
      tier: p.tier,
      region: p.region,
      contact_name: p.contactName,
      contact_email: p.contactEmail,
      deal_count: p.dealCount,
      total_revenue: p.totalRevenue,
      active_deals: p.activeDeals,
      win_rate: p.winRate,
      commission_rate: p.commissionRate,
      notes: p.notes
    };
    if (existing) {
      await fetch('/api/channels', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          _type: 'partner'
        })
      });
    } else {
      await fetch('/api/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    }
    await refreshPartners();
    setShowPartnerForm(false);
    setEditingPartner(null);
  };
  const handleDeletePartner = async (id: string) => {
    if (!(await appConfirm({
      message: '确定删除此合作伙伴？',
      variant: 'danger'
    }))) return;
    await fetch(`/api/channels?id=${id}`, {
      method: 'DELETE'
    });
    await refreshPartners();
  };
  const handleSaveReg = async (reg: DealRegistration) => {
    await fetch('/api/channels', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        _type: 'registration',
        id: reg.id,
        partner_id: reg.partnerId,
        partner_name: reg.partnerName,
        account_name: reg.accountName,
        deal_value: reg.dealValue,
        status: reg.status,
        submitted_at: reg.submittedAt,
        expires_at: reg.expiresAt,
        notes: reg.notes
      })
    });
    await refreshRegs();
    setShowRegForm(false);
  };
  const handleRegAction = async (regId: string, status: DealRegStatus) => {
    await fetch('/api/channels', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: regId,
        _type: 'registration',
        status
      })
    });
    await refreshRegs();
  };
  const filteredPartners = partners.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.region.toLowerCase().includes(q);
  });

  // Stats
  const stats = useMemo(() => ({
    totalPartners: partners.length,
    totalRevenue: partners.reduce((s, p) => s + p.totalRevenue, 0),
    activeRegs: registrations.filter(r => ['pending', 'approved', 'active'].includes(r.status)).length,
    goldPartners: partners.filter(p => p.tier === 'gold').length
  }), [partners, registrations]);
  if (initialLoading) {
    return <div className="flex h-[60vh] items-center justify-center">
        <LoadingSpinner label={tx("加载渠道数据...")} />
      </div>;
  }
  return <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{tx("渠道管理")}</h1>
          <p className="mt-0.5 text-sm text-secondary">{stats.totalPartners}{tx("个合作伙伴 ·")}{stats.activeRegs}{tx("个活跃报备")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRegForm(true)} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-background">
            <FileText className="h-3.5 w-3.5" />{tx("Deal 报备")}</button>
          <button onClick={() => setShowPartnerForm(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover">
            <Plus className="h-3.5 w-3.5" />{tx("添加伙伴")}</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card-elevated rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{tx("合作伙伴")}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{stats.totalPartners}</p>
        </div>
        <div className="card-elevated rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{tx("渠道总收入")}</p>
          <p className="mt-1 text-xl font-bold text-foreground">{formatCurrency(stats.totalRevenue, currency)}</p>
        </div>
        <div className="card-elevated rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{tx("金牌伙伴")}</p>
          <p className="mt-1 text-xl font-bold text-yellow-600">{stats.goldPartners}</p>
        </div>
        <div className="card-elevated rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted">{tx("活跃报备")}</p>
          <p className="mt-1 text-xl font-bold text-accent">{stats.activeRegs}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 w-fit">
        {([['partners', '合作伙伴'], ['registrations', 'Deal 报备']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${tab === key ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-foreground'}`}>
            {label}
          </button>)}
      </div>

      {/* Forms */}
      {showPartnerForm && <PartnerForm onSave={handleSavePartner} onCancel={() => setShowPartnerForm(false)} />}
      {editingPartner && <PartnerForm initial={editingPartner} onSave={handleSavePartner} onCancel={() => setEditingPartner(null)} />}
      {showRegForm && <DealRegForm partners={partners} onSave={handleSaveReg} onCancel={() => setShowRegForm(false)} />}

      {/* Partners Tab */}
      {tab === 'partners' && <>
          {/* Search */}
          {partners.length > 0 && <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tx("搜索伙伴...")} className="w-full rounded-lg border border-border bg-card py-2.5 pl-10 pr-4 text-sm" />
            </div>}

          {filteredPartners.length > 0 ? <div className="space-y-3">
              {filteredPartners.map(p => {
          const tierCfg = TIER_CONFIG[p.tier];
          return <div key={p.id} className="card-elevated rounded-xl border border-border bg-card">
                    <div className="flex items-center justify-between px-5 py-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg">{tierCfg.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${tierCfg.style}`}>{tierCfg.label}</span>
                            <span className="text-[12px] text-muted">{TYPE_LABELS[p.type]}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-[13px] text-secondary">
                            {p.region && <span>{p.region}</span>}
                            {p.contactName && <span>{p.contactName}</span>}
                            <span>{tx("佣金")}{p.commissionRate}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex items-center gap-4 text-xs text-secondary">
                          <span>{p.dealCount}{tx("单")}</span>
                          <span>{formatCurrency(p.totalRevenue, currency)}</span>
                          {p.winRate > 0 && <span className="text-positive">{p.winRate}{tx("% 赢率")}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditingPartner(p)} className="rounded-md p-1 text-secondary hover:text-foreground hover:bg-background"><Edit3 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeletePartner(p.id)} className="rounded-md p-1 text-secondary hover:text-danger hover:bg-danger/10"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  </div>;
        })}
            </div> : <div className="card-elevated rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <Handshake className="mx-auto h-10 w-10 text-secondary mb-3" />
              <p className="text-sm font-medium text-foreground">{tx("暂无渠道合作伙伴")}</p>
              <p className="mt-1 text-xs text-muted">{tx("添加渠道伙伴来管理经销商、代理和 Deal 报备")}</p>
              <button onClick={() => setShowPartnerForm(true)} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
                <Plus className="h-4 w-4" />{tx("添加第一个伙伴")}</button>
            </div>}
        </>}

      {/* Registrations Tab */}
      {tab === 'registrations' && <>
          {registrations.length > 0 ? <div className="space-y-2">
              {registrations.map(reg => {
          const statusCfg = REG_STATUS_CONFIG[reg.status];
          const daysLeft = Math.ceil((new Date(reg.expiresAt).getTime() - currentTime) / 86400000);
          const currentStep = FLOW_STEPS.indexOf(reg.status);
          return <div key={reg.id} className="card-elevated rounded-xl border border-border bg-card px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{reg.accountName}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${statusCfg.style}`}>{statusCfg.label}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[13px] text-secondary">
                          <span>{reg.partnerName}</span>
                          {reg.dealValue > 0 && <span>{formatCurrency(reg.dealValue, currency)}</span>}
                          <span>{daysLeft > 0 ? `保护期剩余 ${daysLeft} 天` : '保护期已过'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {reg.status === 'pending' && <>
                            <button onClick={() => handleRegAction(reg.id, 'approved')} className="rounded bg-positive/10 px-2 py-1 text-[12px] text-positive hover:bg-positive/20">{tx("批准")}</button>
                            <button onClick={() => handleRegAction(reg.id, 'rejected')} className="rounded bg-danger/10 px-2 py-1 text-[12px] text-danger hover:bg-danger/20">{tx("拒绝")}</button>
                          </>}
                        {reg.status === 'approved' && <button onClick={() => handleRegAction(reg.id, 'active')} className="rounded bg-accent/10 px-2 py-1 text-[12px] text-accent hover:bg-accent/20">{tx("开始跟进")}</button>}
                        {reg.status === 'active' && <>
                            <button onClick={() => handleRegAction(reg.id, 'won')} className="rounded bg-positive/10 px-2 py-1 text-[12px] text-positive hover:bg-positive/20">{tx("签约成功")}</button>
                            <button onClick={() => handleRegAction(reg.id, 'lost')} className="rounded bg-danger/10 px-2 py-1 text-[12px] text-danger hover:bg-danger/20">{tx("丢单")}</button>
                          </>}
                        {reg.status === 'won' && <button onClick={() => handleRegAction(reg.id, 'commission_paid')} className="rounded bg-positive/10 px-2 py-1 text-[12px] text-positive hover:bg-positive/20">{tx("已结佣")}</button>}
                      </div>
                    </div>
                    {/* Flow progress indicator */}
                    {reg.status !== 'rejected' && reg.status !== 'lost' && reg.status !== 'expired' && <div className="flex items-center gap-1 text-[11px]">
                        {FLOW_LABELS.map((step, i) => {
                const isCurrent = reg.status === FLOW_STEPS[i];
                const isPast = currentStep > i;
                return <span key={step} className="flex items-center gap-1">
                              {i > 0 && <span className="text-muted">&rarr;</span>}
                              <span className={isCurrent ? 'text-accent font-bold' : isPast ? 'text-positive' : 'text-muted'}>
                                {isPast ? '✓' : ''}{step}
                              </span>
                            </span>;
              })}
                      </div>}
                  </div>;
        })}
            </div> : <div className="card-elevated rounded-xl border border-dashed border-border bg-card p-12 text-center">
              <FileText className="mx-auto h-10 w-10 text-secondary mb-3" />
              <p className="text-sm font-medium text-foreground">{tx("暂无 Deal 报备")}</p>
              <p className="mt-1 text-xs text-muted">{tx("合作伙伴提交 Deal 报备后将在此审核")}</p>
            </div>}
        </>}
    </div>;
}