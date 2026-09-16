// Compose the generated SvelteKit HTTP handler with the scheduled backup handler.
import app from './.svelte-kit/cloudflare/_worker.js';
import { handleScheduled } from './src/lib/server/backup';

export default {
  fetch(request: Request, env: App.Platform['env'], ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: App.Platform['env'], ctx: ExecutionContext): Promise<void> {
    await handleScheduled(controller, env, ctx);
  }
} satisfies ExportedHandler<App.Platform['env']>;
