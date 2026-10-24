'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useState } from 'react';
import { FileText, Loader2, Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, Target, Zap, CheckCircle2, Search } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
interface KeyMetric {
  name: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  note: string;
}
interface StrategicKeyword {
  keyword: string;
  frequency: 'high' | 'medium' | 'low';
  significance: string;
}
interface FinancialAnalysisResult {
  keyMetrics: KeyMetric[];
  strategicKeywords: StrategicKeyword[];
  digitalSignals: string[];
  riskSignals: string[];
  salesTalkingPoints: string[];
  overallAssessment: string;
}
const TREND_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus
};
const TREND_COLOR = {
  up: 'text-emerald-400',
  down: 'text-red-400',
  stable: 'text-amber-400'
};
const FREQUENCY_BADGE = {
  high: 'bg-red-500/15 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
};
const FREQUENCY_LABEL = {
  high: '高频',
  medium: '中频',
  low: '低频'
};
export default function FinancialAnalysisPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [financialData, setFinancialData] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FinancialAnalysisResult | null>(null);
  const [error, setError] = useState('');
  async function handleAnalyze() {
    if (!companyName.trim()) {
      setError('请输入公司名称');
      return;
    }
    if (!financialData.trim() || financialData.trim().length < 20) {
      setError('请粘贴财报内容（至少20字）');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/financial-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyName: companyName.trim(),
          industry: industry.trim() || undefined,
          financialData: financialData.trim(),
          outputLocale: locale
        })
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'AI 分析失败');
        return;
      }
      const data = await res.json();
      setResult(data);
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }
  function handleReset() {
    setCompanyName('');
    setIndustry('');
    setFinancialData('');
    setResult(null);
    setError('');
  }
  return <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <FileText className="h-7 w-7 text-accent" />
          <h1 className="text-3xl font-bold text-foreground">{tx("财务分析中心")}</h1>
        </div>
        <p className="text-sm text-muted">{tx("从财报中提取 B2B 销售情报 · 发现商机信号")}</p>
      </div>

      {/* Input Section */}
      {!result && <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="space-y-4">
            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-semibold text-foreground mb-2">{tx("公司名称")}<span className="text-red-400">*</span>
              </label>
              <input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder={tx("如：阿里巴巴集团")} className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
            </div>

            {/* Industry (Optional) */}
            <div>
              <label htmlFor="industry" className="block text-sm font-semibold text-foreground mb-2">{tx("行业（可选）")}</label>
              <input id="industry" type="text" value={industry} onChange={e => setIndustry(e.target.value)} placeholder={tx("如：电商、SaaS、制造业")} className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
            </div>

            {/* Financial Data */}
            <div>
              <label htmlFor="financialData" className="block text-sm font-semibold text-foreground mb-2">{tx("财报内容")}<span className="text-red-400">*</span>
              </label>
              <textarea id="financialData" value={financialData} onChange={e => setFinancialData(e.target.value)} placeholder={tx("粘贴财报内容、年报摘要、投资者报告等...\n\n示例：\n2024 年 Q1 财报显示营收同比增长 35%，达到 12.5 亿元。数字化转型业务贡献占比提升至 28%，云计算收入增长 52%。公司宣布未来三年将投入 5 亿元用于 AI 和自动化基础设施建设...")} rows={12} className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 resize-y" />
              <p className="mt-2 text-xs text-muted">{tx("已输入")}{financialData.length}{tx("字符（最少 20 字符）")}</p>
            </div>
          </div>

          {/* Error */}
          {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button onClick={handleAnalyze} disabled={loading || !companyName.trim() || financialData.trim().length < 20} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <>
                  <Loader2 className="h-4 w-4 animate-spin" />{tx("AI 分析中...")}</> : <>
                  <Sparkles className="h-4 w-4" />{tx("开始分析")}</>}
            </button>
            <button onClick={handleReset} disabled={loading} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted hover:bg-white/5 hover:text-foreground transition-colors disabled:opacity-50">{tx("重置")}</button>
          </div>
        </div>}

      {/* Result Section */}
      {result && <div className="space-y-5">
          {/* Action Bar */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {companyName}{tx("财报分析完成")}</p>
                <p className="text-xs text-muted">
                  {industry && `${industry} · `}{tx("共提取")}{result.keyMetrics.length}{tx("项关键指标")}</p>
              </div>
            </div>
            <button onClick={handleReset} className="flex items-center gap-2 rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors">
              <Search className="h-4 w-4" />{tx("分析其他公司")}</button>
          </div>

          {/* Overall Assessment */}
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-bold text-accent uppercase tracking-wider">{tx("总体评估")}</h2>
            </div>
            <p className="text-sm text-secondary leading-relaxed whitespace-pre-line">
              {result.overallAssessment}
            </p>
          </div>

          {/* Key Metrics */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">{tx("关键财务指标")}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.keyMetrics.map((metric, idx) => {
            const TrendIcon = TREND_ICON[metric.trend];
            const trendColor = TREND_COLOR[metric.trend];
            return <div key={idx} className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted uppercase tracking-wider">
                          {metric.name}
                        </p>
                        <p className="mt-1 text-xl font-bold text-foreground truncate">
                          {metric.value}
                        </p>
                      </div>
                      <TrendIcon className={`h-5 w-5 flex-shrink-0 ${trendColor}`} />
                    </div>
                    {metric.note && <p className="mt-2 text-xs text-secondary leading-relaxed">
                        {metric.note}
                      </p>}
                  </div>;
          })}
            </div>
          </div>

          {/* Strategic Keywords */}
          {result.strategicKeywords.length > 0 && <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">{tx("战略关键词")}</h2>
              </div>
              <div className="space-y-3">
                {result.strategicKeywords.map((kw, idx) => <div key={idx} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${FREQUENCY_BADGE[kw.frequency]}`}>
                      {FREQUENCY_LABEL[kw.frequency]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{kw.keyword}</p>
                      <p className="mt-1 text-xs text-secondary">{kw.significance}</p>
                    </div>
                  </div>)}
              </div>
            </div>}

          {/* Digital Signals */}
          {result.digitalSignals.length > 0 && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">{tx("数字化转型信号")}</h2>
              </div>
              <ul className="space-y-2">
                {result.digitalSignals.map((signal, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-secondary">
                    <span className="mt-0.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                    <span>{signal}</span>
                  </li>)}
              </ul>
            </div>}

          {/* Risk Signals */}
          {result.riskSignals.length > 0 && <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">{tx("风险信号")}</h2>
              </div>
              <ul className="space-y-2">
                {result.riskSignals.map((signal, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-secondary">
                    <span className="mt-0.5 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                    <span>{signal}</span>
                  </li>)}
              </ul>
            </div>}

          {/* Sales Talking Points */}
          {result.salesTalkingPoints.length > 0 && <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-bold text-accent uppercase tracking-wider">{tx("销售话术建议")}</h2>
              </div>
              <ul className="space-y-2">
                {result.salesTalkingPoints.map((point, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-secondary">
                    <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">
                      {idx + 1}
                    </span>
                    <span>{point}</span>
                  </li>)}
              </ul>
            </div>}
        </div>}
    </div>;
}
