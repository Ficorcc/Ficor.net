// ============================================================================
// 定时任务处理器（cron scheduled）
// 处理两类 cron：
// - */15 * * * *：检查定时发布任务
// - 0 19 * * *：每日数据备份
// ============================================================================

import { createRepos } from './db';
import { exportBackup, cleanupOldBackups } from './r2/backup';

interface ScheduledEnv {
  DB: D1Database;
  R2: R2Bucket;
  AI: Ai;
  BACKUP_RETENTION_DAYS?: string;
  GITHUB_TOKEN?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_WORKFLOW?: string;
  GITHUB_REF?: string;
  CLOUDFLARE_DEPLOY_HOOK?: string;
}

/**
 * 处理 cron 触发的事件。
 * 由 Workers 入口（worker.ts）的 scheduled() 调用。
 */
export async function handleScheduled(
  controller: ScheduledController,
  env: ScheduledEnv,
  ctx: { waitUntil(p: Promise<unknown>): void }
): Promise<void> {
  const cron = controller.cron;
  const repos = createRepos(env.DB);

  if (cron === '*/15 * * * *') {
    // 到期任务保持待部署，由仪表盘的一键部署统一处理。
    return;
  } else if (cron === '0 19 * * *') {
    await runBackup(repos, env);
  }
}

// ---------------------------------------------------------------------------
// 每日备份
// ---------------------------------------------------------------------------
async function runBackup(
  repos: ReturnType<typeof createRepos>,
  env: ScheduledEnv
): Promise<void> {
  try {
    const configuredDays = Number(env.BACKUP_RETENTION_DAYS ?? 30);
    const retentionDays = Number.isInteger(configuredDays) && configuredDays > 0 ? configuredDays : 30;

    // 导出备份
    const backupResult = await exportBackup(env.DB, env.R2);

    // 清理旧备份
    await cleanupOldBackups(env.R2, retentionDays);

    // 审计记录
    await repos.audit.log({
      sessionId: null,
      action: 'BACKUP_DAILY',
      detail: backupResult,
      ip: 'cron'
    });
  } catch (e) {
    // best-effort：失败不影响运行，只记审计
    console.error('备份失败:', e);
    await repos.audit
      .log({
        sessionId: null,
        action: 'BACKUP_FAILED',
        detail: { error: e instanceof Error ? e.message : String(e) },
        ip: 'cron'
      })
      .catch(() => {});
    throw e; // Let Workers report a failed scheduled invocation instead of a false success.
  }
}
