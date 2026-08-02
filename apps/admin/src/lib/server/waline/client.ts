export type AdminCommentStatus = 'pending' | 'approved' | 'spam';
export type AdminCommentMutationStatus = AdminCommentStatus | 'deleted';

export type AdminComment = {
  id: string;
  author: string;
  email: string | null;
  link: string | null;
  content: string;
  status: AdminCommentStatus;
  post_id: string | null;
  post_title: string | null;
  source: string;
  ai_verdict: string | null;
  ai_score: number | null;
  created_at: string;
  updated_at: string;
  url: string | null;
  like: number;
  browser: string | null;
  os: string | null;
};

type WalineComment = {
  objectId?: string;
  nick?: string;
  mail?: string;
  link?: string;
  comment?: string;
  url?: string;
  time?: string;
  insertedAt?: string;
  updatedAt?: string;
  status?: string;
  like?: number;
  browser?: string;
  os?: string;
};

type WalineListResponse = {
  errno?: number;
  errmsg?: string;
  data?: {
    page?: number;
    pageSize?: number;
    totalPages?: number;
    data?: WalineComment[];
  };
};

type WalineMutationResponse = {
  errno?: number;
  errmsg?: string;
  data?: unknown;
};

export function resolveWalineConfig(env: App.Platform['env']) {
  return {
    apiUrl: normalizeBaseUrl(env.WALINE_API_URL ?? 'https://waline.ficor.cc'),
    token: env.WALINE_TOKEN
  };
}

export async function listWalineComments(opts: {
  apiUrl: string;
  token?: string;
  status?: AdminCommentStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ items: AdminComment[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 20);
  const status = opts.status ? toWalineStatus(opts.status) : undefined;
  const url = new URL('/comment', opts.apiUrl);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pageSize', String(pageSize));
  url.searchParams.set('owner', 'all');
  if (status) url.searchParams.set('status', status);

  const data = await walineFetch<WalineListResponse>(url, opts.token);
  const rows = data.data?.data ?? [];
  const totalPages = Math.max(1, data.data?.totalPages ?? 1);

  return {
    items: rows.map(toAdminComment),
    total: Math.max(rows.length, totalPages * pageSize)
  };
}

export async function countWalineComments(opts: {
  apiUrl: string;
  token?: string;
}): Promise<Record<AdminCommentStatus, number>> {
  const statuses: AdminCommentStatus[] = ['pending', 'approved', 'spam'];
  const entries = await Promise.all(
    statuses.map(async (status) => {
      const result = await listWalineComments({
        apiUrl: opts.apiUrl,
        token: opts.token,
        status,
        page: 1,
        pageSize: 1
      });
      return [status, result.total] as const;
    })
  );

  return Object.fromEntries(entries) as Record<AdminCommentStatus, number>;
}

export async function updateWalineCommentStatus(opts: {
  apiUrl: string;
  token?: string;
  id: string;
  status: AdminCommentMutationStatus;
}): Promise<void> {
  if (opts.status === 'deleted') {
    await deleteWalineComment(opts);
    return;
  }

  const url = new URL(`/comment/${encodeURIComponent(opts.id)}`, opts.apiUrl);
  await walineFetch<WalineMutationResponse>(url, opts.token, {
    method: 'PUT',
    body: JSON.stringify({ status: toWalineStatus(opts.status) })
  });
}

export async function deleteWalineComment(opts: {
  apiUrl: string;
  token?: string;
  id: string;
}): Promise<void> {
  const url = new URL(`/comment/${encodeURIComponent(opts.id)}`, opts.apiUrl);
  await walineFetch<WalineMutationResponse>(url, opts.token, { method: 'DELETE' });
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function toWalineStatus(status: AdminCommentStatus) {
  return status === 'pending' ? 'waiting' : status;
}

function fromWalineStatus(status: string | undefined): AdminCommentStatus {
  if (status === 'waiting') return 'pending';
  if (status === 'spam') return 'spam';
  return 'approved';
}

function toAdminComment(comment: WalineComment): AdminComment {
  const createdAt = comment.insertedAt ?? comment.time ?? new Date().toISOString();
  return {
    id: comment.objectId ?? '',
    author: comment.nick ?? '匿名',
    email: comment.mail || null,
    link: comment.link || null,
    content: stripHtml(comment.comment ?? ''),
    status: fromWalineStatus(comment.status),
    post_id: comment.url || null,
    post_title: comment.url || null,
    source: 'waline',
    ai_verdict: null,
    ai_score: null,
    created_at: createdAt,
    updated_at: comment.updatedAt ?? createdAt,
    url: comment.url || null,
    like: comment.like ?? 0,
    browser: comment.browser || null,
    os: comment.os || null
  };
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function walineFetch<T>(url: URL, token?: string, init: RequestInit = {}): Promise<T> {
  if (!token) {
    throw new Error('未配置 WALINE_TOKEN，请先把 Waline 管理 token 写入后台 Worker secret');
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => null)) as (T & { errno?: number; errmsg?: string }) | null;

  if (!response.ok || !data || (typeof data.errno === 'number' && data.errno !== 0)) {
    throw new Error(data?.errmsg || `Waline 请求失败（${response.status}）`);
  }

  return data;
}
