'use client';

import type { ActionButton } from './types';

interface ActionButtonGroupProps {
  actions: ActionButton[];
  onSend: (text: string) => void;
}

export function ActionButtonGroup({ actions, onSend }: ActionButtonGroupProps) {
  const styleMap = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    secondary: 'bg-sidebar text-foreground border border-border hover:bg-muted',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const handleClick = (action: ActionButton) => {
    if (action.disabled) return;

    switch (action.action.type) {
      case 'reply':
        onSend(action.action.text);
        break;
      case 'oauth':
        console.log('OAuth flow:', action.action);
        break;
      case 'confirm':
        onSend(`✅ 确认: ${action.label}`);
        break;
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {actions.map((btn) => (
        <button
          key={btn.id}
          onClick={() => handleClick(btn)}
          disabled={btn.disabled}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styleMap[btn.style]}`}
        >
          {btn.icon && <span>{btn.icon}</span>}
          {btn.label}
        </button>
      ))}
    </div>
  );
}
