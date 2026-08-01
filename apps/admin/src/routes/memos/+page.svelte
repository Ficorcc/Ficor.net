<!--
  说说管理：同步 Memos 并维护主站 data/memos.json
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import { formatDateTime } from '$lib/utils/date';

  let { data } = $props();

  type MemoRecord = Record<string, unknown>;
  const initialJson = () => JSON.stringify(data.value ?? [], null, 2);
  let jsonText = $state(initialJson());
  let saving = $state(false);
  let syncing = $state(false);

  function memoId(memo: MemoRecord, index: number) {
    return String(memo.id ?? memo.memosName ?? memo.createdAt ?? index);
  }

  function memoContent(memo: MemoRecord) {
    return String(memo.content ?? '').replace(/<[^>]*>/g, '').trim();
  }

  function memoDate(memo: MemoRecord) {
    return String(memo.createdAt ?? memo.updatedAt ?? '');
  }

  async function saveJson(deploy = false) {
    let value: unknown;
    try {
      value = JSON.parse(jsonText || '[]');
      if (!Array.isArray(value)) {
        toast.error('说说数据必须是 JSON 数组');
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? `JSON 错误：${e.message}` : 'JSON 格式错误');
      return;
    }

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'memos',
      value,
      deploy
    });
    if (result.ok) {
      const deployResult = result.data?.deploy;
      toast[deployResult?.ok === false ? 'error' : 'ok'](deploy ? (deployResult?.message ?? '说说已保存并触发部署') : '说说已保存');
      await invalidateAll();
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = false;
  }

  async function syncMemos() {
    syncing = true;
    const result = await api<{ items?: unknown[]; count?: number }>('MEMOS_SYNC');
    if (result.ok) {
      jsonText = JSON.stringify(result.data?.items ?? [], null, 2);
      toast.ok(`已同步 ${result.data?.count ?? 0} 条说说`);
      await invalidateAll();
    } else {
      toast.error(result.error ?? '同步失败');
    }
    syncing = false;
  }
</script>

<svelte:head>
  <title>说说管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">说说管理</h1>
      <p class="page-header__sub">{data.items.length} 条 · Memos 数据源</p>
    </div>
    <div class="page-actions">
      <button class="btn btn--ghost" onclick={syncMemos} disabled={syncing}>
        <Icon name="refresh" size={16} /> {syncing ? '同步中...' : '同步 Memos'}
      </button>
      <button class="btn btn--primary" onclick={() => saveJson(false)} disabled={saving}>
        <Icon name="save" size={16} /> {saving ? '保存中...' : '保存'}
      </button>
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

<div class="data-grid">
  <div class="panel">
    <div class="panel__legend">说说预览 <span class="panel__legend-en">MEMOS</span></div>
    {#if data.items.length === 0}
      <div class="empty-state">
        <Icon name="content" size={32} />
        <div class="empty-state__title mt-4">还没有说说</div>
      </div>
    {:else}
      <div class="stack-list">
        {#each data.items.slice(0, 20) as memo, index (memoId(memo as unknown as MemoRecord, index))}
          {@const record = memo as unknown as MemoRecord}
          <article class="stack-item">
            <div class="stack-item__meta">{formatDateTime(memoDate(record))}</div>
            <div class="stack-item__body">{memoContent(record).slice(0, 180)}</div>
          </article>
        {/each}
      </div>
    {/if}
  </div>

  <div class="panel">
    <div class="panel__legend">数据编辑 <span class="panel__legend-en">JSON</span></div>
    <textarea class="json-editor" bind:value={jsonText} spellcheck="false"></textarea>
    <div class="settings-actions">
      <button class="btn btn--primary btn--sm" onclick={() => saveJson(false)} disabled={saving}>保存</button>
      <button class="btn btn--ghost btn--sm" onclick={() => saveJson(true)} disabled={saving}>保存并部署</button>
    </div>
  </div>
</div>

<style>
  .page-actions,
  .settings-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .data-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1.05fr);
    gap: 20px;
    align-items: start;
  }
  .stack-list {
    display: grid;
    gap: 10px;
  }
  .stack-item {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .stack-item__meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
    margin-bottom: 6px;
  }
  .stack-item__body {
    font-family: var(--font-kai);
    font-size: 14px;
    line-height: 1.7;
  }
  .json-editor {
    min-height: 520px;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  @media (max-width: 900px) {
    .data-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
