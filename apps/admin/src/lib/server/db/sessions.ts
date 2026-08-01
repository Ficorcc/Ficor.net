// ============================================================================
// sessions 表操作
// ============================================================================

import { DB } from './client';

export interface SessionRow {
  id: string;
  token: string;
  csrf_token: string;
  ip: string | null;
  ua: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
}

export class SessionsRepo {
  constructor(private db: DB) {}

  /** 按 token 查找有效会话 */
  async findByToken(token: string): Promise<SessionRow | null> {
    return this.db.one<SessionRow>(
      `SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now') LIMIT 1`,
      token
    );
  }

  /** 创建新会话 */
  async create(data: {
    id: string;
    token: string;
    csrfToken: string;
    ip: string;
    ua: string;
    expiresAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO sessions (id, token, csrf_token, ip, ua, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      data.id,
      data.token,
      data.csrfToken,
      data.ip,
      data.ua,
      now,
      data.expiresAt,
      now
    );
  }

  /** 更新最后活跃时间（滑动续期用） */
  async touch(id: string): Promise<void> {
    await this.db.exec(`UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?`, id);
  }

  /** 延长会话过期时间（滑动续期） */
  async updateExpires(id: string, expiresAt: string): Promise<void> {
    await this.db.exec(`UPDATE sessions SET expires_at = ? WHERE id = ?`, expiresAt, id);
  }

  /** 删除会话（登出） */
  async delete(id: string): Promise<void> {
    await this.db.exec(`DELETE FROM sessions WHERE id = ?`, id);
  }

  /** 删除所有过期会话（清理） */
  async deleteExpired(): Promise<void> {
    await this.db.exec(`DELETE FROM sessions WHERE expires_at <= datetime('now')`);
  }

  /** 轮换 CSRF token */
  async rotateCsrf(sessionId: string, newCsrfToken: string): Promise<void> {
    await this.db.exec(`UPDATE sessions SET csrf_token = ? WHERE id = ?`, newCsrfToken, sessionId);
  }
}
