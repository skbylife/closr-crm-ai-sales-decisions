"use client";

// ─── Save to Account Dropdown Button ─────────────────────────────────

import { useState, useEffect, useRef } from "react";
import { Save, ChevronDown, Plus } from "lucide-react";
import type { Account } from "@/lib/babel-engine/types";
import { useLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { useRoleFilteredData } from "@/hooks/use-role-filtered-data";

// ─── Props ───────────────────────────────────────────────────────────

interface SaveToAccountButtonProps {
  onSave: (accountId: string, accountName: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export function SaveToAccountButton({ onSave }: SaveToAccountButtonProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { accounts } = useRoleFilteredData();
  const addAccount = useStore((s) => s.addAccount);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  function handleSelectAccount(account: Account) {
    onSave(account.id, account.name);
    setOpen(false);
  }

  function handleCreateAndSave() {
    const name = newAccountName.trim();
    if (!name) return;
    const id = addAccount({ name });
    onSave(id, name);
    setNewAccountName("");
    setOpen(false);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent/20 hover:border-accent/30"
      >
        <Save className="h-3 w-3" />
        {t("decode.saveToAccount")}
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-card shadow-xl shadow-black/8">
          {accounts.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-b border-border">
              <div className="px-3 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
                {t("decode.existingAccounts")}
              </div>
              {accounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => handleSelectAccount(account)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-sidebar"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sidebar text-xs font-bold text-muted">
                    {account.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{account.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="p-2.5">
            <div className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              {t("decode.newAccount")}
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateAndSave()}
                placeholder={t("decode.newAccountPlaceholder")}
                className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none"
              />
              <button
                onClick={handleCreateAndSave}
                disabled={!newAccountName.trim()}
                className="flex items-center justify-center rounded-lg bg-accent px-2.5 py-1.5 text-white transition-colors hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
