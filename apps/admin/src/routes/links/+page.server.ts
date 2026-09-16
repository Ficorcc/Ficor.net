import type { PageServerLoad } from './$types';
import { readCommunity } from '$lib/server/community';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
  setHeaders({ 'cache-control': 'no-store' });
  try {
    return { ...await readCommunity(platform?.env?.R2), error: '' };
  } catch {
    return { value: {}, siteInfo: {}, links: [], subscriptions: [], latestItems: [], source: 'error', error: '共享数据加载失败，请稍后重试' };
  }
};
