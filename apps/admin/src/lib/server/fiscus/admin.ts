import { error } from '@sveltejs/kit';
import { withFiscus } from './runtime';
import { getCommentById, updateCommentStatus } from './db';
import type { CommentRow, CommentStatus } from './types';

export async function countComments(env: App.Platform['env']): Promise<Record<string, number>> {
  const rows = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM fiscus_comments GROUP BY status').all<{ status: string; count: number }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.status, r.count]));
}
export async function listComments(env: App.Platform['env'], status = 'pending', page = 1, pageSize = 20) {
  const counts = await countComments(env);
  const result = await env.DB.prepare('SELECT * FROM fiscus_comments WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(status, pageSize, (page - 1) * pageSize).all<CommentRow>();
  return {
    items: (result.results ?? []).map((row) => ({ ...row, author: row.author_name, email: row.author_email, post_title: row.page_title })),
    total: counts[status] ?? 0, counts
  };
}
export async function moderateComment(env: App.Platform['env'], id: string, status: string) {
  if (!['pending', 'approved', 'spam', 'deleted', 'rejected'].includes(status)) throw error(400, '无效的评论状态');
  return withFiscus(env, async () => {
    if (!await getCommentById(id)) throw error(404, '评论不存在');
    // Retain the row so replies and audit history keep valid references.
    return updateCommentStatus(id, (status === 'deleted' ? 'rejected' : status) as CommentStatus);
  });
}
