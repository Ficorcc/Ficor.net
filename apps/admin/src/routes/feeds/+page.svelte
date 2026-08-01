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
  let saving = $state(false);
  let creating = $state(false);
  let name = $state('');
  let url = $state('');
  let feedUrl = $state('');
  let avatar = $state('');
  let description = $state('');

  function text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function deployToast(result: { deploy?: { ok?: boolean; message?: string } } | undefined) {
    const deployResult = result?.deploy;
    if (deployResult?.ok === false) {
      toast.warn(`已保存，但部署未触发：${deployResult.message ?? '部署配置不完整'}`);
    } else {
      toast.ok('订阅已新建并触发提交部署');
    }
  }

  function resetForm() {
    name = '';
    url = '';
    feedUrl = '';
    avatar = '';
    description = '';
  }

  async function saveNewFeed() {
    if (!name.trim() || !feedUrl.trim()) {
      toast.error('请填写名称和订阅地址');
      return;
    }

    const subscription: FeedRecord = {
      name: name.trim(),
      url: url.trim(),
      feedUrl: feedUrl.trim(),
      avatar: avatar.trim(),
      description: description.trim(),
      updated: new Date().toISOString(),
      latestItems: []
    };
    const base = data.value && typeof data.value === 'object' ? (data.value as Record<string, unknown>) : {};
    const value = {
      ...base,
      subscriptions: [...(Array.isArray(data.subscriptions) ? data.subscriptions : []), subscription]
    };

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'feed',
      value,
      deploy: true
    });
    if (result.ok) {
      deployToast(result.data);
      resetForm();
      creating = false;
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
    <button class="btn btn--primary" onclick={() => (creating = !creating)}>
      <Icon name={creating ? 'close' : 'plus'} size={16} /> {creating ? '取消新建' : '新建'}
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

{#if creating}
  <div class="panel create-panel">
    <div class="panel__legend">新建订阅 <span class="panel__legend-en">NEW FEED</span></div>
    <div class="create-form">
      <div class="field">
        <label class="field__label" for="feed-name">名称</label>
        <input id="feed-name" type="text" bind:value={name} placeholder="站点名称" />
      </div>
      <div class="field">
        <label class="field__label" for="feed-url">站点地址</label>
        <input id="feed-url" type="url" bind:value={url} placeholder="https://example.com" />
      </div>
      <div class="field">
        <label class="field__label" for="feed-feed-url">订阅地址</label>
        <input id="feed-feed-url" type="url" bind:value={feedUrl} placeholder="https://example.com/feed" />
      </div>
      <div class="field">
        <label class="field__label" for="feed-avatar">头像</label>
        <input id="feed-avatar" type="url" bind:value={avatar} placeholder="https://example.com/avatar.png" />
      </div>
      <div class="field field--full">
        <label class="field__label" for="feed-description">描述</label>
        <textarea id="feed-description" rows="3" bind:value={description} placeholder="一句话介绍"></textarea>
      </div>
      <div class="form-actions field--full">
        <button class="btn btn--ghost btn--sm" onclick={() => (creating = false)} disabled={saving}>取消</button>
        <button class="btn btn--primary btn--sm" onclick={saveNewFeed} disabled={saving}>
          <Icon name="save" size={14} /> {saving ? '保存中...' : '保存并部署'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="panel">
  <div class="panel__legend">订阅展示 <span class="panel__legend-en">FEEDS</span></div>
  {#if data.subscriptions.length === 0}
    <div class="empty-state">
      <Icon name="cloud" size={32} />
      <div class="empty-state__title mt-4">还没有订阅</div>
    </div>
  {:else}
    <div class="feed-list">
      {#each data.subscriptions.slice(0, 80) as item, index (text((item as FeedRecord).feedUrl) || index)}
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

<style>
  .create-panel {
    margin-bottom: 18px;
  }
  .create-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .field--full {
    grid-column: 1 / -1;
  }
  .form-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .feed-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
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
  @media (max-width: 720px) {
    .create-form {
      grid-template-columns: 1fr;
    }
  }
</style>
