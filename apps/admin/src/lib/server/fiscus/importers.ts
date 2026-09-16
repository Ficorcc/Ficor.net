import { sha256 } from "./crypto";
import type { CommentStatus, ExternalCommentInput, ExternalCommentSource } from "./types";

interface ImportOptions {
  source: ExternalCommentSource;
  data: string;
  fallbackPageId?: string;
  defaultStatus?: CommentStatus;
}

const EMAIL_PLACEHOLDER_DOMAIN = "imported.invalid";

export async function parseExternalComments(options: ImportOptions) {
  const source = options.source || "generic";
  const fallbackPageId = cleanPath(options.fallbackPageId || "/imported-comments");
  const defaultStatus = options.defaultStatus || "approved";

  let comments: ExternalCommentInput[] = [];
  if (source === "wordpress") comments = parseWordPressWxr(options.data, fallbackPageId, defaultStatus);
  if (source === "typecho") comments = parseTypecho(options.data, fallbackPageId, defaultStatus);
  if (source === "twikoo") comments = parseJsonSource(options.data, "twikoo", fallbackPageId, defaultStatus);
  if (source === "waline") comments = parseJsonSource(options.data, "waline", fallbackPageId, defaultStatus);
  if (source === "generic") comments = parseJsonSource(options.data, "generic", fallbackPageId, defaultStatus);

  const normalized = await Promise.all(comments.map((comment, index) => normalizeExternalComment(comment, index)));
  return normalized.filter((comment) => comment.authorName && comment.content);
}

function parseWordPressWxr(xml: string, fallbackPageId: string, defaultStatus: CommentStatus) {
  const comments: ExternalCommentInput[] = [];
  for (const item of tagBlocks(xml, "item")) {
    const pageTitle = decodeXml(firstTag(item, "title")) || "";
    const link = decodeXml(firstTag(item, "link"));
    const slug = decodeXml(firstTag(item, "wp:post_name"));
    const pageId = cleanPath(pathFromUrl(link) || (slug ? `/${slug}/` : fallbackPageId));

    for (const block of tagBlocks(item, "wp:comment")) {
      const externalId = decodeXml(firstTag(block, "wp:comment_id")) || randomExternalId(block);
      const approved = decodeXml(firstTag(block, "wp:comment_approved"));
      const parent = decodeXml(firstTag(block, "wp:comment_parent"));
      comments.push({
        source: "wordpress",
        externalId,
        pageId,
        pageTitle,
        parentExternalId: parent && parent !== "0" ? parent : "",
        authorName: decodeXml(firstTag(block, "wp:comment_author")) || "WordPress 用户",
        authorEmail: decodeXml(firstTag(block, "wp:comment_author_email")),
        authorUrl: decodeXml(firstTag(block, "wp:comment_author_url")),
        content: decodeXml(firstTag(block, "wp:comment_content")),
        status: mapStatus(approved, defaultStatus),
        createdAt: parseDate(decodeXml(firstTag(block, "wp:comment_date_gmt")) || decodeXml(firstTag(block, "wp:comment_date"))),
      });
    }
  }
  return comments;
}

