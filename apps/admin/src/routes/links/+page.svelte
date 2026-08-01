<!--
  友链管理：维护主站 links 数据
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';

  let { data } = $props();

  type LinkRecord = Record<string, unknown>;
  const initialJson = () => JSON.stringify(data.value ?? { siteInfo: {}, links: [] }, null, 2);
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
      if (!Array.isArray(record.links)) {
        toast.error('友链数据需要包含 links 数组');
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? `JSON 错误：${e.message}` : 'JSON 格式错误');
      return;
    }

    saving = true;
    const result = await api<{ deploy?: { ok?: boolean; message?: string } }>('DATA_SAVE', {
      key: 'links',
      value,
      deploy
    });
    if (result.ok) {
      const deployResult = result.data?.deploy;
      toast[deployResult?.ok === false ? 'error' : 'ok'](deploy ? (deployResult?.message ?? '友链已保存并触发部署') : '友链已保存');
      await invalidateAll();
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
      <p class="page-header__sub">{data.links.length} 个友链 · 主站 links 数据</p>
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
    <div class="panel__legend">友链列表 <span class="panel__legend-en">LINKS</span></div>
    {#if data.links.length === 0}
      <div class="empty-state">
        <Icon name="database" size={32} />
        <div class="empty-state__title mt-4">还没有友链</div>
      </div>
    {:else}
      <div class="link-list">
        {#each data.links.slice(0, 60) as item, index (text((item as LinkRecord).url) || index)}
          {@const link = item as LinkRecord}
          <a class="link-item" href={text(link.url)} target="_blank" rel="noreferrer">
            <span class="link-item__name">{text(link.name) || '未命名'}</span>
            <span class="link-item__desc">{text(link.description)}</span>
          </a>
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
  .link-list {
    display: grid;
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
