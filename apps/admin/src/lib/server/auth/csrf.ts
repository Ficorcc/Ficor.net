// ============================================================================
// CSRF 防护
// 策略：双重提交 cookie + header 比对。
// 登录时生成 CSRF token，同时写 cookie（可读）和 DB。
// mutation 请求需在 header X-CSRF-Token 携带，服务端比对 DB 中当前会话绑定的 token。
// ============================================================================

import type { Cookies } from '@sveltejs/kit';
import type { Repos, SessionRow } from '../db';

export const CSRF_COOKIE = 'admin_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** 从 cookie 读取 CSRF token（用于双重提交验证） */
export function getCsrfFromCookie(cookies: Cookies): string | null {
  return cookies.get(CSRF_COOKIE) ?? null;
}

/** 从请求头读取 CSRF token */
export function getCsrfFromHeader(request: Request): string | null {
  return request.headers.get(CSRF_HEADER);
}

/**
 * 校验 CSRF token。
 * 双重提交策略：header 中的 token 必须等于 DB 中当前会话绑定的 token。
 * （cookie 读取仅在浏览器同源策略下可见，header 由 JS 显式携带，可防跨站伪造）
 */
export function validateCsrf(session: SessionRow, request: Request): boolean {
  const headerToken = getCsrfFromHeader(request);
  if (!headerToken) return false;
  return headerToken === session.csrf_token;
}

/**
 * 为会话生成并写入新的 CSRF token（cookie + DB）。
 * 登录成功后调用，或在 token 被消费后轮换。
 */
export async function issueCsrf(
  repos: Repos,
  cookies: Cookies,
  session: SessionRow
): Promise<string> {
  const newToken = crypto.randomUUID();
  await repos.sessions.rotateCsrf(session.id, newToken);
  // cookie 可读（非 httpOnly），供前端 JS 取用并放入 header
  cookies.set(CSRF_COOKIE, newToken, {
    path: '/admin',
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60
  });
  return newToken;
}

/** 清除 CSRF cookie（登出时） */
export function clearCsrfCookie(cookies: Cookies): void {
  cookies.delete(CSRF_COOKIE, { path: '/admin' });
}
