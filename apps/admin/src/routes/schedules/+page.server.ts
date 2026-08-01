// 定时任务：拉取任务列表
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.DB) {
    return { items: [], error: '数据库未配置' };
  }

  const repos = createRepos(platform.env.DB);
  try {
    const items = await repos.schedules.list();
    return { items };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : '加载失败' };
  }
};
