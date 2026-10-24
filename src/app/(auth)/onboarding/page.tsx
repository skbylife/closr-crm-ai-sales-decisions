'use client';

import { useState, useCallback, useEffect } from 'react';
import { genId } from '@/lib/gen-id';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2, Loader2, ArrowRight, ArrowLeft, Globe, User, Target,
  CheckCircle2, SkipForward, Briefcase, DollarSign,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { STRATEGIC_GOAL_LABELS, type StrategicGoalType } from '@/lib/babel-engine/types';

// ─── 步骤配置 ───────────────────────────────────────────────────────
const STEPS = [
  { key: 'welcome', label: '创建组织' },
  { key: 'account', label: '添加客户' },
  { key: 'pipeline', label: '创建商机' },
  { key: 'play', label: '创建谋局' },
  { key: 'done', label: '开始使用' },
] as const;

type OnboardingLocale = 'zh' | 'en';

const ONBOARDING_COPY = {
  zh: {
    progressStep: '步骤',
    orgTitle: 'Welcome to Closr',
    orgDesc: '设置你的工作空间，开始结构化地推进每一个 deal',
    orgName: '公司 / 团队名称',
    orgNamePlaceholder: '例如：Acme Corp 销售团队',
    domain: '公司域名（可选）',
    domainPlaceholder: '例如：acme.com',
    createContinue: '创建并继续',
    accountTitle: '添加第一个客户',
    accountDesc: '录入你正在跟进的目标客户',
    accountName: '客户名称',
    accountNamePlaceholder: '例如：字节跳动',
    industry: '所属行业（可选）',
    industryPlaceholder: '例如：互联网 / SaaS / 金融',
    website: '公司网站（可选）',
    websitePlaceholder: '例如：bytedance.com',
    opportunityTitle: '创建第一个商机',
    opportunityDesc: '在 Pipeline 中追踪你的第一个销售机会',
    opportunityName: '商机名称',
    opportunityNamePlaceholder: '例如：企业版年度订阅',
    amount: '预估金额（可选）',
    amountPlaceholder: '例如：100000',
    planTitle: '为你的客户制定谋局',
    planDesc: '谋局是 Closr 的核心 — 为每个客户制定推进策略。选择一个目标，AI 会帮你生成步骤和假设。',
    strategicGoal: '战略目标',
    goalDescription: '目标描述（可选，AI 可自动填充）',
    goalDescriptionPlaceholder: '例如：在 Q2 结束前与 CTO 建立直接沟通渠道',
    tip: '不确定？选「建立长期关系」是最常见的起步策略',
    doneTitle: '一切就绪',
    doneDesc: '你的工作空间已准备好',
    orgSummary: '组织',
    accountSummary: '客户',
    opportunitySummary: '商机',
    planSummary: '谋局',
    enterWorkspace: '进入工作台',
    saveContinue: '保存并继续',
    skip: '跳过',
    skipStep: '跳过此步骤',
    back: '返回',
    processing: '处理中...',
    createFailed: '创建失败',
    addAccountFailed: '添加客户失败，可跳过此步骤',
    addOpportunityFailed: '创建商机失败，可跳过此步骤',
    createPlanFailed: '创建谋局失败，可跳过此步骤',
    addAccountFirst: '请先添加一个客户（返回第二步）',
    completeFirst: '请先完成第一步',
  },
  en: {
    progressStep: 'Step',
    orgTitle: 'Welcome to Closr',
    orgDesc: 'Set up your workspace and start managing complex deals with structure.',
    orgName: 'Company / team name',
    orgNamePlaceholder: 'Example: Acme Revenue Team',
    domain: 'Company domain (optional)',
    domainPlaceholder: 'Example: acme.com',
    createContinue: 'Create and continue',
    accountTitle: 'Add your first account',
    accountDesc: 'Enter a target account your team is actively working.',
    accountName: 'Account name',
    accountNamePlaceholder: 'Example: Acme Manufacturing',
    industry: 'Industry (optional)',
    industryPlaceholder: 'Example: Manufacturing / SaaS / Finance',
    website: 'Company website (optional)',
    websitePlaceholder: 'Example: acme.com',
    opportunityTitle: 'Create your first opportunity',
    opportunityDesc: 'Track your first revenue opportunity in the pipeline.',
    opportunityName: 'Opportunity name',
    opportunityNamePlaceholder: 'Example: Enterprise annual subscription',
    amount: 'Estimated amount (optional)',
    amountPlaceholder: 'Example: 100000',
    planTitle: 'Create an account plan',
    planDesc: 'Account plans turn customer context into concrete steps, assumptions, and priority actions.',
    strategicGoal: 'Plan goal',
    goalDescription: 'Goal description (optional)',
    goalDescriptionPlaceholder: 'Example: Build a direct path to the CTO before the Q2 decision',
    tip: 'Not sure? Relationship building is the most common starting plan.',
    doneTitle: 'You are all set',
    doneDesc: 'Your workspace is ready.',
    orgSummary: 'Organization',
    accountSummary: 'Account',
    opportunitySummary: 'Opportunity',
    planSummary: 'Plan',
    enterWorkspace: 'Enter workspace',
    saveContinue: 'Save and continue',
    skip: 'Skip',
    skipStep: 'Skip this step',
    back: 'Back',
    processing: 'Processing...',
    createFailed: 'Creation failed',
    addAccountFailed: 'Unable to add account. You can skip this step.',
    addOpportunityFailed: 'Unable to create opportunity. You can skip this step.',
    createPlanFailed: 'Unable to create plan. You can skip this step.',
    addAccountFirst: 'Add an account first or go back to step 2.',
    completeFirst: 'Complete the first step first.',
  },
} as const;

