"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  X,
  Target,
  Trash2,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type {
  Account,
  MeddiccData,
} from "@/lib/babel-engine/types";
import { AssessmentResultDisplay } from "@/components/meddicc/assessment-result-display";

export function MeddiccTab({ account }: { account: Account }) {
  const { updateAccount, updateContact } = useStore();
  const contacts = account.contacts;

  const [meddicc, setMeddicc] = useState<MeddiccData>(
    account.meddicc ?? {
      metrics: { notes: "", status: "unconfirmed" as const },
      economicBuyer: { status: "unidentified" as const },
      decisionCriteria: { items: [] },
      decisionProcess: {
        steps: [
          { name: "技术评估", completed: false },
          { name: "POC", completed: false },
          { name: "商务谈判", completed: false },
          { name: "法务审核", completed: false },
          { name: "签约", completed: false },
        ],
      },
      pain: { items: [] },
      champion: { strength: 1 },
      competition: [],
    }
  );

  const [assessing, setAssessing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assessment, setAssessment] = useState<any>(null);
  const [assessError, setAssessError] = useState<string | null>(null);

  // Auto-save on change
  useEffect(() => {
    updateAccount(account.id, { meddicc });
  }, [meddicc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate score
  function calcScore(): number {
    let score = 0;
    if (meddicc.metrics.status === "confirmed") score += 15;
    else if (meddicc.metrics.status === "partial") score += 8;
    if (meddicc.economicBuyer.status === "contacted") score += 15;
    else if (meddicc.economicBuyer.status === "identified") score += 8;
    const criteria = meddicc.decisionCriteria.items;
    if (criteria.length > 0) {
      const meets = criteria.filter((c) => c.fit === "meets").length;
      const partial = criteria.filter((c) => c.fit === "partial").length;
      score += Math.round((meets * 15 + partial * 7) / criteria.length);
    }
    const steps = meddicc.decisionProcess.steps;
    if (steps.length > 0) {
      score += Math.round(
        (steps.filter((s) => s.completed).length / steps.length) * 10
      );
    }
    const pains = meddicc.pain.items;
    if (pains.length > 0) {
      const quantified = pains.filter(
        (p) => p.quantified === "quantified"
      ).length;
      score += Math.round(
        (quantified * 15 + (pains.length - quantified) * 5) / pains.length
      );
    }
    if (contacts.some((c) => c.role === 'champion'))
      score += Math.round(meddicc.champion.strength * 3);
    if (meddicc.competition.length > 0) {
      score += Math.min(15, meddicc.competition.length * 5);
    }
    return Math.min(100, score);
  }

  async function handleAssess() {
    setAssessing(true);
    setAssessError(null);
    try {
      const championContact = contacts.find((c) => c.role === 'champion') ?? null;
      const ebContact = contacts.find((c) => c.role === 'decision_maker') ?? null;

      const res = await fetch("/api/meddicc-assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: {
            id: account.id,
            name: account.name,
            industry: account.industry,
            dealStage: account.dealStage,
            dealValue: account.dealValue,
          },
          meddicc: {
            metrics: meddicc.metrics,
            economicBuyer: {
              contactName: ebContact?.name,
              status: meddicc.economicBuyer.status,
            },
            decisionCriteria: meddicc.decisionCriteria,
            decisionProcess: meddicc.decisionProcess,
            pain: meddicc.pain,
            champion: {
              contactName: championContact?.name,
              strength: meddicc.champion.strength,
            },
            competition: meddicc.competition,
          },
          tasks: (() => {
            const allTasks = useStore.getState().tasks;
            const accountTasks = allTasks.filter((t) => t.accountId === account.id);
            const now = new Date();
            return accountTasks.map((t) => ({
              title: t.title,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              isOverdue: !!(t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'),
            }));
          })(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `请求失败 (${res.status})`
        );
      }

      const result = await res.json();
      setAssessment(result);
    } catch (err) {
      setAssessError(
        err instanceof Error ? err.message : "评估失败，请重试。"
      );
    } finally {
      setAssessing(false);
    }
  }

  const totalScore = calcScore();
  const scoreColor =
    totalScore >= 70
      ? "text-positive"
      : totalScore >= 40
        ? "text-warning"
        : "text-danger";
  const scoreBg =
    totalScore >= 70
      ? "bg-positive"
      : totalScore >= 40
        ? "bg-warning"
        : "bg-danger";


  return (
    <div className="space-y-4 p-4">
      {/* Score Header */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
              <Target className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                MEDDICC 资格评分
              </h3>
              <p className="text-xs text-muted">填写越完整，评分越准确</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {totalScore}
            </span>
            <span className="text-sm text-muted">/ 100</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-card overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-400 ${scoreBg}`}
            style={{ width: `${totalScore}%` }}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleAssess}
            disabled={assessing}
            className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {assessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI 评估建议
          </button>
        </div>
      </div>

      {/* AI Assessment Result */}
      {assessError && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="text-xs text-danger">{assessError}</p>
        </div>
      )}

      {assessment && (
        <AssessmentResultDisplay
          assessment={assessment}
          accountId={account.id}
          entityId={account.id}
          entityName={account.name}
          fallbackScore={totalScore}
        />
      )}

      {/* M -- Metrics */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2">
          M - 量化指标
        </h4>
        <textarea
          value={meddicc.metrics.notes}
          onChange={(e) =>
            setMeddicc((prev) => ({
              ...prev,
              metrics: { ...prev.metrics, notes: e.target.value },
            }))
          }
          placeholder="客户期望的 ROI、成本节约、效率提升等量化指标..."
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none resize-none"
          rows={3}
        />
        <div className="flex gap-1.5 mt-2">
          {(
            [
              {
                value: "confirmed",
                label: "已确认",
                style:
                  "bg-positive/10 text-positive border-positive/30 hover:bg-positive/20",
              },
              {
                value: "partial",
                label: "部分确认",
                style:
                  "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20",
              },
              {
                value: "unconfirmed",
                label: "未确认",
                style:
                  "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setMeddicc((prev) => ({
                  ...prev,
                  metrics: { ...prev.metrics, status: opt.value },
                }))
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                meddicc.metrics.status === opt.value
                  ? opt.style
                  : "border-border bg-card text-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* E -- 经济决策者 */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2">
          经济决策者 / 预算负责人
        </h4>
        <select
          value={contacts.find((c) => c.role === 'decision_maker')?.id ?? ""}
          onChange={(e) => {
            // Clear old decision_maker role
            const oldEB = contacts.find((c) => c.role === 'decision_maker');
            if (oldEB) updateContact(account.id, oldEB.id, { role: 'contact' });
            // Set new decision_maker role
            if (e.target.value) {
              updateContact(account.id, e.target.value, { role: 'decision_maker' });
              // Update EB status to at least identified
              if (meddicc.economicBuyer.status === 'unidentified') {
                setMeddicc((prev) => ({
                  ...prev,
                  economicBuyer: { ...prev.economicBuyer, status: 'identified' as const },
                }));
              }
            }
          }}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">选择经济决策者...</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.title ? `-- ${c.title}` : ""}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5 mt-2">
          {(
            [
              {
                value: "contacted",
                label: "已接触",
                style:
                  "bg-positive/10 text-positive border-positive/30 hover:bg-positive/20",
              },
              {
                value: "identified",
                label: "已识别未接触",
                style:
                  "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20",
              },
              {
                value: "unidentified",
                label: "未识别",
                style:
                  "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() =>
                setMeddicc((prev) => ({
                  ...prev,
                  economicBuyer: { ...prev.economicBuyer, status: opt.value },
                }))
              }
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                meddicc.economicBuyer.status === opt.value
                  ? opt.style
                  : "border-border bg-card text-muted hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* D -- Decision Criteria */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">
            D - Decision Criteria (决策标准)
          </h4>
          <button
            onClick={() =>
              setMeddicc((prev) => ({
                ...prev,
                decisionCriteria: {
                  items: [
                    ...prev.decisionCriteria.items,
                    { criterion: "", fit: "not_meets" as const },
                  ],
                },
              }))
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {meddicc.decisionCriteria.items.length === 0 && (
          <p className="text-xs text-muted py-2">
            暂无决策标准，点击&ldquo;添加&rdquo;开始填写。
          </p>
        )}
        <div className="space-y-2">
          {meddicc.decisionCriteria.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={item.criterion}
                onChange={(e) => {
                  const items = [...meddicc.decisionCriteria.items];
                  items[idx] = { ...items[idx], criterion: e.target.value };
                  setMeddicc((prev) => ({
                    ...prev,
                    decisionCriteria: { items },
                  }));
                }}
                placeholder="决策标准..."
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <div className="flex gap-1">
                {(
                  [
                    { value: "meets", label: "满足", color: "text-positive" },
                    { value: "partial", label: "部分", color: "text-warning" },
                    {
                      value: "not_meets",
                      label: "不满足",
                      color: "text-danger",
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      const items = [...meddicc.decisionCriteria.items];
                      items[idx] = { ...items[idx], fit: opt.value };
                      setMeddicc((prev) => ({
                        ...prev,
                        decisionCriteria: { items },
                      }));
                    }}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      item.fit === opt.value
                        ? `${opt.color} bg-card border border-current/20`
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const items = meddicc.decisionCriteria.items.filter(
                    (_, i) => i !== idx
                  );
                  setMeddicc((prev) => ({
                    ...prev,
                    decisionCriteria: { items },
                  }));
                }}
                className="text-muted hover:text-danger transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* D -- Decision Process */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">
            D - Decision Process (决策流程)
          </h4>
          <button
            onClick={() =>
              setMeddicc((prev) => ({
                ...prev,
                decisionProcess: {
                  steps: [
                    ...prev.decisionProcess.steps,
                    { name: "", completed: false },
                  ],
                },
              }))
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <Plus className="h-3 w-3" />
            添加步骤
          </button>
        </div>
        <div className="space-y-1.5">
          {meddicc.decisionProcess.steps.map((step, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <button
                onClick={() => {
                  const steps = [...meddicc.decisionProcess.steps];
                  steps[idx] = { ...steps[idx], completed: !steps[idx].completed };
                  setMeddicc((prev) => ({
                    ...prev,
                    decisionProcess: { steps },
                  }));
                }}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                  step.completed
                    ? "border-positive bg-positive/20 text-positive"
                    : "border-border bg-card text-muted"
                }`}
              >
                {step.completed && <Check className="h-3 w-3" />}
              </button>
              <input
                value={step.name}
                onChange={(e) => {
                  const steps = [...meddicc.decisionProcess.steps];
                  steps[idx] = { ...steps[idx], name: e.target.value };
                  setMeddicc((prev) => ({
                    ...prev,
                    decisionProcess: { steps },
                  }));
                }}
                placeholder="步骤名称..."
                className={`flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none ${
                  step.completed ? "line-through opacity-60" : ""
                }`}
              />
              {idx > 0 && (
                <button
                  onClick={() => {
                    const steps = meddicc.decisionProcess.steps.filter(
                      (_, i) => i !== idx
                    );
                    setMeddicc((prev) => ({
                      ...prev,
                      decisionProcess: { steps },
                    }));
                  }}
                  className="text-muted hover:text-danger transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* I -- Identify Pain */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">
            I - Identify Pain (痛点识别)
          </h4>
          <button
            onClick={() =>
              setMeddicc((prev) => ({
                ...prev,
                pain: {
                  items: [
                    ...prev.pain.items,
                    { pain: "", quantified: "not_quantified" as const },
                  ],
                },
              }))
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {meddicc.pain.items.length === 0 && (
          <p className="text-xs text-muted py-2">
            暂无痛点记录，点击&ldquo;添加&rdquo;开始填写。
          </p>
        )}
        <div className="space-y-2">
          {meddicc.pain.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={item.pain}
                onChange={(e) => {
                  const items = [...meddicc.pain.items];
                  items[idx] = { ...items[idx], pain: e.target.value };
                  setMeddicc((prev) => ({ ...prev, pain: { items } }));
                }}
                placeholder="客户痛点..."
                className="flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => {
                  const items = [...meddicc.pain.items];
                  items[idx] = {
                    ...items[idx],
                    quantified:
                      items[idx].quantified === "quantified"
                        ? "not_quantified"
                        : "quantified",
                  };
                  setMeddicc((prev) => ({ ...prev, pain: { items } }));
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  item.quantified === "quantified"
                    ? "border-positive/30 bg-positive/10 text-positive"
                    : "border-border bg-card text-muted hover:text-foreground"
                }`}
              >
                {item.quantified === "quantified" ? "已量化" : "未量化"}
              </button>
              <button
                onClick={() => {
                  const items = meddicc.pain.items.filter(
                    (_, i) => i !== idx
                  );
                  setMeddicc((prev) => ({ ...prev, pain: { items } }));
                }}
                className="text-muted hover:text-danger transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* C -- 内部推动者 */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <h4 className="text-sm font-semibold text-foreground mb-2">
          C - 内部推动者
        </h4>
        <select
          value={contacts.find((c) => c.role === 'champion')?.id ?? ""}
          onChange={(e) => {
            // Clear old champion role
            const oldChampion = contacts.find((c) => c.role === 'champion');
            if (oldChampion) updateContact(account.id, oldChampion.id, { role: 'contact' });
            // Set new champion role
            if (e.target.value) updateContact(account.id, e.target.value, { role: 'champion' });
          }}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="">选择内部推动者...</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.title ? `-- ${c.title}` : ""}
            </option>
          ))}
        </select>
        <div className="mt-3">
          <p className="text-xs text-muted mb-1.5">
            内部推动力: {meddicc.champion.strength}/5
          </p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() =>
                  setMeddicc((prev) => ({
                    ...prev,
                    champion: { ...prev.champion, strength: n },
                  }))
                }
                className={`h-8 w-8 rounded-lg border text-xs font-medium transition-colors ${
                  meddicc.champion.strength >= n
                    ? "border-accent/30 bg-accent/15 text-accent"
                    : "border-border bg-card text-muted hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs text-muted mb-1">最近互动日期</p>
          <input
            type="date"
            value={meddicc.champion.lastInteraction ?? ""}
            onChange={(e) =>
              setMeddicc((prev) => ({
                ...prev,
                champion: {
                  ...prev.champion,
                  lastInteraction: e.target.value || undefined,
                },
              }))
            }
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* C -- Competition */}
      <div className="rounded-xl border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">
            C - 竞争分析
          </h4>
          <button
            onClick={() =>
              setMeddicc((prev) => ({
                ...prev,
                competition: [
                  ...prev.competition,
                  { name: "", theirAdvantage: "", ourCounter: "" },
                ],
              }))
            }
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-foreground hover:bg-card transition-colors"
          >
            <Plus className="h-3 w-3" />
            添加竞品
          </button>
        </div>
        {meddicc.competition.length === 0 && (
          <p className="text-xs text-muted py-2">
            暂无竞品记录，点击&ldquo;添加竞品&rdquo;开始填写。
          </p>
        )}
        <div className="space-y-3">
          {meddicc.competition.map((comp, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border bg-card p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <input
                  value={comp.name}
                  onChange={(e) => {
                    const competition = [...meddicc.competition];
                    competition[idx] = {
                      ...competition[idx],
                      name: e.target.value,
                    };
                    setMeddicc((prev) => ({ ...prev, competition }));
                  }}
                  placeholder="竞品名称..."
                  className="flex-1 rounded-lg border border-border bg-sidebar px-3 py-1.5 text-xs font-medium text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => {
                    const competition = meddicc.competition.filter(
                      (_, i) => i !== idx
                    );
                    setMeddicc((prev) => ({ ...prev, competition }));
                  }}
                  className="ml-2 text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                value={comp.theirAdvantage}
                onChange={(e) => {
                  const competition = [...meddicc.competition];
                  competition[idx] = {
                    ...competition[idx],
                    theirAdvantage: e.target.value,
                  };
                  setMeddicc((prev) => ({ ...prev, competition }));
                }}
                placeholder="对方优势..."
                className="w-full rounded-lg border border-border bg-sidebar px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                value={comp.ourCounter}
                onChange={(e) => {
                  const competition = [...meddicc.competition];
                  competition[idx] = {
                    ...competition[idx],
                    ourCounter: e.target.value,
                  };
                  setMeddicc((prev) => ({ ...prev, competition }));
                }}
                placeholder="我方应对策略..."
                className="w-full rounded-lg border border-border bg-sidebar px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
