// ============================================================================
// 内容 Schema 定义（复刻主站 vii.ink/src/content.config.ts）
// 用于校验从后台保存的文章 frontmatter
// ============================================================================

import { z } from 'zod';
import { ESSAY_PUBLIC_SLUG_RE } from './slug';

/** slug 校验：小写 kebab-case */
const slugRule = z
  .string()
  .regex(ESSAY_PUBLIC_SLUG_RE, 'slug 必须是小写 kebab-case');

/** 日期字符串（YYYY-MM-DD 或 ISO8601） */
const dateString = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)));

/** 基础字段（essay / bits 共用） */
const baseFields = {
  title: z.string(),
  description: z.string().optional(),
  date: dateString,
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  archive: z.boolean().default(true),
  slug: slugRule.optional()
};

/** essay schema */
export const essaySchema = z.object({
  ...baseFields,
  cover: z.string().optional(),
  badge: z.string().optional(),
  category: z.string().optional(),
  comment: z.boolean().default(true)
});

/** bits 图片 */
const bitsImage = z.object({
  src: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().optional()
});

const bitsAuthor = z.object({
  name: z.string().optional(),
  avatar: z.string().optional()
});

/** bits schema（title 可选） */
export const bitsSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  date: dateString,
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  slug: slugRule.optional(),
  images: z.array(bitsImage).optional(),
  author: bitsAuthor.optional()
});

/** memo schema */
export const memoSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  date: dateString.optional(),
  draft: z.boolean().default(false),
  slug: z.string().optional()
});

/** 支持的内容集合 */
export const COLLECTIONS = ['essay', 'bits', 'memo'] as const;
export type Collection = (typeof COLLECTIONS)[number];

/** 根据集合名获取对应 schema */
export function getSchema(collection: string) {
  switch (collection) {
    case 'essay':
      return essaySchema;
    case 'bits':
      return bitsSchema;
    case 'memo':
      return memoSchema;
    default:
      throw new Error(`未知的内容集合: ${collection}`);
  }
}

/** 校验 frontmatter */
export function validateFrontmatter(
  collection: string,
  frontmatter: Record<string, unknown>
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  try {
    const schema = getSchema(collection);
    const data = schema.parse(frontmatter);
    return { success: true, data: data as Record<string, unknown> };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return {
        success: false,
        errors: e.errors.map((err) => `${err.path.join('.')}: ${err.message}`)
      };
    }
    return { success: false, errors: [String(e)] };
  }
}

// 复刻主站的 slug 正则（从 slug.ts 重新导出）
export { ESSAY_PUBLIC_SLUG_RE } from './slug';
