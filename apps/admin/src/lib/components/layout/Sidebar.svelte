<!--
  侧栏导航
  复刻主站侧栏导航风格，包含品牌区、导航链接、底部主题切换/登出
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { theme } from '$lib/stores/theme';

  interface Props {
    open?: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(false), onclose }: Props = $props();

  // 导航分组
  const navGroups = [
    {
      label: '主要',
      items: [
        { href: '/dashboard', icon: 'dashboard', text: '仪表盘', match: '/dashboard' },
        { href: '/content/essay', icon: 'content', text: '文章', match: '/content' },
        { href: '/comments', icon: 'comments', text: '评论', match: '/comments' },
        { href: '/images', icon: 'images', text: '图片', match: '/images' },
        { href: '/memos', icon: 'content', text: '说说', match: '/memos' },
        { href: '/links', icon: 'database', text: '友链', match: '/links' },
        { href: '/feeds', icon: 'cloud', text: '订阅', match: '/feeds' }
      ]
    },
    {
      label: '运维',
      items: [
        { href: '/schedules', icon: 'schedules', text: '定时任务', match: '/schedules' },
        { href: '/settings', icon: 'settings', text: '系统设置', match: '/settings' },
        { href: '/audit', icon: 'audit', text: '系统日志', match: '/audit' },
        { href: '/health', icon: 'health', text: '健康检查', match: '/health' }
      ]
    }
  ];

  // 判断当前路径是否匹配某个导航项
  function isActive(match: string): boolean {
    const path = page.url.pathname;
    return path === `${base}${match}` || path.startsWith(`${base}${match}/`);
  }

  function handleNavClick() {
    // 移动端点击后关闭侧栏
    open = false;
    onclose?.();
  }
</script>

<aside class="sidebar" data-open={open}>
  <!-- 品牌区 -->
  <div class="sidebar__brand">
    <a href="{base}/dashboard" class="sidebar__brand-link" onclick={handleNavClick}>
      <div class="sidebar__brand-title">柒色墨笺</div>
      <div class="sidebar__brand-sub">ADMIN CONSOLE</div>
    </a>
  </div>

  <!-- 导航 -->
  <nav class="sidebar__nav">
    {#each navGroups as group (group.label)}
      <div class="sidebar__section-label">{group.label}</div>
      {#each group.items as item (item.href)}
        <a
          href={`${base}${item.href}`}
          class="sidebar__link"
          aria-current={isActive(item.match) ? 'page' : undefined}
          onclick={handleNavClick}
        >
          <Icon name={item.icon} />
          <span>{item.text}</span>
        </a>
      {/each}
    {/each}
  </nav>

  <!-- 底部 -->
  <div class="sidebar__footer">
    <a
      href="https://vii.ink"
      target="_blank"
      rel="noopener"
      class="sidebar__link"
    >
      <Icon name="eye" />
      <span>查看主站</span>
    </a>
    <a href="{base}/logout" class="sidebar__link">
      <Icon name="logout" />
      <span>退出登录</span>
    </a>
  </div>
</aside>

<style>
  .sidebar__brand-link {
    display: block;
  }
</style>
