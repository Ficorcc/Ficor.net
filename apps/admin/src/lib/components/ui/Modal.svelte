<!--
  通用模态框组件
  <Modal bind:open title="标题" onConfirm={() => {}}>内容</Modal>
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { browser } from '$app/environment';

  interface Props {
    open: boolean;
    title?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm?: () => void;
    onCancel?: () => void;
    children?: import('svelte').Snippet;
  }

  let {
    open = $bindable(false),
    title = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
    onConfirm,
    onCancel,
    children
  }: Props = $props();

  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch('confirm');
    onConfirm?.();
  }

  function handleCancel() {
    open = false;
    dispatch('cancel');
    onCancel?.();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleCancel();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <!-- 遮罩 -->
  <div
    class="modal-backdrop"
    transition:fade={{ duration: 150 }}
    onclick={handleCancel}
    role="presentation"
  >
    <div
      class="modal"
      transition:scale={{ duration: 180, start: 0.96 }}
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {#if title}
        <div class="modal__header">
          <h3 class="modal__title">{title}</h3>
          <button class="icon-btn" onclick={handleCancel} aria-label="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      {/if}
      <div class="modal__body">
        {@render children?.()}
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" onclick={handleCancel}>{cancelText}</button>
        <button class="btn {danger ? 'btn--danger' : 'btn--primary'}" onclick={handleConfirm}>
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
