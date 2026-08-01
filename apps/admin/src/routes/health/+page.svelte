<!--
  健康检查
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  let { data } = $props();
  const stats = (data.stats ?? {}) as {
    essays?: number;
    bits?: number;
    comments?: Record<string, number>;
    storage?: { count: number; totalSize: number };
  };

  const statusConfig = {
    ok: { label: '健康', dot: 'status-dot--ok', badge: 'badge--ok', icon: 'check' },
    degraded: { label: '降级', dot: 'status-dot--warn', badge: 'badge--warn', icon: 'health' },
    down: { label: '不可用', dot: 'status-dot--danger', badge: 'badge--danger', icon: 'close' }
  };

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
</script>

<svelte:head>
  <title>健康检查 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <h1 class="page-header__title">健康检查</h1>
  <p class="page-header__sub">各服务运行状态</p>
</div>

{#if data.error}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">无法检查</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{:else}
  <!-- 服务状态 -->
  <div class="panel mb-6">
    <div class="panel__legend">
      服务状态 <span class="panel__legend-en">SERVICES</span>
    </div>
    <div class="health-list">
      {#each data.services as service (service.name)}
        {@const cfg = statusConfig[service.status]}
        <div class="health-item">
          <div class="health-item__left">
            <span class="status-dot {cfg.dot}"></span>
            <span class="health-item__name">{service.name}</span>
          </div>
          <div class="health-item__right">
            {#if service.detail}
              <span class="text-xs text-muted font-kai">{service.detail}</span>
            {/if}
            <span class="badge {cfg.badge}">{cfg.label}</span>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- 系统统计 -->
  {#if data.stats}
    <div class="panel">
      <div class="panel__legend">
        系统统计 <span class="panel__legend-en">STATISTICS</span>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-box__value">{stats.essays ?? 0}</div>
          <div class="stat-box__label">文章</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__value">{stats.bits ?? 0}</div>
          <div class="stat-box__label">絮语</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__value">{stats.comments?.approved ?? 0}</div>
          <div class="stat-box__label">通过评论</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__value">{stats.comments?.pending ?? 0}</div>
          <div class="stat-box__label">待审评论</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__value">{stats.storage?.count ?? 0}</div>
          <div class="stat-box__label">图片数量</div>
        </div>
        <div class="stat-box">
          <div class="stat-box__value">{formatSize(stats.storage?.totalSize ?? 0)}</div>
          <div class="stat-box__label">图片存储</div>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .health-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .health-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    transition: background-color var(--duration) var(--ease);
  }
  .health-item:hover {
    background: var(--panel);
  }
  .health-item__left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .health-item__name {
    font-family: var(--font-kai);
    font-size: 14px;
    font-weight: 500;
  }
  .health-item__right {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }
  .stat-box {
    text-align: center;
    padding: 20px 12px;
    background: var(--panel-2);
    border-radius: var(--radius-lg);
  }
  .stat-box__value {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 600;
    line-height: 1.2;
  }
  .stat-box__label {
    font-family: var(--font-kai);
    font-size: 12px;
    color: var(--muted);
    margin-top: 4px;
  }
</style>
