// ============================================================================
// Slug 规则（复刻主站 vii.ink/src/utils/slug-rules.ts）
// ============================================================================

/** 合法 slug 必须是小写 kebab-case */
export const ESSAY_PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    return { ok: false, reason: 'slug 必须是小写 kebab-case（仅 a-z 0-9 和连字符）' };
  }
  if (RESERVED_ESSAY_SLUGS.has(slug)) {
    return { ok: false, reason: `slug "${slug}" 是保留字，请换一个` };
  }
  return { ok: true };
}

/** 从标题自动生成 slug（中文转拼音需要额外库，这里只处理英文/数字部分） */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // 移除非单词字符（中文会被移除）
    .replace(/[\s_-]+/g, '-') // 空格/下划线转连字符
    .replace(/^-+|-+$/g, ''); // 去首尾连字符
}
