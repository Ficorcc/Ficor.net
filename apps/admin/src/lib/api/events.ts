// ============================================================================
// 事件枚举
// 所有 API 请求通过 event 字段区分操作类型
// ============================================================================

export const Event = {
  // 鉴权
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  CSRF_ISSUE: 'CSRF_ISSUE',

  // 评论
  COMMENT_SUBMIT: 'COMMENT_SUBMIT',
  COMMENT_MODERATE: 'COMMENT_MODERATE',
  COMMENT_DELETE: 'COMMENT_DELETE',
  COMMENT_LIST: 'COMMENT_LIST',

  // 内容
  CONTENT_LIST: 'CONTENT_LIST',
  CONTENT_GET: 'CONTENT_GET',
  CONTENT_SAVE: 'CONTENT_SAVE',
  CONTENT_DELETE: 'CONTENT_DELETE',
  CONTENT_SEARCH: 'CONTENT_SEARCH',
  CONTENT_PUBLISH: 'CONTENT_PUBLISH',
  CONTENT_PULL_SOURCE: 'CONTENT_PULL_SOURCE',

  // 主站数据
  DATA_SAVE: 'DATA_SAVE',
  MEMOS_SYNC: 'MEMOS_SYNC',

  // 图片
  IMAGE_LIST: 'IMAGE_LIST',
  IMAGE_UPLOAD: 'IMAGE_UPLOAD',
  IMAGE_DELETE: 'IMAGE_DELETE',

  // AI
  AI_POLISH: 'AI_POLISH',
  AI_METADATA: 'AI_METADATA',
  AI_MODERATE: 'AI_MODERATE',

  // 定时任务
  SCHEDULE_CREATE: 'SCHEDULE_CREATE',
  SCHEDULE_CANCEL: 'SCHEDULE_CANCEL',
  SCHEDULE_LIST: 'SCHEDULE_LIST',

  // 配置
  CONFIG_GET: 'CONFIG_GET',
  CONFIG_UPDATE: 'CONFIG_UPDATE',
  THEME_SETTINGS_SAVE: 'THEME_SETTINGS_SAVE',

  // 审计
  AUDIT_LIST: 'AUDIT_LIST',

  // 健康
  HEALTH_CHECK: 'HEALTH_CHECK',

  // 统计
  STATS_GET: 'STATS_GET'
} as const;

export type EventType = (typeof Event)[keyof typeof Event];

/** 需要 CSRF 校验的 mutation 事件 */
export const MUTATION_EVENTS: ReadonlySet<string> = new Set([
  Event.COMMENT_MODERATE,
  Event.COMMENT_DELETE,
  Event.CONTENT_SAVE,
  Event.CONTENT_DELETE,
  Event.CONTENT_PUBLISH,
  Event.CONTENT_PULL_SOURCE,
  Event.DATA_SAVE,
  Event.MEMOS_SYNC,
  Event.IMAGE_UPLOAD,
  Event.IMAGE_DELETE,
  Event.AI_POLISH,
  Event.AI_METADATA,
  Event.AI_MODERATE,
  Event.SCHEDULE_CREATE,
  Event.SCHEDULE_CANCEL,
  Event.CONFIG_UPDATE,
  Event.THEME_SETTINGS_SAVE
]);

/** 不需要登录的公开事件 */
export const PUBLIC_EVENTS: ReadonlySet<string> = new Set([
  Event.AUTH_LOGIN,
  Event.COMMENT_SUBMIT
]);

/** 是否为合法事件 */
export function isValidEvent(event: string): event is EventType {
  return Object.values(Event).includes(event as EventType);
}
