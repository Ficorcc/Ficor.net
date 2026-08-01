<!--
  订阅管理：维护友链订阅与展示数据
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';

  let { data } = $props();

  type FeedRecord = Record<string, unknown>;
  const initialJson = () => JSON.stringify(data.value ?? { subscriptions: [] }, null, 2);
  let jsonText = $state(initialJson());
  let saving = $state(false);

  function text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  async function saveJson(deploy = false) {
    let value: unknown;
    try {
      value = JSON.parse(jsonText || '{}');
      const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
      if (!Array.isArray(record.subscriptions)) {
        toast.error('订阅数据需要包含 subscriptions 数组');
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? `JSON 错误：${e.message}` : 'JSON 格式错误');
      return;
    }

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'feed',
      value,
      deploy
    });
    if (result.ok) {
      const deployResult = result.data?.deploy;
      toast[deployResult?.ok === false ? 'error' : 'ok'](deploy ? (deployResult?.message ?? '订阅已保存并触发部署') : '订阅已保存');
      await invalidateAll();
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = false;
  }
</script>

<svelte:head>
  <title>订阅管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">订阅管理</h1>
      <p class="page-header__sub">{data.subscriptions.length} 个订阅 · {data.latestItems.length} 条展示动态</p>
    </div>
    <button class="btn btn--primary" onclick={() => saveJson(false)} disabled={saving}>
      <Icon name="save" size={16} /> {saving ? '保存中...' : '保存'}
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

<div class="data-grid">
  <div class="panel">
    <div class="panel__legend">订阅展示 <span class="panel__legend-en">FEEDS</span></div>
    {#if data.subscriptions.length === 0}
      <div class="empty-state">
        <Icon name="cloud" size={32} />
        <div class="empty-state__title mt-4">还没有订阅</div>
      </div>
    {:else}
      <div class="feed-list">
        {#each data.subscriptions.slice(0, 50) as item, index (text((item as FeedRecord).feedUrl) || index)}
          {@const sub = item as FeedRecord}
          <article class="feed-item">
            <div class="feed-item__name">{text(sub.name) || '未命名订阅'}</div>
            <div class="feed-item__url">{text(sub.feedUrl)}</div>
            <div class="feed-item__meta">{Array.isArray(sub.latestItems) ? sub.latestItems.length : 0} 条动态</div>
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
  .settings-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 14px;
  }
  .data-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(420px, 1.05fr);
    gap: 20px;
    align-items: start;
  }
  .feed-list {
    display: grid;
    gap: 8px;
  }
  .feed-item {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .feed-item__name {
    font-family: var(--font-serif);
    font-weight: 600;
  }
  .feed-item__url,
  .feed-item__meta {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
    overflow-wrap: anywhere;
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
