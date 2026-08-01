// 文章列表：根据 collection 拉取文章
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';

const VALID_COLLECTIONS = new Set(['essay', 'bits', 'memo']);

export const load: PageServerLoad = async ({ params, platform, url }) => {
  const collection = params.collection;
  if (!VALID_COLLECTIONS.has(collection)) {
    throw error(404, '未知的内容集合');
  }

  if (!platform?.env?.DB) {
    return { collection, items: [], error: '数据库未配置' };
  }

  const content = new ContentStore(platform.env.R2);
  const keyword = url.searchParams.get('q') ?? '';

  try {
    let items;
    if (keyword) {
      // 搜索模式
      const results = await content.search(keyword, [collection as 'essay' | 'bits' | 'memo']);
      items = results.map((r) => ({
        slug: r.slug,
        frontmatter: { title: r.title, date: r.date },
        excerpt: r.excerpt,
        uploaded: r.date,
        size: 0,
        key: '',
        collection
      }));
    } else {
      items = await content.list(collection);
    }
    return { collection, items, keyword };
  } catch (e) {
    return { collection, items: [], error: e instanceof Error ? e.message : '加载失败' };
  }
};
