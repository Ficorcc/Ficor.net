// 系统日志：分页加载
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform?.env?.DB) {
    return { items: [], total: 0, error: '数据库未配置' };
  }

  const repos = createRepos(platform.env.DB);
  const action = url.searchParams.get('action') ?? undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));

  try {
    const result = await repos.audit.list({ action, page, pageSize: 30 });
    return { ...result, action: action ?? '' };
  } catch (e) {
    return { items: [], total: 0, action: '', error: e instanceof Error ? e.message : '加载失败' };
  }
};
