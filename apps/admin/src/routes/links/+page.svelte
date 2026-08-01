<!--
  友链管理：维护主站 links 数据
-->
<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';

  let { data } = $props();

  type LinkRecord = Record<string, unknown>;
  let sourceValue = $state<Record<string, unknown>>(
    data.value && typeof data.value === 'object' ? { ...(data.value as Record<string, unknown>) } : {}
  );
  let links = $state<LinkRecord[]>([...((Array.isArray(data.links) ? data.links : []) as LinkRecord[])]);
  let saving = $state(false);
  let creating = $state(false);
  let name = $state('');
  let url = $state('');
  let avatar = $state('');
  let description = $state('');
  let feed = $state('');

  function text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  function recordSlug(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || `link-${Date.now().toString(36)}`
    );
  }

  function deployToast(result: { deploy?: { ok?: boolean; message?: string } } | undefined) {
    const deployResult = result?.deploy;
    if (deployResult?.ok === false) {
      toast.warn(`已保存，但部署未触发：${deployResult.message ?? '部署配置不完整'}`);
    } else {
      toast.ok('友链已新建并触发提交部署');
    }
  }

  function resetForm() {
    name = '';
    url = '';
    avatar = '';
    description = '';
    feed = '';
  }

  async function saveNewLink() {
    if (!name.trim() || !url.trim()) {
      toast.error('请填写名称和网址');
      return;
    }

    const link: LinkRecord = {
      id: recordSlug(url || name),
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      avatar: avatar.trim(),
      feed: feed.trim() || undefined,
      is_active: true,
      status: 'unknown'
    };
    const value = {
      ...sourceValue,
      links: [...links, link]
    };

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'links',
      value,
      deploy: true
    });
    if (result.ok) {
      sourceValue = value;
      links = value.links as LinkRecord[];
      deployToast(result.data);
      resetForm();
      creating = false;
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = false;
  }
</script>

<svelte:head>
  <title>友链管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">友链管理</h1>
      <p class="page-header__sub">{links.length} 个友链 · 主站 links 数据</p>
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
    <div class="panel__legend">新建友链 <span class="panel__legend-en">NEW LINK</span></div>
    <div class="create-form">
      <div class="field">
        <label class="field__label" for="link-name">名称</label>
        <input id="link-name" type="text" bind:value={name} placeholder="站点名称" />
      </div>
      <div class="field">
        <label class="field__label" for="link-url">网址</label>
        <input id="link-url" type="url" bind:value={url} placeholder="https://example.com" />
      </div>
      <div class="field">
        <label class="field__label" for="link-avatar">头像</label>
        <input id="link-avatar" type="url" bind:value={avatar} placeholder="https://example.com/avatar.png" />
      </div>
      <div class="field">
        <label class="field__label" for="link-feed">订阅地址</label>
        <input id="link-feed" type="url" bind:value={feed} placeholder="https://example.com/feed" />
      </div>
      <div class="field field--full">
        <label class="field__label" for="link-description">描述</label>
        <textarea id="link-description" rows="3" bind:value={description} placeholder="一句话介绍"></textarea>
      </div>
      <div class="form-actions field--full">
        <button class="btn btn--ghost btn--sm" onclick={() => (creating = false)} disabled={saving}>取消</button>
        <button class="btn btn--primary btn--sm" onclick={saveNewLink} disabled={saving}>
          <Icon name="save" size={14} /> {saving ? '保存中...' : '保存并部署'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="panel">
  <div class="panel__legend">友链列表 <span class="panel__legend-en">LINKS</span></div>
  {#if links.length === 0}
    <div class="empty-state">
      <Icon name="database" size={32} />
      <div class="empty-state__title mt-4">还没有友链</div>
    </div>
  {:else}
    <div class="link-list">
      {#each links.slice(0, 80) as item, index (text((item as LinkRecord).url) || index)}
        {@const link = item as LinkRecord}
        <a class="link-item" href={text(link.url)} target="_blank" rel="noreferrer">
          <span class="link-item__name">{text(link.name) || '未命名'}</span>
          <span class="link-item__desc">{text(link.description)}</span>
        </a>
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
  .link-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 8px;
  }
  .link-item {
    display: grid;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .link-item:hover {
    border-color: var(--faint);
  }
  .link-item__name {
    font-family: var(--font-serif);
    font-weight: 600;
  }
  .link-item__desc {
    font-family: var(--font-kai);
    font-size: 13px;
    color: var(--muted);
  }
  @media (max-width: 720px) {
    .create-form {
      grid-template-columns: 1fr;
    }
  }
</style>
