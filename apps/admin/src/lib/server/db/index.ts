// ============================================================================
// 数据库仓储层统一导出
// ============================================================================

import { DB } from './client';
import { SessionsRepo } from './sessions';
import { CommentsRepo } from './comments';
import { ConfigRepo } from './config';
import {
  SchedulesRepo,
  AuditRepo,
  RatelimitRepo,
  StatsRepo
} from './repositories';

export { DB };
export type { SessionRow } from './sessions';
export type { CommentRow, CommentStatus } from './comments';
export type {
  ScheduleRow,
  ScheduleStatus,
  AuditRow
} from './repositories';
export { ConfigConflictError } from './config';

/**
 * 所有数据库仓储的聚合入口。
 * 在服务端代码中通过 `const repos = createRepos(env.DB)` 创建。
 */
export interface Repos {
  sessions: SessionsRepo;
  comments: CommentsRepo;
  config: ConfigRepo;
  schedules: SchedulesRepo;
  audit: AuditRepo;
  ratelimit: RatelimitRepo;
  stats: StatsRepo;
}

export function createRepos(d1: D1Database): Repos {
  const db = new DB(d1);
  return {
    sessions: new SessionsRepo(db),
    comments: new CommentsRepo(db),
    config: new ConfigRepo(db),
    schedules: new SchedulesRepo(db),
    audit: new AuditRepo(db),
    ratelimit: new RatelimitRepo(db),
    stats: new StatsRepo(db)
  };
}

export type { CommentsRepo, SessionsRepo, ConfigRepo, SchedulesRepo, AuditRepo, RatelimitRepo, StatsRepo };
