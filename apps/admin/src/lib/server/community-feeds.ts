import { XMLParser } from 'fast-xml-parser';
import { normalizeItems, record, text, webUrl } from '../../../../../src/lib/community';
import { readCommunity } from './community';
import { writeJsonData } from './r2/site-data';

const array = (value: unknown): unknown[] => value == null ? [] : Array.isArray(value) ? value : [value];
const xmlText = (value: unknown): string => text(value) || text(record(value)['#text']);

export function parseFeed(body: string, base: string) {
  if (body.trimStart().startsWith('{')) {
    const data = record(JSON.parse(body));
    if (!Array.isArray(data.items)) throw new Error('无效的 JSON Feed');
    return normalizeItems(data.items.map((value) => {
      const item = record(value);
      return { title: item.title, url: webUrl(item.url || item.external_url, base), date: item.date_published || item.date_modified, summary: item.summary || item.content_text || item.content_html };
    })).slice(0, 10);
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new Error('不支持包含 DTD 的订阅');
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, removeNSPrefix: true }).parse(body, true);
  const rss = record(record(parsed).rss);
  const atom = record(record(parsed).feed);
  const rdf = record(record(parsed).RDF);
  if (!rss.channel && !record(parsed).feed && !record(parsed).RDF) throw new Error('未识别的 RSS/Atom 格式');
  const entries = array(record(rss.channel).item ?? atom.entry ?? rdf.item);
  return normalizeItems(entries.map((value) => {
    const item = record(value);
    const atomLink = array(item.link).find((link) => !record(link)['@_rel'] || record(link)['@_rel'] === 'alternate');
    const link = text(item.link) || text(record(atomLink)['@_href']) || xmlText(item.guid);
    return {
      title: xmlText(item.title), url: webUrl(link, base),
      date: xmlText(item.pubDate || item.published || item.updated || item.date),
      summary: xmlText(item.description || item.summary || item.content || item.encoded)
    };
  })).slice(0, 10);
}

function feedFetchUrl(raw: string) {
  const value = webUrl(raw);
  if (!value) throw new Error('订阅地址无效');
  const host = new URL(value).hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':')
    || /^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error('订阅地址必须使用公开域名');
  return value;
}

async function fetchItems(raw: string) {
  let url = feedFetchUrl(raw);
  const signal = AbortSignal.timeout(8000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, { signal, redirect: 'manual', headers: { Accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/xml, text/xml', 'User-Agent': 'vii-ink-feed-reader' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('订阅跳转地址无效');
      url = feedFetchUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let body = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 2 * 1024 * 1024) throw new Error('订阅内容超过 2 MB');
        body += decoder.decode(chunk.value, { stream: true });
      }
    } finally { await reader.cancel(); }
    return parseFeed(body + decoder.decode(), url);
  }
  throw new Error('订阅跳转次数过多');
}

export async function refreshCommunityFeeds(r2: R2Bucket, cursor = 0) {
  const data = await readCommunity(r2);
  const batch = data.subscriptions.slice(cursor, cursor + 5);
  const refreshed = await Promise.all(batch.map(async (sub) => {
    try { return { ...sub, latestItems: await fetchItems(sub.feedUrl), updated: new Date().toISOString(), lastError: '' }; }
    catch (e) { return { ...sub, lastError: e instanceof Error ? e.message : '抓取失败' }; }
  }));
  // Re-read after network work so edits/deletions made during refresh stay authoritative.
  const latest = await readCommunity(r2);
  const updates = new Map(refreshed.map((sub) => [sub.feedUrl, sub]));
  const subscriptions = latest.subscriptions.map((sub) => {
    const update = updates.get(sub.feedUrl);
    return update ? { ...sub, latestItems: update.latestItems, updated: update.updated, lastError: update.lastError } : sub;
  });
  await writeJsonData(r2, 'feed', { subscriptions });
  const nextCursor = cursor + batch.length;
  return { nextCursor, done: nextCursor >= data.subscriptions.length, total: data.subscriptions.length, failed: refreshed.filter((sub) => sub.lastError).length };
}
