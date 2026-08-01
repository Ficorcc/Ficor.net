import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';

const fallbackFeed = {
  siteTitle: '',
  siteDescription: '',
  siteUrl: '',
  feedUrl: '/rss.xml',
  subscriptions: []
};

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { value: fallbackFeed, subscriptions: [], latestItems: [], error: 'R2 未配置' };
  }

  try {
    const value = await readJsonData<Record<string, unknown>>(platform.env.R2, 'feed', fallbackFeed);
    const subscriptions = Array.isArray(value.subscriptions) ? value.subscriptions : [];
    const latestItems = subscriptions.flatMap((sub) => {
      const record = sub && typeof sub === 'object' ? (sub as Record<string, unknown>) : {};
      return Array.isArray(record.latestItems) ? record.latestItems : [];
    });
    return { value, subscriptions, latestItems };
  } catch (e) {
    return { value: fallbackFeed, subscriptions: [], latestItems: [], error: e instanceof Error ? e.message : '加载失败' };
  }
};
