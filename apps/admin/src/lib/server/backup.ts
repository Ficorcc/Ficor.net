// ============================================================================
// 定时任务处理器（cron scheduled）
// 处理两类 cron：
// - */15 * * * *：检查定时发布任务
// - 0 19 * * *：每日数据备份
// ============================================================================

import { createRepos } from './db';
import { ContentStore } from './r2/content';
import { triggerDeploy } from './deploy/github';
import { exportBackup, cleanupOldBackups } from './r2/backup';

interface ScheduledEnv {
  DB: D1Database;
  R2: R2Bucket;
  AI: Ai;
  BACKUP_RETENTION_DAYS?: string;
  GITHUB_TOKEN?: string;
}

/**
 * 处理 cron 触发的事件。
 * 由 Workers 入口（src/worker.ts 或 hooks）的 scheduled() 调用。
 */
export async function handleScheduled(
  controller: ScheduledController,
  env: ScheduledEnv,
  ctx: { waitUntil(p: Promise<unknown>): void }
): Promise<void> {
  const cron = controller.cron;
  const repos = createRepos(env.DB);

  if (cron === '*/15 * * * *') {
    await runScheduleCheck(repos, env);
  } else if (cron === '0 19 * * *') {
    await runBackup(repos, env);
  }
}

// ---------------------------------------------------------------------------
// 定时发布检查
// ---------------------------------------------------------------------------
async function runScheduleCheck(
  repos: ReturnType<typeof createRepos>,
  env: ScheduledEnv
): Promise<void> {
  try {
    const dueItems = await repos.schedules.findDue();
    if (dueItems.length === 0) return;

    for (const item of dueItems) {
      // 原子抢占，防止多个 Worker 实例并发处理同一任务
      const acquired = await repos.schedules.acquire(item.id);
      if (!acquired) continue;

      try {
        // 触发主站部署
        const deployConfig = await repos.config.get<{
          owner: string;
          repo: string;
          workflow: string;
          ref?: string;
        }>('deploy');

        if (deployConfig && env.GITHUB_TOKEN) {
          const result = await triggerDeploy(env.GITHUB_TOKEN, {
            owner: deployConfig.owner,
            repo: deployConfig.repo,
            workflow: deployConfig.workflow,
            ref: deployConfig.ref
          });

          if (result.ok) {
            await repos.schedules.markDone(item.id);
            await repos.audit.log({
              sessionId: null,
              action: 'SCHEDULE_AUTO_PUBLISH',
              target: `${item.collection}/${item.slug}`,
              detail: { scheduleId: item.id },
              ip: 'cron'
            });
          } else {
            await repos.schedules.markFailed(item.id, result.message);
          }
        } else {
          await repos.schedules.markFailed(item.id, '部署配置不完整');
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : '未知错误';
        await repos.schedules.markFailed(item.id, errorMsg);
      }
    }
  } catch (e) {
    console.error('定时发布检查失败:', e);
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
    const retentionDays = parseInt(env.BACKUP_RETENTION_DAYS ?? '30', 10);

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
  }
}
