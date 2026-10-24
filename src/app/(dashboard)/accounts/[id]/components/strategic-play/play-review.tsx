'use client';

import { useState, useEffect } from 'react';
import { Plus, Loader2, X, FileText, Lightbulb } from 'lucide-react';
import { toast } from '@/lib/toast-store';
import { visibleBusinessText } from '@/lib/visible-business-text';
import { patchStrategicPlay, strategicPlayPatchErrorMessage } from './api';
import { tPlay, REVIEW_RESULT_OPTIONS, reviewResultLabel } from './labels';
import { displayText } from './text';
import type { PlayReview } from '@/lib/babel-engine/types';
import type { StrategicPlayWithRoutePlan } from './deal-path';

// ─── Play Review / In-progress learning (read-only display) ─────────

export function PlayReviewSection({
  play,
  en,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
}) {
  if (!play.review) return null;
  const review = play.review;
  const isFinalReview = play.status === 'completed' || play.status === 'abandoned';

  return (
    <div className="rounded-xl border border-positive/20 bg-positive/[0.03] p-4">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-positive uppercase tracking-wider mb-3">
        <FileText className="h-3.5 w-3.5" />
        {isFinalReview ? tPlay(en, '谋局复盘', 'Play Review') : tPlay(en, '阶段学习', 'Stage Learning')}
      </h4>
      <div className="space-y-3">
        <div>
          <span className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '结果', 'Result')}</span>
          <p className="text-xs font-medium text-foreground mt-0.5">{reviewResultLabel(review.result, en)}</p>
        </div>
        {(review.whatWorked ?? []).length > 0 && (
          <div>
            <span className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '有效策略', 'Effective Strategy')}</span>
            <ul className="mt-1 space-y-0.5">
              {(review.whatWorked ?? []).map((w, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-positive shrink-0" />{visibleBusinessText(w, en ? 'en' : 'zh')}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(review.whatSurprised ?? []).length > 0 && (
          <div>
            <span className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '意外发现', 'Unexpected Finding')}</span>
            <ul className="mt-1 space-y-0.5">
              {(review.whatSurprised ?? []).map((w, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />{visibleBusinessText(w, en ? 'en' : 'zh')}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(review.assumptionsReview ?? []).length > 0 && (
          <div>
            <span className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '假设回顾', 'Assumption Review')}</span>
            <div className="mt-1 space-y-1">
              {(review.assumptionsReview ?? []).map((ar, i) => {
                const assumption = (play.assumptions ?? []).find(a => a.id === ar.assumptionId);
                return (
                  <div key={i} className="text-xs text-foreground">
                    <span className="text-muted">{visibleBusinessText(assumption?.text ?? ar.assumptionId, en ? 'en' : 'zh')}:</span>{' '}
                    <span>{visibleBusinessText(ar.outcome, en ? 'en' : 'zh')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {(review.lessonsForFuture ?? []).length > 0 && (
          <div>
            <span className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '未来经验', 'Future Learning')}</span>
            <ul className="mt-1 space-y-0.5">
              {(review.lessonsForFuture ?? []).map((l, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <Lightbulb className="mt-0.5 h-3 w-3 text-yellow-500 shrink-0" />{visibleBusinessText(l, en ? 'en' : 'zh')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Review Form ────────────────────────────────────────────────────
// Stays mounted while hidden so draft entries survive cancel/reopen,
// matching the original behavior where this state lived in PlayDetail.

export function PlayReviewForm({
  play,
  en,
  show,
  onClose,
  onRefresh,
}: {
  play: StrategicPlayWithRoutePlan;
  en: boolean;
  show: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [reviewResult, setReviewResult] = useState<PlayReview['result']>('achieved');
  const [reviewWhatWorked, setReviewWhatWorked] = useState<string[]>([]);
  const [reviewWhatSurprised, setReviewWhatSurprised] = useState<string[]>([]);
  const [reviewAssumptions, setReviewAssumptions] = useState<{ assumptionId: string; outcome: string }[]>([]);
  const [reviewLessons, setReviewLessons] = useState<string[]>([]);
  const [savingReview, setSavingReview] = useState(false);
  const [newWorkedText, setNewWorkedText] = useState('');
  const [newSurprisedText, setNewSurprisedText] = useState('');
  const [newLessonText, setNewLessonText] = useState('');

  // Init review assumptions from play assumptions
  useEffect(() => {
    if (play.assumptions && play.assumptions.length > 0 && reviewAssumptions.length === 0) {
      setReviewAssumptions(play.assumptions.map(a => ({ assumptionId: a.id, outcome: '' })));
    }
  }, [play.assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveReview = async () => {
    setSavingReview(true);
    try {
      const review: PlayReview = {
        result: reviewResult,
        whatWorked: reviewWhatWorked,
        whatSurprised: reviewWhatSurprised,
        assumptionsReview: reviewAssumptions.filter(a => a.outcome.trim()),
        lessonsForFuture: reviewLessons,
        reviewedAt: new Date().toISOString(),
      };
      await patchStrategicPlay(play, { review });
      onClose();
      onRefresh();
    } catch (err) {
      console.error('[strategic-play] Save review failed:', err);
      toast(strategicPlayPatchErrorMessage(err), 'error');
    } finally {
      setSavingReview(false);
    }
  };

  if (!show || play.review) return null;

  return (
    <div className="rounded-xl border border-accent/20 bg-card p-4 space-y-4">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider">
        <FileText className="h-3.5 w-3.5" />
        {tPlay(en, '谋局复盘', 'Play Review')}
      </h4>

      {/* Result */}
      <div>
        <label className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '结果', 'Result')}</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {REVIEW_RESULT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setReviewResult(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                reviewResult === opt.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-secondary hover:text-foreground'
              }`}
            >
              {reviewResultLabel(opt.value, en)}
            </button>
          ))}
        </div>
      </div>

      {/* What Worked */}
      <ReviewListInput
        label={tPlay(en, '有效策略', 'Effective Strategy')}
        items={reviewWhatWorked}
        setItems={setReviewWhatWorked}
        inputValue={newWorkedText}
        setInputValue={setNewWorkedText}
        placeholder={tPlay(en, '哪些策略起到了作用...', 'Which strategies worked...')}
      />

      {/* What Surprised */}
      <ReviewListInput
        label={tPlay(en, '意外发现', 'Unexpected Finding')}
        items={reviewWhatSurprised}
        setItems={setReviewWhatSurprised}
        inputValue={newSurprisedText}
        setInputValue={setNewSurprisedText}
        placeholder={tPlay(en, '有什么出乎意料的...', 'What was unexpected...')}
      />

      {/* Assumptions Review */}
      {(play.assumptions ?? []).length > 0 && (
        <div>
          <label className="text-[12px] font-semibold text-muted uppercase">{tPlay(en, '假设回顾', 'Assumption Review')}</label>
          <div className="mt-1.5 space-y-2">
            {(play.assumptions ?? []).map((a) => {
              const existing = reviewAssumptions.find(r => r.assumptionId === a.id);
              return (
                <div key={a.id} className="flex items-start gap-2">
                  <span className="text-xs text-foreground shrink-0 mt-1.5 max-w-[200px] truncate">{displayText(a.text)}</span>
                  <input
                    value={existing?.outcome ?? ''}
                    onChange={(e) => {
                      setReviewAssumptions(prev =>
                        prev.map(r => r.assumptionId === a.id ? { ...r, outcome: e.target.value } : r)
                      );
                    }}
                    placeholder={tPlay(en, '最终结果...', 'Final outcome...')}
                    className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lessons */}
      <ReviewListInput
        label={tPlay(en, '未来经验', 'Future Learning')}
        items={reviewLessons}
        setItems={setReviewLessons}
        inputValue={newLessonText}
        setInputValue={setNewLessonText}
        placeholder={tPlay(en, '下次可以改进的...', 'What to improve next time...')}
      />

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          onClick={saveReview}
          disabled={savingReview}
          className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {savingReview ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
          {tPlay(en, '保存复盘', 'Save review')}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg border border-border px-4 py-2 text-xs text-secondary hover:text-foreground transition-colors"
        >
          {tPlay(en, '取消', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

export function ReviewListInput({
  label,
  items,
  setItems,
  inputValue,
  setInputValue,
  placeholder,
}: {
  label: string;
  items: string[];
  setItems: (items: string[]) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  placeholder: string;
}) {
  const add = () => {
    if (!inputValue.trim()) return;
    setItems([...items, inputValue.trim()]);
    setInputValue('');
  };
  return (
    <div>
      <label className="text-[12px] font-semibold text-muted uppercase">{label}</label>
      {items.length > 0 && (
        <div className="mt-1 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
              <span className="flex-1">{item}</span>
              <button
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-muted hover:text-danger"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
        />
        <button
          onClick={add}
          disabled={!inputValue.trim()}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          添加
        </button>
      </div>
    </div>
  );
}
