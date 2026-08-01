// 图片库：拉取图片列表和存储统计
import type { PageServerLoad } from './$types';
import { listImagesWithStorage } from '$lib/server/r2/images';

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { items: [], storage: { totalSize: 0, count: 0 }, error: 'R2 未配置' };
  }

  try {
    const { items, storage } = await listImagesWithStorage(platform.env.R2);
    return { items, storage };
  } catch (e) {
    return {
      items: [],
      storage: { totalSize: 0, count: 0 },
      error: e instanceof Error ? e.message : '加载失败'
    };
  }
};
