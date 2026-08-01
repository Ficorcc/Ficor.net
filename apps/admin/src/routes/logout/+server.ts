// 登出：销毁会话，清除 cookie，重定向到登录页
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRepos } from '$lib/server/db';
import { destroySession } from '$lib/server/auth/session';
import { clearCsrfCookie } from '$lib/server/auth/csrf';

export const GET: RequestHandler = async ({ locals, cookies, platform }) => {
  if (locals.session && platform?.env?.DB) {
    const repos = createRepos(platform.env.DB);
    // 审计：记录登出
    await repos.audit
      .log({
        sessionId: locals.session.id,
        action: 'AUTH_LOGOUT',
        ip: locals.ip
      })
      .catch(() => {});
    await destroySession(repos, cookies, locals.session.id);
  }
  clearCsrfCookie(cookies);
  throw redirect(303, '/admin/login');
};