function parseTypecho(raw: string, fallbackPageId: string, defaultStatus: CommentStatus) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJsonSource(raw, "typecho", fallbackPageId, defaultStatus);
  }

  const comments: ExternalCommentInput[] = [];
  for (const statement of splitSqlStatements(raw)) {
    if (!/insert\s+into\s+[`"]?[\w-]*comments[`"]?/i.test(statement)) continue;
    const parsed = parseInsertStatement(statement);
    if (!parsed) continue;
    for (const row of parsed.rows) {
      const record = Object.fromEntries(parsed.columns.map((column, index) => [column, row[index]]));
      const cid = pick(record, ["cid", "post_id", "postId"]) || "";
      comments.push({
        source: "typecho",
        externalId: pick(record, ["coid", "id", "comment_id"]) || randomExternalId(JSON.stringify(record)),
        pageId: cleanPath(pick(record, ["permalink", "path", "slug"]) || (cid ? `/typecho-${cid}` : fallbackPageId)),
        pageTitle: pick(record, ["title", "post_title"]) || "",
        parentExternalId: normalizeParentExternalId(pick(record, ["parent", "parent_id", "pid"])),
        authorName: pick(record, ["author", "nick", "nickname", "name"]) || "Typecho 用户",
        authorEmail: pick(record, ["mail", "email", "author_email"]),
        authorUrl: pick(record, ["url", "link", "author_url"]),
        content: pick(record, ["text", "content", "comment"]),
        status: mapStatus(pick(record, ["status", "approved"]), defaultStatus),
        createdAt: parseDate(pick(record, ["created", "created_at", "date"])),
        userAgent: pick(record, ["agent", "ua", "user_agent"]),
      });
    }
  }
  return comments;
}

function parseJsonSource(
  raw: string,
  source: ExternalCommentSource,
  fallbackPageId: string,
  defaultStatus: CommentStatus,
) {
  const data = JSON.parse(raw);
  const rows = collectCommentLikeObjects(data);
  return rows.map((record, index) => {
    const externalId = stringValue(pickAny(record, ["id", "_id", "objectId", "comment_id", "coid"])) || String(index + 1);
    return {
      source,
      externalId,
      pageId: cleanPath(
        stringValue(pickAny(record, ["pageId", "page_id", "path", "url", "href", "slug", "permalink"])) || fallbackPageId,
      ),
      pageTitle: stringValue(pickAny(record, ["pageTitle", "page_title", "title"])),
      parentExternalId: normalizeParentExternalId(stringValue(pickAny(record, ["parentId", "parent_id", "parent", "pid", "rid"]))),
      authorName: stringValue(pickAny(record, ["authorName", "author", "nick", "nickname", "name", "mailMd5"])) || `${source} 用户`,
      authorEmail: stringValue(pickAny(record, ["authorEmail", "author_email", "email", "mail"])),
      authorUrl: stringValue(pickAny(record, ["authorUrl", "author_url", "link", "url"])),
      content: stringValue(pickAny(record, ["content", "comment", "text", "body", "orig"])),
      status: mapJsonStatus(record, defaultStatus),
      createdAt: parseDate(pickAny(record, ["createdAt", "created_at", "created", "insertedAt", "time", "date"])),
      userAgent: stringValue(pickAny(record, ["userAgent", "user_agent", "ua", "agent"])),
    };
  });
}

async function normalizeExternalComment(comment: ExternalCommentInput, index: number): Promise<ExternalCommentInput> {
  const externalId = comment.externalId || `${comment.source}-${index + 1}`;
  const email =
    comment.authorEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(comment.authorEmail)
      ? comment.authorEmail.trim().toLowerCase()
      : `${await sha256(`${comment.source}:${externalId}:${comment.authorName}`)}@${EMAIL_PLACEHOLDER_DOMAIN}`;

  return {
    ...comment,
    externalId,
    pageId: cleanPath(comment.pageId || "/imported-comments"),
    parentExternalId: comment.parentExternalId || "",
    authorName: comment.authorName.trim().slice(0, 80) || "导入用户",
    authorEmail: email,
    authorUrl: normalizeExternalUrl(comment.authorUrl),
    content: comment.content.trim().slice(0, 4000),
    createdAt: parseDate(comment.createdAt),
  };
}

export async function externalCommentId(comment: ExternalCommentInput) {
  return `import:${await sha256(`${comment.source}:${comment.externalId}`)}`;
}

export async function externalParentId(comment: ExternalCommentInput) {
  if (!comment.parentExternalId) return "";
  return `import:${await sha256(`${comment.source}:${comment.parentExternalId}`)}`;
}

function tagBlocks(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(xml.matchAll(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi"))).map(
    (match) => match[1],
  );
}

function firstTag(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1]?.trim() || "";
}

function decodeXml(value = "") {
  return value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/g, "$1")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .trim();
}

