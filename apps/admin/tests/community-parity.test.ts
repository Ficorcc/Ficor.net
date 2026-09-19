// ============================================================================
// 友链 / 订阅：后台视图 与 前端视图 的等价性
//
// 两条读取路径：
//   后台 —— readCommunity(R2)：读 R2 的 data/links.json 与 data/feed.json，
//            R2 缺对象时回退到打包快照（admin Worker 构建时的 src/data/links.ts）。
//   前端 —— communitySnapshot：直接读打包进产物的 src/data/links.ts + src/config/feed.json。
//
// 两者都调用同一份 `communityData()`，所以「输入相同 ⇒ 输出相同」是设计意图。
// 本文件把这个意图固化成断言，并额外验证真实本地数据确实满足前提。
//
// ⚠️ 若 `src/lib/community-snapshot.ts` 的组装方式变了（例如多套一层迁移函数），
//    本文件的 `siteViewOf()` 必须同步修改。
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { communityData, importSiteSubscriptions, publicCommunity } from '../../../src/lib/community';
import { communitySnapshot } from '../../../src/lib/community-snapshot';
import { communitySchemaVersion, links as bundledLinks } from '../../../src/data/links';
import { linksModuleSource, subscriptionsOf, visibleLinkCount, visibleLinksOf } from '../../../scripts/lib/content-sync.mjs';
import { resolveContentSource } from '../../../scripts/lib/r2-source.mjs';
import { readCommunity } from '../src/lib/server/community';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const localBucketRoot = path.join(repoRoot, 'apps/admin/.wrangler/state/v3/r2/admin-r2');

/** 极简 R2Bucket 替身：只实现 readCommunity 用到的 get() */
function bucketOf(values: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) =>
      key in values ? { text: async () => JSON.stringify(values[key]) } : null
    )
  } as unknown as R2Bucket;
}

/** 前端路径：与 src/lib/community-snapshot.ts 第 5 行的组装方式保持一致 */
function siteViewOf(linksPayload: unknown, feedPayload: unknown) {
  return communityData(importSiteSubscriptions(linksPayload, feedPayload), feedPayload);
}

const v2Links = {
  communitySchemaVersion: 2,
  siteInfo: { title: '柒色墨笺', url: 'https://vii.ink/', description: '描述', avatar: '/author/avatar.webp' },
  links: [
    {
      id: 'a', name: 'A', url: 'https://a.test/', description: '甲', avatar: '',
      feed: 'https://a.test/feed', is_active: true, show_in_links: true, feed_enabled: true
    },
    {
      id: 'b', name: 'B', url: 'https://b.test/', description: '乙', avatar: '',
      is_active: false, show_in_links: false, feed_enabled: false
    }
  ]
};

const v2Feed = {
  subscriptions: [
    {
      name: 'A', url: 'https://a.test/', description: '甲', avatar: '',
      feedUrl: 'https://a.test/feed', updated: '2026-09-16T00:00:00.000Z', lastError: '',
      latestItems: [{ title: '新文章', url: 'https://a.test/p', date: '2026-09-15', summary: '摘要' }]
    }
  ]
};

describe('友链与订阅：后台视图 === 前端视图', () => {
  it('两边看到同一份数据时，公开视图逐字段相同', async () => {
    const adminView = publicCommunity(await readCommunity(bucketOf({ 'data/links.json': v2Links, 'data/feed.json': v2Feed })));
    const siteView = publicCommunity(siteViewOf(v2Links, v2Feed));
    expect(adminView).toEqual(siteView);
  });

  it('连内部结构（订阅列表、缓存条目）也一致，不只是公开投影', async () => {
    const admin = await readCommunity(bucketOf({ 'data/links.json': v2Links, 'data/feed.json': v2Feed }));
    const site = siteViewOf(v2Links, v2Feed);
    expect({ siteInfo: admin.siteInfo, links: admin.links, subscriptions: admin.subscriptions, latestItems: admin.latestItems })
      .toEqual(site);
  });

  it('R2 缺少对象时后台回退到打包快照，与前端完全同源', async () => {
    const fallback = await readCommunity(bucketOf({}));
    expect(fallback.source).toBe('snapshot');
    expect(fallback.links).toEqual(communitySnapshot.links);
    expect(fallback.subscriptions).toEqual(communitySnapshot.subscriptions);
    expect(fallback.latestItems).toEqual(communitySnapshot.latestItems);
  });

  it('R2 里的空列表是权威值，不会被打包快照顶回去', async () => {
    const empty = await readCommunity(bucketOf({ 'data/links.json': { communitySchemaVersion: 2, links: [] }, 'data/feed.json': { subscriptions: [] } }));
    expect(empty.links).toEqual([]);
    expect(empty.subscriptions).toEqual([]);
    expect(empty.latestItems).toEqual([]);
    expect(empty.source).toBe('r2');
  });
});

