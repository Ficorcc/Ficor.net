<!--
  评论管理
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Pagination from '$lib/components/ui/Pagination.svelte';
  import { relativeTime } from '$lib/utils/date';

  let { data } = $props();
  const counts = (data.counts ?? {}) as Record<string, number>;

  const statusOptions = [
    { label: '待审', value: 'pending' },
    { label: '通过', value: 'approved' },
    { label: '垃圾', value: 'spam' },
    { label: '已删', value: 'deleted' }
  ];

  function handleStatusChange(value: string) {
    goto(`${base}/comments?status=${value}`);
  }

  async function moderate(id: string, status: string) {
    const result = await api('COMMENT_MODERATE', { id, status });
    if (result.ok) {
      toast.ok(status === 'approved' ? '已通过' : status === 'spam' ? '已标为垃圾' : '已操作');
      setTimeout(() => location.reload(), 500);
    } else {
      toast.error(result.error ?? '操作失败');
    }
  }

  async function moderateWithAi(content: string) {
    const result = await api<{ verdict: string; score: number }>('AI_MODERATE', { content });
    if (result.ok && result.data) {
      const verdict = result.data.verdict;
      const labels: Record<string, string> = { approve: '通过', review: '待审', spam: '垃圾' };
      toast.info(`AI 判定: ${labels[verdict] ?? verdict}（置信度 ${(result.data.score * 100).toFixed(0)}%）`);
    } else {
      toast.error(result.error ?? 'AI 审核失败');
    }
  }
</script>

<svelte:head>
  <title>评论管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <h1 class="page-header__title">评论管理</h1>
  <p class="page-header__sub">
    {#if data.counts}
      待审 {counts.pending ?? 0} · 通过 {counts.approved ?? 0} · 垃圾 {counts.spam ?? 0}
    {/if}
  </p>
</div>

<div class="mb-4">
  <Segmented options={statusOptions} value={data.status} onchange={handleStatusChange} />
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
      <Icon name="comments" size={32} />
      <div class="empty-state__title mt-4">没有{statusOptions.find((s) => s.value === data.status)?.label}评论</div>
    </div>
  </div>
{:else}
  <div class="comment-list">
    {#each data.items as comment (comment.id)}
      <div class="comment-card">
        <div class="comment-card__header">
          <div class="comment-card__author">
            <strong>{comment.author}</strong>
            {#if comment.email}
              <span class="text-xs text-faint font-mono">{comment.email}</span>
            {/if}
            {#if comment.ai_verdict}
              <span class="badge badge--info">AI: {comment.ai_verdict}</span>
            {/if}
          </div>
          <span class="comment-card__time">{relativeTime(comment.created_at)}</span>
        </div>

        {#if comment.post_title}
          <div class="comment-card__post">
            <Icon name="content" size={12} />
            <span>{comment.post_title}</span>
          </div>
        {/if}

        <div class="comment-card__content">{comment.content}</div>

        <div class="comment-card__actions">
          <button class="btn btn--sm btn--ghost" onclick={() => moderateWithAi(comment.content)}>
            <Icon name="sparkles" size={12} /> AI 审核
          </button>
          {#if data.status !== 'approved'}
            <button class="btn btn--sm" onclick={() => moderate(comment.id, 'approved')}>
              <Icon name="check" size={12} /> 通过
            </button>
          {/if}
          {#if data.status !== 'spam'}
            <button class="btn btn--sm btn--danger" onclick={() => moderate(comment.id, 'spam')}>
              <Icon name="close" size={12} /> 标为垃圾
            </button>
          {/if}
          <button class="btn btn--sm btn--danger" onclick={() => moderate(comment.id, 'deleted')}>
            <Icon name="trash" size={12} /> 删除
          </button>
        </div>
      </div>
    {/each}
  </div>

  <Pagination
    current={parseInt(page.url.searchParams.get('page') ?? '1', 10)}
    total={data.total}
    pageSize={20}
    hrefPrefix="/comments"
  />
{/if}

<style>
  .comment-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .comment-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    background: var(--bg);
  }
  .comment-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .comment-card__author {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .comment-card__time {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
  }
  .comment-card__post {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 8px;
  }
  .comment-card__content {
    font-family: var(--font-kai);
    font-size: 14px;
    line-height: 1.7;
    padding: 8px 12px;
    background: var(--panel-2);
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .comment-card__actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
</style>
