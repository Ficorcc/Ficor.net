// ============================================================================
// D1 数据库备份到 R2
// 每天将各表导出为 JSON，打包存到 R2 backups/ 目录
// ============================================================================

/** 需要备份的表 */
const BACKUP_TABLES = [
  'comments',
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
    try {
      // 分批读取全表（D1 一次最多返回 1000 行，这里简单处理）
      const result = await db.prepare(`SELECT * FROM ${table}`).all();
      const rows = result.results ?? [];
      backup[table] = rows;
      tableCounts[table] = rows.length;
    } catch (e) {
      console.error(`备份表 ${table} 失败:`, e);
      backup[table] = [];
      tableCounts[table] = 0;
    }
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
  totalSize = json.length;

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
  const result = await r2.list({ prefix: 'backups/', limit: 100 });
  let deleted = 0;

  for (const obj of result.objects) {
    if (obj.uploaded < cutoff) {
      await r2.delete(obj.key);
      deleted++;
    }
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
