import type { PageServerLoad } from './$types';
import { listComments } from '$lib/server/fiscus/admin';
export const load: PageServerLoad = async ({ platform, url }) => {
  const value = url.searchParams.get('status') || 'pending';
  const status = ['pending', 'approved', 'spam', 'rejected'].includes(value) ? value : 'pending';
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  try {
    if (!platform?.env?.DB) throw new Error('运行环境未配置');
    return { ...await listComments(platform.env, status, page), status, error: '' };
  } catch (e) {
    return { items: [], total: 0, counts: {}, status, error: e instanceof Error ? e.message : '加载失败' };
  }
};
