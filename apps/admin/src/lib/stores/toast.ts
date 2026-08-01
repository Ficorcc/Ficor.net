// ============================================================================
// Toast 通知 store
// 用法：import { toast } from '$lib/stores/toast'; toast.ok('保存成功');
// ============================================================================

import { writable } from 'svelte/store';

export type ToastType = 'ok' | 'warn' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

let nextId = 1;

function createToastStore() {
  const { subscribe, update } = writable<ToastItem[]>([]);

  function push(type: ToastType, message: string, duration = 3500) {
    const id = nextId++;
    update((items) => [...items, { id, type, message }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id: number) {
    update((items) => items.filter((t) => t.id !== id));
  }

  return {
    subscribe,
    dismiss,
    ok: (msg: string, d?: number) => push('ok', msg, d),
    warn: (msg: string, d?: number) => push('warn', msg, d),
    error: (msg: string, d?: number) => push('error', msg, d ?? 5000),
    info: (msg: string, d?: number) => push('info', msg, d)
  };
}

export const toast = createToastStore();
