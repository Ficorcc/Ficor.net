<!--
  文章编辑器页面
  整合 frontmatter 表单 + Markdown 编辑器 + AI 润色 + 保存/发布
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/stores/toast';
  import { api, apiStream, csrfToken } from '$lib/utils/api';
  import { slugify, isValidSlug } from '$lib/utils/slug';
  import Icon from '$lib/components/ui/Icon.svelte';
  import MarkdownEditor from '$lib/components/editor/MarkdownEditor.svelte';
  import FrontmatterForm from '$lib/components/editor/FrontmatterForm.svelte';

  let { data } = $props();

  // 本地可变状态（深拷贝避免污染 load data）
  let frontmatter = $state<Record<string, unknown>>(structuredClone(data.frontmatter));
  let body = $state(data.body);
  let saving = $state(false);
  let polishing = $state(false);
  let aiPanelOpen = $state(false);

  // 获取 CSRF token（组件挂载时）
  $effect(() => {
    api('CSRF_ISSUE').then((res) => {
      if (res.ok && res.data) {
        const d = res.data as { csrfToken?: string };
        if (d.csrfToken) csrfToken.set(d.csrfToken);
      }
    });
  });

  // 计算实际 slug
  const effectiveSlug = $derived(
    (frontmatter.slug as string) || slugify((frontmatter.title as string) || '') || data.slug || 'untitled'
  );

  // 保存
  async function handleSave(deploy: boolean = false) {
    // 校验
    if (data.collection !== 'bits' && !frontmatter.title) {
      toast.error('请填写标题');
      return;
    }

    const slugCheck = isValidSlug(effectiveSlug);
    if (!slugCheck.ok) {
      toast.error(slugCheck.reason ?? 'slug 无效');
      return;
    }

    saving = true;
    try {
      const result = await api('CONTENT_SAVE', {
        collection: data.collection,
        slug: effectiveSlug,
        frontmatter,
        body,
        deploy
      });

      if (result.ok) {
        toast.ok(deploy ? '已保存并触发部署' : '保存成功');
        if (data.isNew) {
          await goto(`${base}/content/${data.collection}/${effectiveSlug}`);
        }
      } else {
        toast.error(result.error ?? '保存失败');
      }
    } finally {
      saving = false;
    }
  }

  // AI 润色（流式）
  async function handlePolish() {
    if (!body.trim()) {
      toast.warn('请先输入正文');
      return;
    }
    polishing = true;
    aiPanelOpen = true;

    const { ok, body: stream, error } = await apiStream('AI_POLISH', { text: body });
    if (!ok || !stream) {
      toast.error(error ?? '润色请求失败');
      polishing = false;
      return;
    }

    // 读取 SSE 流，实时更新 body
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let polished = '';
    let inData = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            polished += data;
            body = polished;
          }
        }
      }
      toast.ok('润色完成');
    } catch {
      toast.error('润色中断');
    } finally {
      polishing = false;
    }
  }

  // AI 元数据补全
  async function handleMetadata() {
    if (!body.trim()) {
      toast.warn('请先输入正文');
      return;
    }
    toast.info('正在分析文章元数据...');
    const result = await api<{ metadata: Record<string, unknown> }>('AI_METADATA', {
      content: body
    });

    if (result.ok && result.data?.metadata) {
      const meta = result.data.metadata;
      if (meta.title) frontmatter.title = meta.title;
      if (meta.description) frontmatter.description = meta.description;
      if (Array.isArray(meta.tags)) frontmatter.tags = meta.tags;
      if (meta.date) frontmatter.date = meta.date;
      toast.ok('元数据已补全，请确认');
    } else {
      toast.error(result.error ?? '补全失败');
    }
  }
</script>

<svelte:head>
  <title>{data.isNew ? '新建' : '编辑'}{frontmatter.title ? ` · ${frontmatter.title}` : ''}</title>
</svelte:head>

<!-- 操作栏 -->
<div class="editor-actions">
  <div class="editor-actions__left">
    <a href="{base}/content/{data.collection}" class="btn btn--ghost btn--sm">
      ← 返回列表
    </a>
    <span class="editor-slug text-xs text-faint font-mono">
      {data.collection}/{effectiveSlug}.md
    </span>
  </div>
  <div class="editor-actions__right">
    <button class="btn btn--ghost btn--sm" onclick={() => (aiPanelOpen = !aiPanelOpen)}>
      <Icon name="sparkles" size={14} /> AI
    </button>
    <button class="btn btn--sm" onclick={handlePolish} disabled={polishing}>
      {#if polishing}
        <span class="spinner"></span>
      {:else}
        <Icon name="sparkles" size={14} />
      {/if}
      润色
    </button>
    <button class="btn btn--ghost btn--sm" onclick={handleMetadata} disabled={polishing}>
      <Icon name="edit" size={14} /> 补全元数据
    </button>
    <span class="editor-actions__divider"></span>
    <button class="btn btn--sm" onclick={() => handleSave(false)} disabled={saving}>
      {#if saving}<span class="spinner"></span>{/if}
      保存
    </button>
    <button class="btn btn--primary btn--sm" onclick={() => handleSave(true)} disabled={saving}>
      <Icon name="save" size={14} />
      保存并部署
    </button>
  </div>
</div>

<!-- AI 浮层提示 -->
{#if polishing}
  <div class="ai-status">
    <span class="spinner"></span>
    <span class="font-kai">AI 正在润色，实时更新中...</span>
  </div>
{/if}

<!-- 编辑区 -->
<div class="editor-grid">
  <!-- 左：正文 -->
  <div class="editor-main">
    <div class="panel" style="padding: 0; overflow: hidden;">
      <div class="panel__legend" style="padding: 16px 20px; margin-bottom: 0;">
        正文 <span class="panel__legend-en">BODY</span>
      </div>
      <MarkdownEditor bind:value={body} collection={data.collection} />
    </div>
  </div>

  <!-- 右：frontmatter -->
  <div class="editor-side">
    <div class="panel">
      <div class="panel__legend">
        元数据 <span class="panel__legend-en">FRONTMATTER</span>
      </div>
      <FrontmatterForm collection={data.collection} bind:frontmatter />
    </div>
  </div>
</div>

<style>
  .editor-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .editor-actions__left,
  .editor-actions__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .editor-slug {
    padding: 2px 8px;
    background: var(--panel);
    border-radius: var(--radius-full);
  }
  .editor-actions__divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }
  .ai-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    margin-bottom: 12px;
    border-radius: var(--radius-full);
    background: var(--info-bg);
    color: var(--info);
    font-size: 13px;
  }
  .editor-grid {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 20px;
    align-items: start;
  }
  .editor-main {
    min-width: 0;
  }
  .editor-side {
    position: sticky;
    top: 72px;
  }
  @media (max-width: 1024px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }
    .editor-side {
      position: static;
    }
  }
</style>
