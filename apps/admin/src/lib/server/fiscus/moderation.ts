import { getRuntimeEnv } from "./runtime";
import type { CommentSettings } from "./settings";
import type { ModerationResult, NewCommentInput } from "./types";

const MAX_CONTENT_LENGTH = 4000;
const MIN_CONTENT_LENGTH = 2;

export function validateCommentInput(input: Partial<NewCommentInput>) {
  const errors: Record<string, string> = {};
  const pageId = input.pageId?.trim();
  const authorName = input.authorName?.trim();
  const authorEmail = input.authorEmail?.trim().toLowerCase();
  const content = input.content?.trim();

  if (!pageId || pageId.length > 240 || !isInternalPageId(pageId)) errors.pageId = "Invalid page id.";
  if (!authorName || authorName.length > 80) errors.authorName = "Invalid author name.";
  if (!authorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
    errors.authorEmail = "Invalid email.";
  }
  if (!content || content.length < MIN_CONTENT_LENGTH || content.length > MAX_CONTENT_LENGTH) {
    errors.content = `Comment must be ${MIN_CONTENT_LENGTH}-${MAX_CONTENT_LENGTH} characters.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false as const, errors };
  }

  return {
    ok: true as const,
    value: {
      pageId: pageId as string,
      pageTitle: input.pageTitle?.trim().slice(0, 180) || "",
      parentId: input.parentId?.trim() || "",
      authorName: authorName as string,
      authorEmail: authorEmail as string,
      authorUrl: input.authorUrl?.trim() || "",
      content: content as string,
      website: input.website?.trim() || "",
    },
  };
}

function isInternalPageId(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\0\r\n]/.test(value);
}

export function moderateContent(input: NewCommentInput, settings?: Pick<CommentSettings, "blockedWords">): ModerationResult {
  const env = getRuntimeEnv();
  const blockedWords = (settings?.blockedWords ?? env.COMMENT_BLOCKED_WORDS ?? "")
    .split(",")
    .map((word: string) => word.trim().toLowerCase())
    .filter(Boolean);
  const haystack = `${input.authorName}\n${input.authorEmail}\n${input.authorUrl || ""}\n${input.content}`.toLowerCase();

  if (blockedWords.some((word: string) => haystack.includes(word))) {
    return { status: "spam", reason: "Blocked word matched." };
  }

  const linkCount = (input.content.match(/https?:\/\//g) || []).length;
  if (linkCount >= 3) {
    return { status: "pending", reason: "Many links need review." };
  }

  return { status: "pending", reason: "Default review queue." };
}

export function shouldAutoApprove(
  approvedCount: number,
  settings?: Pick<CommentSettings, "autoApprove" | "trustedAuthorAutoApproveCount">,
) {
  const env = getRuntimeEnv();
  if (settings?.autoApprove ?? env.COMMENT_AUTO_APPROVE === "true") return true;

  const trustedCount =
    settings?.trustedAuthorAutoApproveCount ??
    Number.parseInt(env.TRUSTED_AUTHOR_AUTO_APPROVE_COUNT || "3", 10);
  return Number.isFinite(trustedCount) && trustedCount > 0 && approvedCount >= trustedCount;
}
