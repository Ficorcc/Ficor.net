import { getRuntimeEnv } from "./runtime";
import { getDb } from "./db";
import { DEFAULT_LEVELS, parseLevels } from "./levels";

export interface CommentSettings {
  commentsEnabled: boolean;
  autoApprove: boolean;
  trustedAuthorAutoApproveCount: number;
  blockedWords: string;
  maxPerWindow: number;
  rateWindowSeconds: number;
  siteName: string;
  siteUrl: string;
  emailProvider: "none" | "resend" | "webhook";
  adminEmail: string;
  fromEmail: string;
  emailWebhookUrl: string;
  emptyText: string;
  submitLabel: string;
  pendingMessage: string;
  approvedMessage: string;
  /** 是否在评论表单里显示「网址」输入栏（选填项，前台据此隐藏 authorUrl） */
  allowAuthorUrl: boolean;
  /** 评论等级表，JSON 数组字符串（见 levels.ts 的 CommentLevel） */
  commentLevels: string;
  backupSyncEnabled: boolean;
  backupSyncWebhookUrl: string;
  authOpenRegistration: boolean;
  authSessionDays: number;
}

type SettingKey = keyof CommentSettings;

const DEFAULTS: CommentSettings = {
  commentsEnabled: true,
  autoApprove: false,
  trustedAuthorAutoApproveCount: 0,
  blockedWords: "",
  maxPerWindow: 5,
  rateWindowSeconds: 600,
  siteName: "Astro Comments",
  siteUrl: "",
  emailProvider: "none",
  adminEmail: "",
  fromEmail: "",
  emailWebhookUrl: "",
  emptyText: "还没有评论。",
  submitLabel: "提交评论",
  pendingMessage: "评论已提交，等待审核。",
  approvedMessage: "评论已发布。",
  allowAuthorUrl: true,
  commentLevels: JSON.stringify(DEFAULT_LEVELS),
  backupSyncEnabled: false,
  backupSyncWebhookUrl: "",
  authOpenRegistration: false,
  authSessionDays: 14,
};

// 暴露给前台的键。commentHeading 已在 2026-09-20 改版中废弃（去掉标题栏），前端不再读取。
// allowAuthorUrl 曾在同一次改版里一起下线，09-21 恢复「网址」输入栏后重新启用。
const PUBLIC_SETTING_KEYS: SettingKey[] = [
  "commentsEnabled",
  "emptyText",
  "submitLabel",
  "pendingMessage",
  "approvedMessage",
  "allowAuthorUrl",
];

export function getDefaultSettings() {
  return { ...DEFAULTS };
}

export async function getCommentSettings(): Promise<CommentSettings> {
  const result = await getDb().prepare("SELECT key, value FROM fiscus_comment_settings").all<{ key: string; value: string }>();
  const values = new Map((result.results || []).map((row) => [row.key, row.value]));
  const merged = { ...DEFAULTS };

  for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
    const raw = values.get(key) ?? getEnvFallbacks()[key];
    if (raw !== undefined) merged[key] = coerceSettingValue(key, raw) as never;
  }

  return merged;
}

export async function getPublicCommentSettings() {
  const settings = await getCommentSettings();
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((key) => [key, settings[key]]));
}

export async function updateCommentSettings(input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const entries = Object.entries(DEFAULTS)
    .filter(([key]) => key in input)
    .map(([key]) => {
      const settingKey = key as SettingKey;
      return [settingKey, serializeSettingValue(settingKey, input[settingKey])] as const;
    });

  const db = getDb();
  for (const [key, value] of entries) {
    await db
      .prepare("INSERT OR REPLACE INTO fiscus_comment_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .bind(key, value, now)
      .run();
  }

  return getCommentSettings();
}

export function getSecretStatus() {
  const env = getRuntimeEnv();
  return {
    COMMENT_ADMIN_TOKEN: Boolean(env.COMMENT_ADMIN_TOKEN),
    COMMENT_IP_SALT: Boolean(env.COMMENT_IP_SALT),
    RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
    COMMENT_EMAIL_WEBHOOK_TOKEN: Boolean(env.COMMENT_EMAIL_WEBHOOK_TOKEN),
    COMMENT_SYNC_WEBHOOK_TOKEN: Boolean(env.COMMENT_SYNC_WEBHOOK_TOKEN),
    GITHUB_CLIENT_ID: Boolean(env.GITHUB_CLIENT_ID),
    GITHUB_CLIENT_SECRET: Boolean(env.GITHUB_CLIENT_SECRET),
  };
}

function getEnvFallbacks(): Partial<Record<SettingKey, string | undefined>> {
  const env = getRuntimeEnv();
  return {
    autoApprove: env.COMMENT_AUTO_APPROVE,
    trustedAuthorAutoApproveCount: env.TRUSTED_AUTHOR_AUTO_APPROVE_COUNT,
    blockedWords: env.COMMENT_BLOCKED_WORDS,
    maxPerWindow: env.COMMENT_MAX_PER_WINDOW,
    rateWindowSeconds: env.COMMENT_RATE_WINDOW_SECONDS,
    siteName: env.COMMENT_SITE_NAME,
    siteUrl: env.COMMENT_SITE_URL,
    emailProvider: env.COMMENT_EMAIL_PROVIDER,
    adminEmail: env.COMMENT_ADMIN_EMAIL,
    fromEmail: env.COMMENT_FROM_EMAIL,
    emailWebhookUrl: env.COMMENT_EMAIL_WEBHOOK_URL,
    backupSyncWebhookUrl: env.COMMENT_SYNC_WEBHOOK_URL,
    authOpenRegistration: env.COMMENT_AUTH_OPEN_REGISTRATION,
    authSessionDays: env.COMMENT_AUTH_SESSION_DAYS,
  };
}

function coerceSettingValue(key: SettingKey, value: string) {
  const defaultValue = DEFAULTS[key];
  if (typeof defaultValue === "boolean") return value === "true";
  if (typeof defaultValue === "number") {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : defaultValue;
  }
  if (key === "emailProvider") {
    return value === "resend" || value === "webhook" ? value : "none";
  }
  // 等级表统一归一化后再落库，坏值自动回落默认，避免脏 JSON 流到判定逻辑里
  if (key === "commentLevels") {
    return JSON.stringify(parseLevels(value));
  }
  return value;
}

function serializeSettingValue(key: SettingKey, value: unknown) {
  const defaultValue = DEFAULTS[key];
  if (typeof defaultValue === "boolean") return value === true || value === "true" ? "true" : "false";
  if (typeof defaultValue === "number") {
    const number = Number.parseInt(String(value), 10);
    return String(Number.isFinite(number) ? Math.max(number, 0) : defaultValue);
  }
  if (key === "emailProvider") {
    return value === "resend" || value === "webhook" ? value : "none";
  }
  // 前端可以直接传数组，也可以传 JSON 字符串；两种都归一化成紧凑 JSON
  if (key === "commentLevels") {
    return JSON.stringify(parseLevels(value));
  }
  return String(value ?? "").slice(0, 2000);
}
