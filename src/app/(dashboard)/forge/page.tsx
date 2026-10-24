"use client";

import Link from "next/link";
import { useState } from "react";
import { Settings, Building2, Shield, Database, Calendar, Bell, BarChart3, Package, Trophy, Users2, GitBranch, TrendingUp, Users, Clock, CircleHelp, ArrowRight } from "lucide-react";
import { useLocale, type TranslationKey } from "@/lib/i18n";
import SettingsPage from "../settings/page";
import OrganizationPage from "../organization/page";
import AuditPage from "../audit/page";
import PipelineConfig from "./pipeline-config";
import ProductsPage from "../products/page";

type ForgeTab = "settings" | "organization" | "audit" | "pipeline" | "products" | "tools";

const TAB_CONFIG: { key: ForgeTab; icon: typeof Settings; labelKey: TranslationKey }[] = [
  { key: "settings", icon: Settings, labelKey: "forge.tabs.settings" },
  { key: "organization", icon: Building2, labelKey: "forge.tabs.organization" },
  { key: "audit", icon: Shield, labelKey: "forge.tabs.audit" },
  { key: "pipeline", icon: GitBranch, labelKey: "forge.tabs.pipeline" },
  { key: "products", icon: Package, labelKey: "forge.tabs.products" },
  { key: "tools", icon: Database, labelKey: "forge.tabs.tools" },
];

const ADVANCED_TOOLS: {
  href: string;
  labelKey: TranslationKey;
  icon: typeof Settings;
  desc: string;
  descEn: string;
}[] = [
  { href: "/import", labelKey: "nav.import", icon: Database, desc: "批量导入客户、联系人和商机数据", descEn: "Bulk import accounts, contacts, and opportunities" },
  { href: "/channels", labelKey: "nav.channels", icon: Users2, desc: "管理渠道、合作伙伴和来源", descEn: "Manage channels, partners, and sources" },
  { href: "/products", labelKey: "nav.products", icon: Package, desc: "管理产品、报价与方案素材", descEn: "Manage products, pricing, and proposal assets" },
  { href: "/reports", labelKey: "nav.reports", icon: BarChart3, desc: "查看详细趋势、漏斗和业务报表", descEn: "Review trends, funnels, and business reports" },
  { href: "/calendar", labelKey: "nav.calendar", icon: Calendar, desc: "查看日程与销售活动安排", descEn: "Review calendar and sales activities" },
  { href: "/notifications", labelKey: "nav.notifications", icon: Bell, desc: "统一查看提醒、风险和待处理事项", descEn: "Review reminders, risks, and pending work" },
  { href: "/performance", labelKey: "nav.performance", icon: BarChart3, desc: "个人和团队绩效分析", descEn: "Analyze individual and team performance" },
  { href: "/pool", labelKey: "nav.pool", icon: Building2, desc: "管理客户公海与回收客户", descEn: "Manage account pool and reclaimed accounts" },
  { href: "/forecast", labelKey: "nav.forecast", icon: TrendingUp, desc: "基于管线数据预测未来收入", descEn: "Forecast future revenue from pipeline data" },
  { href: "/leaderboard", labelKey: "nav.leaderboard", icon: Trophy, desc: "团队销售排名和竞赛", descEn: "Team rankings and sales competitions" },
  { href: "/contacts", labelKey: "nav.contacts", icon: Users, desc: "全局联系人管理和搜索", descEn: "Global contact management and search" },
  { href: "/activity", labelKey: "nav.activity", icon: Clock, desc: "系统操作和变更记录", descEn: "System activity and change history" },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, desc: "个人偏好、通知和安全设置", descEn: "Personal preferences, notifications, and security settings" },
  { href: "/help", labelKey: "nav.help", icon: CircleHelp, desc: "面向新用户的快速开始、核心概念和常见问题", descEn: "Quick start, core concepts, and FAQs for new users" },
];

export default function ForgePage() {
  const [activeTab, setActiveTab] = useState<ForgeTab>("settings");
  const { locale, t } = useLocale();
  const en = locale === "en";

  return (
    <div className="page-shell">
      <div className="page-hero">
        <div className="page-hero-row">
          <div>
            <div className="page-kicker">{en ? "Settings Workbench" : "设置工坊"}</div>
            <h1 className="page-title">{t("nav.forge")}</h1>
            <p className="page-subtitle">
              {en
                ? "System configuration, organization management, and audit traceability live in one governance workbench."
                : "系统配置、组织管理与审计追溯统一放在一个治理工作台里，减少设置页的碎片感。"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/help"
              className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/12"
            >
              <CircleHelp className="h-3.5 w-3.5" />
              {en ? "Quick Start" : "新手指南"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="page-meta">System · Organization · Audit</div>
          </div>
        </div>

        <div className="module-tabs">
        {TAB_CONFIG.map(({ key, icon: Icon, labelKey }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`module-tab ${isActive ? "module-tab-active" : ""}`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(labelKey)}</span>
            </button>
          );
        })}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "settings" && <SettingsPage />}
        {activeTab === "organization" && <OrganizationPage />}
        {activeTab === "audit" && <AuditPage />}
        {activeTab === "pipeline" && <PipelineConfig />}
        {activeTab === "products" && <ProductsPage />}
        {activeTab === "tools" && (
          <div className="mx-auto max-w-7xl px-3 sm:px-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{en ? "Advanced Tools" : "高级工具"}</p>
              <p className="mt-1 text-sm text-secondary">{en ? "Tools that were previously scattered across the system are grouped here for faster access." : "原本分散在系统各处的工具先统一收拢到这里，降低查找成本。"}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ADVANCED_TOOLS.map(({ href, labelKey, icon: Icon, desc, descEn }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-xl border border-border bg-card p-4 transition-all hover:border-secondary hover:shadow-sm"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/8 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">{t(labelKey)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-secondary">{en ? descEn : desc}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
