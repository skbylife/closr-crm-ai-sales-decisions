'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import { formatCurrency } from '@/lib/format-currency';
import { useStore } from '@/lib/store';
import { useState } from 'react';
import { Package, Plus, FileText, Search, X, Edit2, Trash2 } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';
interface Product {
  id: string;
  name: string;
  sku: string;
  description: string;
  unitPrice: number;
  currency: string;
  category: string;
  isActive: boolean;
}
interface Quote {
  id: string;
  quoteNumber: string;
  accountName: string;
  opportunityName: string;
  status: string;
  total: number;
  validUntil: string;
  createdAt: string;
}
const STATUS_STYLES: Record<string, {
  label: string;
  class: string;
}> = {
  draft: {
    label: '草稿',
    class: 'bg-white/10 text-secondary'
  },
  sent: {
    label: '已发送',
    class: 'bg-blue-500/10 text-blue-400'
  },
  accepted: {
    label: '已接受',
    class: 'bg-positive/10 text-positive'
  },
  rejected: {
    label: '已拒绝',
    class: 'bg-danger/10 text-danger'
  },
  expired: {
    label: '已过期',
    class: 'bg-warning/10 text-warning'
  }
};

// Demo products
const DEMO_PRODUCTS: Product[] = [
// ── 数字化咨询服务 ──
{
  id: 'p1',
  name: '企业数字化转型咨询',
  sku: 'DX-CONSULT',
  description: '端到端数字化战略规划，含业务诊断、技术路线图、ROI分析',
  unitPrice: 800000,
  currency: 'CNY',
  category: '咨询',
  isActive: true
}, {
  id: 'p2',
  name: 'IT架构评估与优化',
  sku: 'IT-ASSESS',
  description: '现有IT架构健康度评估，输出优化方案和实施路径',
  unitPrice: 350000,
  currency: 'CNY',
  category: '咨询',
  isActive: true
},
// ── 应用开发与测试 ──
{
  id: 'p3',
  name: '定制化应用开发服务',
  sku: 'APP-DEV',
  description: '全栈应用开发，含需求分析、UI/UX设计、前后端开发、测试上线',
  unitPrice: 1500000,
  currency: 'CNY',
  category: '开发',
  isActive: true
}, {
  id: 'p4',
  name: '移动应用开发（iOS+Android）',
  sku: 'MOB-DEV',
  description: '原生/跨平台移动应用开发，含App Store上架',
  unitPrice: 1200000,
  currency: 'CNY',
  category: '开发',
  isActive: true
}, {
  id: 'p5',
  name: '自动化测试服务',
  sku: 'QA-AUTO',
  description: '自动化测试框架搭建+执行，覆盖功能/性能/安全测试',
  unitPrice: 600000,
  currency: 'CNY',
  category: '开发',
  isActive: true
}, {
  id: 'p6',
  name: '智能终端测试解决方案',
  sku: 'TERM-TEST',
  description: 'MIS/SCH测试方案，覆盖手机/IoT设备全品类',
  unitPrice: 800000,
  currency: 'CNY',
  category: '开发',
  isActive: true
},
// ── 云与基础设施 ──
{
  id: 'p7',
  name: '云迁移服务',
  sku: 'CLOUD-MIG',
  description: '本地到云端的平滑迁移，含评估、规划、执行、验证',
  unitPrice: 500000,
  currency: 'CNY',
  category: '云服务',
  isActive: true
}, {
  id: 'p8',
  name: '云运维托管（MSP）',
  sku: 'CLOUD-MSP',
  description: '7×24云基础设施运维，含监控、告警、故障处理',
  unitPrice: 1800000,
  currency: 'CNY',
  category: '云服务',
  isActive: true
}, {
  id: 'p9',
  name: '数据中心运维外包',
  sku: 'DC-OPS',
  description: 'IDC全栈运维服务，含服务器、网络、存储、安全',
  unitPrice: 2500000,
  currency: 'CNY',
  category: '云服务',
  isActive: true
},
// ── AI与数据 ──
{
  id: 'p10',
  name: 'AI模型开发与部署',
  sku: 'AI-MODEL',
  description: '定制AI模型训练、优化、部署，含MLOps流水线',
  unitPrice: 2000000,
  currency: 'CNY',
  category: 'AI',
  isActive: true
}, {
  id: 'p11',
  name: '数据治理与分析平台',
  sku: 'DATA-GOV',
  description: '企业数据湖建设、数据质量管理、BI看板开发',
  unitPrice: 1500000,
  currency: 'CNY',
  category: 'AI',
  isActive: true
}, {
  id: 'p12',
  name: '智能客服/对话系统',
  sku: 'AI-CHAT',
  description: 'NLP驱动的智能客服，含知识库建设和多轮对话',
  unitPrice: 900000,
  currency: 'CNY',
  category: 'AI',
  isActive: true
},
// ── 行业解决方案 ──
{
  id: 'p13',
  name: '智慧金融解决方案',
  sku: 'FIN-SMART',
  description: '银行/保险数字化方案，含风控、反欺诈、智能营销',
  unitPrice: 3500000,
  currency: 'CNY',
  category: '行业方案',
  isActive: true
}, {
  id: 'p14',
  name: '智慧运营商解决方案',
  sku: 'TEL-SMART',
  description: '电信BSS/OSS数字化，含BOSS系统、网络智能运维',
  unitPrice: 3000000,
  currency: 'CNY',
  category: '行业方案',
  isActive: true
}, {
  id: 'p15',
  name: '智能制造MES方案',
  sku: 'MFG-MES',
  description: '制造执行系统，含产线数字孪生、质量追溯、设备OEE',
  unitPrice: 2800000,
  currency: 'CNY',
  category: '行业方案',
  isActive: true
}, {
  id: 'p16',
  name: '智慧园区/社区IoT平台',
  sku: 'IOT-PARK',
  description: 'IoT设备接入、数据可视化、智能控制、能耗管理',
  unitPrice: 1200000,
  currency: 'CNY',
  category: '行业方案',
  isActive: true
},
// ── IT外包与人力 ──
{
  id: 'p17',
  name: 'IT人力外包（驻场）',
  sku: 'IT-STAFF',
  description: '驻场开发/运维工程师，按人月计费',
  unitPrice: 25000,
  currency: 'CNY',
  category: '外包',
  isActive: true
}, {
  id: 'p18',
  name: '项目制外包开发',
  sku: 'PROJ-OUT',
  description: '按项目交付的离岸/近岸开发，含PM和QA',
  unitPrice: 2000000,
  currency: 'CNY',
  category: '外包',
  isActive: true
},
// ── 培训与支持 ──
{
  id: 'p19',
  name: '企业IT培训服务',
  sku: 'TRAIN-IT',
  description: '定制化技术培训，含云计算、AI、DevOps等课程',
  unitPrice: 150000,
  currency: 'CNY',
  category: '培训',
  isActive: true
}, {
  id: 'p20',
  name: '7×24技术支持年费',
  sku: 'SUP-724',
  description: '全年技术支持，含SLA保障、专属服务经理',
  unitPrice: 500000,
  currency: 'CNY',
  category: '支持',
  isActive: true
}];
const DEMO_QUOTES: Quote[] = [{
  id: 'q1',
  quoteNumber: 'QT-2026-001',
  accountName: '华为技术',
  opportunityName: '平台基础设施智能运维升级',
  status: 'sent',
  total: 35000000,
  validUntil: '2026-04-30',
  createdAt: '2026-03-15'
}, {
  id: 'q2',
  quoteNumber: 'QT-2026-002',
  accountName: '某全国性通信运营商',
  opportunityName: '5G网络智能运维平台',
  status: 'draft',
  total: 28000000,
  validUntil: '2026-05-15',
  createdAt: '2026-03-20'
}, {
  id: 'q3',
  quoteNumber: 'QT-2026-003',
  accountName: '某全国性股份制银行',
  opportunityName: '手机银行App重构',
  status: 'accepted',
  total: 22000000,
  validUntil: '2026-06-01',
  createdAt: '2026-02-28'
}, {
  id: 'q4',
  quoteNumber: 'QT-2026-004',
  accountName: '某大型合资车企',
  opportunityName: 'MES系统数字化改造',
  status: 'sent',
  total: 12000000,
  validUntil: '2026-05-30',
  createdAt: '2026-03-10'
}, {
  id: 'q5',
  quoteNumber: 'QT-2026-005',
  accountName: '某国家级能源集团',
  opportunityName: '配电网智能巡检系统',
  status: 'draft',
  total: 15000000,
  validUntil: '2026-06-30',
  createdAt: '2026-03-22'
}];
export default function ProductsPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const currency = useStore(s => s.currencyCode);
  const [tab, setTab] = useState<'products' | 'quotes'>('products');
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [products, setProducts] = useState<Product[]>(DEMO_PRODUCTS);
  const [quotes, setQuotes] = useState<Quote[]>(DEMO_QUOTES);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    description: '',
    unitPrice: '',
    category: '许可'
  });
  const [newQuote, setNewQuote] = useState({
    accountName: '',
    opportunityName: '',
    validDays: '30'
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    sku: '',
    description: '',
    unitPrice: '',
    category: ''
  });
  const filteredProducts = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  const filteredQuotes = quotes.filter(q => !search || q.quoteNumber.toLowerCase().includes(search.toLowerCase()) || q.accountName.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-7xl space-y-4 px-3 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tx("📦 产品与报价")}</h1>
          <p className="text-sm text-muted mt-1">{tx("管理产品目录、生成报价单")}</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
          <Plus className="h-4 w-4" />
          {tab === 'products' ? '添加产品' : '新建报价'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-sidebar p-1">
        <button onClick={() => setTab('products')} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'products' ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
          <Package className="inline h-4 w-4 mr-1.5" />{tx("产品目录")}</button>
        <button onClick={() => setTab('quotes')} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === 'quotes' ? 'bg-card text-foreground shadow-sm' : 'text-secondary hover:text-foreground'}`}>
          <FileText className="inline h-4 w-4 mr-1.5" />{tx("报价单")}</button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === 'products' ? '搜索产品...' : '搜索报价...'} className="form-input w-full" style={{
        paddingLeft: "2.25rem"
      }} />
      </div>

      {/* Add Product Form */}
      {showAddForm && tab === 'products' && <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">{tx("添加新产品")}</p>
            <button onClick={() => setShowAddForm(false)} className="text-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("产品名称 *")}</label>
              <input type="text" value={newProduct.name} onChange={e => setNewProduct({
            ...newProduct,
            name: e.target.value
          })} placeholder={tx("例：Closr CRM 企业版")} className="form-input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">SKU</label>
              <input type="text" value={newProduct.sku} onChange={e => setNewProduct({
            ...newProduct,
            sku: e.target.value
          })} placeholder={tx("例：CRM-ENT")} className="form-input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("单价 ($)")}</label>
              <input type="number" value={newProduct.unitPrice} onChange={e => setNewProduct({
            ...newProduct,
            unitPrice: e.target.value
          })} placeholder="299" className="form-input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("分类")}</label>
              <select value={newProduct.category} onChange={e => setNewProduct({
            ...newProduct,
            category: e.target.value
          })} className="form-input mt-1 w-full">
                <option value={tx("许可")}>{tx("许可")}</option>
                <option value={tx("AI 附加")}>{tx("AI 附加")}</option>
                <option value={tx("服务")}>{tx("服务")}</option>
                <option value={tx("支持")}>{tx("支持")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] text-muted font-medium">{tx("描述")}</label>
            <input type="text" value={newProduct.description} onChange={e => setNewProduct({
          ...newProduct,
          description: e.target.value
        })} placeholder={tx("产品描述")} className="form-input mt-1 w-full" />
          </div>
          <button onClick={() => {
        if (!newProduct.name) return;
        setProducts([...products, {
          id: 'p' + Date.now(),
          name: newProduct.name,
          sku: newProduct.sku,
          description: newProduct.description,
          unitPrice: parseFloat(newProduct.unitPrice) || 0,
          currency: 'USD',
          category: newProduct.category,
          isActive: true
        }]);
        setNewProduct({
          name: '',
          sku: '',
          description: '',
          unitPrice: '',
          category: '许可'
        });
        setShowAddForm(false);
      }} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">{tx("保存产品")}</button>
        </div>}

      {/* Add Quote Form */}
      {showAddForm && tab === 'quotes' && <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">{tx("新建报价")}</p>
            <button onClick={() => setShowAddForm(false)} className="text-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("客户名称 *")}</label>
              <input type="text" value={newQuote.accountName} onChange={e => setNewQuote({
            ...newQuote,
            accountName: e.target.value
          })} placeholder={tx("例：西门子")} className="form-input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("商机名称 *")}</label>
              <input type="text" value={newQuote.opportunityName} onChange={e => setNewQuote({
            ...newQuote,
            opportunityName: e.target.value
          })} placeholder={tx("例：工厂自动化平台")} className="form-input mt-1 w-full" />
            </div>
            <div>
              <label className="text-[12px] text-muted font-medium">{tx("有效天数")}</label>
              <input type="number" value={newQuote.validDays} onChange={e => setNewQuote({
            ...newQuote,
            validDays: e.target.value
          })} placeholder="30" className="form-input mt-1 w-full" />
            </div>
          </div>
          <button onClick={() => {
        if (!newQuote.accountName || !newQuote.opportunityName) return;
        const now = new Date();
        const validDays = parseInt(newQuote.validDays) || 30;
        const validUntil = new Date(now.getTime() + validDays * 86400000);
        const qNum = `QT-${now.getFullYear()}-${String(quotes.length + 1).padStart(3, '0')}`;
        setQuotes([...quotes, {
          id: 'q' + Date.now(),
          quoteNumber: qNum,
          accountName: newQuote.accountName,
          opportunityName: newQuote.opportunityName,
          status: 'draft',
          total: 0,
          validUntil: validUntil.toISOString().split('T')[0],
          createdAt: now.toISOString().split('T')[0]
        }]);
        setNewQuote({
          accountName: '',
          opportunityName: '',
          validDays: '30'
        });
        setShowAddForm(false);
      }} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">{tx("创建报价")}</button>
        </div>}

      {/* Products Tab */}
      {tab === 'products' && <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_80px_100px_80px_80px_70px] gap-2 px-4 py-2 text-[12px] font-semibold text-secondary uppercase border-b border-border">
            <span>{tx("产品")}</span><span>SKU</span><span>{tx("单价")}</span><span>{tx("分类")}</span><span>{tx("状态")}</span><span>{tx("操作")}</span>
          </div>
          {filteredProducts.map(p => editingId === p.id ? <div key={p.id} className="grid sm:grid-cols-[1fr_80px_100px_80px_80px_70px] gap-2 px-4 py-3 items-center border-b border-border last:border-0 bg-accent/5">
                <div>
                  <input type="text" value={editForm.name} onChange={e => setEditForm({
            ...editForm,
            name: e.target.value
          })} className="form-input text-sm w-full" />
                  <input type="text" value={editForm.description} onChange={e => setEditForm({
            ...editForm,
            description: e.target.value
          })} className="form-input text-[12px] w-full mt-1" placeholder={tx("描述")} />
                </div>
                <input type="text" value={editForm.sku} onChange={e => setEditForm({
          ...editForm,
          sku: e.target.value
        })} className="form-input text-xs w-full" />
                <input type="number" value={editForm.unitPrice} onChange={e => setEditForm({
          ...editForm,
          unitPrice: e.target.value
        })} className="form-input text-sm w-full" />
                <select value={editForm.category} onChange={e => setEditForm({
          ...editForm,
          category: e.target.value
        })} className="form-input text-[12px] w-full">
                  <option value={tx("许可")}>{tx("许可")}</option>
                  <option value={tx("AI 附加")}>{tx("AI 附加")}</option>
                  <option value={tx("服务")}>{tx("服务")}</option>
                  <option value={tx("支持")}>{tx("支持")}</option>
                </select>
                <span />
                <div className="flex gap-1">
                  <button onClick={() => {
            setProducts(products.map(prod => prod.id === p.id ? {
              ...prod,
              name: editForm.name,
              sku: editForm.sku,
              description: editForm.description,
              unitPrice: parseFloat(editForm.unitPrice) || prod.unitPrice,
              category: editForm.category
            } : prod));
            setEditingId(null);
          }} className="rounded bg-accent px-2 py-1 text-[12px] text-white">{tx("保存")}</button>
                  <button onClick={() => setEditingId(null)} className="rounded border border-border px-2 py-1 text-[12px] text-secondary">{tx("取消")}</button>
                </div>
              </div> : <div key={p.id} className="grid sm:grid-cols-[1fr_80px_100px_80px_80px_70px] gap-2 px-4 py-3 items-center border-b border-border last:border-0 hover:bg-background">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <p className="text-[12px] text-muted">{p.description}</p>
                </div>
                <span className="text-xs text-secondary font-mono">{p.sku}</span>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(p.unitPrice, currency)}{p.unitPrice < 1000 ? '/月' : ''}</span>
                <span className="text-[12px] text-muted">{p.category}</span>
                <span className={`text-[12px] font-medium ${p.isActive ? 'text-positive' : 'text-muted'}`}>{p.isActive ? '✅ 在售' : '停售'}</span>
                <div className="flex gap-1">
                  <button onClick={() => {
            setEditingId(p.id);
            setEditForm({
              name: p.name,
              sku: p.sku,
              description: p.description,
              unitPrice: String(p.unitPrice),
              category: p.category
            });
          }} className="rounded p-1 text-secondary hover:text-accent hover:bg-accent/10" title={tx("编辑")}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={async () => {
            if (await appConfirm({
              message: '确定删除此产品？',
              variant: 'danger'
            })) setProducts(products.filter(prod => prod.id !== p.id));
          }} className="rounded p-1 text-secondary hover:text-danger hover:bg-danger/10" title={tx("删除")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>)}
        </div>}

      {/* Quotes Tab */}
      {tab === 'quotes' && <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="hidden sm:grid grid-cols-[100px_1fr_1fr_80px_100px_100px_70px] gap-2 px-4 py-2 text-[12px] font-semibold text-secondary uppercase border-b border-border">
            <span>{tx("报价号")}</span><span>{tx("客户")}</span><span>{tx("商机")}</span><span>{tx("状态")}</span><span>{tx("金额")}</span><span>{tx("有效期")}</span><span>{tx("操作")}</span>
          </div>
          {filteredQuotes.map(q => {
        const status = STATUS_STYLES[q.status] || {
          label: q.status,
          class: 'bg-white/10 text-secondary'
        };
        return <div key={q.id} className="grid sm:grid-cols-[100px_1fr_1fr_80px_100px_100px_70px] gap-2 px-4 py-3 items-center border-b border-border last:border-0 hover:bg-background">
                <span className="text-xs font-mono text-accent">{q.quoteNumber}</span>
                <span className="text-sm text-foreground">{q.accountName}</span>
                <span className="text-xs text-secondary">{q.opportunityName}</span>
                <select value={q.status} onChange={e => setQuotes(quotes.map(qq => qq.id === q.id ? {
            ...qq,
            status: e.target.value
          } : qq))} className={`rounded-full px-2 py-0.5 text-[12px] font-medium border-0 appearance-none bg-transparent cursor-pointer ${status.class}`} style={{
            WebkitAppearance: 'none',
            backgroundImage: 'none'
          }}>
                  <option value="draft">{tx("草稿")}</option>
                  <option value="sent">{tx("已发送")}</option>
                  <option value="accepted">{tx("已接受")}</option>
                  <option value="rejected">{tx("已拒绝")}</option>
                  <option value="expired">{tx("已过期")}</option>
                </select>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(q.total, currency)}</span>
                <span className="text-[12px] text-muted">{q.validUntil}</span>
                <div className="flex gap-1">
                  <button onClick={async () => {
              if (await appConfirm({
                message: '确定删除此报价？',
                variant: 'danger'
              })) setQuotes(quotes.filter(qq => qq.id !== q.id));
            }} className="rounded p-1 text-secondary hover:text-danger hover:bg-danger/10" title={tx("删除")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>;
      })}
        </div>}
    </div>;
}