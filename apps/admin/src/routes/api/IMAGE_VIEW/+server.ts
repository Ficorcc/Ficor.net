import { error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

const CACHE_SECONDS = 60 * 60;

function isImageKey(key: string) {
  return key.startsWith('images/') && !key.includes('..') && !key.includes('\\');
}

export const GET: RequestHandler = async ({ locals, platform, url }) => {
  if (!locals.session) {
    throw error(401, '未登录');
  }
  if (!platform?.env?.R2) {
    throw error(503, 'R2 存储未配置');
  }

  const key = url.searchParams.get('key') ?? '';
  if (!isImageKey(key)) {
    throw error(400, '图片路径无效');
  }

  const object = await platform.env.R2.get(key);
  if (!object?.body) {
    throw error(404, '图片不存在');
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', `private, max-age=${CACHE_SECONDS}`);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'image/*');
  }

  return new Response(object.body, { headers });
};
