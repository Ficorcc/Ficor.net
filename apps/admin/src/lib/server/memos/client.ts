export interface MemoItem {
  id: string;
  memosName?: string;
  content: string;
  visibility?: string;
  createdAt: string;
  updatedAt?: string;
  pinned?: boolean;
  resources?: unknown[];
}

interface MemosEnv {
  MEMOS_API_URL?: string;
  MEMOS_ACCESS_TOKEN?: string;
  MEMOS_FILTER?: string;
}

function normalizeEndpoint(base: string): string[] {
  const clean = base.replace(/\/+$/, '');
  if (!clean) return [];

  if (clean.endsWith('/api/v1')) {
    return [`${clean}/memos?pageSize=100`, `${clean}/memos?page_size=100`];
  }
  if (clean.endsWith('/api')) {
    return [`${clean}/v1/memos?pageSize=100`, `${clean}/memo?rowStatus=NORMAL`];
  }
  return [`${clean}/api/v1/memos?pageSize=100`, `${clean}/api/memo?rowStatus=NORMAL`];
}

function appendFilter(url: string, filter?: string): string {
  if (!filter?.trim()) return url;
  const glue = url.includes('?') ? '&' : '?';
  return `${url}${glue}${filter.replace(/^\?+|&+$/g, '')}`;
}

function pickArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.memos)) return record.memos;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') {
    const data = record.data as Record<string, unknown>;
    if (Array.isArray(data.memos)) return data.memos;
    if (Array.isArray(data.list)) return data.list;
  }
  return [];
}

function timestampToIso(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value === 'number') {
    return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  return fallback;
}

function normalizeMemo(item: unknown, index: number): MemoItem {
  const record = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
  const name = String(record.name ?? record.uid ?? record.id ?? `memos/${index + 1}`);
  const id = String(record.id ?? record.uid ?? name.split('/').pop() ?? index + 1);
  const createdAt = timestampToIso(record.createdAt ?? record.createTime ?? record.createdTs ?? record.created_ts);
  const updatedAt = timestampToIso(record.updatedAt ?? record.updateTime ?? record.updatedTs ?? record.updated_ts, createdAt);

  return {
    id,
    memosName: name,
    content: String(record.content ?? ''),
    visibility: typeof record.visibility === 'string' ? record.visibility : undefined,
    createdAt,
    updatedAt,
    pinned: Boolean(record.pinned),
    resources: Array.isArray(record.resources)
      ? record.resources
      : Array.isArray(record.resourceList)
        ? record.resourceList
        : []
  };
}

export async function fetchMemos(env: MemosEnv): Promise<MemoItem[]> {
  if (!env.MEMOS_API_URL?.trim()) {
    throw new Error('缺少 MEMOS_API_URL，无法同步 Memos');
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (env.MEMOS_ACCESS_TOKEN?.trim()) {
    headers.authorization = `Bearer ${env.MEMOS_ACCESS_TOKEN.trim()}`;
  }

  let lastError = '';
  for (const endpoint of normalizeEndpoint(env.MEMOS_API_URL)) {
    const url = appendFilter(endpoint, env.MEMOS_FILTER);
    try {
      const response = await fetch(url, { headers });
      const text = await response.text();
      if (!response.ok) {
        lastError = `Memos 请求失败 (${response.status}): ${text.slice(0, 200)}`;
        continue;
      }
      return pickArray(JSON.parse(text))
        .map(normalizeMemo)
        .filter((memo) => memo.content.trim().length > 0);
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Memos 请求失败';
    }
  }

  throw new Error(lastError || '无法读取 Memos 数据');
}
