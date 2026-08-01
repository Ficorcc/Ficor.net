<!--
  友链管理：读取主站 links 数据并直接编辑
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

  function updateLink(index: number, key: string, value: unknown) {
    links[index] = {
      ...links[index],
      [key]: value
    };
  }

  function addLink() {
    links = [
      {
        id: `link-${Date.now().toString(36)}`,
        name: '',
        url: '',
        description: '',
        avatar: '',
        feed: '',
        is_active: true,
        status: 'unknown'
      },
      ...links
    ];
  }

  function removeLink(index: number) {
    links = links.filter((_, itemIndex) => itemIndex !== index);
  }

  function normalizedLinks(): LinkRecord[] {
    const nextLinks: LinkRecord[] = [];
    for (const link of links) {
      const name = text(link.name).trim();
      const url = text(link.url).trim();
      if (!name && !url) continue;
      nextLinks.push({
        ...link,
        id: text(link.id).trim() || recordSlug(url || name),
        name,
        url,
        description: text(link.description).trim(),
        avatar: text(link.avatar).trim(),
        feed: text(link.feed).trim() || undefined,
        is_active: link.is_active !== false,
        status: text(link.status) || 'unknown'
      });
    }
    return nextLinks;
  }

  function deployToast(result: { deploy?: { ok?: boolean; message?: string } } | undefined) {
    const deployResult = result?.deploy;
    if (deployResult?.ok === false) {
      toast.warn(`已保存，但部署未触发：${deployResult.message ?? '部署配置不完整'}`);
    } else {
      toast.ok('友链已保存并触发提交部署');
    }
  }

  async function saveLinks() {
    const nextLinks = normalizedLinks();
    if (nextLinks.some((link) => !text(link.name) || !text(link.url))) {
      toast.error('每条友链都需要名称和网址');
      return;
    }

    const value = {
      ...sourceValue,
      siteInfo: sourceValue.siteInfo ?? data.siteInfo,
      links: nextLinks
    };

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'links',
      value,
      deploy: true
    });
    if (result.ok) {
      sourceValue = value;
      links = nextLinks;
      deployToast(result.data);
    } else {
      toast.error(result.error ?? '保存失败');
    }
    saving = false;
  }

  function statusText(link: LinkRecord) {
    const status = text(link.status);
    if (status === 'online') return '在线';
    if (status === 'offline') return '离线';
    return '未知';
  }

  function toggleActive(index: number) {
    updateLink(index, 'is_active', links[index].is_active === false);
  }

  function sourceLabel() {
    return (data as Record<string, unknown>).source === 'source' ? '主站仓库' : '后台存储';
  }
</script>

<svelte:head>
  <title>友链管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">友链管理</h1>
      <p class="page-header__sub">{links.length} 个友链 · 数据源：{sourceLabel()}</p>
    </div>
    <div class="header-actions">
      <button class="btn btn--ghost" onclick={addLink}>
        <Icon name="plus" size={16} /> 新增
      </button>
      <button class="btn btn--primary" onclick={saveLinks} disabled={saving}>
        <Icon name="save" size={16} /> {saving ? '保存中...' : '保存并部署'}
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

<div class="panel">
  <div class="panel__legend">友链列表 <span class="panel__legend-en">LINKS</span></div>
  {#if links.length === 0}
    <div class="empty-state">
      <Icon name="database" size={32} />
      <div class="empty-state__title mt-4">还没有友链</div>
    </div>
  {:else}
    <div class="link-editor-list">
      {#each links.slice(0, 80) as item, index (text((item as LinkRecord).url) || text((item as LinkRecord).id) || index)}
        {@const link = item as LinkRecord}
        <article class="link-edit-item" class:is-muted={link.is_active === false}>
          <div class="link-edit-item__avatar">
            {#if text(link.avatar)}
              <img src={text(link.avatar)} alt="" loading="lazy" />
            {:else}
              <span>{(text(link.name) || '?').slice(0, 1)}</span>
            {/if}
          </div>
          <div class="link-edit-item__fields">
            <input aria-label="友链名称" value={text(link.name)} placeholder="站点名称" oninput={(e) => updateLink(index, 'name', e.currentTarget.value)} />
            <input aria-label="站点网址" type="url" value={text(link.url)} placeholder="https://example.com" oninput={(e) => updateLink(index, 'url', e.currentTarget.value)} />
            <input aria-label="头像地址" type="url" value={text(link.avatar)} placeholder="头像地址" oninput={(e) => updateLink(index, 'avatar', e.currentTarget.value)} />
            <input aria-label="订阅地址" type="url" value={text(link.feed)} placeholder="订阅地址" oninput={(e) => updateLink(index, 'feed', e.currentTarget.value)} />
            <textarea aria-label="描述" rows="2" value={text(link.description)} placeholder="一句话介绍" oninput={(e) => updateLink(index, 'description', e.currentTarget.value)}></textarea>
          </div>
          <div class="link-edit-item__actions">
            <button class="btn btn--ghost btn--sm" onclick={() => toggleActive(index)}>
              {link.is_active === false ? '启用' : '停用'}
            </button>
            <a class="btn btn--ghost btn--sm" href={text(link.url)} target="_blank" rel="noreferrer">打开</a>
            <button class="btn btn--ghost btn--sm" onclick={() => removeLink(index)}>删除</button>
            <span class="link-status">{statusText(link)}</span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .header-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .link-editor-list {
    display: grid;
    gap: 12px;
  }
  .link-edit-item {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  .link-edit-item:hover {
    border-color: var(--faint);
  }
  .link-edit-item.is-muted {
    opacity: 0.62;
  }
  .link-edit-item__avatar {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--muted);
    background: var(--panel);
  }
  .link-edit-item__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .link-edit-item__fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .link-edit-item__fields textarea {
    grid-column: 1 / -1;
    resize: vertical;
  }
  .link-edit-item__actions {
    display: grid;
    gap: 8px;
    min-width: 74px;
  }
  .link-status {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--muted);
    text-align: center;
  }
  @media (max-width: 720px) {
    .link-edit-item,
    .link-edit-item__fields {
      grid-template-columns: 1fr;
    }
    .link-edit-item__actions {
      display: flex;
      flex-wrap: wrap;
    }
  }
</style>
