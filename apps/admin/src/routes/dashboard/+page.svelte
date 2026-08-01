<!--
  仪表盘
-->
<script lang="ts">
  import { base } from '$app/paths';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import { formatDate, relativeTime } from '$lib/utils/date';

  let { data } = $props();
  let deploying = $state(false);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function deploySite() {
    deploying = true;
    const result = await api<{ ok?: boolean; message?: string; deploy?: { ok?: boolean; message?: string } }>('CONTENT_PUBLISH');
    if (result.ok) {
      const payload = result.data as { ok?: boolean; message?: string; deploy?: { ok?: boolean; message?: string } } | undefined;
      const deploy = payload?.deploy ?? payload;
      toast[deploy?.ok === false ? 'error' : 'ok'](deploy?.message ?? '已触发主站部署');
    } else {
      toast.error(result.error ?? '部署触发失败');
    }
    deploying = false;
  }
</script>

<svelte:head>
  <title>仪表盘 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">仪表盘</h1>
      <p class="page-header__sub">站点概览与发布状态</p>
    </div>
    <button class="btn btn--primary" onclick={deploySite} disabled={deploying}>
      <Icon name={deploying ? 'refresh' : 'upload'} size={16} />
      {deploying ? '部署中...' : '一键部署'}
    </button>
  </div>
</div>

{#if data.error}
  <div class="panel mb-6">
    <div class="empty-state">
      <div class="empty-state__title">无法加载统计数据</div>
      <p class="text-sm">{data.error}</p>
      <p class="text-xs mt-2">请确认 D1/R2 已正确绑定（见 docs/SETUP.md）</p>
    </div>
  </div>
{/if}

{#if data.stats}
  <!-- 统计卡片 -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-card__icon" style="background: var(--info-bg); color: var(--info)">
        <Icon name="content" size={22} />
      </div>
      <div class="stat-card__body">
        <div class="stat-card__value">{data.stats.essays}</div>
        <div class="stat-card__label">文章</div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-card__icon" style="background: var(--ok-bg); color: var(--ok)">
        <Icon name="comments" size={22} />
      </div>
      <div class="stat-card__body">
        <div class="stat-card__value">{data.stats.comments.pending ?? 0}</div>
        <div class="stat-card__label">待审评论</div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-card__icon" style="background: var(--warn-bg); color: var(--warn)">
        <Icon name="schedules" size={22} />
      </div>
      <div class="stat-card__body">
        <div class="stat-card__value">{data.stats.pendingSchedules}</div>
        <div class="stat-card__label">待发布任务</div>
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-card__icon" style="background: var(--danger-bg); color: var(--danger)">
        <Icon name="images" size={22} />
      </div>
      <div class="stat-card__body">
        <div class="stat-card__value">{formatSize(data.stats.storage.totalSize)}</div>
        <div class="stat-card__label">图片存储 / {data.stats.storage.count} 张</div>
      </div>
    </div>
  </div>

  <!-- 最近文章 + 待发布 -->
  <div class="dashboard-grid mt-6">
    <div class="panel">
      <div class="panel__legend">
        最近文章 <span class="panel__legend-en">RECENT ESSAYS</span>
      </div>
      {#if data.recentEssays.length === 0}
        <div class="empty-state">
          <div class="empty-state__title">还没有文章</div>
        </div>
      {:else}
        <div class="recent-list">
          {#each data.recentEssays as essay (essay.slug)}
            {@const fm = (essay.frontmatter ?? {}) as Record<string, unknown>}
            <a href="{base}/content/essay/{essay.slug}" class="recent-item">
              <div class="recent-item__title">{fm.title ?? essay.slug}</div>
              <div class="recent-item__date">{formatDate(String(fm.date ?? essay.uploaded))}</div>
            </a>
          {/each}
        </div>
      {/if}
      <a href="{base}/content/essay" class="btn btn--ghost btn--sm mt-4">查看全部 →</a>
    </div>

    <div class="panel">
      <div class="panel__legend">
        待发布任务 <span class="panel__legend-en">SCHEDULED</span>
      </div>
      {#if data.recentSchedules.length === 0}
        <div class="empty-state">
          <div class="empty-state__title">没有待发布任务</div>
        </div>
      {:else}
        <div class="recent-list">
          {#each data.recentSchedules as schedule (schedule.id)}
            <div class="recent-item">
              <div class="recent-item__title">{schedule.collection}/{schedule.slug}</div>
              <div class="recent-item__date">{relativeTime(schedule.scheduled_at)}发布</div>
            </div>
          {/each}
        </div>
      {/if}
      <a href="{base}/schedules" class="btn btn--ghost btn--sm mt-4">管理定时任务 →</a>
    </div>
  </div>
{/if}

<style>
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }
  .stat-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    transition: border-color var(--duration) var(--ease);
  }
  .stat-card:hover {
    border-color: var(--faint);
  }
  .stat-card__icon {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .stat-card__value {
    font-family: var(--font-serif);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
  }
  .stat-card__label {
    font-family: var(--font-kai);
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 768px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .recent-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    transition: background-color var(--duration) var(--ease);
  }
  .recent-item:hover {
    background: var(--panel);
  }
  .recent-item__title {
    font-size: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 12px;
  }
  .recent-item__date {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--faint);
    flex-shrink: 0;
  }
</style>
