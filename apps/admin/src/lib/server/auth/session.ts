// ============================================================================
// 会话管理（创建/校验/销毁）+ Cookie 操作
// ============================================================================

import type { Cookies } from '@sveltejs/kit';
import type { Repos, SessionRow } from '../db';

/** Cookie 名称 */
export const SESSION_COOKIE = 'admin_session';

/** 会话有效期（天），从环境变量读取，默认 7 天 */
function getMaxAgeDays(env?: App.Platform['env']): number {
  const raw = env?.SESSION_MAX_AGE_DAYS;
  const n = raw ? parseInt(raw, 10) : 7;
  return Number.isFinite(n) && n > 0 ? n : 7;
}

/** 滑动续期阈值：如果会话剩余寿命不足一半，续期 */
function shouldRefresh(session: SessionRow, maxAgeDays: number): boolean {
  const expiresAt = new Date(session.expires_at).getTime();
  const now = Date.now();
  const totalMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const remaining = expiresAt - now;
  return remaining < totalMs / 2;
}

function shouldTouch(session: SessionRow): boolean {
  const lastSeen = new Date(session.last_seen_at).getTime();
  return !Number.isFinite(lastSeen) || Date.now() - lastSeen > 5 * 60 * 1000;
}

/** 从请求 cookie 中提取 token */
export function extractToken(cookies: Cookies): string | null {
  return cookies.get(SESSION_COOKIE) ?? null;
}

/**
 * 根据 cookie 中的 token 查找有效会话。
 * 如果会话接近过期，自动滑动续期。
 */
export async function resolveSession(
  repos: Repos,
  cookies: Cookies,
  env?: App.Platform['env']
): Promise<SessionRow | null> {
  const token = extractToken(cookies);
  if (!token) return null;

  // 定期清理过期会话（best-effort，不阻塞请求）
  const session = await repos.sessions.findByToken(token);
  if (!session) return null;

  const maxAgeDays = getMaxAgeDays(env);

  // 滑动续期：剩余寿命不足一半时，延长 expires_at
  if (shouldRefresh(session, maxAgeDays)) {
    const newExpires = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
    await repos.sessions.updateExpires(session.id, newExpires).catch(() => {});
    setSessionCookie(cookies, token, maxAgeDays);
  } else if (shouldTouch(session)) {
    await repos.sessions.touch(session.id).catch(() => {});
  }

  return session;
}

/**
 * 创建新会话并设置 cookie。
 */
export async function createSession(
  repos: Repos,
  cookies: Cookies,
  meta: { ip: string; ua: string },
  env?: App.Platform['env']
): Promise<SessionRow> {
  const maxAgeDays = getMaxAgeDays(env);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const csrfToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  await repos.sessions.create({
    id,
    token,
    csrfToken,
    ip: meta.ip,
    ua: meta.ua,
    expiresAt
  });

  setSessionCookie(cookies, token, maxAgeDays);

  return {
    id,
    token,
    csrf_token: csrfToken,
    ip: meta.ip,
    ua: meta.ua,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
    last_seen_at: new Date().toISOString()
  };
}

/** 销毁会话并清除 cookie */
export async function destroySession(repos: Repos, cookies: Cookies, sessionId: string): Promise<void> {
  await repos.sessions.delete(sessionId).catch(() => {});
  cookies.delete(SESSION_COOKIE, { path: '/admin' });
}

/** 设置会话 cookie（httpOnly / Secure / SameSite=Lax） */
function setSessionCookie(cookies: Cookies, token: string, maxAgeDays: number): void {
  cookies.set(SESSION_COOKIE, token, {
    path: '/admin',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: maxAgeDays * 24 * 60 * 60
  });
}
