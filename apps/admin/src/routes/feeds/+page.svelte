<!--
  订阅管理：从友链订阅源展示文章
-->
<script lang="ts">
  import { api } from '$lib/utils/api';
  import { base } from '$app/paths';
  import { feedSummary, formatFeedDate } from '../../../../../src/lib/community';
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';

  let { data } = $props();
  let refreshing = $state(false);

  type FeedItem = Record<string, unknown>;

  function text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function formatDate(value: unknown) {
    return formatFeedDate(text(value));
  }

  async function refreshFeeds() {
    refreshing = true;
    try {
      let cursor = 0;
      let failed = 0;
      while (true) {
        const result = await api<{ nextCursor: number; done: boolean; failed: number }>('FEEDS_REFRESH', { cursor });
        if (!result.ok || !result.data) throw new Error(result.error || '刷新失败');
        failed += result.data.failed;
        if (result.data.done) break;
        if (result.data.nextCursor <= cursor) throw new Error('刷新进度异常，请重试');
        cursor = result.data.nextCursor;
      }
      await invalidateAll();
      if (failed) toast.warn(`刷新完成，${failed} 个订阅源抓取失败，已保留原有文章；结果等待一键部署`);
      else toast.ok('订阅已刷新并保存，等待一键部署后更新友圈');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '刷新失败');
    } finally {
      refreshing = false;
    }
  }
</script>

<svelte:head>
  <title>订阅管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">订阅管理</h1>
      <p class="page-header__sub">{data.subscriptions.length} 个友链订阅源 · {data.latestItems.length} 篇订阅文章</p>
    </div>
    <button class="btn btn--ghost" onclick={refreshFeeds} disabled={refreshing}>
      {#if refreshing}
        <span class="spinner"></span>
      {:else}
        <Icon name="refresh" size={16} />
      {/if}
      {refreshing ? '刷新中...' : '刷新'}
    </button>
  </div>
</div>

{#if data.error}
  <div class="panel mb-4">
    <div class="empty-state">
      <div class="empty-state__title">加载失败</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{/if}

<p class="text-sm mb-4">订阅源与友链共用；在<a href={`${base}/links`}>友链管理</a>中修改 RSS 地址，保存后在这里刷新文章，最后一键部署到前台。</p>

<div class="panel">
  <div class="panel__legend">订阅文章 <span class="panel__legend-en">ARTICLES</span></div>
  {#if data.latestItems.length === 0}
    <div class="empty-state">
      <Icon name="cloud" size={32} />
      <div class="empty-state__title mt-4">还没有订阅文章</div>
    </div>
  {:else}
    <div class="article-list">
      {#each data.latestItems as item, index (text((item as FeedItem).url) || index)}
        {@const article = item as FeedItem}
        <article class="article-item">
          <a class="article-item__link" href={text(article.url)} target="_blank" rel="noreferrer">
            <div class="article-item__meta">
              <span>{text(article.source) || '未知来源'}</span>
              <span>{formatDate(article.date)}</span>
            </div>
            <h2>{text(article.title) || '未命名文章'}</h2>
            {#if text(article.summary)}
              <p>{feedSummary(text(article.summary))}</p>
            {/if}
          </a>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .article-list {
    display: grid;
    gap: 10px;
  }
  .article-item {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
  }
  .article-item:hover {
    border-color: var(--faint);
  }
  .article-item__link {
    display: grid;
    gap: 8px;
    padding: 14px;
    color: inherit;
  }
  .article-item__meta {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
  }
  .article-item h2 {
    margin: 0;
    font-family: var(--font-serif);
    font-size: 16px;
    line-height: 1.45;
  }
  .article-item p {
    margin: 0;
    display: -webkit-box;
    overflow: hidden;
    color: var(--muted);
    font-family: var(--font-kai);
    font-size: 13px;
    line-height: 1.7;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  @media (max-width: 640px) {
    .article-item__meta {
      display: grid;
    }
  }
</style>
