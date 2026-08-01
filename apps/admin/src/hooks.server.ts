// ============================================================================
// hooks.server.ts — 请求中间件链
// 执行顺序：IP 提取 → 限流 → 会话解析（注入 locals）→ 路由守卫
// CSRF 校验在 API handler 内部按需执行（只对 mutation 请求）
// ============================================================================

import type { Handle } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { createRepos } from '$lib/server/db';
import { resolveSession } from '$lib/server/auth/session';

/** 不需要登录即可访问的路径前缀（相对于 base /admin） */
const PUBLIC_PATHS = ['/login', '/api/COMMENT_SUBMIT'];

const ASSET_PATH_PREFIXES = ['/admin/_app/', '/admin/favicon', '/admin/robots.txt'];

/** 是否为公开路径 */
function isPublicPath(pathname: string): boolean {
  // pathname 已包含 base 前缀 /admin
  return PUBLIC_PATHS.some((p) => pathname === `/admin${p}` || pathname.startsWith(`/admin${p}/`));
}

function isStaticAsset(pathname: string): boolean {
  return ASSET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function shouldRateLimit(method: string, pathname: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return true;
  return pathname === '/admin/login' || pathname.startsWith('/admin/api/');
}

export const handle: Handle = async ({ event, resolve }) => {
  const { platform, cookies, url } = event;

  // 提取客户端 IP（Cloudflare 注入）
  const ip = event.request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
  event.locals.ip = ip;
  event.locals.session = null;
  event.locals.csrfValid = false;

  if (isStaticAsset(url.pathname)) {
    return resolve(event);
  }

  // 如果没有平台绑定（如纯本地 vite dev 无 wrangler），直接放行让页面能渲染
  if (!platform?.env?.DB) {
    return resolve(event);
  }

  const repos = createRepos(platform.env.DB);

  // --- 限流（对所有请求） ---
  if (shouldRateLimit(event.request.method, url.pathname)) {
    try {
      const rlConfig = await repos.config.get<{ max: number; window: number }>('ratelimit');
      const max = rlConfig?.max ?? parseInt(platform.env.RATE_LIMIT_MAX ?? '60', 10);
      const window = rlConfig?.window ?? parseInt(platform.env.RATE_LIMIT_WINDOW ?? '60', 10);
      const { allowed } = await repos.ratelimit.check(ip, max, window);
      if (!allowed) {
        throw error(429, '请求过于频繁，请稍后再试');
      }
    } catch (e) {
      // 限流自身的 429 直接抛出
      if (e && typeof e === 'object' && 'status' in e && e.status === 429) throw e;
      // 其他错误（DB 异常）降级放行，不阻塞请求
    }
  }

  // --- 会话解析 ---
  try {
    const session = await resolveSession(repos, cookies, platform.env);
    if (session) {
      event.locals.session = {
        id: session.id,
        token: session.token,
        createdAt: session.created_at,
        expiresAt: session.expires_at
      };
    }
  } catch {
    // 会话解析失败不阻塞，当作未登录
  }

  // --- 路由守卫：非公开路径要求登录 ---
  if (!isPublicPath(url.pathname) && !event.locals.session) {
    // 对 API 请求返回 401，对页面请求重定向到登录
    if (url.pathname.startsWith('/admin/api/')) {
      throw error(401, '未登录或会话已过期');
    }
    throw redirect(303, `/admin/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
  }

  // best-effort：定期清理过期会话和限流记录（不阻塞响应）
  if (Math.random() < 0.02) {
    platform.context?.waitUntil?.(
      (async () => {
        await repos.sessions.deleteExpired().catch(() => {});
        await repos.ratelimit.cleanup(3600).catch(() => {});
      })()
    );
  }

  return resolve(event);
};
