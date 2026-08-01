// ============================================================================
// 主题切换 store（亮/暗）
// ============================================================================

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function createThemeStore() {
  const initial: Theme = browser
    ? (document.documentElement.dataset.theme as Theme) ?? 'light'
    : 'light';

  const { subscribe, set } = writable<Theme>(initial);

  function apply(theme: Theme) {
    if (browser) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('admin-theme', theme);
    }
    set(theme);
  }

  return {
    subscribe,
    toggle() {
      const current = browser ? (document.documentElement.dataset.theme as Theme) : 'light';
      apply(current === 'dark' ? 'light' : 'dark');
    },
    set: apply
  };
}

export const theme = createThemeStore();
