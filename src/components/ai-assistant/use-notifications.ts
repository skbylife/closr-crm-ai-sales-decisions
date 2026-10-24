'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { genId } from '@/lib/gen-id';
import { useAuth } from '@/lib/auth-context';
import type { Message, ActionButton } from './types';

// ─── Notification types (client-side) ────────────────────────────────

interface ClientNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  actions: Array<{
    id: string;
    label: string;
    style: 'primary' | 'secondary' | 'danger';
    action: { type: string; [key: string]: unknown };
  }>;
  createdAt: string;
}

const POLL_INTERVAL = 60_000; // 60 seconds
const MAX_RETRY_BACKOFF = 5 * 60_000; // 5 minutes

function isDocumentVisible() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

function getRetryBackoff(failureCount: number) {
  return Math.min(POLL_INTERVAL * 2 ** Math.max(0, failureCount - 1), MAX_RETRY_BACKOFF);
}

/**
 * useNotifications hook — 通知轮询 + 未读计数
 * 从 ChatBubble 提取，减少组件体积
 */
export function useNotifications(open: boolean) {
  const { session, isLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadedForUserId, setLoadedForUserId] = useState<string | null>(null);
  const [notificationMessages, setNotificationMessages] = useState<Message[]>([]);
  const [blockedAccessToken, setBlockedAccessToken] = useState<string | null>(null);
  const [isPageVisible, setIsPageVisible] = useState(isDocumentVisible);
  const countFailureCountRef = useRef(0);
  const countNextRetryAtRef = useRef(0);
  const listFailureCountRef = useRef(0);
  const listNextRetryAtRef = useRef(0);
  const accessToken = session?.access_token ?? null;
  const currentUserId = session?.user.id ?? null;
  const canFetchNotifications = !isLoading && Boolean(session) && blockedAccessToken !== accessToken;
  const notificationsLoaded = loadedForUserId === currentUserId;

  const resetCountBackoff = useCallback(() => {
    countFailureCountRef.current = 0;
    countNextRetryAtRef.current = 0;
  }, []);

  const recordCountFailure = useCallback(() => {
    countFailureCountRef.current += 1;
    countNextRetryAtRef.current = Date.now() + getRetryBackoff(countFailureCountRef.current);
  }, []);

  const resetListBackoff = useCallback(() => {
    listFailureCountRef.current = 0;
    listNextRetryAtRef.current = 0;
  }, []);

  const recordListFailure = useCallback(() => {
    listFailureCountRef.current += 1;
    listNextRetryAtRef.current = Date.now() + getRetryBackoff(listFailureCountRef.current);
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    if (!canFetchNotifications || !isPageVisible) return;
    if (Date.now() < countNextRetryAtRef.current) return;
    try {
      const res = await fetch('/api/notifications/count');
      if (res.status === 401) {
        resetCountBackoff();
        setBlockedAccessToken(accessToken);
        setUnreadCount(0);
        return;
      }
      if (res.ok) {
        resetCountBackoff();
        const data = await res.json();
        setUnreadCount(data.count ?? 0);
        return;
      }
      recordCountFailure();
    } catch {
      recordCountFailure();
    }
  }, [canFetchNotifications, isPageVisible, resetCountBackoff, recordCountFailure, accessToken]);

  useEffect(() => {
    const onVisibilityChange = () => {
      setIsPageVisible(isDocumentVisible());
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Poll unread count every 60s, only while an authenticated session is available and the tab is visible.
  useEffect(() => {
    if (!canFetchNotifications || !isPageVisible) return;

    const initialTimer = window.setTimeout(() => {
      void fetchUnreadCount();
    }, 0);
    const timer = window.setInterval(() => {
      void fetchUnreadCount();
    }, POLL_INTERVAL);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [canFetchNotifications, isPageVisible, fetchUnreadCount]);

  // Load notifications when chat opens
  const loadNotifications = useCallback(async () => {
    if (notificationsLoaded || !canFetchNotifications || !currentUserId) return;
    if (Date.now() < listNextRetryAtRef.current) return;
    try {
      const res = await fetch('/api/notifications');
      if (res.status === 401) {
        resetCountBackoff();
        resetListBackoff();
        setBlockedAccessToken(accessToken);
        setUnreadCount(0);
        return;
      }
      if (!res.ok) {
        recordListFailure();
        return;
      }
      resetCountBackoff();
      resetListBackoff();
      const data = await res.json();
      const notifications: ClientNotification[] = data.notifications ?? [];
      if (notifications.length === 0) return;

      // Convert notifications to assistant messages
      const notifMessages: Message[] = notifications.map((n) => {
        const priorityLabel = n.priority === 'high' ? '[!] ' : '';
        const bodyText = n.body ? `\n${n.body}` : '';
        const content = `${priorityLabel}**${n.title}**${bodyText}`;

        const actions: ActionButton[] = (n.actions ?? []).map((a) => ({
          id: a.id,
          label: a.label,
          style: a.style,
          action: a.action.type === 'reply'
            ? { type: 'reply' as const, text: (a.action as { text?: string }).text ?? a.label }
            : { type: 'confirm' as const, payload: { notificationId: n.id, ...a.action } },
        }));

        // Add a "dismiss" action to mark as read
        actions.push({
          id: `dismiss-${n.id}`,
          label: '已读',
          style: 'secondary',
          action: { type: 'confirm' as const, payload: { _markRead: n.id } },
        });

        return {
          id: genId(),
          role: 'assistant' as const,
          content,
          type: 'action' as const,
          actions,
          metadata: { notificationId: n.id },
        };
      });

      setNotificationMessages(notifMessages);
      setLoadedForUserId(currentUserId);

      // Mark all as read on server
      const ids = notifications.map((n) => n.id);
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).then(() => setUnreadCount(0)).catch(() => {});
    } catch {
      recordListFailure();
    }
  }, [notificationsLoaded, canFetchNotifications, currentUserId, accessToken, resetCountBackoff, resetListBackoff, recordListFailure]);

  useEffect(() => {
    if (!open || !canFetchNotifications) return;

    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, canFetchNotifications, loadNotifications]);

  return {
    unreadCount: canFetchNotifications ? unreadCount : 0,
    notificationMessages: notificationsLoaded ? notificationMessages : [],
  };
}
