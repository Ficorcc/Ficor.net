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
    const [commentCounts, essays, bits, schedules, storage] = await Promise.all([
      repos.comments.countByStatus(),
      content.list('essay').catch(() => []),
      content.list('bits').catch(() => []),
      repos.schedules.list().catch(() => []),
      estimateStorage(env.R2).catch(() => ({ totalSize: 0, count: 0 }))
    ]);

    const pendingSchedules = schedules.filter((s) => s.status === 'pending');

    return {
      stats: {
        comments: commentCounts,
        essays: essays.length,
        bits: bits.length,
        pendingSchedules: pendingSchedules.length,
        totalSchedules: schedules.length,
        storage
      },
      recentEssays: essays.slice(0, 5),
      recentSchedules: pendingSchedules.slice(0, 5)
    };
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : '加载失败' };
  }
};
