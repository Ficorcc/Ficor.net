<!--
  文章列表页
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto, invalidateAll } from '$app/navigation';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { formatDate } from '$lib/utils/date';
  import { api } from '$lib/utils/api';
  import { toast } from '$lib/stores/toast';

  let { data } = $props();

  // 统一把 frontmatter 当作 Record 处理
  type ItemFm = Record<string, unknown>;
  function getFm(item: { frontmatter: unknown }): ItemFm {
    return (item.frontmatter ?? {}) as ItemFm;
  }

  function bitsText(item: { excerpt?: string; frontmatter: unknown }): string {
    const fm = getFm(item);
    return String(item.excerpt || fm.description || '').trim() || '(空内容)';
  }

  const collectionLabels: Record<string, string> = {
    essay: '随笔',
    bits: '絮语',
    memo: '小记'
  };

  const collectionOptions = [
    { label: '随笔', value: 'essay' },
    { label: '絮语', value: 'bits' },
    { label: '小记', value: 'memo' }
  ];

  let searchKeyword = $state(data.keyword ?? '');
  let pullingSource = $state(false);
  let pullProgress = $state('');

  interface PullSourcePayload {
    count?: number;
    total?: number;
    nextCursor?: number;
    done?: boolean;
    source?: string;
    ref?: string;
  }

  function handleCollectionChange(value: string) {
    goto(`${base}/content/${value}`);
  }

  function handleSearch(e: SubmitEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchKeyword.trim()) params.set('q', searchKeyword.trim());
    goto(`${base}/content/${data.collection}${params.toString() ? `?${params}` : ''}`);
  }

  async function pullSourceContent() {
    pullingSource = true;
    pullProgress = '';
    let cursor: number | undefined = 0;
    let pulledCount = 0;
    let totalCount = 0;

    try {
      while (cursor !== undefined) {
        const result = await api<PullSourcePayload>('CONTENT_PULL_SOURCE', {
          collection: data.collection,
          cursor
        });

        if (!result.ok) {
          toast.error(result.error ?? '抓取失败');
          return;
        }

        const payload = result.data;
        pulledCount += payload?.count ?? 0;
        totalCount = payload?.total ?? totalCount;
        cursor = payload?.done ? undefined : payload?.nextCursor;
        pullProgress = totalCount ? `${Math.min(pulledCount, totalCount)}/${totalCount}` : '';

        if (cursor === undefined) {
          toast.ok(`已从主站抓取 ${pulledCount} 篇${collectionLabels[data.collection]}`);
          await invalidateAll();
        }
      }
    } finally {
      pullingSource = false;
      pullProgress = '';
    }
  }
</script>

<svelte:head>
  <title>{collectionLabels[data.collection]} · 内容管理</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">内容管理</h1>
      <p class="page-header__sub">{collectionLabels[data.collection]} · {data.items.length} 篇</p>
    </div>
    <div class="page-actions">
      <button class="btn btn--ghost" onclick={pullSourceContent} disabled={pullingSource}>
        <Icon name="download" size={16} /> {pullingSource ? `抓取中${pullProgress ? ` ${pullProgress}` : '...'}` : '从主站抓取'}
      </button>
      <a href="{base}/content/{data.collection}/new" class="btn btn--primary">
        <Icon name="plus" size={16} /> 新建
      </a>
    </div>
  </div>
</div>

<!-- 集合切换 + 搜索 -->
<div class="content-toolbar">
  <Segmented options={collectionOptions} value={data.collection} onchange={handleCollectionChange} />
  <form class="content-search" onsubmit={handleSearch}>
    <Icon name="search" size={16} />
    <input
      type="search"
      placeholder="搜索标题、标签、内容..."
      bind:value={searchKeyword}
    />
  </form>
</div>

<!-- 文章列表 -->
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
      <Icon name="content" size={32} />
      <div class="empty-state__title mt-4">
        {data.keyword ? `未找到匹配「${data.keyword}」的文章` : `还没有${collectionLabels[data.collection]}`}
      </div>
      <a href="{base}/content/{data.collection}/new" class="btn btn--primary btn--sm mt-4">
        <Icon name="plus" size={14} /> 写第一篇
      </a>
    </div>
  </div>
{:else}
  <div class="content-list">
    {#each data.items as item (item.slug)}
      {@const fm = getFm(item)}
      <a href="{base}/content/{data.collection}/{item.slug}" class="content-item">
        <div class="content-item__main">
          {#if data.collection === 'bits'}
            <div class="content-item__bits">
              {bitsText(item)}
            </div>
          {:else}
            <div class="content-item__title">
              {fm.title ?? '(无标题)'}
            </div>
            {#if fm.description || item.excerpt}
              <div class="content-item__excerpt">
                {fm.description ?? item.excerpt}
              </div>
            {/if}
            {#if Array.isArray(fm.tags) && fm.tags.length}
              <div class="content-item__tags">
                {#each fm.tags.slice(0, 5) as tag (tag)}
                  <span class="badge">{tag}</span>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
        <div class="content-item__meta">
          {#if fm.draft}
            <span class="badge badge--warn">草稿</span>
          {/if}
          <span class="content-item__date">
            {formatDate(String(fm.date ?? item.uploaded))}
          </span>
        </div>
      </a>
    {/each}
  </div>
{/if}

<style>
  .content-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .page-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .content-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    background: var(--bg);
    color: var(--faint);
    min-width: 240px;
  }
  .content-search input {
    border: none;
    background: none;
    padding: 8px 0;
    box-shadow: none !important;
    outline: none !important;
    flex: 1;
  }
  .content-search:focus-within {
    border-color: var(--muted);
  }
  .content-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .content-item {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px;
    border-radius: var(--radius-lg);
    transition: background-color var(--duration) var(--ease);
    border: 1px solid transparent;
  }
  .content-item:hover {
    background: var(--panel);
  }
  .content-item__main {
    flex: 1;
    min-width: 0;
  }
  .content-item__title {
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .content-item__excerpt {
    font-family: var(--font-kai);
    font-size: 13px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 8px;
  }
  .content-item__bits {
    font-family: var(--font-kai);
    font-size: 14px;
    color: var(--text);
    line-height: 1.75;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .content-item__tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .content-item__meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }
  .content-item__date {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--faint);
  }
  @media (max-width: 640px) {
    .page-actions {
      width: 100%;
      justify-content: flex-start;
    }
    .content-item {
      flex-direction: column;
    }
    .content-item__meta {
      align-items: flex-start;
      flex-direction: row;
    }
  }
</style>
