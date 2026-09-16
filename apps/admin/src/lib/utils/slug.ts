// ============================================================================
// Slug 规则（复刻主站 vii.ink/src/utils/slug-rules.ts）
// ============================================================================

/**
 * 合法 slug 是单段 kebab-case：ASCII 段保持小写，中文可直接作为段内容。
 *
 * 文章库中已存在中文文件名；保留中文可避免保存旧文章时强行改 URL。禁止空格、
 * 斜杠和标点，确保它仍然是安全的单个路由段。
 */
export const ESSAY_PUBLIC_SLUG_RE = /^[a-z0-9\p{Script=Han}]+(?:-[a-z0-9\p{Script=Han}]+)*$/u;

/** 与静态路由冲突的保留 slug */
export const RESERVED_ESSAY_SLUGS: ReadonlySet<string> = new Set([
  'about',
  'admin',
  'api',
  'archive',
  'bits',
  'checks',
  'essay',
  'friends',
  'links',
  'memo',
  'page',
  'robots.txt',
  'rss.xml',
  'tag'
]);

/** 校验 slug 是否合法且未保留 */
export function isValidSlug(slug: string): { ok: boolean; reason?: string } {
  if (!slug) return { ok: false, reason: 'slug 不能为空' };
  if (!ESSAY_PUBLIC_SLUG_RE.test(slug)) {
    return { ok: false, reason: 'slug 只能包含小写字母、数字、中文和连字符' };
  }
  if (RESERVED_ESSAY_SLUGS.has(slug)) {
    return { ok: false, reason: `slug "${slug}" 是保留字，请换一个` };
  }
  return { ok: true };
}

/** 从标题自动生成 slug，保留中文以兼容现有中文文章 URL。 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\p{Script=Han}\s-]/gu, '')
    .replace(/[\s_-]+/g, '-') // 空格/下划线转连字符
    .replace(/^-+|-+$/g, ''); // 去首尾连字符
}
