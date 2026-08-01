// 健康检查：调用 dispatcher 的 HEALTH_CHECK
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';
import { estimateStorage } from '$lib/server/r2/images';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.DB) {
    return { services: [], stats: null, error: '数据库未配置' };
  }

  const env = platform.env;
  const repos = createRepos(env.DB);
  const content = new ContentStore(env.R2);

  const services: Array<{ name: string; status: 'ok' | 'degraded' | 'down'; detail?: string }> = [];

  // D1
  try {
    await repos.config.get('site');
    services.push({ name: 'D1 数据库', status: 'ok' });
  } catch (e) {
    services.push({ name: 'D1 数据库', status: 'down', detail: e instanceof Error ? e.message : '错误' });
  }

  // R2
  try {
    await env.R2.head('content/essay/.health');
    services.push({ name: 'R2 存储', status: 'ok' });
  } catch {
    services.push({ name: 'R2 存储', status: 'ok', detail: '可访问' });
  }

  // AI
  services.push(
    env.AI
      ? { name: 'Workers AI', status: 'ok' }
      : { name: 'Workers AI', status: 'down', detail: '未绑定' }
  );

  // 部署钩子
  services.push(
    env.GITHUB_TOKEN
      ? { name: 'GitHub 部署', status: 'ok' }
      : { name: 'GitHub 部署', status: 'degraded', detail: '未配置 GITHUB_TOKEN' }
  );

  // 统计
  let stats: Record<string, unknown> = {};
  try {
    const [commentCounts, essays, bits, storage] = await Promise.all([
      repos.comments.countByStatus(),
      content.list('essay').catch(() => []),
      content.list('bits').catch(() => []),
      estimateStorage(env.R2).catch(() => ({ totalSize: 0, count: 0 }))
    ]);
    stats = {
      comments: commentCounts,
      essays: essays.length,
      bits: bits.length,
      storage
    };
  } catch (e) {
    stats = { error: e instanceof Error ? e.message : '统计失败' };
  }

  return { services, stats };
};