// ─── 进度条组件 ─────────────────────────────────────────────────────
function ProgressBar({ current, total, stepLabel }: { current: number; total: number; stepLabel: string }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs text-secondary">
        <span>{stepLabel} {current + 1} / {total}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all duration-400 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── 步骤指示器（圆点） ─────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-400 ${
            i === current
              ? 'w-6 bg-accent'
              : i < current
                ? 'w-2 bg-accent/50'
                : 'w-2 bg-border'
          }`}
        />
      ))}
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale] = useState<OnboardingLocale>(() => {
    const paramLocale = searchParams.get('lang');
    if (paramLocale === 'en') return 'en';
    if (typeof window !== 'undefined' && localStorage.getItem('closr-locale') === 'en') return 'en';
    return 'zh';
  });
  const copy = ONBOARDING_COPY[locale];
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  // 检查用户是否已完成 onboarding（已有组织）
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    localStorage.setItem('closr-locale', locale);
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push(locale === 'en' ? '/login?lang=en' : '/login'); return; }
        const { data: mem } = await supabase
          .from('org_memberships')
          .select('org_id')
          .eq('user_id', user.id)
          .limit(1);
        if (mem && mem.length > 0) { window.location.href = '/horizon'; return; }
      } catch { /* 忽略 */ }
      setChecking(false);
    })();
  }, [locale, router]);

  // Step 1 数据
  const [orgName, setOrgName] = useState('');
  const [domain, setDomain] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);

  // Step 2 数据
  const [accountName, setAccountName] = useState('');
  const [accountIndustry, setAccountIndustry] = useState('');
  const [accountWebsite, setAccountWebsite] = useState('');

  // Step 3 数据
  const [oppName, setOppName] = useState('');
  const [oppValue, setOppValue] = useState('');

  // Step 4 数据
  const [goalType, setGoalType] = useState<StrategicGoalType>('build_relationship');
  const [goalDescription, setGoalDescription] = useState('');

  const goNext = useCallback(() => {
    setDirection('next');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setError('');
  }, []);

  const goPrev = useCallback(() => {
    setDirection('prev');
    setStep((s) => Math.max(s - 1, 0));
    setError('');
  }, []);

  // ─── Step 1: 创建组织 ─────────────────────────────────────────────
  const handleCreateOrg = async () => {
      if (!orgName.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim(), domain: domain.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || copy.createFailed); return; }
      setOrgId(data.id);
      goNext();
    } catch {
      setError(copy.createFailed);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 2: 添加第一个客户 ───────────────────────────────────────
  const handleAddAccount = async () => {
    if (!accountName.trim()) { goNext(); return; }
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) { setError(copy.completeFirst); return; }
      const id = genId();
      const { error: dbErr } = await supabase.from('accounts').insert({
        id,
        user_id: user.id,
        org_id: orgId,
        name: accountName.trim(),
        industry: accountIndustry.trim() || null,
        website: accountWebsite.trim() || null,
      });
      if (dbErr) throw dbErr;
      goNext();
    } catch (e) {
      console.error('[onboarding] addAccount failed:', e);
      setError(copy.addAccountFailed);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 3: 创建第一个机会 ───────────────────────────────────────
  const handleAddOpportunity = async () => {
    if (!oppName.trim()) { goNext(); return; }
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) { setError(copy.completeFirst); return; }
      let accountId: string | null = null;
      if (accountName.trim()) {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('org_id', orgId)
          .eq('user_id', user.id)
          .limit(1);
        accountId = accounts?.[0]?.id ?? null;
      }
      const id = genId();
      const now = new Date().toISOString();
      const { error: dbErr } = await supabase.from('opportunities').insert({
        id,
        user_id: user.id,
        org_id: orgId,
        account_id: accountId,
        name: oppName.trim(),
        value: parseFloat(oppValue) || 0,
        currency: locale === 'en' ? 'USD' : 'CNY',
        stage: 'lead_identified',
        probability: 10,
        expected_close_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
        assigned_to: user.id,
        owner: user.email || '',
        source: 'onboarding',
        created_at: now,
        updated_at: now,
      });
      if (dbErr) throw dbErr;
      if (accountId) {
        await supabase.from('accounts').update({
          opportunity_ids: [id],
          last_activity: now,
        }).eq('id', accountId);
      }
      goNext();
    } catch (e) {
      console.error('[onboarding] addOpportunity failed:', e);
      setError(copy.addOpportunityFailed);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 4: 创建谋局 ────────────────────────────────────────────
  const handleCreatePlay = async () => {
    setError('');
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !orgId) { setError(copy.completeFirst); return; }
      let accountId: string | null = null;
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .limit(1);
      accountId = accounts?.[0]?.id ?? null;
      if (!accountId) { setError(copy.addAccountFirst); return; }
      const res = await fetch('/api/strategic-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          goalType,
          goalDescription: goalDescription.trim() || STRATEGIC_GOAL_LABELS[goalType],
          status: 'active',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || copy.createPlanFailed);
        return;
      }
      goNext();
    } catch (e) {
      console.error('[onboarding] createPlay failed:', e);
      setError(copy.createPlanFailed);
    } finally {
      setLoading(false);
    }
  };

  // ─── Step 5: 完成 ──────────────────────────────────────────────
  const handleFinish = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && orgId) {
        await supabase.from('user_settings').upsert({
          id: genId(),
          user_id: user.id,
          org_id: orgId,
          targets: { onboarding_completed: true, completed_at: new Date().toISOString() },
        }, { onConflict: 'id' });
      }
    } catch { /* 忽略 */ }
    window.location.href = '/horizon';
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  const animCls = direction === 'next'
    ? 'animate-[slideInRight_0.3s_ease-out]'
    : 'animate-[slideInLeft_0.3s_ease-out]';

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div key="step0" className={`space-y-6 ${animCls}`}>
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Building2 className="h-7 w-7" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">{copy.orgTitle}</h2>
              <p className="mt-2 text-sm text-secondary">
                {copy.orgDesc}
              </p>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="space-y-3">
              <InputField id="orgName" label={copy.orgName} icon={<Building2 className="h-4 w-4" />}
                placeholder={copy.orgNamePlaceholder} value={orgName} onChange={setOrgName} autoFocus />
              <InputField id="domain" label={copy.domain} icon={<Globe className="h-4 w-4" />}
                placeholder={copy.domainPlaceholder} value={domain} onChange={setDomain} />
            </div>
            <div className="flex">
              <PrimaryButton loading={loading} disabled={!orgName.trim()} onClick={handleCreateOrg} label={copy.createContinue} loadingLabel={copy.processing} />
            </div>
          </div>
        );

      case 1:
        return (
          <div key="step1" className={`space-y-6 ${animCls}`}>
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <User className="h-7 w-7" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">{copy.accountTitle}</h2>
              <p className="mt-2 text-sm text-secondary">
                {copy.accountDesc}
              </p>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="space-y-3">
              <InputField id="accountName" label={copy.accountName} icon={<Briefcase className="h-4 w-4" />}
                placeholder={copy.accountNamePlaceholder} value={accountName} onChange={setAccountName} autoFocus />
              <InputField id="accountIndustry" label={copy.industry} icon={<Target className="h-4 w-4" />}
                placeholder={copy.industryPlaceholder} value={accountIndustry} onChange={setAccountIndustry} />
              <InputField id="accountWebsite" label={copy.website} icon={<Globe className="h-4 w-4" />}
                placeholder={copy.websitePlaceholder} value={accountWebsite} onChange={setAccountWebsite} />
            </div>
            <div className="flex gap-3">
              <BackButton onClick={goPrev} label={copy.back} />
              <PrimaryButton loading={loading} disabled={false} onClick={handleAddAccount}
                label={accountName.trim() ? copy.saveContinue : copy.skip} loadingLabel={copy.processing} />
            </div>
          </div>
        );

      case 2:
        return (
          <div key="step2" className={`space-y-6 ${animCls}`}>
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Target className="h-7 w-7" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">{copy.opportunityTitle}</h2>
              <p className="mt-2 text-sm text-secondary">
                {copy.opportunityDesc}
              </p>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="space-y-3">
              <InputField id="oppName" label={copy.opportunityName} icon={<Briefcase className="h-4 w-4" />}
                placeholder={copy.opportunityNamePlaceholder} value={oppName} onChange={setOppName} autoFocus />
              <InputField id="oppValue" label={copy.amount} icon={<DollarSign className="h-4 w-4" />}
                placeholder={copy.amountPlaceholder} value={oppValue} onChange={setOppValue} type="number" />
            </div>
            <div className="flex gap-3">
              <BackButton onClick={goPrev} label={copy.back} />
              <PrimaryButton loading={loading} disabled={false} onClick={handleAddOpportunity}
                label={oppName.trim() ? copy.saveContinue : copy.skip} loadingLabel={copy.processing} />
            </div>
          </div>
        );

      case 3:
        return (
          <div key="step3" className={`space-y-6 ${animCls}`}>
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Target className="h-7 w-7" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">{copy.planTitle}</h2>
              <p className="mt-2 text-sm text-secondary">
                {copy.planDesc}
              </p>
            </div>
            {error && <ErrorBanner message={error} />}
            <div className="space-y-3">
              <div>
                <label htmlFor="goalType" className="mb-1.5 block text-xs font-medium text-secondary">{copy.strategicGoal}</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"><Target className="h-4 w-4" /></div>
                  <select
                    id="goalType"
                    value={goalType}
                    onChange={(e) => setGoalType(e.target.value as StrategicGoalType)}
                    className="w-full appearance-none rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                  >
                    {Object.entries(STRATEGIC_GOAL_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="goalDescription" className="mb-1.5 block text-xs font-medium text-secondary">{copy.goalDescription}</label>
                <textarea
                  id="goalDescription"
                  value={goalDescription}
                  onChange={(e) => setGoalDescription(e.target.value)}
                  placeholder={copy.goalDescriptionPlaceholder}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                />
              </div>
            </div>
            <p className="text-xs text-secondary">
              {copy.tip}
            </p>
            <div className="flex gap-3">
              <BackButton onClick={goPrev} label={copy.back} />
              <PrimaryButton loading={loading} disabled={false} onClick={handleCreatePlay} label={copy.saveContinue} loadingLabel={copy.processing} />
            </div>
          </div>
        );

      case 4:
        return (
          <div key="step4" className={`space-y-6 ${animCls}`}>
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-positive/10 text-positive">
                <CheckCircle2 className="h-7 w-7" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-foreground">{copy.doneTitle}</h2>
              <p className="mt-2 text-sm text-secondary">
                {copy.doneDesc}
              </p>
            </div>
            <div className="space-y-2">
              <SummaryItem icon={<Building2 className="h-4 w-4" />} label={copy.orgSummary} value={orgName} />
              {accountName.trim() && (
                <SummaryItem icon={<User className="h-4 w-4" />} label={copy.accountSummary} value={accountName} />
              )}
              {oppName.trim() && (
                <SummaryItem icon={<Target className="h-4 w-4" />} label={copy.opportunitySummary} value={oppName} />
              )}
              {goalType && (
                <SummaryItem icon={<Target className="h-4 w-4" />} label={copy.planSummary} value={STRATEGIC_GOAL_LABELS[goalType]} />
              )}
            </div>
            <button
              onClick={handleFinish}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {copy.enterWorkspace}
            </button>
          </div>
        );
    }
  };

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-bold text-white">
              C
            </div>
          </div>

          {/* Progress */}
          <ProgressBar current={step} total={STEPS.length} stepLabel={copy.progressStep} />
          <div className="flex justify-center">
            <StepDots current={step} total={STEPS.length} />
          </div>

          {/* Content Card */}
          <div className="rounded-2xl border border-border bg-card p-8">
            {renderStep()}
          </div>

          {/* Skip */}
          {step > 0 && step < STEPS.length - 1 && (
            <div className="flex justify-center">
              <button
                onClick={goNext}
                className="flex items-center gap-1 text-xs text-secondary transition-colors hover:text-foreground"
              >
                <SkipForward className="h-3 w-3" />
                {copy.skipStep}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── 子组件 ─────────────────────────────────────────────────────────

function InputField({ id, label, icon, placeholder, value, onChange, autoFocus, type = 'text' }: {
  id: string; label: string; icon: React.ReactNode; placeholder: string;
  value: string; onChange: (v: string) => void; autoFocus?: boolean; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-secondary">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary">{icon}</div>
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoFocus={autoFocus}
          className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder-secondary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30" />
      </div>
    </div>
  );
}

function PrimaryButton({ loading, disabled, onClick, label, loadingLabel }: {
  loading: boolean; disabled: boolean; onClick: () => void; label: string; loadingLabel: string;
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {loading ? loadingLabel : label}
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center justify-center gap-1 rounded-xl border border-border px-4 py-3 text-sm text-secondary transition-colors hover:bg-background hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{message}</div>
  );
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3">
      <div className="text-secondary">{icon}</div>
      <div className="flex-1">
        <span className="text-xs text-secondary">{label}</span>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
      <CheckCircle2 className="h-4 w-4 text-positive" />
    </div>
  );
}
