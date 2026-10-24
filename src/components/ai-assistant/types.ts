// ─── Chat Message Types ──────────────────────────────────────────────

import type { PendingAction } from '@/components/chat/ConfirmationCard';

export type { PendingAction };

export interface ActionButton {
  id: string;
  label: string;
  icon?: string; // emoji
  style: 'primary' | 'secondary' | 'danger';
  action:
    | { type: 'oauth'; provider: 'microsoft' | 'google' | 'wecom'; mode?: 'org' | 'personal' }
    | { type: 'confirm'; payload: Record<string, unknown> }
    | { type: 'reply'; text: string };
  disabled?: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'action' | 'progress' | 'summary';
  actions?: ActionButton[];
  metadata?: Record<string, unknown>;
  progression?: {
    currentJudgment: string;
    mainBlocker: string;
    blockerCode?: string;
    nextBestAction: string;
    recommendedTarget: string;
    reason: string;
    riskNote: string;
    nextAction?: {
      actionType: string;
      targetEntityType?: 'contact' | 'account' | 'opportunity';
      targetEntityId?: string;
      targetEntityName?: string;
      description: string;
      evidence?: string;
      urgency: 'high' | 'medium' | 'low';
      quickActionText?: string;
    };
  };
  /** Pending agent actions awaiting user confirmation */
  pendingActions?: PendingAction[];
  /** Execution results shown after user confirmed pending actions */
  actionResults?: ActionResultItem[];
  /** Message creation timestamp */
  timestamp?: number;
}

export interface ActionResultItem {
  toolName: string;
  displayName: string;
  success: boolean;
  message: string;
  canUndo: boolean;
  undoExpiresAt: string; // ISO 8601
}
