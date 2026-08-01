<!--
  图片库
-->
<script lang="ts">
  import { toast } from '$lib/stores/toast';
  import { csrfToken } from '$lib/utils/api';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';

  let { data } = $props();

  let uploading = $state(false);
  let deleteTarget = $state<string | null>(null);
  let showDeleteModal = $state(false);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    uploading = true;
    toast.info(`正在上传 ${input.files.length} 张图片...`);

    const csrfCookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('admin_csrf='))
      ?.split('=')[1];

    let success = 0;
    let failed = 0;
    for (const file of Array.from(input.files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/admin/api/IMAGE_UPLOAD', {
          method: 'POST',
          headers: csrfCookie ? { 'x-csrf-token': csrfCookie } : {},
          body: formData,
          credentials: 'same-origin'
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    if (success > 0) toast.ok(`${success} 张上传成功`);
    if (failed > 0) toast.error(`${failed} 张上传失败`);
    uploading = false;
    input.value = '';
    // 刷新页面
    setTimeout(() => location.reload(), 800);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const csrfCookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('admin_csrf='))
      ?.split('=')[1];

    const res = await fetch('/admin/api/IMAGE_DELETE', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfCookie ? { 'x-csrf-token': csrfCookie } : {})
      },
      body: JSON.stringify({ event: 'IMAGE_DELETE', key: deleteTarget }),
      credentials: 'same-origin'
    });

    if (res.ok) {
      toast.ok('图片已删除');
      setTimeout(() => location.reload(), 500);
    } else {
      toast.error('删除失败');
    }
    deleteTarget = null;
    showDeleteModal = false;
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    toast.ok('已复制路径');
  }

  function imageUrl(key: string) {
    return `/admin/api/IMAGE_VIEW?key=${encodeURIComponent(key)}`;
  }

  function fileName(key: string) {
    return key.split('/').pop() ?? key;
  }
</script>

<svelte:head>
  <title>图片管理 · 柒色墨笺后台</title>
</svelte:head>

<div class="page-header">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="page-header__title">图片管理</h1>
      <p class="page-header__sub">
        {data.storage.count} 张 · {formatSize(data.storage.totalSize)}
      </p>
    </div>
    <label class="btn btn--primary" class:disabled={uploading}>
      {#if uploading}
        <span class="spinner"></span> 上传中...
      {:else}
        <Icon name="upload" size={16} /> 上传图片
      {/if}
      <input type="file" accept="image/*" multiple onchange={handleUpload} hidden disabled={uploading} />
    </label>
  </div>
</div>

{#if data.error}
  <div class="panel">
    <div class="empty-state">
      <div class="empty-state__title">无法加载图片</div>
      <p class="text-sm">{data.error}</p>
    </div>
  </div>
{:else if data.items.length === 0}
  <div class="panel">
    <div class="empty-state">
      <Icon name="images" size={32} />
      <div class="empty-state__title mt-4">还没有图片</div>
      <p class="text-sm mt-2">点击右上角「上传图片」开始添加</p>
      <p class="text-xs mt-4">上传时自动转换为 WebP 格式（可配置），可选加水印</p>
    </div>
  </div>
{:else}
  <div class="image-grid">
    {#each data.items as img (img.key)}
      <div class="image-card">
        <div class="image-card__thumb">
          <img
            class="image-card__image"
            src={imageUrl(img.key)}
            alt={fileName(img.key)}
            loading="lazy"
            onerror={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div class="image-card__placeholder">
            <Icon name="images" size={28} />
          </div>
        </div>
        <div class="image-card__info">
          <div class="image-card__key" title={img.key} onclick={() => copyKey(img.key)}>
            {img.key.split('/').pop()}
          </div>
          <div class="image-card__meta">
            {formatSize(img.size)} · {new Date(img.uploaded).toLocaleDateString('zh-CN')}
          </div>
        </div>
        <button
          class="icon-btn image-card__delete"
          onclick={() => {
            deleteTarget = img.key;
            showDeleteModal = true;
          }}
          aria-label="删除"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- 删除确认模态框 -->
<Modal
  bind:open={showDeleteModal}
  title="确认删除"
  confirmText="删除"
  danger
  onConfirm={confirmDelete}
>
  <p class="text-sm">确定要删除这张图片吗？此操作不可恢复。</p>
  {#if deleteTarget}
    <p class="text-xs font-mono mt-2 text-muted">{deleteTarget}</p>
  {/if}
</Modal>

<style>
  .image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }
  .image-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg);
    position: relative;
    transition: border-color var(--duration) var(--ease);
  }
  .image-card:hover {
    border-color: var(--faint);
  }
  .image-card__thumb {
    aspect-ratio: 4 / 3;
    background: var(--panel);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: var(--faint);
  }
  .image-card__image {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--panel);
  }
  .image-card__placeholder {
    opacity: 0.5;
  }
  .image-card__info {
    padding: 8px 10px;
  }
  .image-card__key {
    font-family: var(--font-mono);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    color: var(--muted);
  }
  .image-card__key:hover {
    color: var(--accent);
  }
  .image-card__meta {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--faint);
    margin-top: 2px;
  }
  .image-card__delete {
    position: absolute;
    top: 6px;
    right: 6px;
    background: var(--bg);
    opacity: 0;
    transition: opacity var(--duration) var(--ease);
  }
  .image-card:hover .image-card__delete {
    opacity: 1;
  }
</style>
