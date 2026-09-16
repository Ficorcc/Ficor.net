// ============================================================================
// D1 数据库备份到 R2
// 每天将各表导出为 JSON，打包存到 R2 backups/ 目录
// ============================================================================

/** 需要备份的表 */
const BACKUP_TABLES = [
  'comments',
  'fiscus_comments',
  'fiscus_comment_settings',
  'fiscus_comment_moderation_logs',
  'fiscus_comment_sync_logs',
  'fiscus_comment_import_logs',
  'config',
  'schedules',
  'audit',
  'sessions',
  'stats'
] as const;

export interface BackupResult {
  date: string;
  tables: Record<string, number>;
  totalSize: number;
  key: string;
}

/**
 * 导出 D1 各表为 JSON，存到 R2。
 * 每个表一个 JSON 文件，打包成一个 tar-like 结构存到 backups/<date>.json。
 * （Workers 环境无 tar/gzip，这里用合并 JSON 的方式）
 */
export async function exportBackup(db: D1Database, r2: R2Bucket): Promise<BackupResult> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const backup: Record<string, unknown[]> = {};
  const tableCounts: Record<string, number> = {};
  let totalSize = 0;

  for (const table of BACKUP_TABLES) {
    // Keyset pagination keeps responses bounded and avoids silently truncated backups.
    const rows: Record<string, unknown>[] = [];
    let cursor = 0;
    while (true) {
      const result = await db.prepare(`SELECT rowid AS __backup_rowid, * FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT 500`).bind(cursor).all<Record<string, unknown>>();
      if (!result.success) throw new Error(`备份表 ${table} 失败`);
      const batch = result.results ?? [];
      for (const row of batch) {
        cursor = Number(row.__backup_rowid);
        const { __backup_rowid, ...data } = row;
        rows.push(data);
      }
      if (batch.length < 500) break;
    }
    backup[table] = rows;
    tableCounts[table] = rows.length;
  }

  const payload = {
    metadata: {
      date: dateStr,
      exportedAt: now.toISOString(),
      tables: tableCounts
    },
    data: backup
  };

  const json = JSON.stringify(payload);
  totalSize = new TextEncoder().encode(json).byteLength;

  const key = `backups/${dateStr}.json`;
  await r2.put(key, json, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      type: 'daily-backup',
      date: dateStr,
      tableCount: String(BACKUP_TABLES.length)
    }
  });

  return { date: dateStr, tables: tableCounts, totalSize, key };
}

/**
 * 清理超过保留期的备份。
 */
export async function cleanupOldBackups(r2: R2Bucket, retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) throw new Error('备份保留天数必须为正整数');
  const expired: string[] = [];
  let cursor: string | undefined;
  do {
    const result = await r2.list({ prefix: 'backups/', limit: 100, cursor });
    for (const obj of result.objects) {
      if (/^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(obj.key) && obj.uploaded < cutoff) expired.push(obj.key);
    }
    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);
  let deleted = 0;
  for (const key of expired) {
    await r2.delete(key);
    deleted++;
  }
  return deleted;
}

/**
 * 列出所有备份。
 */
export async function listBackups(r2: R2Bucket): Promise<
  Array<{ key: string; size: number; uploaded: string }>
> {
  const result = await r2.list({ prefix: 'backups/', limit: 100 });
  return result.objects
    .map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString()
    }))
    .sort((a, b) => b.uploaded.localeCompare(a.uploaded));
}
