/** Shared by the static site and admin Worker. Links are the subscription registry. */
export const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function webUrl(value: unknown, base?: string): string {
  if (!text(value)) return '';
  try {
    const url = new URL(text(value), base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function imageUrl(value: unknown): string {
  const url = text(value);
  return /^\/(?!\/)/.test(url) ? url : webUrl(url);
}

export function normalizeLinks(value: unknown) {
  const data = record(value);
  const info = record(data.siteInfo);
  return {
    communitySchemaVersion: Number(data.communitySchemaVersion) >= 2 ? 2 : 1,
    siteInfo: { title: text(info.title), url: webUrl(info.url), avatar: imageUrl(info.avatar), description: text(info.description) },
    links: (Array.isArray(data.links) ? data.links : []).map((item) => {
      const link = record(item);
      return {
        ...link,
        id: text(link.id) || text(link.url), name: text(link.name), url: webUrl(link.url),
        avatar: imageUrl(link.avatar), description: text(link.description),
        feed: webUrl(link.feed ?? link.feedUrl), is_active: link.is_active !== false,
        show_in_links: link.show_in_links !== false,
        feed_enabled: typeof link.feed_enabled === 'boolean' ? link.feed_enabled : link.is_active !== false
      };
    }).filter((link) => link.name && link.url)
  };
}

export function normalizeItems(value: unknown) {
  return (Array.isArray(value) ? value : []).map((item) => {
    const entry = record(item);
    return {
      title: text(entry.title), url: webUrl(entry.url || entry.link),
      summary: text(entry.summary || entry.description), date: text(entry.date || entry.updated)
    };
  }).filter((item) => item.title && item.url);
}

export function communityData(linksValue: unknown, feedValue: unknown) {
  const { siteInfo, links } = normalizeLinks(linksValue);
  const feed = record(feedValue);
  const cached = new Map((Array.isArray(feed.subscriptions) ? feed.subscriptions : []).map((item) => {
    const sub = record(item);
    return [webUrl(sub.feedUrl || sub.feed), sub];
  }));
  const seenFeeds = new Set<string>();
  const subscriptions = links.filter((link) => {
    if (!link.feed_enabled || !link.feed || seenFeeds.has(link.feed)) return false;
    seenFeeds.add(link.feed);
    return true;
  }).map((link) => {
    const previous = cached.get(link.feed);
    return {
      name: link.name, url: link.url, avatar: link.avatar, description: link.description,
      feedUrl: link.feed, updated: text(previous?.updated), lastError: text(previous?.lastError),
      latestItems: normalizeItems(previous?.latestItems)
    };
  });
  const seenItems = new Set<string>();
  const latestItems = subscriptions.flatMap((sub) => sub.latestItems.map((item) => ({
    ...item, source: sub.name, sourceUrl: sub.url, avatar: sub.avatar
  }))).filter((item) => {
    if (seenItems.has(item.url)) return false;
    seenItems.add(item.url);
    return true;
  }).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return { siteInfo, links, subscriptions, latestItems };
}

/** Explicit public projection: never expose feed tokens, diagnostics or arbitrary R2 fields. */
export function publicCommunity(data: ReturnType<typeof communityData>) {
  return {
    siteInfo: data.siteInfo,
    links: data.links.filter((link) => link.is_active && link.show_in_links).map(({ id, name, url, avatar, description }) => ({ id, name, url, avatar, description })),
    subscriptionCount: data.subscriptions.length,
    latestItems: data.latestItems
  };
}

export function formatFeedDate(raw: string) {
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function feedSummary(raw: string) {
  return raw.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 160);
}

/** One-time import of the site's existing subscription registry, including feed-only sites. */
export function importSiteSubscriptions(linksValue: unknown, feedValue: unknown) {
  const raw = record(linksValue);
  const rawLinks = Array.isArray(raw.links) ? raw.links.map(record) : [];
  if (Number(raw.communitySchemaVersion) >= 2 || rawLinks.some((link) => 'feed_enabled' in link || 'show_in_links' in link)) {
    return { ...normalizeLinks(linksValue), communitySchemaVersion: 2 };
  }

  const value = normalizeLinks(linksValue);
  const feed = record(feedValue);
  for (const raw of Array.isArray(feed.subscriptions) ? feed.subscriptions : []) {
    const sub = record(raw);
    const feedUrl = webUrl(sub.feedUrl || sub.feed);
    const url = webUrl(sub.url);
    if (!feedUrl || !url || !text(sub.name)) continue;
    const existing = value.links.find((link) => link.feed === feedUrl || link.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
    if (existing) {
      existing.feed ||= feedUrl;
      existing.feed_enabled = true;
    } else {
      value.links.push(...normalizeLinks({ links: [{ ...sub, id: url, feed: feedUrl, is_active: true, show_in_links: false, feed_enabled: true }] }).links);
    }
  }
  return { ...value, communitySchemaVersion: 2 };
}
