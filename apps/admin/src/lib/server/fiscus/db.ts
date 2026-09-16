import { getRuntimeEnv } from './runtime';
import { emailHash } from './crypto';
import { externalCommentId, externalParentId } from './importers';
import { levelForApprovedCount } from './levels';
import type { CommentRow, CommentStatus, ExternalCommentInput, NewCommentInput, PublicComment } from './types';
export function getDb(): D1Database { return getRuntimeEnv().DB; }

export function toPublicComment(row: CommentRow): PublicComment {
  return {
    id: row.id,
    pageId: row.page_id,
    pageTitle: row.page_title,
    parentId: row.parent_id,
    authorName: row.author_name,
    authorUrl: row.author_url,
    content: row.content,
    status: row.status,
    level: {
      label: row.level_label,
      score: row.level_score,
    },
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

export async function listApprovedComments(pageId: string, limit = 200) {
  const result = await getDb()
    .prepare(
      `SELECT * FROM fiscus_comments
       WHERE page_id = ? AND status = 'approved'
       ORDER BY created_at ASC
       LIMIT ?`,
    )
    .bind(pageId, limit)
    .all<CommentRow>();

  return (result.results || []).map(toPublicComment);
}

export async function listCommentsForAdmin(status: CommentStatus, limit = 100) {
  const result = await getDb()
    .prepare(
      `SELECT * FROM fiscus_comments
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(status, limit)
    .all<CommentRow>();

  return result.results || [];
}

export async function getApprovedCountByAuthor(authorEmailHash: string) {
  const row = await getDb()
    .prepare("SELECT COUNT(*) AS count FROM fiscus_comments WHERE author_email_hash = ? AND status = 'approved'")
    .bind(authorEmailHash)
    .first<{ count: number }>();

  return row?.count || 0;
}

export async function getCommentById(id: string) {
  return getDb().prepare("SELECT * FROM fiscus_comments WHERE id = ?").bind(id).first<CommentRow>();
}

export async function ensureParentIsValid(parentId: string, pageId: string) {
  if (!parentId) return true;
  const parent = await getDb()
    .prepare("SELECT id FROM fiscus_comments WHERE id = ? AND page_id = ? AND status = 'approved'")
    .bind(parentId, pageId)
    .first<{ id: string }>();
  return Boolean(parent);
}

export async function insertComment(options: {
  input: NewCommentInput;
  authorEmailHash: string;
  ipHashValue: string;
  userAgent: string;
  status: CommentStatus;
  approvedCount: number;
}) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const level = levelForApprovedCount(options.approvedCount);
  const approvedAt = options.status === "approved" ? now : null;

  await getDb()
    .prepare(
      `INSERT INTO fiscus_comments (
        id, page_id, page_title, parent_id, author_name, author_email,
        author_email_hash, author_url, content, status, level_label, level_score,
        ip_hash, user_agent, created_at, updated_at, approved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      options.input.pageId,
      options.input.pageTitle || null,
      options.input.parentId || null,
      options.input.authorName,
      options.input.authorEmail,
      options.authorEmailHash,
      options.input.authorUrl || null,
      options.input.content,
      options.status,
      level.label,
      level.score,
      options.ipHashValue,
      options.userAgent,
      now,
      now,
      approvedAt,
    )
    .run();

  const row = await getCommentById(id);
  if (!row) throw new Error("Comment insert failed.");
  return row;
}

export async function updateCommentStatus(id: string, status: CommentStatus, reason = "") {
  const now = new Date().toISOString();
  const approvedAt = status === "approved" ? now : null;

  await getDb()
    .prepare("UPDATE fiscus_comments SET status = ?, updated_at = ?, approved_at = ? WHERE id = ?")
    .bind(status, now, approvedAt, id)
    .run();

  await getDb()
    .prepare("INSERT INTO fiscus_comment_moderation_logs (id, comment_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), id, status, reason, now)
    .run();

  return getCommentById(id);
}

export async function checkRateLimit(key: string, options?: { max?: number; seconds?: number }) {
  const env = getRuntimeEnv();
  const max = options?.max ?? Number.parseInt(env.COMMENT_MAX_PER_WINDOW || "5", 10);
  const seconds = options?.seconds ?? Number.parseInt(env.COMMENT_RATE_WINDOW_SECONDS || "600", 10);
  const windowSize = Math.max(seconds, 60) * 1000;
  const windowStart = Math.floor(Date.now() / windowSize) * windowSize;
  const row = await getDb()
    .prepare(
      `INSERT INTO fiscus_comment_rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN fiscus_comment_rate_limits.window_start = excluded.window_start
             THEN fiscus_comment_rate_limits.count + 1
           ELSE 1
         END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return { allowed: count <= max, remaining: Math.max(max - count, 0) };
}

export async function getCommentStats() {
  const statusRows = await getDb()
    .prepare("SELECT status, COUNT(*) AS count FROM fiscus_comments GROUP BY status")
    .all<{ status: string; count: number }>();
  const pageRows = await getDb()
    .prepare(
      `SELECT page_id, page_title, COUNT(*) AS count
       FROM fiscus_comments
       GROUP BY page_id, page_title
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all<{ page_id: string; page_title: string | null; count: number }>();
  const authorRows = await getDb()
    .prepare(
      `SELECT author_name, author_email_hash, COUNT(*) AS count
       FROM fiscus_comments
       WHERE status = 'approved'
       GROUP BY author_email_hash, author_name
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all<{ author_name: string; author_email_hash: string; count: number }>();

  return {
    byStatus: statusRows.results || [],
    topPages: pageRows.results || [],
    topAuthors: authorRows.results || [],
  };
}

export async function exportCommentData() {
  const db = getDb();
  const comments = await db.prepare("SELECT * FROM fiscus_comments ORDER BY created_at ASC").all<CommentRow>();
  const settings = await db.prepare("SELECT key, value, updated_at FROM fiscus_comment_settings ORDER BY key ASC").all();
  const moderationLogs = await db
    .prepare("SELECT * FROM fiscus_comment_moderation_logs ORDER BY created_at ASC")
    .all();
  const syncLogs = await db.prepare("SELECT * FROM fiscus_comment_sync_logs ORDER BY created_at ASC").all();

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    comments: comments.results || [],
    settings: settings.results || [],
    moderationLogs: moderationLogs.results || [],
    syncLogs: syncLogs.results || [],
  };
}

export async function importCommentData(payload: {
  comments?: CommentRow[];
  settings?: Array<{ key: string; value: string; updated_at?: string }>;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  let commentsImported = 0;
  let settingsImported = 0;

  for (const row of payload.comments || []) {
    if (!row.id || !row.page_id || !row.author_name || !row.author_email || !row.content) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO fiscus_comments (
          id, page_id, page_title, parent_id, author_name, author_email,
          author_email_hash, author_url, content, status, level_label, level_score,
          ip_hash, user_agent, created_at, updated_at, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.page_id,
        row.page_title || null,
        row.parent_id || null,
        row.author_name,
        row.author_email,
        row.author_email_hash,
        row.author_url || null,
        row.content,
        row.status || "pending",
        row.level_label || "访客",
        row.level_score || 0,
        row.ip_hash || null,
        row.user_agent || null,
        row.created_at || now,
        row.updated_at || now,
        row.approved_at || null,
      )
      .run();
    commentsImported += 1;
  }

  for (const setting of payload.settings || []) {
    if (!setting.key || typeof setting.value !== "string") continue;
    await db
      .prepare("INSERT OR REPLACE INTO fiscus_comment_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .bind(setting.key, setting.value, setting.updated_at || now)
      .run();
    settingsImported += 1;
  }

  return { commentsImported, settingsImported };
}

export async function importExternalComments(source: string, comments: ExternalCommentInput[]) {
  const db = getDb();
  const now = new Date().toISOString();
  const importedIds = new Set<string>();
  let importedCount = 0;
  let skippedCount = 0;

  for (const comment of comments) {
    const id = await externalCommentId(comment);
    const existingComment = await getCommentById(id);
    if (existingComment) {
      skippedCount += 1;
      continue;
    }

    const parentId = await resolveExternalParentId(comment, importedIds);
    const createdAt = comment.createdAt || now;
    const approvedAt = comment.status === "approved" ? createdAt : null;
    const authorEmail = comment.authorEmail || `${id}@imported.invalid`;
    await db
      .prepare(
        `INSERT OR IGNORE INTO fiscus_comments (
          id, page_id, page_title, parent_id, author_name, author_email,
          author_email_hash, author_url, content, status, level_label, level_score,
          ip_hash, user_agent, created_at, updated_at, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        comment.pageId,
        comment.pageTitle || null,
        parentId || null,
        comment.authorName,
        authorEmail,
        await emailHash(authorEmail),
        comment.authorUrl || null,
        comment.content,
        comment.status,
        "导入",
        0,
        null,
        comment.userAgent || null,
        createdAt,
        now,
        approvedAt,
      )
      .run();

    importedCount += 1;
    importedIds.add(id);
  }

  await logImport(source, "merge", importedCount, skippedCount, `Parsed ${comments.length} comments.`);
  return { importedCount, skippedCount, parsedCount: comments.length };
}

export async function replaceCommentData(payload: {
  comments?: CommentRow[];
  settings?: Array<{ key: string; value: string; updated_at?: string }>;
}) {
  const db = getDb();
  await db.batch([
    db.prepare("DELETE FROM fiscus_comment_moderation_logs"),
    db.prepare("DELETE FROM fiscus_comments"),
    db.prepare("DELETE FROM fiscus_comment_rate_limits"),
  ]);
  return importCommentData(payload);
}

export async function logSync(action: string, status: string, detail = "") {
  await getDb()
    .prepare("INSERT INTO fiscus_comment_sync_logs (id, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), action, status, detail.slice(0, 1000), new Date().toISOString())
    .run();
}

export async function logImport(source: string, mode: string, importedCount: number, skippedCount: number, detail = "") {
  await getDb()
    .prepare(
      "INSERT INTO fiscus_comment_import_logs (id, source, mode, imported_count, skipped_count, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), source, mode, importedCount, skippedCount, detail.slice(0, 1000), new Date().toISOString())
    .run();
}

async function resolveExternalParentId(comment: ExternalCommentInput, importedIds: Set<string>) {
  const parentId = await externalParentId(comment);
  if (!parentId) return "";
  if (importedIds.has(parentId)) return parentId;

  const existing = await getCommentById(parentId);
  return existing ? parentId : "";
}
