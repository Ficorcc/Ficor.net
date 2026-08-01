<!--
  订阅管理：从友链订阅源展示文章
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  let { data } = $props();

  type FeedItem = Record<string, unknown>;

  function text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function formatDate(value: unknown) {
    const raw = text(value);
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
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

<div class="panel">
  <div class="panel__legend">订阅文章 <span class="panel__legend-en">ARTICLES</span></div>
  {#if data.latestItems.length === 0}
    <div class="empty-state">
      <Icon name="cloud" size={32} />
      <div class="empty-state__title mt-4">还没有订阅文章</div>
    </div>
  {:else}
    <div class="article-list">
      {#each data.latestItems.slice(0, 120) as item, index (text((item as FeedItem).url) || index)}
        {@const article = item as FeedItem}
        <article class="article-item">
          <a class="article-item__link" href={text(article.url)} target="_blank" rel="noreferrer">
            <div class="article-item__meta">
              <span>{text(article.source) || '未知来源'}</span>
              <span>{formatDate(article.date)}</span>
            </div>
            <h2>{text(article.title) || '未命名文章'}</h2>
            {#if text(article.summary)}
              <p>{text(article.summary)}</p>
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
