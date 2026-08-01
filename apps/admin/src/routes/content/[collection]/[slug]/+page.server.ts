// 文章编辑器：加载已有文章或新建
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ContentStore } from '$lib/server/r2/content';

export const load: PageServerLoad = async ({ params, platform }) => {
  const { collection, slug } = params;
  const isNew = slug === 'new';

  if (!platform?.env?.R2) {
    return { collection, slug, frontmatter: {}, body: '', isNew, error: 'R2 未配置' };
  }

  if (isNew) {
    // 新建文章的默认 frontmatter
    const defaultFm: Record<string, unknown> =
      collection === 'essay'
        ? { title: '', description: '', date: new Date().toISOString().slice(0, 10), tags: [], draft: true, archive: true, comment: true }
        : collection === 'bits'
          ? { date: new Date().toISOString().slice(0, 10), tags: [], draft: false }
          : { title: '', subtitle: '', date: new Date().toISOString().slice(0, 10), draft: false };

    return { collection, slug: '', frontmatter: defaultFm, body: '', isNew: true };
  }

  // 读取现有文章
  const content = new ContentStore(platform.env.R2);
  const item = await content.read(collection, slug);
  if (!item) {
    throw error(404, '文章不存在');
  }

  return {
    collection,
    slug,
    frontmatter: item.frontmatter,
    body: item.body,
    isNew: false
  };
};
