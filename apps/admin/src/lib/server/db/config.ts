// ============================================================================
// config 表操作（系统配置 key-value）
// ============================================================================

import { DB } from './client';

export class ConfigRepo {
  constructor(private db: DB) {}

  /** 读取某个配置项（JSON 解析） */
  async get<T = unknown>(key: string): Promise<T | null> {
    const row = await this.db.one<{ value: string }>(`SELECT value FROM config WHERE key = ?`, key);
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  /** 读取多个配置项 */
  async getMany<T = Record<string, unknown>>(keys: string[]): Promise<Record<string, T>> {
    if (keys.length === 0) return {};
    const placeholders = keys.map(() => '?').join(',');
    const rows = await this.db.all<{ key: string; value: string }>(
      `SELECT key, value FROM config WHERE key IN (${placeholders})`,
      ...keys
    );
    const result: Record<string, T> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value) as T;
      } catch {
        // 忽略解析失败
      }
    }
    return result;
  }

  /** 读取所有配置项 */
  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.db.all<{ key: string; value: string }>(`SELECT key, value FROM config`);
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

  /** 写入配置项（带乐观锁，revision 自增） */
  async set(key: string, value: unknown, expectedRevision?: number): Promise<{ revision: number }> {
    const json = JSON.stringify(value);
    const now = new Date().toISOString();
    const existing = await this.db.one<{ revision: number }>(
      `SELECT revision FROM config WHERE key = ?`,
      key
    );

    if (existing) {
      if (expectedRevision !== undefined && expectedRevision !== existing.revision) {
        throw new ConfigConflictError(key, existing.revision, expectedRevision);
      }
      await this.db.exec(
        `UPDATE config SET value = ?, updated_at = ?, revision = revision + 1 WHERE key = ?`,
        json,
        now,
        key
      );
      return { revision: existing.revision + 1 };
    }

    await this.db.exec(
      `INSERT INTO config (key, value, updated_at, revision) VALUES (?, ?, ?, 1)`,
      key,
      json,
      now
    );
    return { revision: 1 };
  }
}

export class ConfigConflictError extends Error {
  constructor(
    public key: string,
    public currentRevision: number,
    public expectedRevision: number
  ) {
    super(`配置 ${key} 已在外部更新（当前 revision=${currentRevision}，期望=${expectedRevision}）`);
    this.name = 'ConfigConflictError';
  }
}
