// ============================================================================
// R2 内容存储（Markdown 文章读写）
// 目录结构：content/<collection>/<slug>.md
// ============================================================================

import { parseMarkdown, serializeMarkdown } from '$lib/utils/frontmatter';
import type { Collection } from '$lib/utils/content-schema';

// 使用全局 R2Bucket 类型（由 adapter-cloudflare 提供）

export interface ContentMeta {
  collection: Collection;
  slug: string;
  key: string;
  size: number;
  uploaded: string;
  frontmatter: Record<string, unknown>;
  excerpt: string;
}

type R2ObjectWithMetadata = R2Object & { customMetadata?: Record<string, string> };

interface ListOptions {
  limit?: number;
  quick?: boolean;
}

const LIST_CONCURRENCY = 8;

function excerptFromBody(body: string): string {
  return body.replace(/[#*`\n]/g, ' ').trim().slice(0, 120);
}

function metadataForObject(
  collection: string,
  obj: R2ObjectWithMetadata,
  slug: string
): ContentMeta | null {
  const metadata = obj.customMetadata ?? {};
  const title = metadata.title;
  const date = metadata.date;
  const excerpt = metadata.excerpt;

  if (!title && !date && !excerpt) return null;

  return {
    collection: collection as Collection,
    slug,
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded.toISOString(),
    frontmatter: {
      ...(title ? { title } : {}),
      ...(date ? { date } : {})
    },
    excerpt: excerpt ?? ''
  };
}

function writeMetadata(collection: string, slug: string, frontmatter: Record<string, unknown>, body: string) {
  return {
    collection,
    slug,
    updatedAt: new Date().toISOString(),
    title: String(frontmatter.title ?? slug).slice(0, 160),
    date: String(frontmatter.date ?? frontmatter.updated ?? '').slice(0, 40),
    excerpt: excerptFromBody(body).slice(0, 240)
  };
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export class ContentStore {
  constructor(private r2: R2Bucket) {}

  /** R2 key 构造 */
  key(collection: string, slug: string): string {
    return `content/${collection}/${slug}.md`;
  }

  /** 读取一篇文章 */
  async read(collection: string, slug: string): Promise<{ frontmatter: Record<string, unknown>; body: string } | null> {
    const obj = await this.r2.get(this.key(collection, slug));
    if (!obj) return null;
    const text = await obj.text();
    return parseMarkdown(text);
  }

  /** 写入文章 */
  async write(
    collection: string,
    slug: string,
    frontmatter: Record<string, unknown>,
    body: string
  ): Promise<void> {
    const md = serializeMarkdown(frontmatter, body);
    await this.r2.put(this.key(collection, slug), md, {
      customMetadata: writeMetadata(collection, slug, frontmatter, body)
    });
  }

  /** 写入 Markdown 原文，用于从主站仓库同步时尽量保留原始 frontmatter 格式 */
  async writeRaw(collection: string, slug: string, markdown: string): Promise<void> {
    const parsed = parseMarkdown(markdown);
    await this.r2.put(this.key(collection, slug), markdown, {
      customMetadata: {
        ...writeMetadata(collection, slug, parsed.frontmatter, parsed.body),
        source: 'main-site'
      }
    });
  }

  /** 删除文章 */
  async delete(collection: string, slug: string): Promise<void> {
    await this.r2.delete(this.key(collection, slug));
  }

  private async objects(collection: string): Promise<R2ObjectWithMetadata[]> {
    const prefix = `content/${collection}/`;
    const objects: R2ObjectWithMetadata[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.r2.list({ prefix, cursor, limit: 1000 });
      objects.push(...(result.objects as R2ObjectWithMetadata[]));
      cursor = result.truncated ? result.cursor : undefined;
    } while (cursor);

    return objects.filter((obj) => obj.key.endsWith('.md'));
  }

  /** 只统计某集合下的文章数量，不读取正文 */
  async count(collection: string): Promise<number> {
    return (await this.objects(collection)).length;
  }

  /** 列出某集合下的文章 */
  async list(collection: string, options: ListOptions = {}): Promise<ContentMeta[]> {
    const prefix = `content/${collection}/`;
    let objects = await this.objects(collection);

    if (options.quick) {
      objects = objects.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
      if (options.limit) objects = objects.slice(0, options.limit);
    }

    const metas = await mapConcurrent(objects, LIST_CONCURRENCY, async (obj) => {
      // 从 key 提取 slug：content/essay/hello.md → hello
      const slug = obj.key.slice(prefix.length, -3); // 去掉前缀和 .md
      if (!slug) return null;

      const fromMetadata = metadataForObject(collection, obj, slug);
      if (fromMetadata) return fromMetadata;

      // 旧对象没有 metadata 时才读取正文；并发受控，避免菜单切换时串行等待。
      const content = await this.read(collection, slug);
      const frontmatter = content?.frontmatter ?? {};
      const body = content?.body ?? '';

      return {
        collection: collection as Collection,
        slug,
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        frontmatter,
        excerpt: excerptFromBody(body)
      };
    });

    // 按日期降序
    const sorted = metas.filter((item): item is ContentMeta => Boolean(item));
    sorted.sort((a, b) => {
      const da = String(a.frontmatter.date ?? a.uploaded);
      const db = String(b.frontmatter.date ?? b.uploaded);
      return db.localeCompare(da);
    });

    return options.limit ? sorted.slice(0, options.limit) : sorted;
  }

  /** 全文搜索 */
  async search(keyword: string, collections: Collection[] = ['essay', 'bits', 'memo']): Promise<
    Array<{
      collection: string;
      slug: string;
      title: string;
      excerpt: string;
      date: string;
    }>
  > {
    const results: Array<{
      collection: string;
      slug: string;
      title: string;
      excerpt: string;
      date: string;
    }> = [];

    const lowerKeyword = keyword.toLowerCase();

    for (const collection of collections) {
      const items = await this.list(collection);
      for (const item of items) {
        const title = String(item.frontmatter.title ?? item.slug);
        const tags = Array.isArray(item.frontmatter.tags) ? item.frontmatter.tags : [];
        const haystack = (title + ' ' + item.excerpt + ' ' + tags.join(' ')).toLowerCase();
        if (haystack.includes(lowerKeyword)) {
          // 高亮摘要：找到关键词位置，截取上下文
          const bodyLower = item.excerpt.toLowerCase();
          const idx = bodyLower.indexOf(lowerKeyword);
          let excerpt = item.excerpt;
          if (idx >= 0) {
            const start = Math.max(0, idx - 30);
            excerpt = (start > 0 ? '...' : '') + item.excerpt.slice(start, start + 120) + '...';
          }
          results.push({
            collection,
            slug: item.slug,
            title,
            excerpt,
            date: String(item.frontmatter.date ?? item.uploaded)
          });
        }
      }
    }

    return results;
  }
}
