"use client";

// ─── Decode Input Panel (text mode: single + batch) ──────────────────

import { useState, useRef, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  Sparkles,
  Target,
  CheckCircle2,
  Paperclip,
  X,
} from "lucide-react";
import type { DecodeOutput } from "@/lib/babel-engine/types";
import type { TranslationKey } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";
import { isOcrEnabled } from "@/lib/ocr-config";
import {
  DECODE_SOURCES,
  DECODE_GOALS,
  DEAL_STAGES,
  autoMatchAccount,
  type DecodeSource,
  type DecodeGoal,
} from "./decode-helpers";

// ─── Props ───────────────────────────────────────────────────────────

export interface DecodeInputProps {
  emailText: string;
  setEmailText: (v: string) => void;
  clientName: string;
  setClientName: (v: string) => void;
  dealStage: string;
  setDealStage: (v: string) => void;
  selectedOpportunityId: string;
  setSelectedOpportunityId: (v: string) => void;
  role: string;
  setRole: (v: string) => void;
  context: string;
  setContext: (v: string) => void;
  signalSource: DecodeSource;
  setSignalSource: (v: DecodeSource) => void;
  analysisGoal: DecodeGoal;
  setAnalysisGoal: (v: DecodeGoal) => void;
  signalContext: string;
  setSignalContext: (v: string) => void;
  decoding: boolean;
  error: string | null;
  canDecode: boolean;
  onDecode: () => void;
}

// ─── Component ───────────────────────────────────────────────────────

