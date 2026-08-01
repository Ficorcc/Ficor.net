// ============================================================================
// 各事件的请求体 Schema（Zod 校验）
// ============================================================================

import { z } from 'zod';

// --- 鉴权 ---
export const authLoginSchema = z.object({
  event: z.literal('AUTH_LOGIN'),
  password: z.string().min(1)
});

export const csrfIssueSchema = z.object({
  event: z.literal('CSRF_ISSUE')
});

// --- 评论 ---
export const commentSubmitSchema = z.object({
  event: z.literal('COMMENT_SUBMIT'),
  postId: z.string().optional(),
  postTitle: z.string().optional(),
  author: z.string().min(1).max(50),
  email: z.string().email().optional(),
  link: z.string().url().optional(),
  content: z.string().min(1).max(5000)
});

export const commentModerateSchema = z.object({
  event: z.literal('COMMENT_MODERATE'),
  id: z.string().min(1),
  status: z.enum(['approved', 'pending', 'spam', 'deleted'])
});

export const commentDeleteSchema = z.object({
  event: z.literal('COMMENT_DELETE'),
  id: z.string().min(1)
});

// --- 内容 ---
export const contentListSchema = z.object({
  event: z.literal('CONTENT_LIST'),
  collection: z.enum(['essay', 'bits', 'memo'])
});

export const contentGetSchema = z.object({
  event: z.literal('CONTENT_GET'),
  collection: z.enum(['essay', 'bits', 'memo']),
  slug: z.string().min(1)
});

export const contentSaveSchema = z.object({
  event: z.literal('CONTENT_SAVE'),
  collection: z.enum(['essay', 'bits', 'memo']),
  slug: z.string().min(1),
  frontmatter: z.record(z.unknown()),
  body: z.string(),
  deploy: z.boolean().optional() // 保存后是否触发部署
});

export const contentDeleteSchema = z.object({
  event: z.literal('CONTENT_DELETE'),
  collection: z.enum(['essay', 'bits', 'memo']),
  slug: z.string().min(1)
});

export const contentSearchSchema = z.object({
  event: z.literal('CONTENT_SEARCH'),
  keyword: z.string().min(1).max(100)
});

export const contentPublishSchema = z.object({
  event: z.literal('CONTENT_PUBLISH')
});

export const contentPullSourceSchema = z.object({
  event: z.literal('CONTENT_PULL_SOURCE'),
  collection: z.enum(['essay', 'bits', 'memo']),
  cursor: z.number().int().nonnegative().optional()
});

// --- 主站数据 ---
export const dataSaveSchema = z.object({
  event: z.literal('DATA_SAVE'),
  key: z.enum(['memos', 'links', 'feed']),
  value: z.unknown(),
  deploy: z.boolean().optional()
});

export const memosSyncSchema = z.object({
  event: z.literal('MEMOS_SYNC'),
  deploy: z.boolean().optional()
});

// --- 图片 ---
export const imageListSchema = z.object({
  event: z.literal('IMAGE_LIST'),
  prefix: z.string().optional()
});

export const imageDeleteSchema = z.object({
  event: z.literal('IMAGE_DELETE'),
  key: z.string().min(1)
});

// --- AI ---
export const aiPolishSchema = z.object({
  event: z.literal('AI_POLISH'),
  text: z.string().min(1).max(10000)
});

export const aiMetadataSchema = z.object({
  event: z.literal('AI_METADATA'),
  content: z.string().min(1).max(20000)
});

export const aiModerateSchema = z.object({
  event: z.literal('AI_MODERATE'),
  content: z.string().min(1).max(2000)
});

// --- 定时任务 ---
export const scheduleCreateSchema = z.object({
  event: z.literal('SCHEDULE_CREATE'),
  collection: z.enum(['essay', 'bits', 'memo']),
  slug: z.string().min(1),
  scheduledAt: z.string().min(1) // ISO8601
});

export const scheduleCancelSchema = z.object({
  event: z.literal('SCHEDULE_CANCEL'),
  id: z.string().min(1)
});

// --- 配置 ---
export const configUpdateSchema = z.object({
  event: z.literal('CONFIG_UPDATE'),
  key: z.string().min(1),
  value: z.unknown(),
  revision: z.number().int().positive().optional() // 乐观锁
});

export const themeSettingsSaveSchema = z.object({
  event: z.literal('THEME_SETTINGS_SAVE'),
  settings: z.record(z.unknown()),
  deploy: z.boolean().optional()
});

// --- 审计 ---
export const auditListSchema = z.object({
  event: z.literal('AUDIT_LIST'),
  action: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional()
});

/** 根据事件名解析请求体，返回校验结果 */
export function validateEvent(
  event: string,
  body: unknown
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const schemaMap: Record<string, z.ZodType> = {
    AUTH_LOGIN: authLoginSchema,
    CSRF_ISSUE: csrfIssueSchema,
    COMMENT_SUBMIT: commentSubmitSchema,
    COMMENT_MODERATE: commentModerateSchema,
    COMMENT_DELETE: commentDeleteSchema,
    COMMENT_LIST: z.object({ event: z.literal('COMMENT_LIST'), status: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }),
    CONTENT_LIST: contentListSchema,
    CONTENT_GET: contentGetSchema,
    CONTENT_SAVE: contentSaveSchema,
    CONTENT_DELETE: contentDeleteSchema,
    CONTENT_SEARCH: contentSearchSchema,
    CONTENT_PUBLISH: contentPublishSchema,
    CONTENT_PULL_SOURCE: contentPullSourceSchema,
    DATA_SAVE: dataSaveSchema,
    MEMOS_SYNC: memosSyncSchema,
    IMAGE_LIST: imageListSchema,
    IMAGE_DELETE: imageDeleteSchema,
    AI_POLISH: aiPolishSchema,
    AI_METADATA: aiMetadataSchema,
    AI_MODERATE: aiModerateSchema,
    SCHEDULE_CREATE: scheduleCreateSchema,
    SCHEDULE_CANCEL: scheduleCancelSchema,
    SCHEDULE_LIST: z.object({ event: z.literal('SCHEDULE_LIST') }),
    CONFIG_GET: z.object({ event: z.literal('CONFIG_GET') }),
    CONFIG_UPDATE: configUpdateSchema,
    THEME_SETTINGS_SAVE: themeSettingsSaveSchema,
    AUDIT_LIST: auditListSchema,
    HEALTH_CHECK: z.object({ event: z.literal('HEALTH_CHECK') }),
    STATS_GET: z.object({ event: z.literal('STATS_GET') })
  };

  const schema = schemaMap[event];
  if (!schema) {
    return { success: false, errors: [`未知事件: ${event}`] };
  }

  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join('.') || 'root'}: ${e.message}`)
  };
}
