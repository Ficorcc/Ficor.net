// 仪表盘：拉取统计数据
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';
import { estimateStorage } from '$lib/server/r2/images';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.DB) {
    return { stats: null, error: '数据库未配置' };
  }

  const env = platform.env;
  const repos = createRepos(env.DB);
  const content = new ContentStore(env.R2);

  try {
    const [commentCounts, essayCount, recentEssays, bits, schedules, storage] = await Promise.all([
      repos.comments.countByStatus(),
      content.count('essay').catch(() => 0),
      content.list('essay', { limit: 5, quick: true }).catch(() => []),
      content.count('bits').catch(() => 0),
      repos.schedules.list().catch(() => []),
      estimateStorage(env.R2, 1).catch(() => ({ totalSize: 0, count: 0 }))
    ]);

    const pendingSchedules = schedules.filter((s) => s.status === 'pending');

    return {
      stats: {
        comments: commentCounts,
        essays: essayCount,
        bits,
        pendingSchedules: pendingSchedules.length,
        totalSchedules: schedules.length,
        storage
      },
      recentEssays,
      recentSchedules: pendingSchedules.slice(0, 5)
    };
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : '加载失败' };
  }
};
