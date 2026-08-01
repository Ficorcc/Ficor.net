// ============================================================================
// 单一 API 入口 /admin/api/[...event]
// 所有写操作走这里，通过 body.event 区分操作类型
// ============================================================================

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createRepos } from '$lib/server/db';
import { ContentStore } from '$lib/server/r2/content';
import { dispatch } from '$lib/api/dispatcher';
import { isValidEvent } from '$lib/api/events';

export const POST: RequestHandler = async ({ request, locals, platform, params }) => {
  if (!platform?.env?.DB) {
    throw error(503, '数据库未配置，请检查 wrangler 绑定');
  }

  const env = platform.env;
  const repos = createRepos(env.DB);
  const content = new ContentStore(env.R2);

  // 解析请求体
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    throw error(400, '请求体不是合法 JSON');
  }

  // event 来源：优先 body.event，兼容 URL path 的 [...event]
  const event = String(body.event ?? params.event ?? '');
  if (!event || !isValidEvent(event)) {
    throw error(400, `无效的 event: ${event}`);
  }

  return dispatch(event, {
    request,
    env,
    repos,
    content,
    locals,
    body
  });
};

// GET：返回 API 元信息
export const GET: RequestHandler = async () => {
  return json({
    name: 'vii.ink-admin API',
    version: '0.1.0',
    description: '单一入口 API，通过 event 字段区分操作类型。POST 请求体需包含 event 字段。'
  });
};
