'use client';

import { visibleBusinessText } from "@/lib/visible-business-text";
import { useLocale } from "@/lib/i18n";
import Link from 'next/link';
import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  type: 'task' | 'deal' | 'meeting';
  href?: string;
  color: string;
  priority?: string;
}
export default function CalendarPage() {
  const {
    locale
  } = useLocale();
  const en = locale === "en";
  const tx = (value: string) => en ? visibleBusinessText(value, "en") : value;
  const tasks = useStore(s => s.tasks);
  const opportunities = useStore(s => s.opportunities);
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 收集日历事件
  const events: CalendarEvent[] = useMemo(() => {
    const evts: CalendarEvent[] = [];

    // 任务 dueDate
    for (const t of tasks) {
      if (t.dueDate) {
        evts.push({
          id: t.id,
          title: t.title,
          date: t.dueDate.split('T')[0],
          type: 'task',
          href: '/tasks',
          color: t.priority === 'high' ? 'bg-danger' : t.priority === 'medium' ? 'bg-warning' : 'bg-blue-400',
          priority: t.priority
        });
      }
    }

    // Deal close dates
    for (const o of opportunities) {
      if (o.expectedCloseDate) {
        const dateStr = o.expectedCloseDate.split('T')[0];
        evts.push({
          id: o.id,
          title: `💰 ${o.name}`,
          date: dateStr,
          type: 'deal',
          href: `/pipeline/${o.id}`,
          color: 'bg-accent'
        });
      }
    }
    return evts;
  }, [tasks, opportunities]);

  // 日历网格
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date === dateStr);
  };
  return <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{tx("📅 日历")}</h1>
          <p className="text-sm text-muted mt-1">{tx("任务截止日、Deal 预计关单日")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-lg border border-border p-2 hover:bg-background"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold text-foreground min-w-[120px] text-center">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="rounded-lg border border-border p-2 hover:bg-background"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={goToday} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background">{tx("今天")}</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 sm:gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" />{tx("高优先任务")}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" />{tx("中优先任务")}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{tx("低优先任务")}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" />{tx("Deal 关单日")}</span>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map(d => <div key={d} className="py-2 text-center text-[12px] font-semibold text-secondary">{d}</div>)}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[48px] sm:min-h-[80px] border-b border-r border-border bg-sidebar/30" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === today;
          const dayEvents = getEventsForDay(day);
          return <div key={i} className={`min-h-[48px] sm:min-h-[80px] border-b border-r border-border p-0.5 sm:p-1 ${isToday ? 'bg-accent/5' : 'hover:bg-background'}`}>
                <p className={`text-xs font-medium mb-1 ${isToday ? 'text-accent font-bold' : 'text-foreground'}`}>
                  {day}
                </p>
                <div className="space-y-0.5">
                  {/* Mobile: show dots only */}
                  <div className="flex flex-wrap gap-0.5 sm:hidden">
                    {dayEvents.slice(0, 4).map(evt => <span key={evt.id} className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${evt.color}`} />)}
                    {dayEvents.length > 4 && <span className="text-[10px] text-muted">+{dayEvents.length - 4}</span>}
                  </div>
                  {/* Desktop: show event titles */}
                  <div className="hidden sm:block space-y-0.5">
                  {dayEvents.slice(0, 3).map(evt => <Link key={evt.id} href={evt.href || '/tasks'} className="flex items-center gap-1 truncate hover:bg-stripe rounded px-0.5 -mx-0.5 cursor-pointer">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${evt.color}`} />
                      <span className="text-[11px] text-foreground truncate">{evt.title}</span>
                    </Link>)}
                  {dayEvents.length > 3 && <p className="text-[11px] text-muted">+{dayEvents.length - 3}{tx("更多")}</p>}
                  </div>
                </div>
              </div>;
        })}
        </div>
      </div>

      {/* Today's events */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">{tx("📋 今日事项")}</p>
        {events.filter(e => e.date === today).length === 0 ? <p className="text-xs text-muted">{tx("今天没有安排")}</p> : <div className="space-y-2">
            {events.filter(e => e.date === today).map(evt => <Link key={evt.id} href={evt.href || '/tasks'} className="flex items-center gap-2 hover:bg-stripe rounded-lg px-2 py-1 -mx-2 cursor-pointer transition-colors">
                <span className={`h-2 w-2 rounded-full ${evt.color}`} />
                <span className="text-sm text-foreground">{evt.title}</span>
                <span className="text-[12px] text-muted">{evt.type === 'task' ? '任务' : 'Deal'}</span>
              </Link>)}
          </div>}
      </div>
    </div>;
}