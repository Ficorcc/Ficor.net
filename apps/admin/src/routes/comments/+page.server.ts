// 评论管理：拉取评论列表
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import type { CommentStatus } from '$lib/server/db';

const VALID_STATUSES = new Set(['pending', 'approved', 'spam', 'deleted']);

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform?.env?.DB) {
    return { items: [], total: 0, status: 'pending', error: '数据库未配置' };
  }

  const repos = createRepos(platform.env.DB);
  const statusParam = url.searchParams.get('status') ?? 'pending';
  const status = VALID_STATUSES.has(statusParam)
    ? (statusParam as CommentStatus)
    : 'pending';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));

  try {
    const result = await repos.comments.list({ status, page, pageSize: 20 });
    const counts = await repos.comments.countByStatus();
    return { ...result, status, counts };
  } catch (e) {
    return { items: [], total: 0, status, counts: {}, error: e instanceof Error ? e.message : '加载失败' };
  }
};
