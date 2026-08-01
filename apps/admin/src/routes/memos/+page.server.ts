import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';
import type { MemoItem } from '$lib/server/memos/client';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { items: [] as MemoItem[], value: [] as MemoItem[], error: 'R2 未配置' };
  }

  try {
    const value = await readJsonData<MemoItem[]>(platform.env.R2, 'memos', []);
    const items = Array.isArray(value) ? value : [];
    return { items, value };
  } catch (e) {
    return { items: [] as MemoItem[], value: [] as MemoItem[], error: e instanceof Error ? e.message : '加载失败' };
  }
};
