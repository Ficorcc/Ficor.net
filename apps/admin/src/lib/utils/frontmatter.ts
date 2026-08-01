// ============================================================================
// Frontmatter 解析与序列化（基于 yaml 库）
// Markdown 文件结构：---\n<YAML frontmatter>\n---\n<body>
// ============================================================================

import { parse, stringify } from 'yaml';

export interface ParsedContent {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * 解析 Markdown 文件，分离 frontmatter 和正文。
 */
export function parseMarkdown(raw: string): ParsedContent {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: raw };
  }
  const [, fmRaw, body] = fmMatch;
  try {
    const frontmatter = parse(fmRaw) ?? {};
    return { frontmatter, body: body ?? '' };
  } catch {
    return { frontmatter: {}, body: body ?? '' };
  }
}

/**
 * 将 frontmatter + body 序列化为 Markdown 文件。
 */
export function serializeMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const fmYaml = stringify(frontmatter, {
    indent: 2,
    lineWidth: 0, // 不自动换行（tags 数组保持每项一行）
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN'
  }).trimEnd();
  return `---\n${fmYaml}\n---\n${body}`;
}

/**
 * 从正文中提取摘要（取前 N 个字符，去掉 Markdown 标记）。
 */
export function extractExcerpt(body: string, maxLen = 120): string {
  const plain = body
    .replace(/^#{1,6}\s+/gm, '') // 标题标记
    .replace(/!\[.*?\]\(.*?\)/g, '') // 图片
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接保留文字
    .replace(/[*_`~]/g, '') // 强调标记
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '...' : plain;
}
