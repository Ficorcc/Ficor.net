import type { RequestHandler } from './$types';
import { withFiscus } from '$lib/server/fiscus/runtime';
import { getRuntimeEnv, runRuntimeTask } from "$lib/server/fiscus/runtime";
import {
  checkRateLimit,
  ensureParentIsValid,
  getApprovedCountByAuthor,
  insertComment,
  listApprovedComments,
  toPublicComment,
} from "$lib/server/fiscus/db";
import { badRequest, json, readJson } from "$lib/server/fiscus/http";
import { sendCommentNotification } from "$lib/server/fiscus/mail";
import { moderateContent, shouldAutoApprove, validateCommentInput } from "$lib/server/fiscus/moderation";
import { emailHash, getClientUserAgent, ipHash, normalizeUrl } from "$lib/server/fiscus/security";
import { getCommentSettings, getPublicCommentSettings } from "$lib/server/fiscus/settings";
import type { NewCommentInput } from "$lib/server/fiscus/types";



const getComments: RequestHandler = async ({ url }) => {
  const pageId = url.searchParams.get("pageId") || url.searchParams.get("path");
  if (!pageId) return badRequest("Missing pageId.");

  const comments = await listApprovedComments(pageId);
  const settings = await getPublicCommentSettings();
  return json({ comments, settings });
};

const postComment: RequestHandler = async (context) => {
  const body = await readJson<Partial<NewCommentInput>>(context.request);
  if (!body) return badRequest("Invalid JSON body.");

  const validation = validateCommentInput(body);
  if (!validation.ok) return badRequest("Invalid comment.", validation.errors);

  const input = validation.value;
  const settings = await getCommentSettings();

  if (!settings.commentsEnabled) {
    return json({ error: "Comments are closed." }, { status: 403 });
  }

  if (input.website) {
    return json({ ok: true, status: "pending" }, { status: 202 });
  }

  input.authorUrl = normalizeUrl(input.authorUrl || "") || "";

  const ipHashValue = await ipHash(context.request);
  const rateLimit = await checkRateLimit(ipHashValue, {
    max: settings.maxPerWindow,
    seconds: settings.rateWindowSeconds,
  });
  if (!rateLimit.allowed) {
    return json({ error: "Too many comments. Please try again later." }, { status: 429 });
  }

  const validParent = await ensureParentIsValid(input.parentId || "", input.pageId);
  if (!validParent) return badRequest("Invalid parent comment.");

  const authorEmailHash = await emailHash(input.authorEmail);
  const approvedCount = await getApprovedCountByAuthor(authorEmailHash);
  const moderation = moderateContent(input, settings);
  const status =
    moderation.status === "spam"
      ? "spam"
      : shouldAutoApprove(approvedCount, settings)
        ? "approved"
        : moderation.status;

  const row = await insertComment({
    input,
    authorEmailHash,
    ipHashValue,
    userAgent: getClientUserAgent(context.request),
    status,
    approvedCount,
  });
  const publicComment = toPublicComment(row);
  const env = getRuntimeEnv();
  const pageUrl = new URL(input.pageId, settings.siteUrl || env.COMMENT_SITE_URL || context.url.origin).toString();

  const notification = sendCommentNotification({ comment: publicComment, pageUrl, settings });
  await runRuntimeTask(context, notification);

  return json({
    ok: true,
    status,
    comment: status === "approved" ? publicComment : null,
    message: status === "approved" ? settings.approvedMessage : settings.pendingMessage,
  });
};

export const GET: RequestHandler = (event) => {
  if (!event.platform?.env?.DB) return json({ error: '评论服务未配置' }, { status: 503 });
  return withFiscus(event.platform.env, () => getComments(event));
};
export const POST: RequestHandler = (event) => {
  if (!event.platform?.env?.DB) return json({ error: '评论服务未配置' }, { status: 503 });
  if (event.request.headers.get('origin') !== event.url.origin) return json({ error: '不允许跨站提交评论' }, { status: 403 });
  return withFiscus(event.platform.env, () => postComment(event));
};
