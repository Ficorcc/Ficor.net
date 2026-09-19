import { afterEach, describe, expect, it, vi } from 'vitest';
import { communityData, importSiteSubscriptions, publicCommunity } from '../../../src/lib/community';
import { readCommunity, saveCommunityLinks } from '../src/lib/server/community';
import { parseFeed, refreshCommunityFeeds } from '../src/lib/server/community-feeds';

const link = { id: 'a', name: 'A', url: 'https://a.test', feed: 'https://a.test/rss', avatar: '', description: '', is_active: true };
const item = { title: '文章', url: 'https://a.test/post', date: '2026-09-15', summary: '内容' };
const feed = { subscriptions: [{ name: '旧名称', feedUrl: link.feed, latestItems: [item] }] };
function bucket(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get: vi.fn(async (key: string) => values.has(key) ? { text: async () => JSON.stringify(values.get(key)) } : null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, JSON.parse(value)); })
  };
}
const asR2 = (value: ReturnType<typeof bucket>) => value as unknown as R2Bucket;
afterEach(() => vi.unstubAllGlobals());

describe('shared community data', () => {
  it('uses R2 articles with current link metadata and discards deleted or disabled sources', () => {
    const data = communityData({ links: [link, { ...link, feed: 'https://off.test/rss', is_active: false }] }, {
      subscriptions: [...feed.subscriptions, { feedUrl: 'https://deleted.test/rss', latestItems: [{ ...item, url: 'https://deleted.test/post' }] }]
    });
    expect(data.subscriptions).toHaveLength(1);
    expect(data.latestItems).toEqual([{ ...item, source: 'A', sourceUrl: 'https://a.test/', avatar: '' }]);
  });
  it('treats empty saved links and feed caches as authoritative', async () => {
    const empty = await readCommunity(asR2(bucket({ 'data/links.json': { links: [] } })));
    expect(empty.links).toEqual([]);
    expect(empty.latestItems).toEqual([]);
    const fresh = await readCommunity(asR2(bucket({ 'data/links.json': { links: [link] }, 'data/feed.json': { subscriptions: [] } })));
    expect(fresh.subscriptions).toHaveLength(1);
    expect(fresh.latestItems).toEqual([]);
  });
  it('save, reload and public view share the same R2 objects', async () => {
    const r2 = asR2(bucket({ 'data/feed.json': feed }));
    await saveCommunityLinks(r2, { links: [{ ...link, name: '修改后的名称' }] });
    expect(publicCommunity(await readCommunity(r2)).latestItems[0]?.source).toBe('修改后的名称');
    await saveCommunityLinks(r2, { links: [] });
    expect(publicCommunity(await readCommunity(r2)).latestItems).toEqual([]);
  });
  it('drops old articles when a feed URL changes and deduplicates URLs', () => {
    expect(communityData({ links: [{ ...link, feed: 'https://a.test/new' }] }, feed).latestItems).toEqual([]);
    const data = communityData({ links: [link, { ...link, id: 'duplicate' }] }, feed);
    expect(data.subscriptions).toHaveLength(1);
    expect(data.latestItems).toHaveLength(1);
  });
  it('imports the legacy feed registry once and keeps later admin deletions authoritative', () => {
    const legacy = importSiteSubscriptions({ links: [link] }, {
      subscriptions: [
        { name: 'Only Feed', url: 'https://feed-only.test', feedUrl: 'https://feed-only.test/rss' }
      ]
    });
    expect(legacy.links).toHaveLength(2);
    expect(legacy.links.find((item) => item.name === 'Only Feed')?.show_in_links).toBe(false);
    const savedAfterDeletion = importSiteSubscriptions({ communitySchemaVersion: 2, links: [link] }, {
      subscriptions: [
        { name: 'Only Feed', url: 'https://feed-only.test', feedUrl: 'https://feed-only.test/rss' }
      ]
    });
    expect(savedAfterDeletion.links.map((item) => item.name)).toEqual(['A']);
  });
  it('only exposes public fields and rejects unsafe URLs', async () => {
    const data = publicCommunity(communityData({ links: [{ ...link, internal: 'private', avatar: 'javascript:alert(1)' }] }, feed));
    expect(JSON.stringify(data)).not.toContain('private');
    expect(JSON.stringify(data)).not.toContain('feedUrl');
    expect(data.links[0]?.avatar).toBe('');
    await expect(saveCommunityLinks(asR2(bucket()), { links: [{ name: 'bad', url: 'javascript:alert(1)' }] })).rejects.toThrow();
  });
});