describe('避免 v1 数据导致的前后端分歧', () => {
  // v1（没有 communitySchemaVersion / show_in_links / feed_enabled）时，
  // 前端会走 importSiteSubscriptions，把「只有订阅、没有友链」的站点补成隐藏友链；
  // 后台的 readCommunity 不做这一步 —— 两边就会不一致。
  // 因此仓库里的 links 快照必须是 v2，这个分歧才不会被触发。
  it('仓库中的友链快照已是 schema v2', () => {
    expect(communitySchemaVersion).toBe(2);
    expect(bundledLinks.length).toBeGreaterThan(0);
  });

  it('每条友链都带 v2 标记，importSiteSubscriptions 会直接短路', () => {
    const marked = bundledLinks.filter(
      (link) => typeof link.show_in_links === 'boolean' || typeof link.feed_enabled === 'boolean'
    );
    expect(marked.length).toBe(bundledLinks.length);

    // 短路意味着不会再从 feed 里补进额外友链，前后端输入因此相同
    const imported = importSiteSubscriptions(
      { communitySchemaVersion, siteInfo: {}, links: bundledLinks },
      { subscriptions: [{ name: '仅订阅站点', url: 'https://only-feed.test/', feedUrl: 'https://only-feed.test/feed' }] }
    );
    expect(imported.links).toHaveLength(bundledLinks.length);
  });
});

// 还原快照：R2 的 data/links.json 被写坏时，用它把原始友链推回后台。
// 这个文件是「前台原始数据」的唯一权威副本，一旦它自身腐化，还原就会把错误数据推回 R2，
// 所以这里把它和前端真正渲染的内容绑死。
describe('还原快照 scripts/data/links.original.json', () => {
  const payload = () => JSON.parse(readFileSync(path.join(repoRoot, 'scripts/data/links.original.json'), 'utf8'));

  it('还原后前台看到的友链，与当前打包快照逐字段相同', () => {
    const restored = publicCommunity(siteViewOf(payload(), { subscriptions: [] }));
    const bundled = publicCommunity(communitySnapshot);
    expect(restored.links).toEqual(bundled.links);
    expect(restored.siteInfo).toEqual(bundled.siteInfo);
  });

  it('条目数与隐藏集合不退化', () => {
    const data = payload();
    expect(data.communitySchemaVersion).toBe(2);
    expect(data.links).toHaveLength(bundledLinks.length);

    const ids = (list: { id: string; is_active?: boolean }[]) =>
      list.filter((link) => link.is_active === false).map((link) => link.id);
    expect(ids(data.links)).toEqual(ids(bundledLinks));

    // 可见友链必须占多数 —— 历史上出现过「46 条只剩 1 条可见」的线上事故
    expect(data.links.filter((link) => link.is_active !== false).length)
      .toBeGreaterThan(data.links.length / 2);
  });

  it('siteInfo 四个字段都不为空（空 siteInfo 会让友链页的站点信息整块空白）', () => {
    const info = payload().siteInfo as Record<string, unknown>;
    for (const field of ['title', 'url', 'description', 'avatar']) {
      expect(String(info[field] ?? '').trim(), `siteInfo.${field} 不能为空`).not.toBe('');
    }
  });
});

