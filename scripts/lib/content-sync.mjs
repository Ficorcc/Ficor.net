import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

/**
 * 由 R2 的 `data/links.json` 派生 `src/data/links.ts`。
 *
 * 生成结果刻意保留 `LinkItem` / `SiteInfo` 两个接口与带类型注解的导出，
 * 与仓库里原有的手写版本形状保持一致：消费方 `src/lib/community-snapshot.ts`
 * 按 `{ communitySchemaVersion, siteInfo, links }` 取值，不需要改动，
 * 类型也仍然可用。不要简化成裸对象导出，那会丢掉类型定义。
 *
 * 同步脚本与一致性检查脚本共用本函数 —— 两边必须生成完全相同的内容，
 * 否则检查会报出假阳性。
 *
 * @param {string} jsonText
 * @returns {string}
 */
export function linksModuleSource(jsonText) {
  const payload = JSON.parse(jsonText);
  const version = Number(payload.communitySchemaVersion) >= 2 ? 2 : 1;
  const info = payload.siteInfo ?? {};
  const siteInfo = {
    title: String(info.title ?? ''),
    url: String(info.url ?? ''),
    description: String(info.description ?? ''),
    avatar: String(info.avatar ?? '')
  };
  const links = Array.isArray(payload.links) ? payload.links : [];

  return `// Generated from admin R2 data/links.json during content sync.
// 请勿手改：下次同步会覆盖本文件。要改内容请编辑后台的友链数据。

export interface LinkItem {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string;
  feed?: string;
  is_active?: boolean;
  status?: 'unknown' | 'online' | 'offline';
  statusCode?: number;
  lastChecked?: string;
  lastError?: string;
  show_in_links?: boolean;
  feed_enabled?: boolean;
}

export interface SiteInfo {
  title: string;
  url: string;
  description: string;
  avatar: string;
}

export const communitySchemaVersion = ${version};

export const siteInfo: SiteInfo = ${JSON.stringify(siteInfo, null, 2)};

export const links: LinkItem[] = ${JSON.stringify(links, null, 2)};
`;
}

/**
 * 把 R2 `data/<name>` 对象名映射到仓库目标文件（相对项目根）。
 *
 * 只有这里列出的对象会被同步/检查：
 *   links.json  → src/data/links.ts      （派生，走 linksModuleSource）
 *   feed.json   → src/config/feed.json   （原样）
 *   其它 *.json → src/data/<name>        （原样）
 *
 * @param {string} name 例如 `links.json`
 * @returns {{ path: string; generated: boolean } | null}
 */
export function dataObjectTarget(name) {
  if (!name.endsWith('.json')) return null;
  if (name.includes('/') || name.includes('\\') || name === '..') return null;

  if (name === 'links.json') return { path: 'src/data/links.ts', generated: true };
  if (name === 'feed.json') return { path: 'src/config/feed.json', generated: false };
  return { path: `src/data/${name}`, generated: false };
}

/**
 * 从「R2 里的原始 JSON 对象」或「`linksModuleSource` 生成的 TS 模块」中取出 links 数组。
 *
 * 同步脚本要拿它做「站点数据骤减」比对，而这两处比对发生在落盘之前 ——
 * 一侧是 R2 的原始对象，另一侧是仓库里已经生成的模块，形态不同，
 * 所以不能直接 `JSON.parse` 整段文本。
 *
 * @param {string | Buffer | null | undefined} text
 * @returns {unknown[] | null} 无法解析时返回 null（宁可不告警，也不要误报）
 */
