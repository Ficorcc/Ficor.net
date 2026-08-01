// ============================================================================
// comments 表操作
// ============================================================================

import { DB } from './client';

export type CommentStatus = 'pending' | 'approved' | 'spam' | 'deleted';

export interface CommentRow {
  id: string;
  post_id: string | null;
  post_title: string | null;
  author: string;
  email: string | null;
  link: string | null;
  content: string;
  status: CommentStatus;
  source: string;
  ai_verdict: string | null;
  ai_score: number | null;
  created_at: string;
  updated_at: string;
}

export class CommentsRepo {
  constructor(private db: DB) {}

  /** 分页查询评论 */
  async list(opts: {
    status?: CommentStatus;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: CommentRow[]; total: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, opts.pageSize ?? 20);
    const offset = (page - 1) * pageSize;
    const where = opts.status ? `WHERE status = ?` : '';
    const params = opts.status ? [opts.status, pageSize, offset] : [pageSize, offset];

    const items = await this.db.all<CommentRow>(
      `SELECT * FROM comments ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params
    );
    const totalRow = await this.db.one<{ c: number }>(
      `SELECT COUNT(*) as c FROM comments ${where}`,
      ...(opts.status ? [opts.status] : [])
    );
    return { items, total: totalRow?.c ?? 0 };
  }

  /** 按 ID 查找 */
  async findById(id: string): Promise<CommentRow | null> {
    return this.db.one<CommentRow>(`SELECT * FROM comments WHERE id = ?`, id);
  }

  /** 创建评论（公开提交） */
  async create(data: {
    id: string;
    post_id?: string;
    post_title?: string;
    author: string;
    email?: string;
    link?: string;
    content: string;
    source?: string;
    ai_verdict?: string;
    ai_score?: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO comments (id, post_id, post_title, author, email, link, content, status, source, ai_verdict, ai_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      data.id,
      data.post_id ?? null,
      data.post_title ?? null,
      data.author,
      data.email ?? null,
      data.link ?? null,
      data.content,
      data.source ?? 'direct',
      data.ai_verdict ?? null,
      data.ai_score ?? null,
      now,
      now
    );
  }

  /** 更新评论状态 */
  async updateStatus(id: string, status: CommentStatus): Promise<void> {
    await this.db.exec(
      `UPDATE comments SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      status,
      id
    );
  }

  /** 更新 AI 审核结论 */
  async updateAiVerdict(id: string, verdict: string, score: number): Promise<void> {
    await this.db.exec(
      `UPDATE comments SET ai_verdict = ?, ai_score = ?, updated_at = datetime('now') WHERE id = ?`,
      verdict,
      score,
      id
    );
  }

  /** 删除评论 */
  async delete(id: string): Promise<void> {
    await this.db.exec(`DELETE FROM comments WHERE id = ?`, id);
  }

  /** 统计各状态数量 */
  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.db.all<{ status: string; c: number }>(
      `SELECT status, COUNT(*) as c FROM comments GROUP BY status`
    );
    return rows.reduce((acc, r) => {
      acc[r.status] = r.c;
      return acc;
    }, {} as Record<string, number>);
  }
}
