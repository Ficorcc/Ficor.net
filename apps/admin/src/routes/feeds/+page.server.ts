import type { PageServerLoad } from './$types';
import { readJsonData } from '$lib/server/r2/site-data';
import { fetchSourceFeed, fetchSourceLinks } from '$lib/server/site-source';

const fallbackFeed = {
  siteTitle: '',
  siteDescription: '',
  siteUrl: '',
  feedUrl: '/rss.xml',
  subscriptions: []
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeLinkSubscriptions(links: unknown[]): Record<string, unknown>[] {
  const subscriptions: Record<string, unknown>[] = [];
  for (const item of links) {
    const link = toRecord(item);
    const feedUrl = text(link.feed) || text(link.feedUrl);
    if (!feedUrl) continue;
    subscriptions.push({
      name: text(link.name),
      url: text(link.url),
      feedUrl,
      avatar: text(link.avatar),
      description: text(link.description),
      latestItems: []
    });
  }
  return subscriptions;
}

function normalizeLatestItems(subscriptions: unknown[]) {
  return subscriptions
    .flatMap((sub) => {
      const source = toRecord(sub);
      const latestItems = Array.isArray(source.latestItems) ? source.latestItems : [];
      return latestItems.map((item) => {
        const entry = toRecord(item);
        return {
          title: text(entry.title),
          url: text(entry.url) || text(entry.link),
          summary: text(entry.summary) || text(entry.description),
          date: text(entry.date) || text(entry.updated),
          source: text(source.name) || text(entry.source_title) || text(entry.source),
          sourceUrl: text(source.url),
          avatar: text(source.avatar)
        };
      });
    })
    .filter((item) => item.title && item.url)
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

export const load: PageServerLoad = async ({ platform }) => {
  if (!platform?.env?.R2) {
    return { value: fallbackFeed, subscriptions: [], latestItems: [], source: 'fallback', error: 'R2 未配置' };
  }

  try {
    const r2Feed = await readJsonData<Record<string, unknown>>(platform.env.R2, 'feed', fallbackFeed);
    const r2Subscriptions = Array.isArray(r2Feed.subscriptions) ? r2Feed.subscriptions : [];
    const sourceFeed = r2Subscriptions.length > 0 ? null : await fetchSourceFeed(platform.env);
    const sourceSubscriptions = Array.isArray(sourceFeed?.subscriptions) ? sourceFeed.subscriptions : [];
    const sourceLinks = await fetchSourceLinks(platform.env);
    const linkSubscriptions = normalizeLinkSubscriptions(Array.isArray(sourceLinks?.links) ? sourceLinks.links : []);
    const subscriptions = sourceSubscriptions.length > 0 ? sourceSubscriptions : linkSubscriptions;
    const value =
      sourceFeed && sourceSubscriptions.length > 0
        ? sourceFeed
        : {
            ...r2Feed,
            subscriptions
          };
    const latestItems = normalizeLatestItems(subscriptions);
    return {
      value,
      subscriptions,
      latestItems,
      source: sourceSubscriptions.length > 0 ? 'source-feed' : 'links'
    };
  } catch (e) {
    return { value: fallbackFeed, subscriptions: [], latestItems: [], source: 'fallback', error: e instanceof Error ? e.message : '加载失败' };
  }
};
