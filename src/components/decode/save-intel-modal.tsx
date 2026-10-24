"use client";

// ─── Save as Intel Modal ─────────────────────────────────────────────

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  X,
  Send,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { DecodeOutput, SpinItem, DiscoveryScore } from "@/lib/babel-engine/types";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";

// ─── Props ───────────────────────────────────────────────────────────

interface SaveAsIntelModalProps {
  open: boolean;
  onClose: () => void;
  decodeResult: DecodeOutput;
  defaultAccountId?: string;
  defaultOpportunityId?: string;
}

// ─── Component ───────────────────────────────────────────────────────

export function SaveAsIntelModal({ open, onClose, decodeResult, defaultAccountId, defaultOpportunityId }: SaveAsIntelModalProps) {
  const { t } = useLocale();
  const router = useRouter();
  const { accounts, opportunities } = useRoleFilteredData();
  const addIntel = useStore((s) => s.addIntel);

  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccountId ?? "");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(defaultOpportunityId ?? "");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredOpportunities = selectedAccountId
    ? opportunities.filter((opp) => opp.accountId === selectedAccountId)
    : [];

  useEffect(() => {
    // Only reset opportunity when account changes away from the default pair
    if (selectedAccountId !== defaultAccountId) {
      setSelectedOpportunityId("");
    }
  }, [selectedAccountId, defaultAccountId]);

  useEffect(() => {
    if (open) {
      setSaveSuccess(false);
      setSaveError(null);
      setSelectedAccountId(defaultAccountId ?? "");
      setSelectedOpportunityId(defaultOpportunityId ?? "");
    }
  }, [open, defaultAccountId, defaultOpportunityId]);

  function buildContent(): string {
    const parts: string[] = [];
    const ta = decodeResult.threadAnalysis;
    if (ta?.keySignal) {
      parts.push(`关键信号: ${ta.keySignal}`);
    }
    decodeResult.messages.forEach((msg) => {
      if (msg.speaker === "them") {
        parts.push(`客户: "${msg.original}" → 真实意图: ${msg.decode?.meaning} (情绪: ${msg.decode?.emotion})`);
      }
    });
    return parts.join("\n\n");
  }

  async function handleSave() {
    if (!selectedAccountId) return;
    setSaving(true);
    setSaveError(null);

    try {
      const content = buildContent();
      const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
      const selectedOpp = filteredOpportunities.find((o) => o.id === selectedOpportunityId);

      let spinItems: SpinItem[] = [];
      try {
        const spinRes = await fetch("/api/spin-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-company-domain": useStore.getState().userSettings.companyDomain || "" },
          body: JSON.stringify({
            content,
            opportunityContext: selectedOpp && selectedAccount
              ? {
                  name: selectedOpp.name,
                  stage: selectedOpp.stage,
                  value: selectedOpp.value,
                  accountName: selectedAccount.name,
                }
              : undefined,
          }),
        });
        if (spinRes.ok) {
          const spinData = (await spinRes.json()) as { spinItems: SpinItem[]; score: DiscoveryScore };
          spinItems = spinData.spinItems || [];
        }
      } catch {
        // SPIN analysis failed, save note without classification
      }

      addIntel({
        accountName: selectedAccount?.name ?? '',
        source: 'email',
        content,
        credibility: 'medium',
        urgency: 'medium',
        opportunityId: selectedOpportunityId,
        type: 'discovery',
        spinClassification: spinItems.length > 0 ? spinItems : undefined,
      });

      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function handleGoToPipeline() {
    if (selectedOpportunityId) {
      router.push(`/pipeline/${selectedOpportunityId}`);
    }
    onClose();
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold text-foreground">
              {t("decode.discoveryModal.title")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sidebar hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {saveSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-positive/10">
                <CheckCircle2 className="h-6 w-6 text-positive" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {t("decode.discoveryModal.saved")}
              </p>
              <p className="text-xs text-muted">
                {t("decode.discoveryModal.spinAnalyzed")}
              </p>
              <button
                onClick={handleGoToPipeline}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                {t("decode.discoveryModal.viewPipeline")}
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className="form-label">
                  {t("decode.discoveryModal.account")} <span className="text-danger">*</span>
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="form-select"
                >
                  <option value="">{t("decode.selectClient")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">
                  {t("decode.discoveryModal.opportunity")}
                </label>
                <select
                  value={selectedOpportunityId}
                  onChange={(e) => setSelectedOpportunityId(e.target.value)}
                  className="form-select"
                  disabled={!selectedAccountId}
                >
                  <option value="">
                    {!selectedAccountId
                      ? t("decode.discoveryModal.selectFirst")
                      : filteredOpportunities.length === 0
                        ? t("decode.discoveryModal.noOpportunities")
                        : t("decode.discoveryModal.selectOpportunity")}
                  </option>
                  {filteredOpportunities.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — ${o.value.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">{t("decode.discoveryModal.source")}</label>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-sidebar px-3 py-2 text-sm text-secondary">
                  <Send className="h-3.5 w-3.5 text-muted" />
                  {t("decode.discoveryModal.emailAuto")}
                </div>
              </div>

              <div>
                <label className="form-label">{t("decode.discoveryModal.preview")}</label>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-sidebar p-3 text-xs leading-relaxed text-secondary">
                  {decodeResult.threadAnalysis?.keySignal && (
                    <p className="mb-1.5">
                      <span className="font-medium text-foreground">{t("decode.discoveryModal.keySignal")}</span>{" "}
                      {decodeResult?.threadAnalysis?.keySignal}
                    </p>
                  )}
                  {decodeResult.messages
                    .filter((m) => m.speaker === "them")
                    .slice(0, 2)
                    .map((m, i) => (
                      <p key={i} className="mb-1">
                        <span className="font-medium text-foreground">{t("decode.discoveryModal.clientLabel")}</span>{" "}
                        {m.decode?.meaning}
                      </p>
                    ))}
                  {decodeResult.messages.filter((m) => m.speaker === "them").length > 2 && (
                    <p className="text-muted">{t("decode.discoveryModal.more")}</p>
                  )}
                </div>
              </div>

              {saveError && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  {saveError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-sidebar hover:text-foreground"
                >
                  {t("decode.discoveryModal.cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!selectedAccountId || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("decode.discoveryModal.saving")}
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-3.5 w-3.5" />
                      {t("decode.discoveryModal.save")}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
