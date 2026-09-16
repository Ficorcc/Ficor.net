import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readPublishedCommunity } from '$lib/server/community';

export const GET: RequestHandler = async ({ platform }) => {
  try {
    return json(await readPublishedCommunity(platform?.env?.R2), {
      headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
  } catch {
    return json({ error: '共享数据暂时不可用' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
