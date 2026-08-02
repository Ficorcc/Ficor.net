<!--
  说说管理：同步 Memos 并维护主站 data/memos.json
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import { formatDateTime } from '$lib/utils/date';

  let { data } = $props();

  type MemoRecord = Record<string, unknown>;
  let saving = $state(false);
  let syncing = $state(false);
  let creating = $state(false);
  let items = $state<MemoRecord[]>([...((Array.isArray(data.items) ? data.items : []) as MemoRecord[])]);
  let value = $state<MemoRecord[]>([...((Array.isArray(data.value) ? data.value : []) as MemoRecord[])]);
  let newContent = $state('');
  let newCreatedAt = $state(new Date().toISOString().slice(0, 16));

  function memoId(memo: MemoRecord, index: number) {
    return String(memo.id ?? memo.memosName ?? memo.createdAt ?? index);
  }

  function memoContent(memo: MemoRecord) {
    return String(memo.content ?? '').replace(/<[^>]*>/g, '').trim();
  }

  function memoDate(memo: MemoRecord) {
    return String(memo.createdAt ?? memo.updatedAt ?? '');
  }

  function sourceLabel() {
    if (data.source === 'memos') return `Memos 实时数据 · ${data.memosUrl ?? 'memos.ficor.net'}`;
    if (data.source === 'r2') return 'R2 缓存数据';
    return 'Memos 数据源';
  }

  function deployToast(result: { deploy?: { ok?: boolean; message?: string } } | undefined, okText: string) {
    const deployResult = result?.deploy;
    if (deployResult?.ok === false) {
      toast.warn(`已保存，但部署未触发：${deployResult.message ?? '部署配置不完整'}`);
    } else {
      toast.ok(okText);
    }
  }

  function resetForm() {
    newContent = '';
    newCreatedAt = new Date().toISOString().slice(0, 16);
  }

  async function saveNewMemo() {
    const content = newContent.trim();
    if (!content) {
      toast.error('请填写说说内容');
      return;
    }

    const createdAt = new Date(newCreatedAt || Date.now()).toISOString();
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-${Date.now().toString(36)}`;
    const item: MemoRecord = {
      id,
      memosName: `memos/${id}`,
      content,
      visibility: 'PROTECTED',
      createdAt,
      updatedAt: createdAt,
      pinned: false,
      resources: []
    };
    const nextValue = [item, ...value];

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'memos',
      value: nextValue,
      deploy: true
    });
    if (result.ok) {
      value = nextValue;
      items = [item, ...items];
      deployToast(result.data, '说说已新建并触发提交部署');
      resetForm();
      creating = false;
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = false;
  }

  async function syncMemos() {
    syncing = true;
    const result = await api<{ items?: unknown[]; count?: number }>('MEMOS_SYNC');
    if (result.ok) {
      const nextItems = Array.isArray(result.data?.items) ? (result.data.items as MemoRecord[]) : [];
      items = nextItems;
      value = nextItems;
      toast.ok(`已同步 ${result.data?.count ?? 0} 条说说`);
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
      <p class="page-header__sub">{items.length} 条 · {sourceLabel()}</p>
    </div>
    <div class="page-actions">
      <button class="btn btn--ghost" onclick={syncMemos} disabled={syncing}>
        <Icon name="refresh" size={16} /> {syncing ? '同步中...' : '同步 Memos'}
      </button>
      <button class="btn btn--primary" onclick={() => (creating = !creating)}>
        <Icon name={creating ? 'close' : 'plus'} size={16} /> {creating ? '取消新建' : '新建'}
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

{#if creating}
  <div class="panel create-panel">
    <div class="panel__legend">新建说说 <span class="panel__legend-en">NEW MEMO</span></div>
    <div class="create-form">
      <div class="field field--full">
        <label class="field__label" for="memo-content">内容</label>
        <textarea
          id="memo-content"
          rows="5"
          bind:value={newContent}
          placeholder="写点碎碎念..."
        ></textarea>
      </div>
      <div class="field">
        <label class="field__label" for="memo-created">发布时间</label>
        <input id="memo-created" type="datetime-local" bind:value={newCreatedAt} />
      </div>
      <div class="form-actions">
        <button class="btn btn--ghost btn--sm" onclick={() => (creating = false)} disabled={saving}>取消</button>
        <button class="btn btn--primary btn--sm" onclick={saveNewMemo} disabled={saving}>
          <Icon name="save" size={14} /> {saving ? '保存中...' : '保存并部署'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="panel">
  <div class="panel__legend">说说预览 <span class="panel__legend-en">MEMOS</span></div>
  {#if items.length === 0}
    <div class="empty-state">
      <Icon name="content" size={32} />
      <div class="empty-state__title mt-4">还没有说说</div>
    </div>
  {:else}
    <div class="stack-list">
      {#each items.slice(0, 60) as memo, index (memoId(memo as unknown as MemoRecord, index))}
        {@const record = memo as unknown as MemoRecord}
        <article class="stack-item">
          <div class="stack-item__meta">{formatDateTime(memoDate(record))}</div>
          <div class="stack-item__body">{memoContent(record).slice(0, 220)}</div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page-actions,
  .form-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .create-panel {
    margin-bottom: 18px;
  }
  .create-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 14px;
    align-items: end;
  }
  .field--full {
    grid-column: 1 / -1;
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
  @media (max-width: 720px) {
    .create-form {
      grid-template-columns: 1fr;
    }
    .form-actions {
      justify-content: flex-start;
    }
  }
</style>
