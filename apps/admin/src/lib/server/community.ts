import { communityData, normalizeLinks, publicCommunity } from '../../../../../src/lib/community';
import { communityLinksSnapshot, communityFeedSnapshot, communitySnapshot } from '../../../../../src/lib/community-snapshot';
import { readJsonData, writeJsonData } from './r2/site-data';

const PUBLISHED_KEY = 'published/community.json';
type Publication = ReturnType<typeof publicCommunity>;

export async function readPublishedCommunity(r2?: R2Bucket): Promise<Publication> {
  const object = await r2?.get(PUBLISHED_KEY);
  return object ? JSON.parse(await object.text()) as Publication : publicCommunity(communitySnapshot);
}

export async function prepareCommunityPublication(r2: R2Bucket): Promise<Publication> {
  return publicCommunity(await readCommunity(r2));
}

export async function publishCommunity(r2: R2Bucket, publication: Publication) {
  await r2.put(PUBLISHED_KEY, JSON.stringify(publication), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { publishedAt: new Date().toISOString() }
  });
}

export async function readCommunity(r2?: R2Bucket) {
  // A saved empty list is authoritative. Only a missing object uses the bundled snapshot.
  const [storedLinks, storedFeed] = r2 ? await Promise.all([
    readJsonData<unknown>(r2, 'links', null), readJsonData<unknown>(r2, 'feed', null)
  ]) : [null, null];
  const linksValue = storedLinks ?? communityLinksSnapshot;
  const feedValue = storedFeed ?? communityFeedSnapshot;
  return {
    ...communityData(linksValue, feedValue),
    value: normalizeLinks(linksValue),
    source: storedLinks === null ? 'snapshot' : 'r2'
  };
}

export async function saveCommunityLinks(r2: R2Bucket, value: unknown) {
  const data = value as { links?: unknown[] } | null;
  if (!data || !Array.isArray(data.links)) throw new Error('友链数据必须包含 links 数组');
  const normalized = normalizeLinks(value);
  if (normalized.links.length !== data.links.length) throw new Error('每条友链都需要名称和有效的 HTTP(S) 网址');
  await writeJsonData(r2, 'links', { ...normalized, communitySchemaVersion: 2 });
  return normalized;
}
