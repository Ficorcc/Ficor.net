// ============================================================================
// Cloudflare Workers 入口
// 处理 cron 定时任务（scheduled handler）
// adapter-cloudflare 会把 SvelteKit 的 fetch handler 和这个 worker 合并
// ============================================================================

import { handleScheduled } from './lib/server/backup';

export default {
  async fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> {
    // fetch 请求由 SvelteKit 处理（adapter-cloudflare 注入）
    // 这个文件主要为了提供 scheduled handler
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(
    controller: ScheduledController,
    env: App.Platform['env'],
    ctx: { waitUntil(p: Promise<unknown>): void }
  ): Promise<void> {
    await handleScheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<App.Platform['env']>;
