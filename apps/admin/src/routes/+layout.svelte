<!--
  根布局：登录页直接渲染，其他页面套侧栏 Shell
-->
<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Topbar from '$lib/components/layout/Topbar.svelte';
  import Toasts from '$lib/components/ui/Toasts.svelte';

  let { data, children } = $props();

  // 登录页/登出页不需要侧栏 shell。用 route id 避免 /admin base path 影响判断。
  const isAuthPage = $derived(page.route.id === '/login' || page.route.id === '/logout');

  let sidebarOpen = $state(false);

  // 页面标题映射
  const titleMap: Record<string, string> = {
    [`${base}/dashboard`]: '仪表盘',
    [`${base}/content`]: '文章管理',
    [`${base}/comments`]: '评论管理',
    [`${base}/images`]: '图片管理',
    [`${base}/memos`]: '说说管理',
    [`${base}/links`]: '友链管理',
    [`${base}/feeds`]: '订阅管理',
    [`${base}/settings`]: '系统设置',
    [`${base}/schedules`]: '定时任务',
    [`${base}/audit`]: '系统日志',
    [`${base}/health`]: '健康检查'
  };

  const currentTitle = $derived.by(() => {
    const path = page.url.pathname;
    for (const [key, val] of Object.entries(titleMap)) {
      if (path === key || path.startsWith(key + '/')) return val;
    }
    return '';
  });
</script>

{#if isAuthPage}
  <!-- 登录/登出页：无 shell -->
  {@render children?.()}
{:else}
  <!-- 管理后台 Shell -->
  <div class="admin-shell">
    <div class="admin-shell__sidebar" data-open={sidebarOpen}>
      <Sidebar bind:open={sidebarOpen} onclose={() => (sidebarOpen = false)} />
    </div>
    <Topbar title={currentTitle} onMenuClick={() => (sidebarOpen = !sidebarOpen)} />
    <main class="admin-shell__main">
      <div class="admin-shell__content">
        {@render children?.()}
      </div>
    </main>
  </div>
{/if}

<Toasts />
