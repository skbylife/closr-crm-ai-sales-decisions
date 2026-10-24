import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'warning' | 'default';
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmStore extends ConfirmState {
  confirm: (opts: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'default';
  }) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: '确认',
  cancelLabel: '取消',
  variant: 'default',
  resolve: null,

  confirm: (opts) => {
    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title || '确认操作',
        message: opts.message,
        confirmLabel: opts.confirmLabel || '确认',
        cancelLabel: opts.cancelLabel || '取消',
        variant: opts.variant || 'default',
        resolve,
      });
    });
  },

  close: (result) => {
    const { resolve } = get();
    resolve?.(result);
    set({ open: false, resolve: null });
  },
}));

/**
 * Show a custom confirm dialog. Returns a Promise<boolean>.
 * Usage: if (await appConfirm({ message: '确定删除？' })) { ... }
 */
export function appConfirm(opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}): Promise<boolean> {
  return useConfirmStore.getState().confirm(opts);
}
