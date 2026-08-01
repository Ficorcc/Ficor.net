// ============================================================================
// CSRF token store + 前端 API 请求封装
// ============================================================================

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { base } from '$app/paths';

/** 从 cookie 读取 CSRF token（cookie 非 httpOnly，JS 可读） */
export const csrfToken = writable<string | null>(
  browser ? getCookie('admin_csrf') : null
);

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

/**
 * 发起 API 请求到统一入口 /admin/api/[...event]
 * @param event 事件类型（如 CONTENT_SAVE）
 * @param payload 请求体数据
 * @param opts.method 请求方法，默认 POST
 */
export async function api<T = unknown>(
  event: string,
  payload?: unknown,
  opts: { method?: 'POST' | 'GET' } = {}
): Promise<ApiResult<T>> {
  const method = opts.method ?? 'POST';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // mutation 请求携带 CSRF token
  if (method === 'POST') {
    let token: string | null = null;
    csrfToken.subscribe((v) => (token = v))();
    if (token) headers['x-csrf-token'] = token;
  }

  const body = method === 'POST' ? JSON.stringify({ event, ...((payload as Record<string, unknown>) ?? {}) }) : undefined;

  try {
    const res = await fetch(`${base}/api/${event}`, {
      method,
      headers,
      body,
      credentials: 'same-origin'
    });

    // 尝试解析 JSON，失败则返回文本
    let data: unknown = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = text || null;
    }

    if (!res.ok) {
      let errorMsg = `请求失败 (${res.status})`;
      if (data && typeof data === 'object' && 'error' in data) {
        const errVal = (data as Record<string, unknown>).error;
        if (typeof errVal === 'string') errorMsg = errVal;
      }
      return { ok: false, error: errorMsg, status: res.status, data: data as T };
    }

    return { ok: true, data: data as T, status: res.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '网络请求失败',
      status: 0
    };
  }
}

/**
 * 发起流式 SSE 请求（用于 AI 润色）。
 * 返回 ReadableStream，调用方逐 chunk 读取。
 */
export async function apiStream(
  event: string,
  payload: unknown
): Promise<{ ok: boolean; body: ReadableStream<Uint8Array> | null; error?: string }> {
  let token: string | null = null;
  csrfToken.subscribe((v) => (token = v))();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    };
    if (token) headers['x-csrf-token'] = token;

    const res = await fetch(`${base}/api/${event}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, ...((payload as Record<string, unknown>) ?? {}) }),
      credentials: 'same-origin'
    });

    if (!res.ok || !res.body) {
      return { ok: false, body: null, error: `请求失败 (${res.status})` };
    }

    return { ok: true, body: res.body };
  } catch (e) {
    return {
      ok: false,
      body: null,
      error: e instanceof Error ? e.message : '网络请求失败'
    };
  }
}