// ============================================================================
// 「以后台为准，映射前端」的字面含义，就是这条等式：
//
//   linksModuleSource(R2 的 data/links.json) === 仓库里的 src/data/links.ts
//
// 只要 R2 里是这份内容，前端构建输入就必然是这份文件。生成器一旦漂移
// （字段顺序变了、少写一个字段、序列化方式换了），后台与前端就会在
// **没有任何报错**的情况下悄悄分叉 —— 友链页照常渲染，只是内容不对。
// 所以这里比对字节，而不是比对解析后的对象。
// ============================================================================
describe('后台数据 → 前端模块的映射等式', () => {
  const snapshotPath = path.join(repoRoot, 'scripts/data/links.original.json');
  const generatedFromSnapshot = () => linksModuleSource(readFileSync(snapshotPath, 'utf8'));

  it('linksModuleSource(还原快照) === 仓库里的 src/data/links.ts（逐字节相同）', () => {
    expect(generatedFromSnapshot()).toBe(readFileSync(path.join(repoRoot, 'src/data/links.ts'), 'utf8'));
  });

  it('映射是纯函数：同一份输入连续生成两次，结果完全一致', () => {
    const once = generatedFromSnapshot();
    expect(generatedFromSnapshot()).toBe(once);
  });

  it('空数据也走同一条路径，不会生成出与前端形状不同的模块', () => {
    const empty = linksModuleSource(JSON.stringify({ communitySchemaVersion: 2, siteInfo: {}, links: [] }));
    expect(empty).toContain('export const links: LinkItem[] = [');
    // 空输入不应该让「可见友链」这个指标变成无法解析的值（同步侧靠它做骤减告警）
    expect(empty).toMatch(/export const links: LinkItem\[\] = \[\]/);
  });

  // 骤减告警数的是 visibleLinksOf（is_active !== false 且 show_in_links !== false），
  // 前端渲染用的是 publicCommunity 的过滤。两者口径一旦漂移，告警就会误报或漏报 ——
  // 而告警本身正是用来兜住「前端友链页悄悄变空」的，它自己失准就完全失去意义。
  it('骤减告警的计数口径 === 前端实际渲染出来的条数', () => {
    const moduleText = readFileSync(path.join(repoRoot, 'src/data/links.ts'), 'utf8');
    expect(visibleLinkCount(moduleText)).toBe(publicCommunity(communitySnapshot).links.length);
    expect(visibleLinkCount(moduleText)).toBeGreaterThan(0);
  });
});

// ============================================================================
// 还原脚本（scripts/data/restore-links.console.js）里写死的期望值，
// 是「还原成功」这件事的判据。它必须等于前端真正会渲染出来的数字 ——
// 否则用户照着脚本自检，会被一个错误的期望值误导。
//
// 期望值由 `push-site-data.mjs` 用下面这两个函数算出后内联进脚本，
// 所以只要这里成立，生成物里的数字就是可信的。
// ============================================================================
describe('还原脚本的期望值 === 前端渲染口径', () => {
  const snapshot = () => JSON.parse(readFileSync(path.join(repoRoot, 'scripts/data/links.original.json'), 'utf8'));

  it('可见友链数：visibleLinksOf 与 publicCommunity 一致', () => {
    expect(visibleLinksOf(snapshot()).length).toBe(publicCommunity(communitySnapshot).links.length);
  });

  it('订阅数：subscriptionsOf 与 communityData 的订阅列表一致', () => {
    expect(subscriptionsOf(snapshot()).length).toBe(communitySnapshot.subscriptions.length);
  });

  it('两者都取自同一份 46 条载荷，且可见数占多数', () => {
    const data = snapshot();
    expect(visibleLinksOf(data).length).toBe(41);
    expect(subscriptionsOf(data).length).toBe(46);
  });
});

