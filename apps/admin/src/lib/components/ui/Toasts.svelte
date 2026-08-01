<!--
  Toast 通知容器
  挂载在根 layout，监听 toast store 并渲染通知
-->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toast } from '$lib/stores/toast';
  import type { ToastType } from '$lib/stores/toast';

  const icons: Record<ToastType, string> = {
    ok: '✓',
    warn: '!',
    error: '×',
    info: 'i'
  };
</script>

<div class="toast-region" role="region" aria-label="通知" aria-live="polite">
  {#each $toast as item (item.id)}
    <div class="toast toast--{item.type}" transition:fly={{ x: 20, duration: 180 }}>
      <span class="toast__icon" aria-hidden="true">{icons[item.type]}</span>
      <span class="toast__msg">{item.message}</span>
      <button class="toast__close" onclick={() => toast.dismiss(item.id)} aria-label="关闭">×</button>
    </div>
  {/each}
</div>

<style>
  .toast__icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
    background: var(--border);
    color: var(--text);
    line-height: 1;
  }
  .toast--ok .toast__icon {
    background: var(--ok);
    color: #fff;
  }
  .toast--warn .toast__icon {
    background: var(--warn);
    color: #fff;
  }
  .toast--error .toast__icon {
    background: var(--danger);
    color: #fff;
  }
  .toast--info .toast__icon {
    background: var(--info);
    color: #fff;
  }
  .toast__msg {
    flex: 1;
    line-height: 1.5;
  }
  .toast__close {
    background: none;
    border: none;
    color: var(--faint);
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .toast__close:hover {
    color: var(--text);
  }
</style>
