<!--
  Markdown 编辑器
  功能：工具栏（加粗/斜体/标题/链接/图片/代码）、快捷键、拖拽上传、字数统计
-->
<script lang="ts">
  import { toast } from '$lib/stores/toast';
  import { api } from '$lib/utils/api';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    value?: string;
    onchange?: (value: string) => void;
    collection?: string;
  }

  let {
    value = $bindable(''),
    onchange,
    collection = 'essay'
  }: Props = $props();

  let textarea = $state<HTMLTextAreaElement>(undefined!);
  let wordCount = $derived(value.length);
  let isDragOver = $state(false);

  // 工具栏操作
  function wrapSelection(before: string, after: string = before, placeholder = '文本') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder;
    const newValue = value.slice(0, start) + before + selected + after + value.slice(end);
    value = newValue;
    onchange?.(newValue);
    // 恢复光标
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = start + before.length;
      textarea.selectionEnd = start + before.length + selected.length;
    });
  }

  function insertLinePrefix(prefix: string) {
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    value = newValue;
    onchange?.(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
    });
  }

  function insertText(text: string) {
    const start = textarea.selectionStart;
    const newValue = value.slice(0, start) + text + value.slice(textarea.selectionEnd);
    value = newValue;
    onchange?.(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    });
  }

  // 快捷键
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          wrapSelection('**');
          break;
        case 'i':
          e.preventDefault();
          wrapSelection('*');
          break;
        case 'k':
          e.preventDefault();
          wrapSelection('[', '](https://)', '链接文字');
          break;
      }
    }
    // Tab 插入空格
    if (e.key === 'Tab') {
      e.preventDefault();
      insertText('  ');
    }
  }

  // 拖拽上传
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.warn(`${file.name} 不是图片`);
        continue;
      }
      await uploadImage(file);
    }
  }

  async function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadImage(file);
    }
    input.value = '';
  }

  async function uploadImage(file: File) {
    toast.info(`正在上传 ${file.name}...`);
    // 用 fetch 直接上传到图片 API（multipart 因为是文件）
    const formData = new FormData();
    formData.append('file', file);
    formData.append('collection', collection);

    const csrfCookie = document.cookie
      .split('; ')
      .find((c) => c.startsWith('admin_csrf='))
      ?.split('=')[1];

    try {
      const res = await fetch('/admin/api/IMAGE_UPLOAD', {
        method: 'POST',
        headers: csrfCookie ? { 'x-csrf-token': csrfCookie } : {},
        body: formData,
        credentials: 'same-origin'
      });
      const result = (await res.json()) as { key?: string; url?: string; message?: string };
      if (res.ok && result.key) {
        const markdown = `![${file.name}](${result.url || result.key})`;
        insertText(`\n${markdown}\n`);
        toast.ok(`${file.name} 上传成功`);
      } else {
        toast.error(result.message ?? '上传失败');
      }
    } catch {
      toast.error('上传网络错误');
    }
  }
</script>

<div
  class="md-editor"
  class:drag-over={isDragOver}
  ondragover={(e) => {
    e.preventDefault();
    isDragOver = true;
  }}
  ondragleave={() => (isDragOver = false)}
  ondrop={handleDrop}
>
  <!-- 工具栏 -->
  <div class="md-toolbar">
    <button type="button" class="md-toolbar__btn" onclick={() => wrapSelection('**')} title="加粗 (Ctrl+B)">
      <strong>B</strong>
    </button>
    <button type="button" class="md-toolbar__btn" onclick={() => wrapSelection('*')} title="斜体 (Ctrl+I)">
      <em>I</em>
    </button>
    <button type="button" class="md-toolbar__btn" onclick={() => insertLinePrefix('## ')} title="标题">
      H
    </button>
    <span class="md-toolbar__divider"></span>
    <button type="button" class="md-toolbar__btn" onclick={() => wrapSelection('[', '](https://)', '链接')} title="链接 (Ctrl+K)">
      <Icon name="edit" size={14} />
    </button>
    <label class="md-toolbar__btn" title="插入图片">
      <Icon name="upload" size={14} />
      <input type="file" accept="image/*" multiple onchange={handleFileInput} hidden />
    </label>
    <button type="button" class="md-toolbar__btn" onclick={() => wrapSelection('`')} title="行内代码">
      <code>{'<>'}</code>
    </button>
    <button type="button" class="md-toolbar__btn" onclick={() => insertText('\n```\n代码\n```\n')} title="代码块">
      <Icon name="cpu" size={14} />
    </button>
    <span class="md-toolbar__divider"></span>
    <button type="button" class="md-toolbar__btn" onclick={() => insertLinePrefix('- ')} title="无序列表">
      •
    </button>
    <button type="button" class="md-toolbar__btn" onclick={() => insertLinePrefix('> ')} title="引用">
      "
    </button>
  </div>

  <!-- 编辑区 -->
  <textarea
    bind:this={textarea}
    bind:value
    oninput={() => onchange?.(value)}
    onkeydown={handleKeydown}
    placeholder="在此输入 Markdown 正文..."
    spellcheck="false"
    class="md-textarea"
  ></textarea>

  <!-- 状态栏 -->
  <div class="md-statusbar">
    <span>{wordCount} 字符</span>
    <span class="md-statusbar__hint">支持拖拽上传图片 · Ctrl+B 加粗 · Ctrl+I 斜体 · Ctrl+K 链接</span>
  </div>
</div>

<style>
  .md-editor {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg);
    transition: border-color var(--duration) var(--ease);
  }
  .md-editor.drag-over {
    border-color: var(--accent);
    background: var(--accent-bg);
  }
  .md-toolbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    background: var(--panel-2);
    flex-wrap: wrap;
  }
  .md-toolbar__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--duration) var(--ease);
  }
  .md-toolbar__btn:hover {
    background: var(--panel);
    color: var(--text);
  }
  .md-toolbar__divider {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 4px;
  }
  .md-textarea {
    width: 100%;
    min-height: 400px;
    border: none;
    border-radius: 0;
    padding: 16px;
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.8;
    resize: vertical;
    outline: none;
    box-shadow: none !important;
    background: var(--bg);
    color: var(--text);
  }
  .md-statusbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    background: var(--panel-2);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--faint);
  }
  .md-statusbar__hint {
    font-family: var(--font-kai);
  }
</style>
