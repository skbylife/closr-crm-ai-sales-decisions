'use client';

import { useState } from 'react';
import { useLocale } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmationField {
  field: string;
  value: string | null;
  confidence: 'explicit' | 'implied' | 'inferred';
  source_quote: string;
  isBlocked?: boolean;
  needsClarification?: string;
  needs_clarification?: string;
}

export interface PendingAction {
  toolName: string;
  displayName: string;
  fields: ConfirmationField[];
  requiresConfirmation: boolean;
  args?: Record<string, unknown>;
}

interface ConfirmationCardProps {
  actions: PendingAction[];
  onConfirm: (confirmedActions: PendingAction[]) => void;
  onCancel: () => void;
  onModify: (actionIndex: number, fieldIndex: number, newValue: string) => void;
  confirmLabel?: string;
  confirmingLabel?: string;
  isConfirming?: boolean;
  statusMessage?: string;
  errorMessage?: string;
}

// ─── Fields that always require extra confirmation ────────────────────────────

const ALWAYS_CONFIRM_FIELDS = [
  'budget', 'amount', 'contract_value',
  'close_date', 'decision_date', 'timeline',
  'deal_stage',
  'opportunity_status',
  // Chinese field names
  '预算', '金额', '合同金额', '关闭日期', '决策日期', '时间线',
  '阶段', '机会状态',
];

function isAlwaysConfirm(fieldName: string): boolean {
  return ALWAYS_CONFIRM_FIELDS.some((f) =>
    fieldName.toLowerCase().includes(f.toLowerCase()),
  );
}

// ─── Single field row ─────────────────────────────────────────────────────────

interface FieldRowProps {
  field: ConfirmationField;
  actionIndex: number;
  fieldIndex: number;
  editMode: boolean;
  onModify: (actionIndex: number, fieldIndex: number, newValue: string) => void;
}

function FieldRow({ field, actionIndex, fieldIndex, editMode, onModify }: FieldRowProps) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [editValue, setEditValue] = useState(field.value ?? '');

  const alwaysConfirm = isAlwaysConfirm(field.field);
  const isBlocked = field.confidence === 'inferred' || field.isBlocked;
  const needsClarification = field.needsClarification ?? field.needs_clarification;

  // Determine badge style
  let badge: React.ReactNode;
  if (isBlocked) {
    badge = (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-slate-200 dark:text-slate-900">
        ❓ {en ? 'AI inferred' : 'AI推断'}
      </span>
    );
  } else if (field.confidence === 'implied' || alwaysConfirm) {
    badge = (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-700 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-amber-300 dark:text-amber-950">
        ⚠️ {en ? 'Needs confirmation' : '需确认'}
      </span>
    );
  } else {
    badge = (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-emerald-300 dark:text-emerald-950">
        ✅ {en ? 'Extracted' : '已提取'}
      </span>
    );
  }

  // Row background
  const rowBg = isBlocked
    ? 'bg-gray-50 dark:bg-gray-900/20 opacity-60'
    : field.confidence === 'implied' || alwaysConfirm
      ? 'bg-amber-50/50 dark:bg-amber-900/10'
      : 'bg-emerald-50/30 dark:bg-emerald-900/10';

  return (
    <div className={`rounded-lg p-2.5 ${rowBg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">{field.field}</span>
          {badge}
          {needsClarification && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
              · {needsClarification}
            </span>
          )}
        </div>
        <button
          onClick={() => setQuoteOpen((v) => !v)}
          className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
        >
          {quoteOpen ? (en ? 'Hide quote' : '收起') : (en ? 'View quote' : '查看原话')}
        </button>
      </div>

      {/* Value */}
      {!isBlocked && (
        <div className="mt-1">
          {editMode ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                onModify(actionIndex, fieldIndex, e.target.value);
              }}
              className="w-full text-sm rounded-lg border border-border bg-background px-2 py-1 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : (
            <p className="text-sm text-foreground">
              {field.value ?? <span className="text-muted-foreground italic">{en ? '(not extracted)' : '（未提取到）'}</span>}
            </p>
          )}
        </div>
      )}

      {/* Blocked note */}
      {isBlocked && (
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 italic">{en ? 'This field is AI-inferred and will not be written to the database' : '此字段为 AI 推断，不会写入数据库'}</p>
      )}

      {/* Source quote */}
      {quoteOpen && field.source_quote && (
        <div className="mt-2 rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-2.5 py-1.5">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground/60">{en ? 'Quote: ' : '原话：'}</span>
            {field.source_quote}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConfirmationCard({
  actions,
  onConfirm,
  onCancel,
  onModify,
  confirmLabel = '确认全部',
  confirmingLabel = '处理中...',
  isConfirming = false,
  statusMessage,
  errorMessage,
}: ConfirmationCardProps) {
  const { locale } = useLocale();
  const en = locale === 'en';
  const [editMode, setEditMode] = useState(false);
  const effectiveConfirmLabel = confirmLabel === '确认全部'
    ? (en ? 'Confirm all' : confirmLabel)
    : confirmLabel;
  const effectiveConfirmingLabel = confirmingLabel === '处理中...'
    ? (en ? 'Processing...' : confirmingLabel)
    : confirmingLabel;

  // Filter out inferred/blocked from confirmation (they're display-only)
  const confirmableActions = actions.map((action) => ({
    ...action,
    fields: action.fields.filter((f) => f.confidence !== 'inferred' && !f.isBlocked),
  }));

  const totalWritable = confirmableActions.reduce((sum, a) => sum + a.fields.length, 0);
  const totalInferred = actions.reduce(
    (sum, a) => sum + a.fields.filter((f) => f.confidence === 'inferred' || f.isBlocked).length,
    0,
  );

  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden mt-2">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-sidebar px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold shrink-0">
          AI
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{en ? 'Needs your confirmation' : '需要你确认'}</p>
          <p className="text-[11px] text-muted-foreground">
            {en ? `Will write ${totalWritable} field${totalWritable === 1 ? '' : 's'}` : `将写入 ${totalWritable} 个字段`}
            {totalInferred > 0 && (en ? `; ${totalInferred} inferred field${totalInferred === 1 ? '' : 's'} will not be written` : `，${totalInferred} 个推断字段不会写入`)}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="divide-y divide-border">
        {actions.map((action, ai) => (
          <div key={ai} className="px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {action.displayName}
            </p>
            <div className="space-y-2">
              {action.fields.map((field, fi) => (
                <FieldRow
                  key={fi}
                  field={field}
                  actionIndex={ai}
                  fieldIndex={fi}
                  editMode={editMode}
                  onModify={onModify}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer buttons */}
      <div className="border-t border-border bg-sidebar px-4 py-3">
        {(statusMessage || errorMessage) && (
          <p className={`mb-3 text-xs ${errorMessage ? 'text-danger' : 'text-muted-foreground'}`}>
            {errorMessage ?? statusMessage}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onCancel}
            disabled={isConfirming}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {en ? 'Cancel' : '取消'}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode((v) => !v)}
              disabled={isConfirming}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editMode ? (en ? 'Done editing' : '完成修改') : (en ? 'Edit fields' : '逐条修改')}
            </button>
            <button
              onClick={() => onConfirm(confirmableActions)}
              disabled={totalWritable === 0 || isConfirming}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {isConfirming && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />}
              {isConfirming ? effectiveConfirmingLabel : effectiveConfirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
