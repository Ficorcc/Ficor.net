import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';
import { fetchMemos, type MemoItem } from '$lib/server/memos/client';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { items: [] as MemoItem[], value: [] as MemoItem[], source: 'fallback', error: 'R2 未配置' };
  }

  try {
    const value = await readJsonData<MemoItem[]>(platform.env.R2, 'memos', []);
    const cachedItems = Array.isArray(value) ? value : [];

    if (platform.env.MEMOS_API_URL?.trim()) {
      try {
        const items = await fetchMemos(platform.env);
        return { items, value: cachedItems, source: 'memos', memosUrl: platform.env.MEMOS_API_URL };
      } catch (e) {
        return {
          items: cachedItems,
          value: cachedItems,
          source: 'r2',
          memosUrl: platform.env.MEMOS_API_URL,
          error: e instanceof Error ? `Memos 连接失败，已显示缓存：${e.message}` : 'Memos 连接失败，已显示缓存'
        };
      }
    }

    return { items: cachedItems, value: cachedItems, source: 'r2' };
  } catch (e) {
    return {
      items: [] as MemoItem[],
      value: [] as MemoItem[],
      source: 'fallback',
      error: e instanceof Error ? e.message : '加载失败'
    };
  }
};