describe('RSS refresh', () => {
  it('parses RSS, Atom relative links, JSON Feed and valid empty feeds', () => {
    expect(parseFeed('<rss><channel><item><title>A &amp; B</title><link>https://a.test/p</link></item></channel></rss>', link.feed)[0]?.title).toBe('A & B');
    expect(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title><link rel="self" href="/self"/><link rel="alternate" href="/post"/><updated>2026-09-15</updated></entry></feed>', link.feed)[0]?.url).toBe(item.url);
    expect(parseFeed('{"items":[{"title":"JSON","url":"/post"}]}', link.feed)[0]?.url).toBe(item.url);
    expect(parseFeed('<rss><channel><title>Empty</title></channel></rss>', link.feed)).toEqual([]);
    expect(() => parseFeed('<html>error</html>', link.feed)).toThrow();
    expect(() => parseFeed('<!DOCTYPE rss><rss/>', link.feed)).toThrow();
  });
  it('parses long feeds whose entity references exceed the library default', () => {
    // 实测有几个正常源（Yang's Blog / 老刘博客 / Counting Stars 等）里被转义的尖括号
    // 累计超过 1000 次。fast-xml-parser 5.x 默认 processEntities.maxTotalExpansions=1000
    // 会直接抛「Entity expansion limit exceeded」把整个源丢掉，这里锁住放宽后的行为。
    // 注意 &amp; 和 &#xD; 走的是别的分支、不参与计数，所以用 &lt; 来构造超限正文。
    const noisy = '<item><title>标题 &amp; &lt;标签&gt;</title><link>https://a.test/p</link>'
      + `<description>${'&lt;'.repeat(3000)}</description></item>`;
    const parsed = parseFeed(`<rss><channel>${noisy}</channel></rss>`, link.feed);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe('标题 & <标签>');
  });
  it('rejects entity-expansion bombs by refusing DTD outright', () => {
    // 放宽 maxTotalExpansions 的前提：自定义实体只能来自 DTD，而 DTD 在解析前就被拒绝。
    const bomb = '<!DOCTYPE rss [<!ENTITY a "x"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>'
      + '<rss><channel><item><title>&b;</title></item></channel></rss>';
    expect(() => parseFeed(bomb, link.feed)).toThrow('不支持包含 DTD 的订阅');
  });
  it('persists refreshed articles for admin and public views', async () => {
    const r2 = asR2(bucket({ 'data/links.json': { links: [link] }, 'data/feed.json': feed }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<rss><channel><item><title>新文章</title><link>https://a.test/new-post</link></item></channel></rss>')));
    expect(await refreshCommunityFeeds(r2)).toMatchObject({ done: true, failed: 0 });
    expect(publicCommunity(await readCommunity(r2)).latestItems[0]?.title).toBe('新文章');
  });
  it('preserves last successful articles when fetching fails', async () => {
    const r2 = asR2(bucket({ 'data/links.json': { links: [link] }, 'data/feed.json': feed }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    expect(await refreshCommunityFeeds(r2)).toMatchObject({ failed: 1 });
    expect((await readCommunity(r2)).latestItems[0]?.title).toBe(item.title);
  });
  it('does not resurrect a source deleted while fetching', async () => {
    const r2 = asR2(bucket({ 'data/links.json': { links: [link] }, 'data/feed.json': feed }));
    vi.stubGlobal('fetch', vi.fn(async () => {
      await saveCommunityLinks(r2, { links: [] });
      return new Response('<rss><channel><title>Empty</title></channel></rss>');
    }));
    await refreshCommunityFeeds(r2);
    expect((await readCommunity(r2)).subscriptions).toEqual([]);
  });
});
