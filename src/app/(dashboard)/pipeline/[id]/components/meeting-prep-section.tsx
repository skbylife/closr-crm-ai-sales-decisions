'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { useLocale } from '@/lib/i18n';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  CheckCircle2,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type {
  Opportunity,
  Contact,
  MeetingType,
  MeetingPrepInput,
  MeetingPrepResult,
} from '@/lib/babel-engine/types';
import { MEETING_TYPE_LABELS } from '@/lib/babel-engine/types';

export function MeetingPrepSection({ opp, accountId, contacts }: { opp: Opportunity; accountId: string; contacts: Contact[] }) {
  const { locale } = useLocale();
  const addMeetingPrep = useStore((s) => s.addMeetingPrep);
  const addTask = useStore((s) => s.addTask);
  const [addedAgendaTasks, setAddedAgendaTasks] = useState(false);
  const getMeetingPreps = useStore((s) => s.getMeetingPreps);
  const preps = getMeetingPreps(accountId);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MeetingPrepResult | null>(null);

  // Step 1 fields
  const [meetingType, setMeetingType] = useState<MeetingType>('discovery');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [objective, setObjective] = useState('');

  // Step 2 fields
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
  const [agenda, setAgenda] = useState('');
  const [topics, setTopics] = useState('');
  const [ourTeam, setOurTeam] = useState('');
  const [specialConcerns, setSpecialConcerns] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const input: MeetingPrepInput = {
        meetingTitle: meetingTitle || `${MEETING_TYPE_LABELS[meetingType]} - ${opp.name}`,
        meetingDate: meetingDate || new Date().toISOString().slice(0, 10),
        meetingType,
        agenda,
        topics: topics.split(/[,，]/).map(t => t.trim()).filter(Boolean),
        attendeeContactIds: selectedContacts,
        externalAttendees: [],
        ourTeam,
        meetingObjective: objective,
        specialConcerns,
      };
      const res = await fetch('/api/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, input, outputLocale: locale }),
      });
      const data = await res.json();
      if (data.meetingSummary) {
        setResult(data);
        addMeetingPrep(accountId, input, data);
      }
    } catch (err) {
      console.error('Meeting prep error:', err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-accent" />
          会议准备
        </h3>
        <button onClick={() => { setShowForm(!showForm); setResult(null); }} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">
          <Plus className="h-3 w-3" /> 新建准备
        </button>
      </div>

      {showForm && !result && (
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-accent/20 bg-accent/[0.03] p-4 space-y-3">
            <p className="text-xs font-bold text-accent">Step 1 — 必填</p>
            <div>
              <label className="mb-1 block text-xs text-muted">会议类型</label>
              <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as MeetingType)} className="form-select text-sm">
                {(Object.entries(MEETING_TYPE_LABELS) as [MeetingType, string][]).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">参会人员</label>
              <div className="flex flex-wrap gap-2">
                {contacts.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs cursor-pointer hover:bg-sidebar">
                    <input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => setSelectedContacts(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])} />
                    {c.name}{c.title ? ` (${c.title})` : ''}
                  </label>
                ))}
                {contacts.length === 0 && <p className="text-xs text-muted">暂无联系人</p>}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">会议目标</label>
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} className="form-input" rows={2} placeholder="这次会议要达成什么目的？" />
            </div>
          </div>

          <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-xs text-accent hover:underline">
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showAdvanced ? '收起更多选项' : '展开更多选项'}
          </button>

          <div className={`overflow-hidden transition-all duration-250 ${showAdvanced ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="rounded-lg border border-border bg-sidebar p-4 space-y-3">
              <p className="text-xs font-bold text-secondary">Step 2 — 可选</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-muted">会议标题</label>
                  <input type="text" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} className="form-input text-sm" placeholder="自动生成" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">会议日期</label>
                  <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="form-input text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">议程</label>
                <textarea value={agenda} onChange={(e) => setAgenda(e.target.value)} className="form-input text-sm" rows={2} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">话题（逗号分隔）</label>
                <input type="text" value={topics} onChange={(e) => setTopics(e.target.value)} className="form-input text-sm" placeholder="话题1, 话题2" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">我方参会人员</label>
                <input type="text" value={ourTeam} onChange={(e) => setOurTeam(e.target.value)} className="form-input text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">特别关注事项</label>
                <textarea value={specialConcerns} onChange={(e) => setSpecialConcerns(e.target.value)} className="form-input text-sm" rows={2} />
              </div>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generating || !objective.trim()} className="flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? '生成中...' : '生成会议准备'}
          </button>
        </div>
      )}

      {result && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">AI 准备建议</h4>
            <button onClick={() => { setResult(null); setShowForm(false); }} className="text-xs text-muted hover:text-accent">关闭</button>
          </div>
          {result.winProbabilityReasoning && <p className="text-xs text-muted">{result.winProbabilityReasoning}</p>}
          {result.talkingPoints.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">谈话要点</p>
              {result.talkingPoints.map((tp, i) => (<div key={i} className="text-xs text-muted mb-1">• <span className="font-medium text-foreground">{tp.topic}</span>: {tp.angle}</div>))}
            </div>
          )}
          {result.questionsToAsk.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">建议提问</p>
              {result.questionsToAsk.map((q, i) => (<div key={i} className="text-xs text-muted mb-1">• {q.question}</div>))}
            </div>
          )}
          {result.actionItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">行动项</p>
              {result.actionItems.map((a, i) => (<div key={i} className="text-xs text-muted mb-1">• [{a.phase === 'before' ? '会前' : a.phase === 'during' ? '会中' : '会后'}] {a.action}</div>))}
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-border">
            {addedAgendaTasks ? (
              <span className="flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="h-3 w-3" />已创建任务</span>
            ) : (
              <button
                onClick={() => {
                  const items = [
                    ...result.talkingPoints.map((tp) => ({ title: tp.topic, desc: tp.angle })),
                    ...result.actionItems.map((a) => ({ title: a.action, desc: `[${a.phase === 'before' ? '会前' : a.phase === 'during' ? '会中' : '会后'}]` })),
                  ];
                  for (const item of items) {
                    addTask({
                      title: item.title,
                      description: item.desc,
                      status: 'todo',
                      priority: 'medium',
                      source: 'manual',
                      aiGenerated: true,
                      accountId,
                      opportunityId: opp.id,
                    });
                  }
                  setAddedAgendaTasks(true);
                }}
                className="flex items-center gap-1 rounded-lg border border-accent/30 px-3 py-1.5 text-xs text-accent hover:bg-accent/5 transition-colors"
              >
                <Plus className="h-3 w-3" />将议程项转为任务
              </button>
            )}
          </div>
        </div>
      )}

      {preps.length > 0 && !showForm && (
        <div className="divide-y divide-border">
          {preps.slice(0, 3).map((p) => (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{p.input.meetingTitle || MEETING_TYPE_LABELS[p.input.meetingType]}</span>
                <span className="text-xs text-muted">{new Date(p.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <p className="text-xs text-secondary mt-0.5">{p.input.meetingObjective}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
