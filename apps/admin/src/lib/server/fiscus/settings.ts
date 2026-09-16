import { getRuntimeEnv } from "./runtime";
import { getDb } from "./db";

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
  commentHeading: string;
  emptyText: string;
  submitLabel: string;
  pendingMessage: string;
  approvedMessage: string;
  allowAuthorUrl: boolean;
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
  commentHeading: "评论",
  emptyText: "还没有评论。",
  submitLabel: "提交评论",
  pendingMessage: "评论已提交，等待审核。",
  approvedMessage: "评论已发布。",
  allowAuthorUrl: true,
  backupSyncEnabled: false,
  backupSyncWebhookUrl: "",
  authOpenRegistration: false,
  authSessionDays: 14,
};

const PUBLIC_SETTING_KEYS: SettingKey[] = [
  "commentsEnabled",
  "commentHeading",
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
  return String(value ?? "").slice(0, 2000);
}
