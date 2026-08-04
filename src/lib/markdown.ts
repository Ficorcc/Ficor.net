// ============================================================================
// 构建期 Markdown 渲染（用于 memos 说说等非 content collection 的文本）
// ============================================================================

import { createMarkdownProcessor, type MarkdownRenderer } from '@astrojs/markdown-remark';

let processorPromise: Promise<MarkdownRenderer> | null = null;

const getMarkdownProcessor = () => {
  processorPromise ??= createMarkdownProcessor();
  return processorPromise;
};

export async function renderMarkdownToHtml(content: string): Promise<string> {
  const processor = await getMarkdownProcessor();
  const result = await processor.render(content);
  return result.code;
}