function parseDate(value: unknown) {
  if (typeof value === "number") {
    const timestamp = value < 100000000000 ? value * 1000 : value;
    return new Date(timestamp).toISOString();
  }
  const raw = String(value || "").trim();
  if (/^\d+$/.test(raw)) return parseDate(Number(raw));
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function mapStatus(value: unknown, fallback: CommentStatus): CommentStatus {
  const raw = String(value ?? "").toLowerCase();
  if (["1", "true", "approved", "approve", "publish", "published"].includes(raw)) return "approved";
  if (["0", "false", "hold", "waiting", "pending", "unapproved"].includes(raw)) return "pending";
  if (["spam", "junk", "true"].includes(raw)) return "spam";
  if (["trash", "deleted", "rejected", "reject"].includes(raw)) return "rejected";
  return fallback;
}

function mapJsonStatus(record: Record<string, unknown>, fallback: CommentStatus): CommentStatus {
  const spam = pickAny(record, ["isSpam", "spam"]);
  if (spam === true || String(spam).toLowerCase() === "true") return "spam";
  return mapStatus(pickAny(record, ["status", "approved", "state"]), fallback);
}

function cleanPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "/imported-comments";
  const path = pathFromUrl(raw) || raw;
  return path.startsWith("/") ? path : `/${path}`;
}

function pathFromUrl(value: string) {
  try {
    return new URL(value).pathname || "/";
  } catch {
    return "";
  }
}

function normalizeExternalUrl(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeParentExternalId(value: string) {
  const raw = String(value || "").trim();
  return raw && raw !== "0" && raw.toLowerCase() !== "null" ? raw : "";
}

function collectCommentLikeObjects(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data.flatMap(collectCommentLikeObjects);
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const directKeys = ["comment", "content", "text", "nick", "author", "mail", "email"];
  const isComment = directKeys.some((key) => key in record) && ["url", "path", "href", "pageId", "cid"].some((key) => key in record);
  const nested = ["comments", "data", "results", "items", "Comment", "comment"].flatMap((key) =>
    key in record ? collectCommentLikeObjects(record[key]) : [],
  );
  return isComment ? [record, ...nested] : nested;
}

function pick(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return "";
}

function pickAny(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
  }
  return "";
}

function stringValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    current += char;
    if (quote) {
      if (char === "\\" && next) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === ";") {
      statements.push(current);
      current = "";
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
}

function parseInsertStatement(statement: string) {
  const match = statement.match(/insert\s+into\s+[`"]?[\w-]*comments[`"]?\s*\(([\s\S]*?)\)\s*values\s*([\s\S]*);?$/i);
  if (!match) return null;
  const columns = match[1].split(",").map((column) => column.replace(/[`"]/g, "").trim());
  return { columns, rows: parseSqlTuples(match[2]) };
}

function parseSqlTuples(valueSql: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quote = "";
  let inTuple = false;
  for (let index = 0; index < valueSql.length; index += 1) {
    const char = valueSql[index];
    const next = valueSql[index + 1];
    if (!inTuple) {
      if (char === "(") inTuple = true;
      continue;
    }
    if (quote) {
      if (char === "\\" && next) {
        value += next;
        index += 1;
      } else if (char === quote) {
        quote = "";
      } else {
        value += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ",") {
      row.push(cleanSqlValue(value));
      value = "";
      continue;
    }
    if (char === ")") {
      row.push(cleanSqlValue(value));
      rows.push(row);
      row = [];
      value = "";
      inTuple = false;
      continue;
    }
    value += char;
  }
  return rows;
}

function cleanSqlValue(value: string) {
  const trimmed = value.trim();
  return /^null$/i.test(trimmed) ? "" : trimmed;
}

function randomExternalId(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return String(hash);
}
