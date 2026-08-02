<!--
  友链管理：默认展示卡片，点击条目后编辑
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
  let editingIndex = $state<number | null>(null);
  let draft = $state<LinkRecord | null>(null);

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

  function normalizeLink(link: LinkRecord): LinkRecord | null {
    const name = text(link.name).trim();
    const url = text(link.url).trim();
    if (!name && !url) return null;
    return {
      ...link,
      id: text(link.id).trim() || recordSlug(url || name),
      name,
      url,
      description: text(link.description).trim(),
      avatar: text(link.avatar).trim(),
      feed: text(link.feed).trim() || undefined,
      is_active: link.is_active !== false,
      status: text(link.status) || 'unknown'
    };
  }

  function normalizedLinks(): LinkRecord[] {
    return links.map(normalizeLink).filter(Boolean) as LinkRecord[];
  }

  function updateDraft(key: string, value: unknown) {
    if (!draft) return;
    draft = {
      ...draft,
      [key]: value
    };
  }

  function addLink() {
    editingIndex = null;
    draft = {
      id: `link-${Date.now().toString(36)}`,
      name: '',
      url: '',
      description: '',
      avatar: '',
      feed: '',
      is_active: true,
      status: 'unknown'
    };
  }

  function editLink(index: number) {
    editingIndex = index;
    draft = { ...links[index] };
  }

  function closeEditor() {
    editingIndex = null;
    draft = null;
  }

  function applyDraft() {
    if (!draft) return;
    const normalized = normalizeLink(draft);
    if (!normalized || !text(normalized.name) || !text(normalized.url)) {
      toast.error('友链需要名称和网址');
      return;
    }

    if (editingIndex === null) {
      links = [normalized, ...links];
    } else {
      links[editingIndex] = normalized;
    }
    closeEditor();
  }

  function removeLink(index: number) {
    if (!window.confirm(`确认删除「${text(links[index]?.name) || '这条友链'}」吗？`)) return;
    links = links.filter((_, itemIndex) => itemIndex !== index);
    closeEditor();
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

{#if draft}
  <div class="panel link-editor-panel">
    <div class="panel__legend">
      {editingIndex === null ? '新增友链' : '编辑友链'} <span class="panel__legend-en">EDIT</span>
    </div>
    <div class="link-form">
      <div class="field">
        <label class="field__label" for="link-name">名字</label>
        <input id="link-name" value={text(draft.name)} placeholder="站点名称" oninput={(e) => updateDraft('name', e.currentTarget.value)} />
      </div>
      <div class="field">
        <label class="field__label" for="link-url">网址</label>
        <input id="link-url" type="url" value={text(draft.url)} placeholder="https://example.com" oninput={(e) => updateDraft('url', e.currentTarget.value)} />
      </div>
      <div class="field">
        <label class="field__label" for="link-avatar">头像</label>
        <input id="link-avatar" type="url" value={text(draft.avatar)} placeholder="头像地址" oninput={(e) => updateDraft('avatar', e.currentTarget.value)} />
      </div>
      <div class="field">
        <label class="field__label" for="link-feed">订阅</label>
        <input id="link-feed" type="url" value={text(draft.feed)} placeholder="订阅地址，可选" oninput={(e) => updateDraft('feed', e.currentTarget.value)} />
      </div>
      <div class="field field--full">
        <label class="field__label" for="link-description">描述</label>
        <textarea id="link-description" rows="3" value={text(draft.description)} placeholder="一句话介绍" oninput={(e) => updateDraft('description', e.currentTarget.value)}></textarea>
      </div>
      <div class="link-form__actions">
        <button class="btn btn--ghost btn--sm" onclick={closeEditor}>取消</button>
        {#if editingIndex !== null}
          <button class="btn btn--ghost btn--sm" onclick={() => removeLink(editingIndex as number)}>删除</button>
        {/if}
        <button class="btn btn--primary btn--sm" onclick={applyDraft}>
          <Icon name="check" size={14} /> 完成编辑
        </button>
      </div>
    </div>
  </div>
{/if}

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
    <div class="link-card-list">
      {#each links.slice(0, 80) as item, index (text((item as LinkRecord).url) || text((item as LinkRecord).id) || index)}
        {@const link = item as LinkRecord}
        <button type="button" class="link-card" class:is-muted={link.is_active === false} onclick={() => editLink(index)}>
          <span class="link-card__head">
            <span class="link-card__avatar">
              {#if text(link.avatar)}
                <img src={text(link.avatar)} alt="" loading="lazy" />
              {:else}
                <span>{(text(link.name) || '?').slice(0, 1)}</span>
              {/if}
            </span>
            <span class="link-card__name">{text(link.name) || '未命名站点'}</span>
          </span>
          <span class="link-card__description">{text(link.description) || '暂无描述'}</span>
        </button>
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
  .link-editor-panel {
    margin-bottom: 18px;
  }
  .link-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .field--full {
    grid-column: 1 / -1;
  }
  .link-form__actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }
  .link-card-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .link-card {
    display: grid;
    gap: 10px;
    width: 100%;
    min-height: 104px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .link-card:hover {
    border-color: var(--faint);
  }
  .link-card.is-muted {
    opacity: 0.62;
  }
  .link-card__head {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }
  .link-card__avatar {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 50%;
    color: var(--muted);
    background: var(--bg);
  }
  .link-card__avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .link-card__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-serif);
    font-size: 16px;
    font-weight: 600;
  }
  .link-card__description {
    display: -webkit-box;
    min-height: 44px;
    overflow: hidden;
    color: var(--muted);
    font-family: var(--font-kai);
    font-size: 13px;
    line-height: 1.7;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  @media (max-width: 720px) {
    .link-form,
    .link-card-list {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 520px) {
    .header-actions {
      width: 100%;
      justify-content: flex-start;
    }
    .link-form__actions {
      justify-content: flex-start;
    }
  }
</style>