// ============================================================================
// 口径镜像的钉死测试
//
// `scripts/lib/content-sync.mjs` 里的 visibleLinksOf / subscriptionsOf 是
// `src/lib/community.ts` 里 normalizeLinks / webUrl 的**手抄副本** —— 因为那边是
// TypeScript、这边要给 .mjs 脚本用，没法直接 import。手抄就会漂移。
//
// 所以这里用一批畸形载荷把两者钉在一起：只要有一边改了而另一边没跟上，
// 下面任意一条就会红。真实数据（46 条整整齐齐）覆盖不到这些边角。
// ============================================================================
describe('口径镜像：content-sync.mjs 与 community.ts 必须一致', () => {
  const cases: Record<string, Record<string, unknown>> = {
    '缺 name': { links: [{ url: 'https://a.test/' }] },
    '缺 url': { links: [{ name: 'A' }] },
    'url 不是字符串': { links: [{ name: 'A', url: 123 }] },
    'url 只有空白': { links: [{ name: 'A', url: '   ' }] },
    'url 非 http 协议': { links: [{ name: 'A', url: 'ftp://a.test/' }] },
    'url 带凭据': { links: [{ name: 'A', url: 'https://u:p@a.test/' }] },
    'url 是裸域名': { links: [{ name: 'A', url: 'https://a.test', feed: 'https://a.test/feed' }] },
    'name 带首尾空白': { links: [{ name: '  A  ', url: 'https://a.test/' }] },
    '条目混入 null / 数字 / 字符串': { links: [null, 0, 'x', { name: 'B', url: 'https://b.test/' }] },
    'feed 写在 feedUrl 字段里': { links: [{ name: 'A', url: 'https://a.test/', feedUrl: 'https://a.test/feed' }] },
    '两条 feed 只差尾斜杠（应去重成 1 个订阅）': {
      links: [
        { name: 'A', url: 'https://a.test/', feed: 'https://a.test/feed' },
        { name: 'B', url: 'https://b.test/', feed: 'https://a.test/feed/' }
      ]
    },
    'show_in_links 为 false': {
      links: [{ name: 'A', url: 'https://a.test/', show_in_links: false, feed: 'https://a.test/feed' }]
    },
    'is_active 为 false 且未给 feed_enabled': {
      links: [{ name: 'A', url: 'https://a.test/', is_active: false, feed: 'https://a.test/feed' }]
    },
    'feed_enabled 显式 false': {
      links: [{ name: 'A', url: 'https://a.test/', feed_enabled: false, feed: 'https://a.test/feed' }]
    },
    'links 不是数组': { links: 'nope' },
    '完全没有 links 字段': {}
  };

  for (const [label, payload] of Object.entries(cases)) {
    it(label, () => {
      const input = { communitySchemaVersion: 2, ...payload };
      const view = siteViewOf(input, { subscriptions: [] });

      expect(visibleLinksOf(input), `可见友链数不一致（${label}）`)
        .toHaveLength(publicCommunity(view).links.length);
      expect(subscriptionsOf(input), `订阅数不一致（${label}）`)
        .toHaveLength(view.subscriptions.length);
    });
  }
});

// 真实数据比对：需要本地模拟 R2（开发者机器上有，CI 上没有，自动跳过）
describe.skipIf(!existsSync(localBucketRoot))('本地 R2 与打包快照的真实数据等价性', () => {
  it('后台读本地 R2 得到的视图，与前端渲染的快照完全一致', async () => {
    const { source } = await resolveContentSource({
      env: { ...process.env, ADMIN_R2_SOURCE: 'local' },
      projectRoot: repoRoot
    });
    expect(source).not.toBeNull();

    const r2 = {
      get: vi.fn(async (key: string) => {
        try {
          return { text: async () => (await source!.getObject(key)).toString('utf8') };
        } catch {
          return null;
        }
      })
    } as unknown as R2Bucket;

    const admin = await readCommunity(r2);
    expect(admin.source).toBe('r2');

    expect({ siteInfo: admin.siteInfo, links: admin.links, subscriptions: admin.subscriptions, latestItems: admin.latestItems })
      .toEqual(communitySnapshot);
    expect(publicCommunity(admin)).toEqual(publicCommunity(communitySnapshot));
  });
});
