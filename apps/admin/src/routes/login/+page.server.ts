// 登录页：GET 渲染表单，POST（actions.default）处理登录
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createRepos } from '$lib/server/db';
import { createSession } from '$lib/server/auth/session';
import { issueCsrf } from '$lib/server/auth/csrf';

export const load: PageServerLoad = async ({ locals, url }) => {
  // 已登录则直接跳转
  if (locals.session) {
    throw redirect(303, '/admin/dashboard');
  }
  return {
    redirect: url.searchParams.get('redirect') ?? '/admin/dashboard'
  };
};

export const actions: Actions = {
  default: async ({ request, cookies, platform, url }) => {
    if (!platform?.env?.DB) {
      return fail(503, { message: '数据库未配置，请检查 wrangler 绑定' });
    }

    const env = platform.env;
    const data = await request.formData();
    const password = String(data.get('password') ?? '').trim();

    if (!password) {
      return fail(400, { message: '请输入密码' });
    }

    const adminPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return fail(503, { message: '管理密码未配置' });
    }

    // 校验密码（常量时间比较）
    const valid = await safeCompare(password, adminPassword);
    if (!valid) {
      await delay(500); // 防计时攻击
      return fail(401, { message: '密码错误' });
    }

    const repos = createRepos(env.DB);
    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const ua = request.headers.get('user-agent') ?? '';

    // 创建会话
    const session = await createSession(repos, cookies, { ip, ua }, env);
    // 颁发 CSRF token
    await issueCsrf(repos, cookies, session);
    // 审计
    await repos.audit.log({ sessionId: session.id, action: 'AUTH_LOGIN', ip });

    const redirectTarget = String(data.get('redirect') ?? url.searchParams.get('redirect') ?? '/admin/dashboard');
    throw redirect(303, redirectTarget);
  }
};

async function safeCompare(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;
  const hA = await crypto.subtle.digest('SHA-256', bufA);
  const hB = await crypto.subtle.digest('SHA-256', bufB);
  const viewA = new Uint8Array(hA);
  const viewB = new Uint8Array(hB);
  let diff = 0;
  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];
  return diff === 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
