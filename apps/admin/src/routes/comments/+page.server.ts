// 评论管理：拉取评论列表
import type { PageServerLoad } from './$types';
import {
  countWalineComments,
  listWalineComments,
  resolveWalineConfig,
  type AdminCommentStatus
} from '$lib/server/waline/client';

const VALID_STATUSES = new Set(['pending', 'approved', 'spam']);

export const load: PageServerLoad = async ({ platform, url }) => {
  if (!platform?.env) {
    return { items: [], total: 0, status: 'pending', counts: {}, walineUrl: 'https://waline.ficor.cc', error: '运行环境未配置' };
  }

  const statusParam = url.searchParams.get('status') ?? 'pending';
  const status = VALID_STATUSES.has(statusParam)
    ? (statusParam as AdminCommentStatus)
    : 'pending';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const waline = resolveWalineConfig(platform.env);

  if (!waline.token) {
    return {
      items: [],
      total: 0,
      status,
      counts: {},
      walineUrl: waline.apiUrl,
      tokenMissing: true
    };
  }

  try {
    const [result, counts] = await Promise.all([
      listWalineComments({ ...waline, status, page, pageSize: 20 }),
      countWalineComments(waline)
    ]);
    return { ...result, total: counts[status] ?? result.total, status, counts, walineUrl: waline.apiUrl };
  } catch (e) {
    return {
      items: [],
      total: 0,
      status,
      counts: {},
      walineUrl: waline.apiUrl,
      error: e instanceof Error ? e.message : '加载失败'
    };
  }
};
