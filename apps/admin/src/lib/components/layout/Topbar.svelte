<!--
  顶部栏：移动端菜单按钮 + 当前页面标题 + 主题切换
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { theme } from '$lib/stores/theme';

  interface Props {
    onMenuClick?: () => void;
    title?: string;
  }

  let { onMenuClick, title = '' }: Props = $props();
</script>

<header class="admin-shell__topbar">
  <div class="topbar__left">
    <button class="icon-btn topbar__menu" onclick={onMenuClick} aria-label="菜单">
      <Icon name="menu" />
    </button>
    <span class="topbar__title">{title}</span>
  </div>
  <div class="topbar__right">
    <button
      class="icon-btn"
      data-action="theme"
      onclick={() => theme.toggle()}
      aria-label="切换主题"
      title="切换亮/暗色"
    >
      {#if $theme === 'dark'}
        <Icon name="sun" />
      {:else}
        <Icon name="moon" />
      {/if}
    </button>
  </div>
</header>

<style>
  .topbar__left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .topbar__title {
    font-family: var(--font-kai);
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .topbar__menu {
    display: none;
  }
  @media (max-width: 900px) {
    .topbar__menu {
      display: inline-flex;
    }
  }
</style>
