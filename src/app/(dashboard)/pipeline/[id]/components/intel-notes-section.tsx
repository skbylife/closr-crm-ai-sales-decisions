'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import {
  Plus,
  Trash2,
  Brain,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';
import type {
  Opportunity,
  SpinCategory,
  DiscoveryScore,
} from '@/lib/babel-engine/types';
import { SPIN_COLORS, SPIN_LABELS } from '@/lib/babel-engine/types';

export function IntelNotesSection({ opportunityId, opp, accountName }: { opportunityId: string; opp: Opportunity; accountName: string }) {
  const { locale } = useLocale();
  const { addIntel, updateIntel, deleteIntel, intelItems, accounts } = useStore();
  const notes = intelItems.filter(n => n.opportunityId === opportunityId);
  const [showForm, setShowForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSource, setNoteSource] = useState<'meeting' | 'call' | 'email' | 'chat' | 'other'>('meeting');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [analyzing, setAnalyzing] = useState(false);

  const SOURCE_LABELS_LOCAL: Record<string, string> = {
    meeting: '会议',
    call: '电话',
    email: '邮件',
    chat: '聊天',
    other: '其他',
  };

  const SPIN_ORDER: SpinCategory[] = ['situation', 'problem', 'implication', 'need_payoff'];

  const discoveryScore = useMemo<DiscoveryScore>(() => {
    const allSpins = notes.flatMap(n => n.spinClassification || []);
    const cats: Record<SpinCategory, number> = { situation: 0, problem: 0, implication: 0, need_payoff: 0 };
    for (const item of allSpins) {
      cats[item.category] = Math.min(25, cats[item.category] + Math.round(8 * item.confidence));
    }
    const missing: SpinCategory[] = [];
    if (cats.situation < 10) missing.push('situation');
    if (cats.problem < 10) missing.push('problem');
    if (cats.implication < 10) missing.push('implication');
    if (cats.need_payoff < 10) missing.push('need_payoff');
    return { situation: cats.situation, problem: cats.problem, implication: cats.implication, needPayoff: cats.need_payoff, total: cats.situation + cats.problem + cats.implication + cats.need_payoff, missingCategories: missing, recommendedQuestions: [] };
  }, [notes]);

  // Find the account for this opportunity
  const account = accounts.find(a => a.id === opp.accountId);

  const handleAddNote = () => {
    if (!noteContent.trim() || !account) return;
    addIntel({
      accountName: accountName,
      source: noteSource,
      content: noteContent.trim(),
      credibility: 'medium',
      urgency: 'medium',
      opportunityId,
      type: 'discovery',
    });
    setNoteContent('');
    setShowForm(false);
  };

  const handleAnalyze = async (noteId: string, content: string) => {
    setAnalyzing(true);
    try {
      const existingSpins = notes.flatMap(n => n.spinClassification || []);
      const res = await fetch('/api/spin-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, opportunityContext: { name: opp.name, stage: opp.stage, value: opp.value, accountName, existingSpinItems: existingSpins }, outputLocale: locale }),
      });
      const data = await res.json();
      if (data.spinItems) {
        updateIntel(noteId, { spinClassification: data.spinItems });
      }
    } catch (err) {
      console.error('SPIN analyze error:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-accent" />
          情报 (SPIN)
        </h3>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
          <Plus className="h-3 w-3" /> 添加情报
        </button>
      </div>

      {/* Discovery Score */}
      <div className="px-5 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">需求挖掘完整度</span>
          <span className="text-xs font-bold text-foreground">{discoveryScore.total}/100</span>
        </div>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-background">
          {SPIN_ORDER.map((cat) => {
            const val = cat === 'need_payoff' ? discoveryScore.needPayoff : discoveryScore[cat];
            return <div key={cat} className={`${SPIN_COLORS[cat].bg} transition-all duration-250`} style={{ width: `${val}%` }} title={`${SPIN_LABELS[cat]}: ${val}/25`} />;
          })}
        </div>
        <div className="flex gap-3 mt-1.5">
          {SPIN_ORDER.map((cat) => (
            <span key={cat} className={`text-xs font-medium ${SPIN_COLORS[cat].text}`}>
              {cat === 'situation' ? 'S' : cat === 'problem' ? 'P' : cat === 'implication' ? 'I' : 'N'}:{cat === 'need_payoff' ? discoveryScore.needPayoff : discoveryScore[cat]}
            </span>
          ))}
        </div>
        {discoveryScore.missingCategories.length > 0 && (
          <div className="mt-2 space-y-1">
            {discoveryScore.missingCategories.includes('implication') && <p className="text-xs text-warning">⚠️ 还没有量化后果（Implication），建议在下次会议中追问</p>}
            {discoveryScore.missingCategories.includes('need_payoff') && <p className="text-xs text-warning">⚠️ 缺少需求回报（Need-payoff），建议了解客户预期的 ROI</p>}
            {discoveryScore.missingCategories.includes('problem') && <p className="text-xs text-warning">⚠️ 问题描述不足（Problem），建议深入了解客户痛点</p>}
            {discoveryScore.missingCategories.includes('situation') && <p className="text-xs text-warning">⚠️ 现状信息不足（Situation），建议收集更多背景信息</p>}
          </div>
        )}
      </div>

      {/* Add Note Form */}
      {showForm && (
        <div className="p-5 border-b border-border space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">日期</label>
              <input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="form-input text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">来源</label>
              <select value={noteSource} onChange={(e) => setNoteSource(e.target.value as typeof noteSource)} className="form-select text-sm">
                {Object.entries(SOURCE_LABELS_LOCAL).map(([val, lbl]) => (<option key={val} value={val}>{lbl}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">情报内容</label>
            <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} className="form-input" rows={4} placeholder="记录会议/通话中的发现..." />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddNote} disabled={!noteContent.trim()} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40">
              <Plus className="h-3.5 w-3.5" /> 保存情报
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:bg-sidebar">取消</button>
          </div>
        </div>
      )}

      {/* Notes List */}
      {notes.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted/30 mb-2" />
          <p className="text-sm font-medium text-foreground">暂无情报</p>
          <p className="mt-1 text-xs text-muted">通过 SPIN 方法论系统化整理发现，提升成交率</p>
          <button onClick={() => setShowForm(true)} className="mt-3 flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
            <Plus className="h-3 w-3" />添加情报
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
          {notes.map((note) => (
            <div key={note.id} className="px-5 py-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{new Date(note.date).toLocaleDateString('zh-CN')}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">{SOURCE_LABELS_LOCAL[note.source] ?? note.source}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!Array.isArray(note.spinClassification) && (
                    <button onClick={() => handleAnalyze(note.id, note.content)} disabled={analyzing} className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50">
                      {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                      🔍 AI 分析 SPIN
                    </button>
                  )}
                  <button onClick={async () => { if (await appConfirm({ message: '确定删除此情报？', variant: 'danger' })) deleteIntel(note.id); }} className="rounded p-1 text-muted hover:text-danger hover:bg-danger/10"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{note.content}</p>
              {Array.isArray(note.spinClassification) && note.spinClassification.length > 0 && (
                <div className="mt-2 space-y-1">
                  {note.spinClassification.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${SPIN_COLORS[item.category].bg} ${SPIN_COLORS[item.category].text} border ${SPIN_COLORS[item.category].border}`}>
                        {item.category === 'situation' ? 'S' : item.category === 'problem' ? 'P' : item.category === 'implication' ? 'I' : 'N'}
                      </span>
                      <span className="text-xs text-foreground flex-1">{item.text}</span>
                      <span className="text-xs text-muted">{Math.round(item.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
