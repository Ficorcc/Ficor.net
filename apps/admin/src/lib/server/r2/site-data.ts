export const DATA_KEYS = ['memos', 'links', 'feed'] as const;
export type SiteDataKey = (typeof DATA_KEYS)[number];

const DATA_OBJECT_KEYS: Record<SiteDataKey, string> = {
  memos: 'data/memos.json',
  links: 'data/links.json',
  feed: 'data/feed.json'
};

export function isSiteDataKey(value: string): value is SiteDataKey {
  return (DATA_KEYS as readonly string[]).includes(value);
}

export async function readJsonData<T>(r2: R2Bucket, key: SiteDataKey, fallback: T): Promise<T> {
  const object = await r2.get(DATA_OBJECT_KEYS[key]);
  if (!object) return fallback;

  const text = await object.text();
  if (!text.trim()) return fallback;
  return JSON.parse(text) as T;
}

export async function writeJsonData(r2: R2Bucket, key: SiteDataKey, value: unknown) {
  await r2.put(DATA_OBJECT_KEYS[key], `${JSON.stringify(value, null, 2)}\n`, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8'
    },
    customMetadata: {
      updatedAt: new Date().toISOString()
    }
  });
}
