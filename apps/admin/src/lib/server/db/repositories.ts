// ============================================================================
// schedules / audit / ratelimit / stats 表操作
// ============================================================================

import { DB } from './client';

// ---------------------------------------------------------------------------
// schedules：定时发布任务
// ---------------------------------------------------------------------------
export type ScheduleStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ScheduleRow {
  id: string;
  collection: string;
  slug: string;
  scheduled_at: string;
  status: ScheduleStatus;
  deploy_triggered: number;
  created_at: string;
  triggered_at: string | null;
  error: string | null;
}

export class SchedulesRepo {
  constructor(private db: DB) {}

  async list(): Promise<ScheduleRow[]> {
    return this.db.all<ScheduleRow>(`SELECT * FROM schedules ORDER BY scheduled_at DESC`);
  }

  async findById(id: string): Promise<ScheduleRow | null> {
    return this.db.one<ScheduleRow>(`SELECT * FROM schedules WHERE id = ?`, id);
  }

  async create(data: {
    id: string;
    collection: string;
    slug: string;
    scheduledAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO schedules (id, collection, slug, scheduled_at, status, deploy_triggered, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
      data.id,
      data.collection,
      data.slug,
      data.scheduledAt,
      now
    );
  }

  /** 取消任务（仅 pending 可取消） */
  async cancel(id: string): Promise<boolean> {
    const result = await this.db.raw
      .prepare(`UPDATE schedules SET status = 'cancelled' WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  /** 查询所有到期但未处理的任务 */
  async findDue(): Promise<ScheduleRow[]> {
    return this.db.all<ScheduleRow>(
      `SELECT * FROM schedules
       WHERE status = 'pending' AND scheduled_at <= datetime('now')
       ORDER BY scheduled_at ASC`
    );
  }

  /**
   * 原子地抢占一个任务（乐观锁，防并发）。
   * 多个 cron 实例同时运行时，只有一个能把 pending 改成 running。
   */
  async acquire(id: string): Promise<ScheduleRow | null> {
    const result = await this.db.raw
      .prepare(
        `UPDATE schedules SET status = 'running' WHERE id = ? AND status = 'pending' RETURNING *`
      )
      .bind(id)
      .first<ScheduleRow>();
    return result ?? null;
  }

  /** 标记任务完成 */
  async markDone(id: string): Promise<void> {
    await this.db.exec(
      `UPDATE schedules SET status = 'done', deploy_triggered = 1, triggered_at = datetime('now') WHERE id = ?`,
      id
    );
  }

  /** 标记任务失败 */
  async markFailed(id: string, error: string): Promise<void> {
    await this.db.exec(
      `UPDATE schedules SET status = 'failed', error = ?, triggered_at = datetime('now') WHERE id = ?`,
      error,
      id
    );
  }
}

// ---------------------------------------------------------------------------
// audit：审计日志
// ---------------------------------------------------------------------------
export interface AuditRow {
  id: string;
  session_id: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

export class AuditRepo {
  constructor(private db: DB) {}

  async log(data: {
    sessionId: string | null;
    action: string;
    target?: string;
    detail?: unknown;
    ip?: string;
  }): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.exec(
      `INSERT INTO audit (id, session_id, action, target, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      id,
      data.sessionId,
      data.action,
      data.target ?? null,
      data.detail ? JSON.stringify(data.detail) : null,
      data.ip ?? null
    );
  }

  async list(opts: {
    action?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ items: AuditRow[]; total: number }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, opts.pageSize ?? 30);
    const offset = (page - 1) * pageSize;
    const where = opts.action ? `WHERE action = ?` : '';
    const items = await this.db.all<AuditRow>(
      `SELECT * FROM audit ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...(opts.action ? [opts.action, pageSize, offset] : [pageSize, offset])
    );
    const totalRow = await this.db.one<{ c: number }>(
      `SELECT COUNT(*) as c FROM audit ${where}`,
      ...(opts.action ? [opts.action] : [])
    );
    return { items, total: totalRow?.c ?? 0 };
  }
}

// ---------------------------------------------------------------------------
// ratelimit：分布式限流
// ---------------------------------------------------------------------------
export class RatelimitRepo {
  constructor(private db: DB) {}

  /**
   * 检查并计数。返回 { allowed, count, limit }。
   * 基于 IP + 窗口（分钟级）的计数器，跨实例生效。
   */
  async check(ip: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number }> {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000)).toISOString();

    // 原子 upsert：如果 (ip, window_start) 不存在则插入 0，再更新
    await this.db.exec(
      `INSERT OR IGNORE INTO ratelimit (ip, window_start, count) VALUES (?, ?, 0)`,
      ip,
      windowStart
    );
    const row = await this.db.raw
      .prepare(`UPDATE ratelimit SET count = count + 1 WHERE ip = ? AND window_start = ? RETURNING count`)
      .bind(ip, windowStart)
      .first<{ count: number }>();

    const count = row?.count ?? 1;
    return { allowed: count <= limit, count };
  }

  /** 定期清理过期记录 */
  async cleanup(maxAgeSeconds: number): Promise<void> {
    const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
    await this.db.exec(`DELETE FROM ratelimit WHERE window_start < ?`, cutoff);
  }
}

// ---------------------------------------------------------------------------
// stats：系统统计
// ---------------------------------------------------------------------------
export class StatsRepo {
  constructor(private db: DB) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.db.one<{ value: string }>(`SELECT value FROM stats WHERE key = ?`, key);
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as T;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    await this.db.exec(
      `INSERT INTO stats (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      key,
      json
    );
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.all<{ key: string; value: string }>(`SELECT key, value FROM stats`);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  }
}