export function linkArrayOf(text) {
  if (text === null || text === undefined) return null;
  const source = Buffer.isBuffer(text) ? text.toString('utf8') : String(text);

  // 形态一：R2 里的原始对象 { communitySchemaVersion, siteInfo, links }
  if (source.trimStart().startsWith('{')) {
    try {
      const payload = JSON.parse(source);
      return Array.isArray(payload.links) ? payload.links : null;
    } catch {
      return null;
    }
  }

  // 形态二：生成的模块 `export const links: LinkItem[] = [ ... ]`
  // 不能直接找标记后的第一个 `[` —— 类型注解 `LinkItem[]` 就带方括号，
  // 那样会切出 `[] = [ ... ]` 这种解析不了的东西。必须先越过 `=` 再找。
  const marker = 'export const links';
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;

  const assignIndex = source.indexOf('=', markerIndex + marker.length);
  if (assignIndex === -1) return null;

  const start = source.indexOf('[', assignIndex);
  const end = source.lastIndexOf(']');
  if (start === -1 || end <= start) return null;

  try {
    const list = JSON.parse(source.slice(start, end + 1));
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 「可见友链 / 订阅」的判定
//
// 这两份判定必须与前端 `src/lib/community.ts` 逐条对齐 —— 它们同时驱动
// 同步侧的骤减告警、还原脚本的期望值、以及一致性检查。口径一旦漂移，
// 「告警」和「自检」会同时失准，而这两个东西正是用来兜住友链页悄悄变空的。
//
// 下面三个小函数是 `community.ts` 里 `text` / `webUrl` / `normalizeLinks`
// 的镜像。**改那边就必须改这里** —— 等价性由
// `apps/admin/tests/community-parity.test.ts` 用一批畸形载荷钉住。
// ---------------------------------------------------------------------------

/** 镜像 `community.ts` 的 `text()`：只有字符串才算数，并 trim。 */
const textOf = (value) => (typeof value === 'string' ? value.trim() : '');

/** 镜像 `community.ts` 的 `webUrl()`：非 http(s) 或带凭据一律视为空。 */
function webUrl(value) {
  const raw = textOf(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * 把一条原始友链归一化成「前端会真正看到的样子」。
 * 返回 null 表示这条在前端根本不存在（`normalizeLinks` 会把它过滤掉）。
 */
function normalizedLink(value) {
  const link = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const name = textOf(link.name);
  const url = webUrl(link.url);
  if (!name || !url) return null;

  return {
    name,
    url,
    // 与 normalizeLinks 一致：feed 缺失时回退到 feedUrl 字段
    feed: webUrl(link.feed ?? link.feedUrl),
    is_active: link.is_active !== false,
    show_in_links: link.show_in_links !== false,
    // 缺省时跟随 is_active —— 注意这意味着「离线且未显式开启」的友链不订阅
    feed_enabled: typeof link.feed_enabled === 'boolean' ? link.feed_enabled : link.is_active !== false
  };
}

/** 载荷里所有「前端能看到」的友链，已归一化。 */
function normalizedLinks(payload) {
  const list = Array.isArray(payload?.links) ? payload.links : [];
  return list.map(normalizedLink).filter(Boolean);
}

/**
 * 从已解析的载荷里挑出「可见友链」—— 口径与前端 `publicCommunity` 一致：
 * `is_active` **且** `show_in_links`。
 *
 * 只按 `is_active` 数会多算：`show_in_links: false` 正是「在线但不显示在友链页」
 * 那个开关，用它下掉一条友链时，自检就会误报「数量与预期不符」。
 *
 * @param {unknown} payload `data/links.json` 解析后的对象
 * @returns {Record<string, unknown>[]}
 */
export function visibleLinksOf(payload) {
  return normalizedLinks(payload).filter((link) => link.is_active && link.show_in_links);
}

/**
 * 从已解析的载荷里挑出「订阅」—— 口径与前端 `communityData` 一致：
 * `feed_enabled`、有 `feed`、且按**归一化后**的 feed URL 去重。
 *
 * 注意它与 `subscriptionCount` 不是一回事：那个数的是 `data/feed.json` 里的
 * **抓取缓存条目**，这个是**注册表派生**出来的订阅（只订阅不上友链的站点也算）。
 *
 * @param {unknown} payload `data/links.json` 解析后的对象
 * @returns {Record<string, unknown>[]}
 */
export function subscriptionsOf(payload) {
  const seen = new Set();
  return normalizedLinks(payload).filter((link) => {
    if (!link.feed_enabled || !link.feed || seen.has(link.feed)) return false;
    seen.add(link.feed);
    return true;
  });
}

/**
 * 可见友链数（吃文本，供同步脚本读文件用）。
 *
 * @param {string | Buffer | null | undefined} text
 * @returns {number | null}
 */
export function visibleLinkCount(text) {
  const list = linkArrayOf(text);
  if (list === null) return null;
  return visibleLinksOf({ links: list }).length;
}

/**
 * 订阅数（`feed.json` 的 subscriptions 长度）。订阅与友链相互独立 ——
 * 一条友链可以只做订阅、不显示在友链页，所以两者必须分开计数。
 *
 * @param {string | Buffer | null | undefined} text
 * @returns {number | null}
 */
export function subscriptionCount(text) {
  if (text === null || text === undefined) return null;
  const source = Buffer.isBuffer(text) ? text.toString('utf8') : String(text);
  try {
    const payload = JSON.parse(source);
    return Array.isArray(payload.subscriptions) ? payload.subscriptions.length : null;
  } catch {
    return null;
  }
}

/**
 * 每个站点数据对象的规模指标。base 是告警基线（数据量太小时不告警，
 * 避免开发初期噪声），ratio 是触发比例 —— 指标跌破 base 的 ratio 倍即视为骤减。
 */
export const DATA_METRICS = {
  'links.json': { label: '可见友链', count: visibleLinkCount, base: 5, ratio: 0.5 },
  'feed.json': { label: '订阅', count: subscriptionCount, base: 5, ratio: 0.5 }
};

/**
 * 判断某个站点数据对象是否「骤减」。
 *
 * @param {string} name R2 对象名，例如 `links.json`
 * @param {string | Buffer | null} beforeText 仓库现有内容
 * @param {string | Buffer | null} afterText R2 待写入内容
 * @returns {{ name: string; label: string; before: number; after: number } | null}
 */
export function detectDataCollapse(name, beforeText, afterText) {
  const metric = DATA_METRICS[name];
  if (!metric) return null;

  const before = metric.count(beforeText);
  const after = metric.count(afterText);
  if (before === null || after === null) return null;
  if (before < metric.base || after > before * metric.ratio) return null;

  return { name, label: metric.label, before, after };
}

/**
 * @param {string} key
 * @param {string} [prefix]
 * @returns {string | null}
 */
export function contentRelativePathFromKey(key, prefix = 'content/') {
  if (!key.startsWith(prefix) || !key.endsWith('.md')) return null;
  const relativePath = key.slice(prefix.length).replace(/\\/g, '/');
  if (!relativePath || relativePath.split('/').some((part) => part === '..' || part === '')) return null;
  return relativePath;
}

/**
 * @param {string} key
 * @param {string} [prefix]
 * @returns {string | null}
 */
export function tombstoneRelativePathFromKey(key, prefix = 'deleted/content/') {
  if (!key.startsWith(prefix) || !key.endsWith('.json')) return null;
  const raw = key.slice(prefix.length, -'.json'.length).replace(/\\/g, '/');
  const [collection, slug, extra] = raw.split('/');
  if (extra || !collection || !slug || collection === '..' || slug === '..') return null;
  return `${collection}/${slug}.md`;
}

/**
 * @param {string} dir
 * @param {string} [base]
 * @returns {Promise<string[]>}
 */
export async function collectLocalFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  /** @type {string[]} */
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectLocalFiles(fullPath, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, fullPath).replace(/\\/g, '/'));
    }
  }

  return files;
}

/**
 * @param {{ contentRoot: string; remoteRelativePaths: Set<string>; tombstoneKeys: string[] }} input
 * @returns {Promise<number>}
 */
export async function pruneDeletedContent(input) {
  const { contentRoot, remoteRelativePaths, tombstoneKeys } = input;
  const localFiles = new Set(await collectLocalFiles(contentRoot));
  let removed = 0;

  for (const key of tombstoneKeys) {
    const relativePath = tombstoneRelativePathFromKey(key);
    if (!relativePath || remoteRelativePaths.has(relativePath) || !localFiles.has(relativePath)) continue;
    await rm(path.join(contentRoot, relativePath), { force: true });
    removed++;
  }

  return removed;
}
