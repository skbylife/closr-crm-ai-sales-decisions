'use client';

import { useState } from 'react';
import { Target, Loader2, ChevronRight, ArrowRight, Brain, Users, X, Sparkles, Building2, Crosshair, Eye } from 'lucide-react';
import { genId } from '@/lib/gen-id';
import { usePlayPermissions } from '@/hooks/use-permissions';
import { STRATEGIC_GOAL_LABELS } from '@/lib/babel-engine/types';
import { PLAY_TEMPLATES } from '@/lib/play-templates';
import { toast } from '@/lib/toast-store';
import { useLocale } from '@/lib/i18n';
import { PlayGeneratingOverlay } from './generating-overlay';
import { GOAL_ICONS, displayContactRole, OPPORTUNITY_GOAL_TYPES, ACCOUNT_ONLY_GOAL_TYPES } from './labels';
import { displayText } from './text';
import type {
  Contact,
  Opportunity,
  StrategicGoalType,
  PlayAssumption,
} from '@/lib/babel-engine/types';

export function NewPlayForm({
  contacts,
  accountId,
  accountName,
  opportunities,
  initialGoalType,
  initialGoalDescription,
  initialSuccessCriteria,
  initialOpportunityId,
  initialAdditionalContext,
  onCreated,
  onCancel,
}: {
  contacts: Contact[];
  accountId: string;
  accountName: string;
  opportunities: Opportunity[];
  initialGoalType?: string;
  initialGoalDescription?: string;
  initialSuccessCriteria?: string;
  initialOpportunityId?: string;
  initialAdditionalContext?: string;
  onCreated: (newPlayId?: string) => void;
  onCancel: () => void;
}) {
  const permissions = usePlayPermissions();
  const { locale } = useLocale();

  // Wizard state
  const [step, setStep] = useState(1);

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 1: Define Objective
  const [scope, setScope] = useState<'opportunity' | 'account'>('opportunity');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(initialOpportunityId || '');
  const [goalType, setGoalType] = useState<StrategicGoalType>((initialGoalType as StrategicGoalType) || 'reach_key_person');
  const [goalDescription, setGoalDescription] = useState(displayText(initialGoalDescription));
  const [targetContactId, setTargetContactId] = useState('');
  const [successCriteria, setSuccessCriteria] = useState(displayText(initialSuccessCriteria));
  const [deadline, setDeadline] = useState('');

  // Step 2: Assess Situation
  const [additionalContext, setAdditionalContext] = useState(displayText(initialAdditionalContext));
  const [assumptions, setAssumptions] = useState<PlayAssumption[]>([]);
  const [newAssumptionText, setNewAssumptionText] = useState('');
  const [analyzingAssumptions, setAnalyzingAssumptions] = useState(false);

  // Step 3: Generate
  const [generating, setGenerating] = useState(false);

  const availableGoalTypes = scope === 'account'
    ? [...OPPORTUNITY_GOAL_TYPES, ...ACCOUNT_ONLY_GOAL_TYPES]
    : OPPORTUNITY_GOAL_TYPES;

  // Reset goal type if switching scope and current type is account-only
  const handleScopeChange = (newScope: 'opportunity' | 'account') => {
    setScope(newScope);
    if (newScope === 'opportunity' && ACCOUNT_ONLY_GOAL_TYPES.includes(goalType)) {
      setGoalType('reach_key_person');
    }
  };

  const applyTemplate = (templateId: string) => {
    const t = PLAY_TEMPLATES.find(t => t.id === templateId);
    if (!t) return;
    setSelectedTemplate(t.id);
    setGoalType(t.goalType);
    setGoalDescription(t.goalDescription);
    setSuccessCriteria(t.successCriteria);
    setScope(t.scope);
    setAssumptions(t.assumptions.map(text => ({
      id: genId(),
      text,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    })));
  };

  const clearTemplate = () => {
    setSelectedTemplate(null);
    setGoalType('reach_key_person');
    setGoalDescription('');
    setSuccessCriteria('');
    setScope('opportunity');
    setAssumptions([]);
    setTargetContactId('');
    setSelectedOpportunityId('');
  };

  const canProceedStep1 = goalDescription.trim().length > 0 && successCriteria.trim().length > 0;
  const canProceedStep2 = true; // Step 2 is optional enrichment

  const addAssumption = () => {
    if (!newAssumptionText.trim()) return;
    setAssumptions(prev => [...prev, {
      id: genId(),
      text: newAssumptionText.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }]);
    setNewAssumptionText('');
  };

  const removeAssumption = (id: string) => {
    setAssumptions(prev => prev.filter(a => a.id !== id));
  };

  const analyzeAssumptions = async () => {
    setAnalyzingAssumptions(true);
    try {
      const contactsSummary = contacts.slice(0, 10).map(c =>
        `${c.name}${c.title ? ` (${c.title})` : ''}${c.role ? ` [${c.role}]` : ''}`
      ).join(', ');

      const res = await fetch('/api/strategic-play/analyze-assumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName,
          goalType,
          goalDescription,
          successCriteria,
          contactsSummary,
          outputLocale: locale,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const aiAssumptions: PlayAssumption[] = (data.assumptions ?? []).map((text: string) => ({
          id: genId(),
          text,
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        }));
        setAssumptions(prev => [...prev, ...aiAssumptions]);
      }
    } catch (err) {
      console.error('[strategic-play] Analyze assumptions failed:', err);
    } finally {
      setAnalyzingAssumptions(false);
    }
  };

  const handleGenerate = async () => {
    if (!goalDescription.trim()) return;
    setGenerating(true);
    try {
      const template = PLAY_TEMPLATES.find(t => t.id === selectedTemplate);
      const mergedContext = [
        template?.templateContext,
        deadline ? `关键截止日期：${deadline}，请按此日期倒推规划每个步骤的时间窗口，优先安排耗时长的关键步骤。` : '',
        additionalContext,
      ].filter(Boolean).join('\n\n') || undefined;

      const res = await fetch('/api/strategic-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          accountName,
          goalType,
          goalDescription,
          targetContactId: targetContactId || undefined,
          opportunityId: scope === 'opportunity' && selectedOpportunityId ? selectedOpportunityId : undefined,
          additionalContext: mergedContext,
          successCriteria: successCriteria || undefined,
          deadline: deadline || undefined,
          assumptions: assumptions.length > 0 ? assumptions : undefined,
          outputLocale: locale,
        }),
      });
      if (!res.ok) {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) {
          console.error(`[strategic-play] Generate timeout/non-JSON: ${res.status}`);
          toast('谋局生成超时，请稍后重试（服务器响应时间过长）', 'error');
        } else {
          const errData = await res.json();
          console.error('[strategic-play] Generate returned error:', errData);
        }
        onCreated();
        return;
      }
      const data = await res.json();
      onCreated(data.id);
    } catch (err) {
      console.error('[strategic-play] Generate failed:', err);
      toast('谋局生成失败，请检查网络后重试', 'error');
      onCreated();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/[0.02] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Brain className="h-4 w-4 text-accent" />
          新建单局谋划
        </h3>
        <button onClick={onCancel} className="rounded-lg p-1 text-secondary hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step Indicator */}
      {(() => {
        const steps = [
          { num: 1, icon: '🎯', label: '定义目标' },
          { num: 2, icon: '🔍', label: '判断局势' },
          { num: 3, icon: '✨', label: '生成谋局' },
        ];
        return (
          <div className="relative mb-8">
            {/* 连接线 */}
            <div className="absolute top-[18px] left-[16.67%] right-[16.67%] flex">
              <div className={`h-[2px] flex-1 transition-colors duration-400 ${step > 1 ? 'bg-accent' : 'bg-border'}`} />
              <div className={`h-[2px] flex-1 transition-colors duration-400 ${step > 2 ? 'bg-accent' : 'bg-border'}`} />
            </div>
            {/* 步骤 */}
            <div className="relative flex justify-between">
              {steps.map((s) => {
                const isActive = step === s.num;
                const isDone = step > s.num;
                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => { if (isDone) setStep(s.num); }}
                    className={`flex flex-col items-center w-1/3 group ${isDone ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`relative h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-250 ${
                      isActive
                        ? 'bg-accent text-white scale-110 shadow-[0_2px_12px_rgba(223,37,49,0.35)]'
                        : isDone
                          ? 'bg-positive text-white group-hover:scale-105'
                          : 'bg-card text-muted border-2 border-border'
                    }`}>
                      {isDone ? '✓' : s.icon}
                    </div>
                    <span className={`mt-2.5 text-[15px] font-semibold transition-colors ${
                      isActive ? 'text-foreground' : isDone ? 'text-positive' : 'text-muted'
                    }`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── Step 1: Define Objective ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider">第一步：定义目标</h4>

          {/* Template selector */}
          <div>
            <label className="text-xs font-medium text-secondary">快速开始（可选）</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PLAY_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    selectedTemplate === t.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-card text-secondary hover:text-foreground'
                  }`}
                >
                  {t.emoji} {t.name}
                </button>
              ))}
              {selectedTemplate && (
                <button
                  onClick={clearTemplate}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-secondary hover:text-foreground transition-colors"
                >
                  从头开始
                </button>
              )}
            </div>
          </div>

          {/* Scope selector */}
          <div>
            <label className="text-xs font-medium text-secondary">谋划范围</label>
            <div className="mt-1.5 flex gap-2">
              <button
                onClick={() => handleScopeChange('opportunity')}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  scope === 'opportunity'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-card text-secondary hover:text-foreground'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                商机级
              </button>
              {permissions.canCreateAccountPlay && (
                <button
                  onClick={() => handleScopeChange('account')}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    scope === 'account'
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-card text-secondary hover:text-foreground'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  客户级
                </button>
              )}
            </div>
          </div>

          {/* Opportunity selector (only when scope = opportunity) */}
          {scope === 'opportunity' && opportunities.length > 0 && (
            <div>
              <label className="text-xs font-medium text-secondary">关联商机（可选）</label>
              <select
                value={selectedOpportunityId}
                onChange={(e) => setSelectedOpportunityId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">不指定</option>
                {opportunities.map((opp) => (
                  <option key={opp.id} value={opp.id}>
                    {opp.name} — {opp.stage} ({opp.currency} {opp.value.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Goal Type */}
          <div>
            <label className="text-xs font-medium text-secondary">目标类型</label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {availableGoalTypes.map((key) => {
                const Icon = GOAL_ICONS[key] ?? Target;
                const label = STRATEGIC_GOAL_LABELS[key];
                const isAccountOnly = ACCOUNT_ONLY_GOAL_TYPES.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => setGoalType(key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      goalType === key
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-card text-secondary hover:text-foreground hover:bg-background'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                    {isAccountOnly && <span className="text-[10px] text-accent/60">客户级</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Goal Description */}
          <div>
            <label className="text-xs font-medium text-secondary">目标描述</label>
            <textarea
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              placeholder="例如：通过项目经理引荐，获得客户高层 15 分钟沟通"
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none"
            />
          </div>

          {/* Target Contact */}
          {contacts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-secondary">目标人物（可选）</label>
              <select
                value={targetContactId}
                onChange={(e) => setTargetContactId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="">不指定</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.title ? `(${displayText(c.title)})` : ''} {c.role ? `[${displayContactRole(c.role)}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Success Criteria */}
          <div>
            <label className="text-xs font-medium text-secondary">成功标准 — 怎样算成功？</label>
            <textarea
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              placeholder="例如：客户高层同意 30 分钟沟通，并邀请技术负责人参加"
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none"
            />
          </div>

          {/* Key Deadline */}
          <div>
            <label className="text-xs font-medium text-secondary">关键截止日期（可选）</label>
            <p className="text-[11px] text-muted mt-0.5 mb-1">填写后会按截止日期倒推时间安排</p>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </div>

          {/* Next Button */}
          <button
            onClick={() => setStep(2)}
            disabled={!canProceedStep1}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            下一步：判断局势
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Step 2: Assess Situation ─── */}
      {step === 2 && (
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider">第二步：判断局势</h4>

          {/* Stakeholder Coverage Summary */}
          {contacts.length > 0 && (
            <div>
              <label className="text-xs font-medium text-secondary flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                关键人物覆盖
              </label>
              <div className="mt-1.5 rounded-lg border border-border bg-card p-3 space-y-1.5">
                {contacts.slice(0, 8).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{c.name}</span>
                      {c.title && <span className="text-muted">{displayText(c.title)}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {c.role && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[12px] font-medium text-accent">
                          {displayContactRole(c.role)}
                        </span>
                      )}
                      {c.lastContactedAt && (
                        <span className="text-[12px] text-muted">
                          最近联系 {new Date(c.lastContactedAt).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {contacts.length > 8 && (
                  <p className="text-[12px] text-muted">还有 {contacts.length - 8} 个联系人...</p>
                )}
              </div>
            </div>
          )}

          {/* Key Assumptions */}
          <div>
            <label className="text-xs font-medium text-secondary flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              关键假设
            </label>
            <p className="mt-1 mb-2 text-[13px] text-muted leading-relaxed">
              你的推进方案基于哪些尚未验证的前提？例如：“决策者是王总”、“预算已获批”、“选型窗口在本月”。把假设写下来，执行中验证或否定。
            </p>
            <div className="mt-1.5 space-y-2">
              {assumptions.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <span className="flex-1 text-xs text-foreground">{displayText(a.text)}</span>
                  <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[11px] font-medium text-yellow-700">
                    待验证
                  </span>
                  <button
                    onClick={() => removeAssumption(a.id)}
                    className="rounded p-0.5 text-muted hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}

              {/* Add assumption manually */}
              <div className="flex gap-2">
                <input
                  value={newAssumptionText}
                  onChange={(e) => setNewAssumptionText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAssumption()}
                  placeholder="添加一个假设..."
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted"
                />
                <button
                  onClick={addAssumption}
                  disabled={!newAssumptionText.trim()}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-secondary hover:text-foreground disabled:opacity-50"
                >
                  添加
                </button>
              </div>

              {/* AI analyze button */}
              <button
                onClick={analyzeAssumptions}
                disabled={analyzingAssumptions}
                className="flex items-center gap-1.5 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition-colors"
              >
                {analyzingAssumptions ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    分析假设
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Additional Context */}
          <div>
            <label className="text-xs font-medium text-secondary">补充信息（可选）</label>
            <textarea
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="任何对路径规划有帮助的信息..."
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted resize-none"
            />
          </div>

          {/* Back / Next */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1 rounded-lg border border-border px-4 py-3 text-sm font-medium text-secondary hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              上一步
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              下一步：生成方案
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Generate & Review ─── */}
      {step === 3 && (
        <div className="space-y-4">
          {generating ? (
            <PlayGeneratingOverlay />
          ) : (
            <>
              <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider">第三步：确认并生成</h4>

              {/* Summary */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted uppercase">范围</span>
                  <span className="text-xs text-foreground">
                    {scope === 'account' ? '客户级' : '商机级'}
                    {scope === 'opportunity' && selectedOpportunityId && (
                      <span className="text-muted ml-1">
                        — {opportunities.find(o => o.id === selectedOpportunityId)?.name}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted uppercase">目标</span>
                  <span className="text-xs text-foreground">
                    {STRATEGIC_GOAL_LABELS[goalType]} — {displayText(goalDescription)}
                  </span>
                </div>
                {targetContactId && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-muted uppercase">人物</span>
                    <span className="text-xs text-foreground">
                      {contacts.find(c => c.id === targetContactId)?.name ?? '—'}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-semibold text-muted uppercase shrink-0">成功标准</span>
                  <span className="text-xs text-foreground">{displayText(successCriteria)}</span>
                </div>
                {deadline && (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-muted uppercase">截止日期</span>
                    <span className="text-xs text-foreground">{deadline}</span>
                  </div>
                )}
                {assumptions.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[12px] font-semibold text-muted uppercase shrink-0">假设</span>
                    <div className="text-xs text-foreground space-y-0.5">
                      {assumptions.map(a => (
                        <p key={a.id}>• {displayText(a.text)}</p>
                      ))}
                    </div>
                  </div>
                )}
                {additionalContext && (
                  <div className="flex items-start gap-2">
                    <span className="text-[12px] font-semibold text-muted uppercase shrink-0">补充</span>
                    <span className="text-xs text-foreground">{displayText(additionalContext)}</span>
                  </div>
                )}
              </div>

              {/* Back / Generate */}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 rounded-lg border border-border px-4 py-3 text-sm font-medium text-secondary hover:text-foreground transition-colors"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                  上一步
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="glow-button flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <Brain className="h-4 w-4" />
                  生成推进路径
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
