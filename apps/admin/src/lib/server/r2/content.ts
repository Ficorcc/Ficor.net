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
      customMetadata: {
        collection,
        slug,
        updatedAt: new Date().toISOString()
      }
    });
  }

  /** 写入 Markdown 原文，用于从主站仓库同步时尽量保留原始 frontmatter 格式 */
  async writeRaw(collection: string, slug: string, markdown: string): Promise<void> {
    await this.r2.put(this.key(collection, slug), markdown, {
      customMetadata: {
        collection,
        slug,
        updatedAt: new Date().toISOString(),
        source: 'main-site'
      }
    });
  }

  /** 删除文章 */
  async delete(collection: string, slug: string): Promise<void> {
    await this.r2.delete(this.key(collection, slug));
  }

  /** 列出某集合下的所有文章 */
  async list(collection: string): Promise<ContentMeta[]> {
    const prefix = `content/${collection}/`;
    const result = await this.r2.list({ prefix });
    const metas: ContentMeta[] = [];

    for (const obj of result.objects) {
      // 从 key 提取 slug：content/essay/hello.md → hello
      const slug = obj.key.slice(prefix.length, -3); // 去掉前缀和 .md
      if (!slug) continue;

      // 读取 frontmatter（只读第一个 chunk 够解析 YAML 即可，这里简单全读）
      const content = await this.read(collection, slug);
      const frontmatter = content?.frontmatter ?? {};
      // 简短摘要
      const body = content?.body ?? '';
      const excerpt = body.replace(/[#*`\n]/g, ' ').trim().slice(0, 120);

      metas.push({
        collection: collection as Collection,
        slug,
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
        frontmatter,
        excerpt
      });
    }

    // 按日期降序
    metas.sort((a, b) => {
      const da = String(a.frontmatter.date ?? a.uploaded);
      const db = String(b.frontmatter.date ?? b.uploaded);
      return db.localeCompare(da);
    });

    return metas;
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
