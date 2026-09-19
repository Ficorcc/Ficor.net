import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ContentStore } from '../src/lib/server/r2/content';
import {
  DATA_METRICS,
  dataObjectTarget,
  detectDataCollapse,
  linksModuleSource,
  linkArrayOf,
  pruneDeletedContent,
  subscriptionCount,
  subscriptionsOf,
  visibleLinkCount,
  visibleLinksOf
} from '../../../scripts/lib/content-sync.mjs';

function bucket() {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn(async (key: string) => values.has(key) ? { text: async () => values.get(key) } : null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); })
  };
}

describe('content deletion sync', () => {
  it('writes tombstones and clears them when content is recreated', async () => {
    const r2 = bucket();
    const store = new ContentStore(r2 as unknown as R2Bucket);
    await store.delete('essay', 'old-post');
    expect(r2.values.has('deleted/content/essay/old-post.json')).toBe(true);
    expect(r2.delete).toHaveBeenCalledWith('content/essay/old-post.md');
    await store.write('essay', 'old-post', { title: '恢复', date: '2026-09-16' }, '正文');
    expect(r2.values.has('content/essay/old-post.md')).toBe(true);
    expect(r2.delete).toHaveBeenCalledWith('deleted/content/essay/old-post.json');
  });

  it('only prunes files with explicit tombstones and never removes active remote content', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vii-content-'));
    await mkdir(path.join(root, 'essay'), { recursive: true });
    await writeFile(path.join(root, 'essay/old.md'), '');
    await writeFile(path.join(root, 'essay/keep.md'), '');
    await writeFile(path.join(root, 'essay/unimported.md'), '');

    const removed = await pruneDeletedContent({
      contentRoot: root,
      remoteRelativePaths: new Set(['essay/keep.md']),
      tombstoneKeys: [
        'deleted/content/essay/old.json',
        'deleted/content/essay/keep.json',
        'deleted/content/essay/unimported/unsafe.json'
      ]
    });

    expect(removed).toBe(1);
    await expect(readFile(path.join(root, 'essay/old.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(path.join(root, 'essay/keep.md'))).resolves.toBeDefined();
    await expect(readFile(path.join(root, 'essay/unimported.md'))).resolves.toBeDefined();
  });
});

describe('data/ prefix mapping', () => {
  it('routes links.json to the generated TypeScript module', () => {
    expect(dataObjectTarget('links.json')).toEqual({ path: 'src/data/links.ts', generated: true });
  });

  it('keeps feed.json in src/config and copies other json verbatim', () => {
    expect(dataObjectTarget('feed.json')).toEqual({ path: 'src/config/feed.json', generated: false });
    expect(dataObjectTarget('memos.json')).toEqual({ path: 'src/data/memos.json', generated: false });
  });

  it('rejects nested paths, traversal and non-json objects', () => {
    expect(dataObjectTarget('nested/links.json')).toBeNull();
    expect(dataObjectTarget('..')).toBeNull();
    expect(dataObjectTarget('notes.txt')).toBeNull();
  });
});

describe('links module generation', () => {
  const payload = {
    communitySchemaVersion: 2,
    siteInfo: { title: '柒色墨笺', url: 'https://vii.ink/', description: '描述', avatar: '/a.webp' },
    links: [{ id: 'a', name: 'A', url: 'https://a.test/', show_in_links: true, feed_enabled: false }]
  };

  it('keeps the LinkItem and SiteInfo interfaces so the public shape stays typed', () => {
    const source = linksModuleSource(JSON.stringify(payload));
    expect(source).toContain('export interface LinkItem {');
    expect(source).toContain('export interface SiteInfo {');
    // 消费方按这三个导出取值，缺一不可
    expect(source).toContain('export const communitySchemaVersion = 2;');
    expect(source).toContain('export const siteInfo: SiteInfo =');
    expect(source).toContain('export const links: LinkItem[] =');
    expect(source).toContain('"show_in_links"');
    expect(source).toContain('show_in_links?: boolean;');
  });

  it('clamps the schema version and fills missing siteInfo fields', () => {
    const source = linksModuleSource(JSON.stringify({ communitySchemaVersion: 99, links: [] }));
    expect(source).toContain('export const communitySchemaVersion = 2;');
    // SiteInfo 的四个字段必须有值，否则类型检查会失败
    expect(source).toContain('"title": ""');
    expect(source).toContain('"url": ""');
    expect(source).toContain('"description": ""');
    expect(source).toContain('"avatar": ""');
  });

  it('treats a missing version as v1 and tolerates malformed links', () => {
    const source = linksModuleSource(JSON.stringify({ links: 'nope' }));
    expect(source).toContain('export const communitySchemaVersion = 1;');
    expect(source).toContain('export const links: LinkItem[] = [];');
  });
});

// ============================================================================
// 站点数据骤减检测
//
// 线上出过一次事故：R2 的 data/links.json 只剩 1 条友链，同步脚本照单全收，
// 前端友链页几乎空白，全程没有任何提示。下面的测试锁住这个检测的两侧：
//   · 该报的时候必须报（46 → 1）
//   · 不该报的时候不能报（正常下架、数据量还小、文本解析不了）
// ============================================================================
describe('站点数据骤减检测', () => {
  const linksJson = (count: number, hidden = 0) => JSON.stringify({
    communitySchemaVersion: 2,
    siteInfo: {},
    links: Array.from({ length: count }, (_, i) => ({
      id: `l${i}`,
      name: `站点${i}`,
      url: `https://s${i}.test/`,
      is_active: i < hidden ? false : true
    }))
  });

  it('两种文本形态都能数出条数：R2 原始对象 与 生成的 TS 模块', () => {
    const raw = linksJson(3);
    const generated = linksModuleSource(raw);
    expect(linkArrayOf(raw)).toHaveLength(3);
    // `export const links: LinkItem[]` 里的 LinkItem[] 不能被误当成数组
    expect(linkArrayOf(generated)).toHaveLength(3);
    expect(visibleLinkCount(generated)).toBe(3);
  });

  it('只数可见友链，隐藏的不计入（口径必须与前端 publicCommunity 一致）', () => {
    expect(visibleLinkCount(linksJson(10, 4))).toBe(6);
    expect(visibleLinkCount(linksModuleSource(linksJson(10, 4)))).toBe(6);
  });

  it('解析不了时返回 null，绝不猜一个数出来', () => {
    for (const bad of [null, undefined, '', 'not json', '{"links": "nope"}', 'export const links =']) {
      expect(linkArrayOf(bad as never)).toBeNull();
      expect(visibleLinkCount(bad as never)).toBeNull();
    }
    expect(subscriptionCount('{"subscriptions": 3}')).toBeNull();
  });

  it('复现线上事故：可见友链 46 → 1，必须报出来', () => {
    const collapse = detectDataCollapse('links.json', linksJson(46), linksJson(1));
    expect(collapse).toEqual({ name: 'links.json', label: '可见友链', before: 46, after: 1 });
  });

  it('同步两侧形态不同也能比：仓库里是生成的模块，R2 里是原始对象', () => {
    const collapse = detectDataCollapse('links.json', linksModuleSource(linksJson(46)), linksJson(1));
    expect(collapse?.before).toBe(46);
    expect(collapse?.after).toBe(1);
  });

  it('正常下架不误报：46 → 30 是允许的', () => {
    expect(detectDataCollapse('links.json', linksJson(46), linksJson(30))).toBeNull();
    // 正好腰斩属于边界，按 ratio 判定算骤减
    expect(detectDataCollapse('links.json', linksJson(46), linksJson(23))).not.toBeNull();
  });

  it('数据量还小的时候不告警，避免开发初期噪声', () => {
    expect(detectDataCollapse('links.json', linksJson(4), linksJson(0))).toBeNull();
  });

  it('订阅数与可见友链分开计数 —— 只订阅不上友链的站点不该被算进友链', () => {
    const feed = JSON.stringify({ subscriptions: Array.from({ length: 46 }, () => ({})) });
    expect(subscriptionCount(feed)).toBe(46);
    expect(detectDataCollapse('feed.json', feed, JSON.stringify({ subscriptions: [] })))
      .toEqual({ name: 'feed.json', label: '订阅', before: 46, after: 0 });
  });

  it('没登记指标的对象不参与检测', () => {
    expect(DATA_METRICS['memos.json']).toBeUndefined();
    expect(detectDataCollapse('memos.json', linksJson(46), linksJson(1))).toBeNull();
  });
});

// ============================================================================
// 可见友链 / 订阅的判定口径
//
// 这两个函数同时被三处使用：同步侧的骤减告警、还原脚本的期望值、
// 以及一致性检查。口径与前端不一致时，会同时污染「告警」和「自检」两件事，
// 所以逐个条件单独钉住。
// ============================================================================
describe('可见友链与订阅的判定口径', () => {
  const link = (over: Record<string, unknown> = {}) => ({
    id: 'x', name: 'X', url: 'https://x.test/', feed: 'https://x.test/feed',
    is_active: true, show_in_links: true, feed_enabled: true, ...over
  });

  it('show_in_links 为 false 的在线友链不算可见（这正是「在线但不显示」那个开关）', () => {
    const payload = { links: [link(), link({ id: 'y', feed: 'https://y.test/feed', show_in_links: false })] };
    expect(visibleLinksOf(payload)).toHaveLength(1);
    expect(subscriptionsOf(payload)).toHaveLength(2);
  });

  it('is_active 为 false 的友链不算可见；feed_enabled 缺省时跟随 is_active，所以也不订阅', () => {
    const payload = { links: [link({ is_active: false, feed_enabled: undefined })] };
    expect(visibleLinksOf(payload)).toHaveLength(0);
    expect(subscriptionsOf(payload)).toHaveLength(0);
  });

  it('feed_enabled 缺省时跟随 is_active：在线的默认订阅', () => {
    expect(subscriptionsOf({ links: [link({ feed_enabled: undefined })] })).toHaveLength(1);
  });

  it('显式 feed_enabled: true 的离线友链仍会订阅（快照里 5 条离线友链正是这样）', () => {
    const payload = { links: [link({ is_active: false, feed_enabled: true })] };
    expect(visibleLinksOf(payload)).toHaveLength(0);
    expect(subscriptionsOf(payload)).toHaveLength(1);
  });

  it('feed_enabled 显式为 false 时不订阅，哪怕 is_active 是 true', () => {
    const payload = { links: [link({ feed_enabled: false })] };
    expect(visibleLinksOf(payload)).toHaveLength(1);
    expect(subscriptionsOf(payload)).toHaveLength(0);
  });

  it('订阅按 feed URL 去重，可见友链不去重', () => {
    const payload = { links: [link(), link({ id: 'y', name: 'Y' })] };
    expect(subscriptionsOf(payload)).toHaveLength(1);
    expect(visibleLinksOf(payload)).toHaveLength(2);
  });

  it('只订阅、不上友链页的站点：可见 0，订阅 1', () => {
    const payload = { links: [link({ show_in_links: false })] };
    expect(visibleLinksOf(payload)).toHaveLength(0);
    expect(subscriptionsOf(payload)).toHaveLength(1);
  });

  it('没有 feed 的友链不会变成订阅', () => {
    expect(subscriptionsOf({ links: [link({ feed: '' })] })).toHaveLength(0);
    expect(subscriptionsOf({ links: [link({ feed: undefined })] })).toHaveLength(0);
  });

  it('载荷形状不对时返回空数组而不是抛错', () => {
    for (const bad of [null, undefined, {}, { links: 'nope' }, { links: [null, 0, 'x'] }]) {
      expect(visibleLinksOf(bad)).toEqual([]);
      expect(subscriptionsOf(bad)).toEqual([]);
    }
  });

  it('文本形态与载荷形态数出来的一样（同步脚本两种都要用）', () => {
    const payload = { communitySchemaVersion: 2, siteInfo: {}, links: [link(), link({ id: 'y', show_in_links: false })] };
    const text = JSON.stringify(payload);
    expect(visibleLinkCount(text)).toBe(visibleLinksOf(payload).length);
    expect(visibleLinkCount(linksModuleSource(text))).toBe(visibleLinksOf(payload).length);
  });
});
