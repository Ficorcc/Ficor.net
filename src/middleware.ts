import { defineMiddleware } from 'astro:middleware';

// Production /admin/* is served by the admin Worker. Mirror that route locally.
export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  if (import.meta.env.DEV && /^\/admin\/api\/(community|comments)\/?$/.test(url.pathname)
    && ['GET', 'HEAD', 'POST'].includes(request.method)) {
    try {
      const origin = import.meta.env.ADMIN_DEV_ORIGIN || 'http://127.0.0.1:5173';
      const init: RequestInit = {
        method: request.method,
        headers: { 'content-type': request.headers.get('content-type') || 'application/json', 'origin': new URL(origin).origin },
        signal: AbortSignal.timeout(8000)
      };
      if (request.method === 'POST') init.body = await request.text();
      return await fetch(new URL(url.pathname.replace(/\/$/, '') + url.search, origin), init);
    } catch {
      return new Response(JSON.stringify({ error: '请先运行 npm run dev:admin' }), {
        status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }
  }
  return next();
});
