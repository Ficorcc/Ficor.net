<!--
  Frontmatter 编辑表单
  根据 collection 类型动态渲染不同字段
-->
<script lang="ts">
  interface Props {
    collection?: string;
    frontmatter?: Record<string, unknown>;
  }

  let {
    collection = 'essay',
    frontmatter = $bindable({} as Record<string, unknown>)
  }: Props = $props();

  // 类型安全的字段访问辅助
  function str(val: unknown): string {
    return typeof val === 'string' ? val : '';
  }

  // tags 数组编辑
  let tagInput = $state('');

  function addTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    const tags = Array.isArray(frontmatter.tags) ? [...frontmatter.tags] : [];
    if (!tags.includes(tag)) {
      tags.push(tag);
      frontmatter.tags = tags;
    }
    tagInput = '';
  }

  function removeTag(tag: string) {
    const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
    frontmatter.tags = tags.filter((t: unknown) => t !== tag);
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }
</script>

<div class="fm-form">
  {#if collection === 'essay'}
    <!-- Essay 字段 -->
    <div class="field field--full">
      <label class="field__label" for="fm-title">标题 *</label>
      <input
        id="fm-title"
        type="text"
        value={str(frontmatter.title)}
        oninput={(e) => (frontmatter.title = e.currentTarget.value)}
        placeholder="文章标题"
      />
    </div>

    <div class="field field--full">
      <label class="field__label" for="fm-desc">摘要</label>
      <textarea
        id="fm-desc"
        rows="2"
        value={str(frontmatter.description)}
        oninput={(e) => (frontmatter.description = e.currentTarget.value)}
        placeholder="一句话描述文章内容"
      ></textarea>
    </div>

    <div class="field">
      <label class="field__label" for="fm-date">日期</label>
      <input
        id="fm-date"
        type="date"
        value={str(frontmatter.date).slice(0, 10)}
        oninput={(e) => (frontmatter.date = e.currentTarget.value)}
      />
    </div>

    <div class="field">
      <label class="field__label" for="fm-slug">Slug</label>
      <input
        id="fm-slug"
        type="text"
        value={str(frontmatter.slug)}
        oninput={(e) => (frontmatter.slug = e.currentTarget.value)}
        placeholder="url-slug（留空自动生成）"
      />
      <div class="field__hint">小写 kebab-case，与主站路由冲突的词会被拒绝</div>
    </div>

  {:else if collection === 'bits'}
    <!-- Bits 字段 -->
    <div class="field field--full">
      <label class="field__label" for="fm-title">标题（可选）</label>
      <input
        id="fm-title"
        type="text"
        value={str(frontmatter.title)}
        oninput={(e) => (frontmatter.title = e.currentTarget.value)}
        placeholder="絮语可无标题"
      />
    </div>

    <div class="field">
      <label class="field__label" for="fm-date">日期</label>
      <input
        id="fm-date"
        type="date"
        value={str(frontmatter.date).slice(0, 10)}
        oninput={(e) => (frontmatter.date = e.currentTarget.value)}
      />
    </div>

    <div class="field">
      <label class="field__label" for="fm-author">作者</label>
      <input
        id="fm-author"
        type="text"
        value={str((frontmatter.author as { name?: string } | undefined)?.name)}
        oninput={(e) => {
          const name = e.currentTarget.value;
          frontmatter.author = name ? { name } : undefined;
        }}
        placeholder="作者名（可选）"
      />
    </div>

  {:else if collection === 'memo'}
    <!-- Memo 字段 -->
    <div class="field field--full">
      <label class="field__label" for="fm-title">标题 *</label>
      <input
        id="fm-title"
        type="text"
        value={str(frontmatter.title)}
        oninput={(e) => (frontmatter.title = e.currentTarget.value)}
        placeholder="小记标题"
      />
    </div>

    <div class="field field--full">
      <label class="field__label" for="fm-subtitle">副标题</label>
      <input
        id="fm-subtitle"
        type="text"
        value={str(frontmatter.subtitle)}
        oninput={(e) => (frontmatter.subtitle = e.currentTarget.value)}
        placeholder="副标题（可选）"
      />
    </div>

    <div class="field">
      <label class="field__label" for="fm-date">日期</label>
      <input
        id="fm-date"
        type="date"
        value={str(frontmatter.date).slice(0, 10)}
        oninput={(e) => (frontmatter.date = e.currentTarget.value)}
      />
    </div>
  {/if}

  <!-- 标签（essay/bits 共用） -->
  {#if collection !== 'memo'}
    <div class="field field--full">
      <label class="field__label">标签</label>
      <div class="tag-editor">
        {#each (Array.isArray(frontmatter.tags) ? frontmatter.tags : []) as tag (tag)}
          <span class="tag-chip">
            {tag}
            <button type="button" onclick={() => removeTag(tag)} aria-label="移除">×</button>
          </span>
        {/each}
        <input
          type="text"
          bind:value={tagInput}
          onkeydown={handleTagKeydown}
          onblur={addTag}
          placeholder="输入标签后回车"
        />
      </div>
      <div class="field__hint">支持中文，按回车或逗号添加</div>
    </div>
  {/if}

  <!-- 开关字段（essay） -->
  {#if collection === 'essay'}
    <div class="field field--full fm-toggles">
      <label class="fm-toggle">
        <input
          type="checkbox"
          checked={frontmatter.draft === true}
          onchange={(e) => (frontmatter.draft = e.currentTarget.checked)}
        />
        <span>草稿模式</span>
      </label>
      <label class="fm-toggle">
        <input
          type="checkbox"
          checked={frontmatter.archive !== false}
          onchange={(e) => (frontmatter.archive = e.currentTarget.checked)}
        />
        <span>归档</span>
      </label>
      <label class="fm-toggle">
        <input
          type="checkbox"
          checked={frontmatter.comment !== false}
          onchange={(e) => (frontmatter.comment = e.currentTarget.checked)}
        />
        <span>允许评论</span>
      </label>
    </div>
  {:else if collection === 'bits' || collection === 'memo'}
    <div class="field field--full fm-toggles">
      <label class="fm-toggle">
        <input
          type="checkbox"
          checked={frontmatter.draft === true}
          onchange={(e) => (frontmatter.draft = e.currentTarget.checked)}
        />
        <span>草稿模式</span>
      </label>
    </div>
  {/if}

  <!-- 可选高级字段（essay） -->
  {#if collection === 'essay'}
    <details class="fm-advanced">
      <summary>高级字段（封面/分类/徽章）</summary>
      <div class="form-grid mt-4">
        <div class="field">
          <label class="field__label">封面图 URL</label>
          <input
            type="url"
            value={str(frontmatter.cover)}
            oninput={(e) => (frontmatter.cover = e.currentTarget.value || undefined)}
            placeholder="https://..."
          />
        </div>
        <div class="field">
          <label class="field__label">分类</label>
          <input
            type="text"
            value={str(frontmatter.category)}
            oninput={(e) => (frontmatter.category = e.currentTarget.value || undefined)}
            placeholder="如：文章"
          />
        </div>
        <div class="field">
          <label class="field__label">徽章</label>
          <input
            type="text"
            value={str(frontmatter.badge)}
            oninput={(e) => (frontmatter.badge = e.currentTarget.value || undefined)}
            placeholder="如：置顶"
          />
        </div>
      </div>
    </details>
  {/if}
</div>

<style>
  .fm-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .fm-form .field--full {
    grid-column: 1 / -1;
  }
  .tag-editor {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    min-height: 38px;
  }
  .tag-editor:focus-within {
    border-color: var(--muted);
    box-shadow: 0 0 0 3px var(--panel);
  }
  .tag-editor input {
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
    padding: 4px 0 !important;
    flex: 1;
    min-width: 120px;
  }
  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    background: var(--panel);
    font-size: 12px;
  }
  .tag-chip button {
    border: none;
    background: none;
    color: var(--faint);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0;
  }
  .tag-chip button:hover {
    color: var(--danger);
  }
  .fm-toggles {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .fm-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-family: var(--font-kai);
    font-size: 13px;
  }
  .fm-advanced {
    grid-column: 1 / -1;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 0 14px;
  }
  .fm-advanced summary {
    padding: 10px 0;
    cursor: pointer;
    font-family: var(--font-kai);
    font-size: 13px;
    color: var(--muted);
  }
  @media (max-width: 640px) {
    .fm-form {
      grid-template-columns: 1fr;
    }
  }
</style>
