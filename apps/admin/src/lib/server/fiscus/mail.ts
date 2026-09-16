import { getRuntimeEnv } from "./runtime";
import type { CommentSettings } from "./settings";
import type { PublicComment } from "./types";

interface MailPayload {
  comment: PublicComment;
  pageUrl: string;
  settings?: CommentSettings;
}

export async function sendCommentNotification(payload: MailPayload) {
  const env = getRuntimeEnv();
  const provider = payload.settings?.emailProvider || env.COMMENT_EMAIL_PROVIDER || "none";
  if (provider === "none") return;

  if (provider === "webhook") {
    await sendWebhook(payload);
    return;
  }

  if (provider === "resend") {
    await sendResend(payload);
  }
}

async function sendWebhook(payload: MailPayload) {
  const env = getRuntimeEnv();
  const webhookUrl = payload.settings?.emailWebhookUrl || env.COMMENT_EMAIL_WEBHOOK_URL;
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.COMMENT_EMAIL_WEBHOOK_TOKEN
        ? { authorization: `Bearer ${env.COMMENT_EMAIL_WEBHOOK_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      event: "comment.created",
      site: payload.settings?.siteName || env.COMMENT_SITE_NAME || "Astro Comments",
      ...payload,
    }),
  });
}

async function sendResend(payload: MailPayload) {
  const env = getRuntimeEnv();
  const adminEmail = payload.settings?.adminEmail || env.COMMENT_ADMIN_EMAIL;
  const fromEmail = payload.settings?.fromEmail || env.COMMENT_FROM_EMAIL;
  if (!env.RESEND_API_KEY || !adminEmail || !fromEmail) return;

  const subject = `[${payload.settings?.siteName || env.COMMENT_SITE_NAME || "Astro"}] 新评论等待处理`;
  const text = [
    `页面：${payload.comment.pageTitle || payload.comment.pageId}`,
    `地址：${payload.pageUrl}`,
    `作者：${payload.comment.authorName} (${payload.comment.level.label})`,
    `状态：${payload.comment.status}`,
    "",
    payload.comment.content,
  ].join("\n");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject,
      text,
    }),
  });
}