export default function DecodeInput({
  emailText,
  setEmailText,
  clientName,
  setClientName,
  dealStage,
  setDealStage,
  selectedOpportunityId,
  setSelectedOpportunityId,
  role,
  setRole,
  context,
  setContext,
  signalSource,
  setSignalSource,
  analysisGoal,
  setAnalysisGoal,
  signalContext,
  setSignalContext,
  decoding,
  error,
  canDecode,
  onDecode,
}: DecodeInputProps) {
  const { t, locale } = useLocale();
  const en = locale === "en";
  const saveDecode = useStore((s) => s.saveDecode);
  const { accounts, opportunities } = useRoleFilteredData();
  const ocrEnabled = isOcrEnabled();

  // 根据选中客户获取商机列表
  const selectedAccount = accounts.find((a) => a.name === clientName);
  const accountOpportunities = selectedAccount
    ? opportunities.filter((opp) => opp.accountId === selectedAccount.id)
    : [];

  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_IMAGES = 3;

  // 批量解读
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [batchEmails, setBatchEmails] = useState<string[]>([]);
  const [batchMatches, setBatchMatches] = useState<(ReturnType<typeof autoMatchAccount>)[]>([]);
  const [batchDecoding, setBatchDecoding] = useState(false);
  const [batchResults, setBatchResults] = useState<(DecodeOutput | null)[]>([]);
  const [batchEditIndex, setBatchEditIndex] = useState<number | null>(null);

  const inputFieldClass = "form-input";

  const currentSourceConfig = DECODE_SOURCES.find((s) => s.value === signalSource) ?? DECODE_SOURCES[0];
  const currentPlaceholder = locale === "zh" ? currentSourceConfig.placeholderZh : currentSourceConfig.placeholderEn;
  const selectedGoal = DECODE_GOALS.find((g) => g.value === analysisGoal) ?? DECODE_GOALS[0];
  const hasBusinessContext = Boolean(clientName || dealStage || selectedOpportunityId || context || signalContext);
  const looksTooShort = emailText.trim().length > 0 && emailText.trim().length < 40;

  // ── Image handlers ──
  const addImages = useCallback((files: File[]) => {
    if (!isOcrEnabled()) return;
    setImages((prev) => {
      const remaining = MAX_IMAGES - prev.length;
      if (remaining <= 0) return prev;
      const newItems = files.slice(0, remaining).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      return [...prev, ...newItems];
    });

    setOcrLoading(true);
    setOcrError(null);
    let pending = files.length;
    for (const file of files) {
      const formData = new FormData();
      formData.append('image', file);
      fetch('/api/ocr', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(data => {
          if (data.text) {
            setEmailText(emailText ? `${emailText}\n\n--- 图片提取 ---\n${data.text}` : data.text);
          } else if (data.error) {
            setOcrError(data.visionUnsupported
              ? '当前AI模型不支持图片识别，请手动输入文字内容'
              : 'OCR提取失败，请手动输入文字内容');
          }
        })
        .catch(err => {
          console.error('[ocr]', err);
          setOcrError('OCR提取失败，请手动输入文字内容');
        })
        .finally(() => {
          pending--;
          if (pending <= 0) setOcrLoading(false);
        });
    }
  }, [emailText, setEmailText]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        addImages(imageFiles);
      }
    },
    [addImages]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) addImages(Array.from(files));
      e.target.value = "";
    },
    [addImages]
  );

  // Batch helpers
  function parseBatchEmails() {
    const emails = batchText
      .split(/\n---\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setBatchEmails(emails);
    setBatchResults(new Array(emails.length).fill(null));
    const matches = emails.map((email) => autoMatchAccount(email, accounts));
    setBatchMatches(matches);
    setBatchEditIndex(null);
  }

  function updateBatchMatch(index: number, accountId: string) {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    setBatchMatches((prev) => {
      const next = [...prev];
      next[index] = { accountId: acc.id, accountName: acc.name };
      return next;
    });
  }

  async function handleSingleBatchDecode(index: number) {
    const email = batchEmails[index];
    if (!email) return;
    try {
      const res = await fetch("/api/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailText: email, outputLocale: locale }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const decoded: DecodeOutput = await res.json();
      setBatchResults((prev) => {
        const next = [...prev];
        next[index] = decoded;
        return next;
      });
      const match = batchMatches[index];
      if (match) {
        saveDecode({
          accountId: match.accountId,
          accountName: match.accountName,
          emailText: email,
          decode: decoded,
        });
      }
    } catch (err) {
      console.error(`[batch-decode] email #${index + 1} failed:`, err);
    }
  }

  async function handleBatchDecode() {
    setBatchDecoding(true);
    for (let i = 0; i < batchEmails.length; i++) {
      if (!batchResults[i]) {
        await handleSingleBatchDecode(i);
      }
    }
    setBatchDecoding(false);
  }

  return (
    <>
      {/* Level 2: 单条/批量切换 */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-sidebar p-0.5">
        <button
          onClick={() => setBatchMode(false)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            !batchMode ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-foreground"
          }`}
        >
          {en ? "Single decode" : "单条解读"}
        </button>
        <button
          onClick={() => setBatchMode(true)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            batchMode ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-foreground"
          }`}
        >
          {en ? "Batch decode" : "批量解读"}
        </button>
      </div>

      {batchMode ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            placeholder={en ? "Paste multiple emails and separate each one with ---\n\nExample:\nEmail 1 content...\n---\nEmail 2 content...\n---\nEmail 3 content..." : "粘贴多封邮件，用 --- 分隔每封邮件...\n\n例如：\n邮件1内容...\n---\n邮件2内容...\n---\n邮件3内容..."}
            className="min-h-[180px] flex-1 resize-y rounded-lg border border-border bg-background p-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={parseBatchEmails}
              disabled={!batchText.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
            >
              <Target className="h-3.5 w-3.5" />
              {en ? `Parse emails (${batchText.split(/\n---\n/).filter((s) => s.trim()).length})` : `解析邮件 (${batchText.split(/\n---\n/).filter((s) => s.trim()).length} 封)`}
            </button>
            {batchEmails.length > 0 && (
              <span className="text-xs text-muted">{en ? `Parsed ${batchEmails.length} emails` : `已解析 ${batchEmails.length} 封邮件`}</span>
            )}
          </div>

          {batchEmails.length > 0 && (
            <div className="space-y-2 overflow-y-auto">
              {batchEmails.map((email, i) => {
                const match = batchMatches[i];
                const result = batchResults[i];
                const isEditing = batchEditIndex === i;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 transition-colors ${
                      result ? "border-positive/20 bg-positive/[0.03]" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-sidebar text-xs font-bold text-muted">{i + 1}</span>
                        <span className="text-sm font-medium text-foreground">{en ? `Email #${i + 1}` : `邮件 #${i + 1}`}</span>
                        {result && <CheckCircle2 className="h-3.5 w-3.5 text-positive" />}
                      </div>
                      <div className="flex items-center gap-2">
                        {match && (
                          <span className="text-xs text-accent">
                            {en ? "Auto match: " : "自动匹配："}{match.accountName}
                            {(match as { contactName?: string }).contactName
                              ? ` - ${(match as { contactName?: string }).contactName}`
                              : ""}
                          </span>
                        )}
                        <select
                          value={match?.accountId ?? ""}
                          onChange={(e) => updateBatchMatch(i, e.target.value)}
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
                        >
                          <option value="">{en ? "Select account..." : "选择客户..."}</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={batchEmails[i]}
                          onChange={(e) => {
                            setBatchEmails((prev) => {
                              const next = [...prev];
                              next[i] = e.target.value;
                              return next;
                            });
                          }}
                          className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground resize-y min-h-[80px]"
                        />
                        <button onClick={() => setBatchEditIndex(null)} className="text-xs text-accent hover:underline">
                          {en ? "Done editing" : "完成编辑"}
                        </button>
                      </div>
                    ) : (
                      <p
                        className="text-xs text-secondary line-clamp-3 cursor-pointer hover:text-foreground"
                        onClick={() => setBatchEditIndex(i)}
                        title={en ? "Click to edit" : "点击编辑"}
                      >
                        {email.slice(0, 200)}
                        {email.length > 200 ? "..." : ""}
                      </p>
                    )}

                    {!result && (
                      <button onClick={() => handleSingleBatchDecode(i)} className="mt-2 text-xs text-accent hover:underline">
                        {en ? "Decode this one" : "单独解读"}
                      </button>
                    )}

                    {result && (
                      <div className="mt-2 rounded-lg border border-positive/10 bg-positive/[0.03] p-2">
                        <p className="text-xs text-foreground">
                          <span className="font-medium text-accent">{en ? "Key signal: " : "关键信号："}</span>
                          {result.threadAnalysis?.keySignal || "—"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                onClick={handleBatchDecode}
                disabled={batchDecoding || batchEmails.every((_, i) => batchResults[i] !== null)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
              >
                {batchDecoding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {en ? "Batch decoding..." : "批量解读中..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {en ? `Decode all (${batchEmails.filter((_, i) => !batchResults[i]).length})` : `全部解读 (${batchEmails.filter((_, i) => !batchResults[i]).length} 封)`}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Signal source + goal */}
          <div className="rounded-xl border border-border bg-sidebar/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{en ? "What signal is this?" : "这是什么信号？"}</p>
              </div>
              <span className="hidden rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent sm:inline-flex">
                {locale === "zh" ? selectedGoal.labelZh : selectedGoal.labelEn}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DECODE_SOURCES.map((src) => (
                <button
                  key={src.value}
                  type="button"
                  onClick={() => setSignalSource(src.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    signalSource === src.value
                      ? "border-accent/40 bg-accent/10 text-accent shadow-sm"
                      : "border-border bg-background text-muted hover:border-secondary hover:text-foreground"
                  }`}
                >
                  <span>{src.icon}</span>
                  {t(src.label as TranslationKey)}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DECODE_GOALS.map((goal) => (
                <button
                  key={goal.value}
                  type="button"
                  onClick={() => setAnalysisGoal(goal.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    analysisGoal === goal.value
                      ? "border-foreground/15 bg-card text-foreground shadow-sm"
                      : "border-border bg-background text-muted hover:border-secondary hover:text-foreground"
                  }`}
                >
                  {locale === "zh" ? goal.labelZh : goal.labelEn}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted">{t("decode.aiHint")}</p>

          {/* Email textarea + image upload */}
          <div className="relative">
            <textarea
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              onPaste={ocrEnabled ? handlePaste : undefined}
              placeholder={currentPlaceholder}
              className="min-h-[140px] sm:min-h-[200px] w-full flex-1 resize-none rounded-lg border border-border bg-background p-4 pr-10 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted/30 focus:border-accent/40 focus:outline-none input-glow transition-colors duration-150"
            />
            {ocrEnabled && <>
              <button
                type="button"
                title={en ? "Upload image" : "上传图片"}
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="absolute right-2 top-2 rounded-md p-1.5 text-muted hover:bg-secondary/50 hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </>}
          </div>

          {/* Image preview */}
          {ocrEnabled && images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative group rounded-lg border border-border overflow-hidden w-20 h-20">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Local object URLs from pasted images are short-lived previews. */}
                  <img src={img.preview} alt={en ? `Uploaded image ${i + 1}` : `上传图片 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <p className="self-center text-xs text-muted">
                  {en ? `${images.length}/${MAX_IMAGES} images (paste or upload)` : `${images.length}/${MAX_IMAGES} 张图片（可粘贴或上传）`}
                </p>
              )}
              {ocrLoading && (
                <div className="flex items-center gap-1.5 self-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  <span className="text-xs text-accent font-medium">{en ? "Extracting text..." : "正在提取文字..."}</span>
                </div>
              )}
              {ocrError && !ocrLoading && (
                <div className="flex items-center gap-1.5 self-center">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="text-xs text-warning">{ocrError}</span>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border bg-background px-3 py-2.5">
            <p className="text-xs font-medium text-foreground">{en ? "Input quality hints" : "输入质量提示"}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className={`rounded-full px-2 py-1 ${emailText.trim().length >= 40 ? "bg-positive/10 text-positive" : "bg-warning/10 text-warning"}`}>
                {emailText.trim().length >= 40 ? (en ? "Communication content included" : "已包含沟通内容") : looksTooShort ? (en ? "Content is short" : "内容偏短") : (en ? "Waiting for communication content" : "等待沟通内容")}
              </span>
              <span className={`rounded-full px-2 py-1 ${clientName ? "bg-positive/10 text-positive" : "bg-sidebar text-muted"}`}>
                {clientName ? (en ? "Account linked" : "已关联客户") : (en ? "Link an account" : "建议关联客户")}
              </span>
              <span className={`rounded-full px-2 py-1 ${hasBusinessContext ? "bg-positive/10 text-positive" : "bg-sidebar text-muted"}`}>
                {hasBusinessContext ? (en ? "Business context included" : "已有业务上下文") : (en ? "Add one line of context" : "可补一句背景")}
              </span>
            </div>
          </div>

          {/* Context fields */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-tour="decode-client">
            <div>
              <label className="form-label">{t("decode.clientName")}</label>
              <select
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="form-select"
              >
                <option value="">{t("decode.discoveryModal.selectAccount")}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              {accountOpportunities.length > 0 ? (
                <>
                  <label className="form-label">{en ? "Linked opportunity" : "关联商机"}</label>
                  <select
                    value={selectedOpportunityId}
                    onChange={(e) => {
                      const oppId = e.target.value;
                      setSelectedOpportunityId(oppId);
                      const opp = accountOpportunities.find((o) => o.id === oppId);
                      if (opp) {
                        setDealStage(opp.stage);
                      } else {
                        setDealStage("");
                      }
                    }}
                    className="form-select"
                  >
                    <option value="">{en ? "Select opportunity (optional)" : "选择商机（可选）"}</option>
                    {accountOpportunities.map((opp) => (
                      <option key={opp.id} value={opp.id}>
                        {opp.name} — {opp.stage}{opp.value ? (en ? ` ($${(opp.value / 1000).toFixed(0)}K)` : ` (¥${(opp.value / 10000).toFixed(0)}万)`) : ""}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="form-label">{t("decode.dealStage")}</label>
                  <select
                    value={dealStage}
                    onChange={(e) => setDealStage(e.target.value)}
                    className="form-select"
                  >
                    <option value="">{t("decode.selectStage")}</option>
                    {DEAL_STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>{en ? stage.value : stage.label}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="form-label">
                {t("decode.yourRole")} {role && <span className="text-xs text-muted">{t("decode.roleFromSettings")}</span>}
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t("decode.rolePlaceholder")}
                className={inputFieldClass}
              />
            </div>
            <div>
              <label className="form-label">{t("decode.additionalContext")}</label>
              <input
                type="text"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={t("decode.contextPlaceholder")}
                className={inputFieldClass}
              />
            </div>
          </div>

          <div>
            <label className="form-label">{en ? "Signal background (optional)" : "信号背景（可选）"}</label>
            <textarea
              value={signalContext}
              onChange={(e) => setSignalContext(e.target.value)}
              placeholder={en ? "Example: this is customer feedback after the second quote; we are trying to secure a CTO meeting; the customer said budget is tight." : "例如：这是第二轮报价后的客户反馈；我们正在争取 CTO 会议；客户之前说预算紧。"}
              className="form-input min-h-[72px] resize-y"
            />
          </div>

          {/* Decode button */}
          <button
            data-tour="decode-button"
            onClick={onDecode}
            disabled={!canDecode}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-accent-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-40"
          >
            {decoding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("decode.decoding")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t("decode.startDecode")}
              </>
            )}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </>
      )}
    </>
  );
}
