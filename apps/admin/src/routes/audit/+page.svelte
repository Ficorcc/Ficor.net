<!--
  系统日志
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import { formatDateTime } from '$lib/utils/date';

  let { data } = $props();

  const actionOptions = [
    { label: '全部', value: '' },
    { label: '登录', value: 'AUTH_LOGIN' },
    { label: '登出', value: 'AUTH_LOGOUT' },
    { label: '文章', value: 'CONTENT_SAVE' },
    { label: '删除', value: 'COMMENT_DELETE' },
    { label: '配置', value: 'CONFIG_UPDATE' },
    { label: '部署', value: 'CONTENT_PUBLISH' }
  ];

  function handleFilter(value: string) {
    const params = new URLSearchParams();
    if (value) params.set('action', value);
    goto(`${base}/audit${params.toString() ? `?${params}` : ''}`);
  }

  const actionColors: Record<string, string> = {
    AUTH_LOGIN: 'badge--ok',
    AUTH_LOGOUT: '',
    CONTENT_SAVE: 'badge--info',
    CONTENT_DELETE: 'badge--danger',
    CONTENT_PUBLISH: 'badge--info',
    CONTENT_PULL_SOURCE: 'badge--info',
    DATA_SAVE: 'badge--warn',
    MEMOS_SYNC: 'badge--info',
    COMMENT_DELETE: 'badge--danger',
    COMMENT_MODERATE: 'badge--warn',
    CONFIG_UPDATE: 'badge--warn',
    SCHEDULE_CREATE: 'badge--info',
    SCHEDULE_CANCEL: 'badge--danger',
    IMAGE_UPLOAD: 'badge--info',
    IMAGE_DELETE: 'badge--danger',
    BACKUP_DAILY: '',
    SCHEDULE_AUTO_PUBLISH: 'badge--ok'
  };
</script>

<svelte:head>
  <title>系统日志 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <h1 class="page-header__title">系统日志</h1>
  <p class="page-header__sub">共 {data.total} 条记录</p>
</div>

<div class="mb-4">
  <Segmented options={actionOptions} value={data.action ?? ''} onchange={handleFilter} />
</div>

{#if data.error}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">加载失败</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{:else if data.items.length === 0}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">没有日志记录</div>
    </div>
  </div>
{:else}
  <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th style="width:160px">时间</th>
          <th style="width:140px">操作</th>
          <th>对象</th>
          <th style="width:120px">IP</th>
        </tr>
      </thead>
      <tbody>
        {#each data.items as log (log.id)}
          <tr>
            <td class="text-xs font-mono">{formatDateTime(log.created_at)}</td>
            <td>
              <span class="badge {actionColors[log.action] ?? ''}">{log.action}</span>
            </td>
            <td class="font-mono text-sm">{log.target ?? '—'}</td>
            <td class="text-xs font-mono text-muted">{log.ip ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <Pagination
    current={parseInt(page.url.searchParams.get('page') ?? '1', 10)}
    total={data.total}
    pageSize={30}
    hrefPrefix="/audit"
  />
{/if}
