<!--
  文章列表页
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto, invalidateAll } from '$app/navigation';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
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
  const markdownImportBatchSize = 50;

  let searchKeyword = $state(data.keyword ?? '');
  let pullingSource = $state(false);
  let importingMarkdown = $state(false);
  let importProgress = $state('');
  let duplicateImportOpen = $state(false);
  let pendingMarkdownFiles = $state<File[]>([]);
  let duplicateMarkdownNames = $state<string[]>([]);
  let pullProgress = $state('');
  let deletingSlug = $state('');
  let markdownInput: HTMLInputElement | null = null;

  interface PullSourcePayload {
    count?: number;
    total?: number;
    nextCursor?: number;
    done?: boolean;
    source?: string;
    ref?: string;
  }
  interface ImportMarkdownPayload {
    count?: number;
    skippedCount?: number;
    failedCount?: number;
    failed?: Array<{ name?: string; error?: string }>;
  }
  type ApiResult<T> = { ok: boolean; error?: string; data?: T };

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
        const result: ApiResult<PullSourcePayload> = await api<PullSourcePayload>('CONTENT_PULL_SOURCE', {
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

  function openMarkdownImport() {
    markdownInput?.click();
  }

  function slugFromMarkdownFilename(name: string): string {
    return name.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '').trim() ?? '';
  }

  async function handleMarkdownImport(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((file) => /\.md$/i.test(file.name));
    input.value = '';
    if (!files.length) {
      toast.error('请选择 .md 文件');
      return;
    }

    const existing = await api<{ items?: Array<{ slug?: string }> }>('CONTENT_LIST', {
      collection: data.collection
    });
    if (!existing.ok) {
      toast.error(existing.error ?? '无法检查重复文章');
      return;
    }

    const existingSlugs = new Set((existing.data?.items ?? []).map((item) => item.slug).filter(Boolean));
    const duplicateNames = files
      .filter((file) => existingSlugs.has(slugFromMarkdownFilename(file.name)))
      .map((file) => file.name);
    if (duplicateNames.length) {
      pendingMarkdownFiles = files;
      duplicateMarkdownNames = duplicateNames;
      duplicateImportOpen = true;
      return;
    }

    await importMarkdownFiles(files);
  }

  async function importMarkdownFiles(files: File[], overwrite = false) {
    importingMarkdown = true;
    try {
      let count = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (let start = 0; start < files.length; start += markdownImportBatchSize) {
        const batch = files.slice(start, start + markdownImportBatchSize);
        const payloadFiles = await Promise.all(
          batch.map(async (file) => ({
            name: file.name,
            markdown: await file.text(),
            lastModified: file.lastModified
          }))
        );
        const result: ApiResult<ImportMarkdownPayload> = await api<ImportMarkdownPayload>('CONTENT_IMPORT_MARKDOWN', {
          collection: data.collection,
          overwrite,
          files: payloadFiles
        });

        if (!result.ok) {
          const batchNumber = Math.floor(start / markdownImportBatchSize) + 1;
          toast.error(`第 ${batchNumber} 批导入失败：${result.error ?? '导入失败'}`);
          return;
        }

        count += result.data?.count ?? payloadFiles.length;
        skippedCount += result.data?.skippedCount ?? 0;
        failedCount += result.data?.failedCount ?? 0;
        importProgress = `${Math.min(start + batch.length, files.length)}/${files.length}`;
      }

      if (failedCount > 0) {
        toast.error(`已导入 ${count} 个文件，跳过 ${skippedCount} 个重复项，${failedCount} 个失败`);
      } else if (count === 0 && skippedCount > 0) {
        toast.ok(`没有新增文章，已跳过 ${skippedCount} 个重复项`);
      } else if (skippedCount > 0) {
        toast.ok(`已导入 ${count} 个 Markdown 文件，跳过 ${skippedCount} 个重复项`);
      } else {
        toast.ok(`已导入 ${count} 个 Markdown 文件，等待一键部署`);
      }
      await invalidateAll();
    } finally {
      importingMarkdown = false;
      importProgress = '';
    }
  }

  async function resolveDuplicateImport() {
    const files = pendingMarkdownFiles;
    duplicateImportOpen = false;
    pendingMarkdownFiles = [];
    duplicateMarkdownNames = [];
    await importMarkdownFiles(files);
  }

  async function deleteItem(slug: string, title: unknown) {
    const label = String(title || slug || '这条内容');
    if (!window.confirm(`确认删除「${label}」吗？`)) return;

    deletingSlug = slug;
    try {
      const result = await api('CONTENT_DELETE', {
        collection: data.collection,
        slug
      });

      if (result.ok) {
        toast.ok('已删除');
        await invalidateAll();
      } else {
        toast.error(result.error ?? '删除失败');
      }
    } finally {
      deletingSlug = '';
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
      <input
        bind:this={markdownInput}
        class="visually-hidden"
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        onchange={handleMarkdownImport}
      />
      <button class="btn btn--ghost" onclick={openMarkdownImport} disabled={importingMarkdown}>
        <Icon name="upload" size={16} /> {importingMarkdown ? `导入中${importProgress ? ` ${importProgress}` : '...'}` : '导入 .md'}
      </button>
      <button class="btn btn--ghost" onclick={pullSourceContent} disabled={pullingSource}>
        <Icon name="download" size={16} /> {pullingSource ? `抓取中${pullProgress ? ` ${pullProgress}` : '...'}` : '从主站抓取'}
      </button>
      <a href="{base}/content/{data.collection}/new" class="btn btn--primary">
        <Icon name="plus" size={16} /> 新建
      </a>
    </div>
  </div>
</div>

<Modal
  bind:open={duplicateImportOpen}
  title="发现重复文章"
  confirmText="跳过重复项并导入"
  cancelText="取消"
  onConfirm={resolveDuplicateImport}
  onCancel={() => {
    pendingMarkdownFiles = [];
    duplicateMarkdownNames = [];
  }}
>
  <p>已存在 {duplicateMarkdownNames.length} 篇同名文章。跳过会保留已有文章，覆盖会替换它们的正文和 frontmatter。</p>
  <div class="duplicate-import__names">{duplicateMarkdownNames.slice(0, 8).join('、')}{duplicateMarkdownNames.length > 8 ? ' 等' : ''}</div>
  <button class="btn btn--danger mt-4" onclick={async () => {
    const files = pendingMarkdownFiles;
    duplicateImportOpen = false;
    pendingMarkdownFiles = [];
    duplicateMarkdownNames = [];
    await importMarkdownFiles(files, true);
  }}>
    覆盖已有文章并导入
  </button>
</Modal>

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
      <div class="content-item">
        <div class="content-item__main">
          {#if data.collection === 'bits'}
            <a href="{base}/content/{data.collection}/{item.slug}" class="content-item__bits">
              {bitsText(item)}
            </a>
          {:else}
            <a href="{base}/content/{data.collection}/{item.slug}" class="content-item__title">
              {fm.title ?? '(无标题)'}
            </a>
            {#if Array.isArray(fm.tags) && fm.tags.length}
              <div class="content-item__tags">
                {#each fm.tags.slice(0, 5) as tag (tag)}
                  <span class="badge">{tag}</span>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
        <div class="content-item__actions">
          {#if fm.draft}
            <span class="badge badge--warn">草稿</span>
          {/if}
          {#if data.collection !== 'essay'}
            <span class="content-item__date">
              {formatDate(String(fm.date ?? item.uploaded))}
            </span>
          {/if}
          <button
            type="button"
            class="btn btn--ghost btn--sm content-item__delete"
            onclick={() => deleteItem(item.slug, data.collection === 'bits' ? bitsText(item) : fm.title)}
            disabled={deletingSlug === item.slug}
          >
            {#if deletingSlug === item.slug}
              <span class="spinner"></span>
            {:else}
              <Icon name="trash" size={14} />
            {/if}
            删除
          </button>
        </div>
      </div>
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
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .page-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .duplicate-import__names {
    margin-top: 10px;
    color: var(--color-text-muted);
    font-size: 13px;
    line-height: 1.7;
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
    display: inline-block;
    font-family: var(--font-serif);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  .content-item__title:hover,
  .content-item__bits:hover {
    color: var(--muted);
  }
  .content-item__bits {
    display: -webkit-box;
    font-family: var(--font-kai);
    font-size: 14px;
    color: var(--text);
    line-height: 1.75;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .content-item__tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .content-item__actions {
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
  }
  .content-item__delete {
    white-space: nowrap;
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
    .content-item__actions {
      align-items: flex-start;
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
</style>
